import type { BrowserContext, Page } from 'playwright';
import type { AuthStrategy, ResolvedToken, RunnerConfig } from '../types/index.js';
import { isAnonymousToken } from '../config/tokens.js';
import { standOrigin } from '../utils/url.js';

/**
 * Prepares browser auth state before Lighthouse cold navigation.
 *
 * Auth is intentionally pluggable — many SPAs read a token from
 * localStorage/sessionStorage and attach Authorization on API calls.
 * Setting only the first HTML request Bearer is often not enough.
 *
 * Supported strategies (AUTH_STRATEGY):
 * - bearer-header: CDP/extra HTTP headers Authorization Bearer
 * - local-storage / session-storage: write token under AUTH_STORAGE_KEY
 * - cookie: set AUTH_COOKIE_NAME cookie for the stand origin
 *
 * Token name `anonymous` skips auth preparation (public pages).
 */
export class AuthPreparer {
  constructor(private readonly config: RunnerConfig) {}

  async prepare(
    context: BrowserContext,
    token: ResolvedToken,
  ): Promise<void> {
    if (isAnonymousToken(token.name)) {
      return;
    }

    const origin = standOrigin(this.config.testStand);
    const strategy = this.config.authStrategy;

    if (strategy === 'bearer-header') {
      await context.setExtraHTTPHeaders({
        Authorization: `Bearer ${token.value}`,
      });
      return;
    }

    if (strategy === 'cookie') {
      const url = new URL(origin);
      await context.addCookies([
        {
          name: this.config.authCookieName,
          value: token.value,
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: url.protocol === 'https:',
          sameSite: 'Lax',
        },
      ]);
      return;
    }

    const page = await context.newPage();
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.writeStorage(page, strategy, token.value);
    } finally {
      await page.close();
    }
  }

  private async writeStorage(
    page: Page,
    strategy: Extract<AuthStrategy, 'local-storage' | 'session-storage'>,
    tokenValue: string,
  ): Promise<void> {
    const key = this.config.authStorageKey;
    await page.evaluate(
      ({ storage, key, value }) => {
        const target = storage === 'local-storage' ? localStorage : sessionStorage;
        target.setItem(key, value);
      },
      { storage: strategy, key, value: tokenValue },
    );
  }
}
