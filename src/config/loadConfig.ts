import { config as loadDotenv } from 'dotenv';
import { createBrowserConfig } from './browserConfig.js';
import type { AuthStrategy, CacheMode, InfluxConfig, RunnerConfig } from '../types/index.js';
import { generateRunId } from '../utils/runId.js';

loadDotenv();

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parsePositiveNumber(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw Object.assign(new Error(`${name} must be a positive number, got: "${raw}"`), {
      category: 'CONFIG_ERROR' as const,
    });
  }
  return n;
}

function parseCacheMode(raw: string | undefined): CacheMode {
  const value = (raw ?? 'cold').toLowerCase();
  if (value === 'cold' || value === 'warm') {
    return value;
  }
  throw Object.assign(new Error(`CACHE_MODE must be "cold" or "warm", got: "${raw}"`), {
    category: 'CONFIG_ERROR' as const,
  });
}

function parseAuthStrategy(raw: string | undefined): AuthStrategy {
  const value = (raw ?? 'bearer-header').toLowerCase();
  const allowed: AuthStrategy[] = [
    'bearer-header',
    'local-storage',
    'session-storage',
    'cookie',
  ];
  if ((allowed as string[]).includes(value)) {
    return value as AuthStrategy;
  }
  throw Object.assign(
    new Error(
      `AUTH_STRATEGY must be one of ${allowed.join(', ')}, got: "${raw}"`,
    ),
    { category: 'CONFIG_ERROR' as const },
  );
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  const v = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(v)) {
    return false;
  }
  throw Object.assign(new Error(`Boolean env expected, got: "${raw}"`), {
    category: 'CONFIG_ERROR' as const,
  });
}

export function loadInfluxConfig(): InfluxConfig {
  return {
    enabled: parseBool(readEnv('INFLUX_ENABLED'), false),
    url: readEnv('INFLUX_URL') ?? '',
    database: readEnv('INFLUX_DATABASE') ?? '',
    username: readEnv('INFLUX_USERNAME') ?? '',
    password: readEnv('INFLUX_PASSWORD') ?? '',
    measurement: readEnv('INFLUX_MEASUREMENT') ?? 'browser_performance',
  };
}

export function loadRunnerConfig(): RunnerConfig {
  const cacheMode = parseCacheMode(readEnv('CACHE_MODE'));
  const testStand = readEnv('TEST_STAND') ?? '';
  const profileName = readEnv('PERFORMANCE_URLS_PROFILE') ?? 'loadTestUrls';
  const runId = readEnv('RUN_ID') ?? generateRunId();

  return {
    testStand,
    profileName,
    runTimeSec: parsePositiveNumber('RUN_TIME', readEnv('RUN_TIME'), 60),
    pacingSec: parsePositiveNumber('PACING', readEnv('PACING'), 5),
    requestTimeoutSec: parsePositiveNumber(
      'PERF_REQUEST_TIMEOUT',
      readEnv('PERF_REQUEST_TIMEOUT'),
      30,
    ),
    cacheMode,
    chromePath: readEnv('CHROME_PATH'),
    runId,
    authStrategy: parseAuthStrategy(readEnv('AUTH_STRATEGY')),
    authStorageKey: readEnv('AUTH_STORAGE_KEY') ?? 'accessToken',
    authCookieName: readEnv('AUTH_COOKIE_NAME') ?? 'access_token',
    browser: createBrowserConfig(cacheMode),
    influx: loadInfluxConfig(),
  };
}
