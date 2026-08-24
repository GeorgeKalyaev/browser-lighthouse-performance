import { request as playwrightRequest, type APIRequestContext } from 'playwright';
import type {
  ErrorCategory,
  PreflightPageResult,
  RunnerConfig,
  UrlProfileEntry,
  EnvironmentMetadata,
} from '../types/index.js';
import { resolveToken } from '../auth/tokenResolver.js';
import { resolvePageUrl } from '../utils/url.js';
import { InfluxReporter } from '../reporters/influxReporter.js';
import { logger } from '../logging/logger.js';

export interface PreflightResult {
  ok: boolean;
  pages: PreflightPageResult[];
  influxOk: boolean | null;
  fatalMessage?: string;
}

export async function runPreflight(options: {
  config: RunnerConfig;
  profile: readonly UrlProfileEntry[];
  environment: EnvironmentMetadata;
  browserAlreadyOk?: boolean;
}): Promise<PreflightResult> {
  const { config, profile, environment } = options;
  const pages: PreflightPageResult[] = [];

  logger.info('Running preflight...');
  logger.blank();

  let api: APIRequestContext | undefined;

  try {
    api = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
      timeout: config.requestTimeoutSec * 1000,
      extraHTTPHeaders: {},
    });

    for (const entry of profile) {
      const pageResult = await preflightPage(api, config, entry);
      pages.push(pageResult);
      if (!pageResult.ok) {
        logger.error(
          [
            '[Browser Performance] Preflight failed',
            '',
            `Page: ${pageResult.name}`,
            `URL: ${pageResult.url}`,
            '',
            `Auth profile: ${pageResult.authProfile}`,
            pageResult.httpStatus !== undefined
              ? `HTTP status: ${pageResult.httpStatus}`
              : undefined,
            '',
            pageResult.error ?? 'Page preflight failed.',
          ]
            .filter((line) => line !== undefined)
            .join('\n'),
        );
      }
    }
  } catch (err) {
    return {
      ok: false,
      pages,
      influxOk: null,
      fatalMessage: `Browser preflight failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    await api?.dispose();
  }

  const failedPage = pages.find((p) => !p.ok);
  if (failedPage) {
    return {
      ok: false,
      pages,
      influxOk: null,
      fatalMessage: 'Page preflight failed. Browser performance test aborted.',
    };
  }

  let influxOk: boolean | null = null;
  if (config.influx.enabled) {
    const influx = new InfluxReporter(config.influx, environment);
    const ping = await influx.ping();
    influxOk = ping.ok;
    logger.blank();
    logger.info('[InfluxDB]');
    logger.blank();
    logger.info(`Version: ${ping.version ?? 'unknown'}`);
    logger.info('Enabled: true');
    logger.info(`URL: ${config.influx.url}`);
    logger.info(`Database: ${config.influx.database}`);
    logger.info(`Measurement: ${config.influx.measurement}`);
    logger.info(`Connection: ${ping.ok ? 'OK' : 'FAILED'}`);
    if (!ping.ok) {
      return {
        ok: false,
        pages,
        influxOk,
        fatalMessage: `[Browser Performance] InfluxDB connection error\n\n${ping.error ?? 'Connection failed'}\n\nBrowser performance test aborted.`,
      };
    }
  }

  return { ok: true, pages, influxOk };
}

async function preflightPage(
  api: APIRequestContext,
  config: RunnerConfig,
  entry: UrlProfileEntry,
): Promise<PreflightPageResult> {
  const url = resolvePageUrl(entry.path, config.testStand).toString();
  let token;
  try {
    token = resolveToken(entry.token, entry.name);
  } catch (err) {
    return {
      name: entry.name,
      url,
      authProfile: entry.token,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      category: 'AUTH_ERROR',
    };
  }

  const headers: Record<string, string> = {};
  if (
    config.authStrategy === 'bearer-header' &&
    entry.token !== 'anonymous'
  ) {
    headers.Authorization = `Bearer ${token.value}`;
  }

  try {
    const response = await api.get(url, {
      headers,
      timeout: config.requestTimeoutSec * 1000,
      maxRedirects: 5,
    });
    const status = response.status();

    if (status === 401 || status === 403) {
      return {
        name: entry.name,
        url,
        authProfile: entry.token,
        ok: false,
        httpStatus: status,
        error: 'Authorization failed.',
        category: 'AUTH_ERROR' satisfies ErrorCategory,
      };
    }
    if (status === 404) {
      return {
        name: entry.name,
        url,
        authProfile: entry.token,
        ok: false,
        httpStatus: status,
        error: 'Page not found (404).',
        category: 'PAGE_ERROR',
      };
    }
    if (status >= 500) {
      return {
        name: entry.name,
        url,
        authProfile: entry.token,
        ok: false,
        httpStatus: status,
        error: `Server error (${status}).`,
        category: 'PAGE_ERROR',
      };
    }
    if (status >= 400) {
      return {
        name: entry.name,
        url,
        authProfile: entry.token,
        ok: false,
        httpStatus: status,
        error: `Unexpected HTTP status ${status}.`,
        category: 'PAGE_ERROR',
      };
    }

    return {
      name: entry.name,
      url,
      authProfile: entry.token,
      ok: true,
      httpStatus: status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout/i.test(message);
    return {
      name: entry.name,
      url,
      authProfile: entry.token,
      ok: false,
      error: isTimeout ? `Timeout after ${config.requestTimeoutSec}s.` : message,
      category: 'PAGE_ERROR',
    };
  }
}
