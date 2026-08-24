export type CacheMode = 'cold' | 'warm';

export type AuthStrategy =
  | 'bearer-header'
  | 'local-storage'
  | 'session-storage'
  | 'cookie';

export type ErrorCategory =
  | 'CONFIG_ERROR'
  | 'AUTH_ERROR'
  | 'BROWSER_ERROR'
  | 'PAGE_ERROR'
  | 'LIGHTHOUSE_ERROR'
  | 'REPORTER_ERROR';

export interface UrlProfileEntry {
  /** Unique page identifier (used as Influx tag `page`). */
  name: string;
  /** Relative path resolved against TEST_STAND via `new URL(path, stand)`. */
  path: string;
  /** Logical token name from token mapping (e.g. userToken). */
  token: string;
}

export type UrlProfileMap = Record<string, readonly UrlProfileEntry[]>;

export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  cacheMode: CacheMode;
}

export interface InfluxConfig {
  enabled: boolean;
  url: string;
  database: string;
  username: string;
  password: string;
  measurement: string;
}

export interface RunnerConfig {
  testStand: string;
  profileName: string;
  runTimeSec: number;
  pacingSec: number;
  requestTimeoutSec: number;
  cacheMode: CacheMode;
  chromePath: string | undefined;
  runId: string;
  authStrategy: AuthStrategy;
  authStorageKey: string;
  authCookieName: string;
  browser: BrowserConfig;
  influx: InfluxConfig;
}

export interface PerformanceMetrics {
  speedIndex: number | null;
  fcp: number | null;
  lcp: number | null;
  ttfb: number | null;
  tbt: number | null;
  cls: number | null;
}

export interface EnvironmentMetadata {
  nodeVersion: string;
  browserName: string;
  browserVersion: string;
  playwrightVersion: string;
  lighthouseVersion: string;
}

export interface MeasurementResult {
  runId: string;
  timestamp: string;
  page: string;
  path: string;
  url: string;
  profile: string;
  stand: string;
  authProfile: string;
  cacheMode: CacheMode;
  metrics: PerformanceMetrics;
  environment: EnvironmentMetadata;
  durationMs: number;
  status: 'SUCCESS';
}

export interface MeasurementError {
  runId: string;
  timestamp: string;
  page: string;
  path: string;
  url: string;
  profile: string;
  stand: string;
  authProfile: string;
  cacheMode: CacheMode;
  category: ErrorCategory;
  message: string;
  httpStatus?: number;
  environment: EnvironmentMetadata;
  durationMs: number;
  status: 'FAILED';
}

export interface RunSummary {
  runId: string;
  configuredRunTimeSec: number;
  actualDurationSec: number;
  totalMeasurements: number;
  successful: number;
  failed: number;
  influx: { sent: number; failed: number };
  pages: Record<string, { success: number; failed: number }>;
  environment: EnvironmentMetadata;
}

export interface PerformanceReporter {
  reportMeasurement(result: MeasurementResult): Promise<void>;
  reportError(error: MeasurementError): Promise<void>;
  close(): Promise<void>;
  getStats?(): { sent: number; failed: number };
}

export interface ResolvedToken {
  name: string;
  value: string;
  envVar: string;
}

export interface PreflightPageResult {
  name: string;
  url: string;
  authProfile: string;
  ok: boolean;
  httpStatus?: number;
  error?: string;
  category?: ErrorCategory;
}
