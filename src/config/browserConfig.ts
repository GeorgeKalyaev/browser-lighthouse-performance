import type { BrowserConfig, CacheMode } from '../types/index.js';

export function createBrowserConfig(cacheMode: CacheMode): BrowserConfig {
  return {
    headless: true,
    viewport: {
      width: 1920,
      height: 1080,
    },
    deviceScaleFactor: 1,
    cacheMode,
  };
}

/** Stable Chromium flags for reproducible desktop measurements. */
export const BROWSER_LAUNCH_ARGS: readonly string[] = [
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--metrics-recording-only',
  '--password-store=basic',
  '--use-mock-keychain',
];
