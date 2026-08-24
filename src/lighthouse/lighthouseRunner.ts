import lighthouse from 'lighthouse';
import type { RunnerConfig, PerformanceMetrics, ResolvedToken } from '../types/index.js';
import { isAnonymousToken } from '../config/tokens.js';
import { extractPerformanceMetrics } from './metricsExtractor.js';

export interface LighthouseRunInput {
  url: string;
  port: number;
  token: ResolvedToken;
  timeoutMs: number;
}

export interface LighthouseRunOutput {
  metrics: PerformanceMetrics;
  fetchTime: string;
}

/**
 * Lighthouse owns the navigation performance audit.
 * Playwright must NOT pre-navigate the measured URL for cold runs —
 * that would warm the page and invalidate Speed Index / LCP semantics.
 */
export class LighthouseRunner {
  constructor(private readonly config: RunnerConfig) {}

  async measure(input: LighthouseRunInput): Promise<LighthouseRunOutput> {
    const { url, port, token, timeoutMs } = input;

    const extraHeaders: Record<string, string> = {};
    if (
      this.config.authStrategy === 'bearer-header' &&
      !isAnonymousToken(token.name)
    ) {
      extraHeaders.Authorization = `Bearer ${token.value}`;
    }

    const disableStorageReset =
      this.config.authStrategy !== 'bearer-header' || this.config.cacheMode === 'warm';

    const flags = {
      port,
      output: 'json' as const,
      logLevel: 'error' as const,
      onlyCategories: ['performance'],
      formFactor: 'desktop' as const,
      screenEmulation: {
        mobile: false,
        width: this.config.browser.viewport.width,
        height: this.config.browser.viewport.height,
        deviceScaleFactor: this.config.browser.deviceScaleFactor,
        disabled: false,
      },
      throttlingMethod: 'provided' as const,
      // Cold HTTP cache is cleared via CDP. Do not let Lighthouse wipe auth storage/cookies.
      disableStorageReset,
      maxWaitForLoad: timeoutMs,
      maxWaitForFcp: timeoutMs,
      extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
    };

    const config = {
      extends: 'lighthouse:default',
      settings: {
        onlyCategories: ['performance'],
        formFactor: 'desktop' as const,
        screenEmulation: flags.screenEmulation,
        throttlingMethod: 'provided' as const,
        // Desktop preset — no mobile emulation for this PoC.
        emulatedUserAgent: false as const,
      },
    };

    const result = await withTimeout(
      lighthouse(url, flags, config),
      timeoutMs + 5_000,
      `Lighthouse exceeded PERF_REQUEST_TIMEOUT (${this.config.requestTimeoutSec}s) for ${url}`,
    );

    if (!result || !result.lhr) {
      throw Object.assign(new Error('Lighthouse returned an empty result'), {
        category: 'LIGHTHOUSE_ERROR' as const,
      });
    }

    const metrics = extractPerformanceMetrics(result.lhr);
    return {
      metrics,
      fetchTime: result.lhr.fetchTime ?? new Date().toISOString(),
    };
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error(message), {
              category: 'LIGHTHOUSE_ERROR' as const,
            }),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
