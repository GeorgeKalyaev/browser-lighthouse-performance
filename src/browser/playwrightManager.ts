import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  chromium,
  type Browser,
  type BrowserContext,
} from 'playwright';
import { BROWSER_LAUNCH_ARGS } from '../config/browserConfig.js';
import { AuthPreparer } from '../auth/authPreparer.js';
import type { ResolvedToken, RunnerConfig } from '../types/index.js';
import { logger } from '../logging/logger.js';

export interface LaunchedBrowser {
  browser: Browser;
  debuggingPort: number;
  browserName: string;
  browserVersion: string;
  executablePath: string;
}

/**
 * Playwright owns browser lifecycle and auth preparation.
 * Lighthouse connects to the same Chromium via remote debugging port.
 *
 * A persistent user-data-dir is required so localStorage/cookies prepared
 * by Playwright remain visible to Lighthouse navigations (isolated
 * BrowserContexts would not share storage with the CDP session Lighthouse uses).
 */
export class PlaywrightManager {
  private persistentContext: BrowserContext | undefined;
  private debuggingPort = 0;
  private browserName = 'Chromium';
  private browserVersion = 'unknown';
  private executablePath = '';
  private userDataDir = '';
  private readonly authPreparer: AuthPreparer;

  constructor(private readonly config: RunnerConfig) {
    this.authPreparer = new AuthPreparer(config);
  }

  async launch(): Promise<LaunchedBrowser> {
    this.debuggingPort = await this.findFreePort();
    this.userDataDir = path.join(
      os.tmpdir(),
      `bpr-chrome-${process.pid}-${this.debuggingPort}`,
    );
    await mkdir(this.userDataDir, { recursive: true });

    const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: this.config.browser.headless,
      viewport: this.config.browser.viewport,
      deviceScaleFactor: this.config.browser.deviceScaleFactor,
      ignoreHTTPSErrors: true,
      args: [
        ...BROWSER_LAUNCH_ARGS,
        `--remote-debugging-port=${this.debuggingPort}`,
        `--window-size=${this.config.browser.viewport.width},${this.config.browser.viewport.height}`,
      ],
    };

    if (this.config.chromePath) {
      launchOptions.executablePath = this.config.chromePath;
      this.browserName = 'Chrome';
    }

    this.persistentContext = await chromium.launchPersistentContext(
      this.userDataDir,
      launchOptions,
    );

    const browser = this.persistentContext.browser();
    if (!browser) {
      throw new Error('Persistent Chromium browser handle is unavailable');
    }
    this.browserVersion = browser.version();
    this.executablePath = browser.browserType().executablePath();

    logger.info(`Browser: ${this.browserName}`);
    logger.info(`Browser version: ${this.browserVersion}`);

    return {
      browser,
      debuggingPort: this.debuggingPort,
      browserName: this.browserName,
      browserVersion: this.browserVersion,
      executablePath: this.executablePath,
    };
  }

  getDebuggingPort(): number {
    if (!this.debuggingPort) {
      throw new Error('Browser is not launched');
    }
    return this.debuggingPort;
  }

  getBrowserInfo(): { browserName: string; browserVersion: string } {
    return {
      browserName: this.browserName,
      browserVersion: this.browserVersion,
    };
  }

  /**
   * Apply auth into the shared persistent profile used by Lighthouse.
   */
  async prepareAuthForSharedBrowser(token: ResolvedToken): Promise<void> {
    if (!this.persistentContext) {
      throw new Error('Browser is not launched');
    }
    await this.authPreparer.prepare(this.persistentContext, token);
  }

  async clearCacheForCold(): Promise<void> {
    if (this.config.cacheMode !== 'cold' || !this.persistentContext) {
      return;
    }

    const page = await this.persistentContext.newPage();
    try {
      const client = await this.persistentContext.newCDPSession(page);
      await client.send('Network.enable');
      await client.send('Network.clearBrowserCache');
      // Intentionally do not clearBrowserCookies — cookie auth must survive cold cache.
    } finally {
      await page.close();
    }
  }

  private closing = false;

  async close(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    try {
      const context = this.persistentContext;
      if (context) {
        for (const page of context.pages()) {
          await page.close().catch(() => undefined);
        }
        await context.close().catch(() => undefined);
      }
    } finally {
      this.persistentContext = undefined;
      if (this.userDataDir) {
        const dir = this.userDataDir;
        this.userDataDir = '';
        // Defer profile cleanup so Chromium can fully release file locks on Windows.
        setTimeout(() => {
          void rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }, 1000);
      }
    }
  }

  private async findFreePort(): Promise<number> {
    const { createServer } = await import('node:net');
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          const { port } = address;
          server.close((err) => {
            if (err) {
              reject(err);
            } else {
              resolve(port);
            }
          });
        } else {
          server.close();
          reject(new Error('Unable to allocate debugging port'));
        }
      });
      server.on('error', reject);
    });
  }
}
