import type {
  EnvironmentMetadata,
  MeasurementError,
  MeasurementResult,
  RunnerConfig,
  UrlProfileEntry,
} from '../types/index.js';
import { resolveToken } from '../auth/tokenResolver.js';
import { PlaywrightManager } from '../browser/playwrightManager.js';
import { LighthouseRunner } from '../lighthouse/lighthouseRunner.js';
import { resolvePageUrl } from '../utils/url.js';
import { sleep } from '../utils/sleep.js';
import { logger } from '../logging/logger.js';
import type { CompositeReporter } from '../reporters/compositeReporter.js';
import type { JsonFileReporter } from '../reporters/jsonFileReporter.js';
import { buildSummary, printSummary } from './summary.js';

export interface RunnerDeps {
  config: RunnerConfig;
  profile: readonly UrlProfileEntry[];
  environment: EnvironmentMetadata;
  playwright: PlaywrightManager;
  lighthouse: LighthouseRunner;
  reporters: CompositeReporter;
  jsonReporter: JsonFileReporter;
}

export class PerformanceRunner {
  private stopRequested = false;
  private readonly measurements: MeasurementResult[] = [];
  private readonly errors: MeasurementError[] = [];
  private index = 0;

  constructor(private readonly deps: RunnerDeps) {}

  requestStop(): void {
    if (!this.stopRequested) {
      this.stopRequested = true;
      logger.blank();
      logger.info('Stop requested.');
      logger.info('Finishing current operation...');
    }
  }

  async run(): Promise<number> {
    const { config, profile, playwright, lighthouse, reporters, jsonReporter, environment } =
      this.deps;

    const startedAt = Date.now();
    const deadline = startedAt + config.runTimeSec * 1000;

    logger.info('Starting measurements...');
    logger.blank();

    while (Date.now() < deadline && !this.stopRequested) {
      const entry = profile[this.index % profile.length];
      this.index += 1;

      await this.measureOne(entry, playwright, lighthouse, reporters, environment);

      if (Date.now() >= deadline || this.stopRequested) {
        break;
      }

      if (config.pacingSec > 0) {
        await sleep(config.pacingSec * 1000);
      }
    }

    logger.info('Saving results...');
    logger.info('Flushing reporters...');
    const influxStats = reporters.getStats();
    const summary = buildSummary({
      runId: config.runId,
      configuredRunTimeSec: config.runTimeSec,
      actualDurationSec: Math.round((Date.now() - startedAt) / 1000),
      measurements: this.measurements,
      errors: this.errors,
      influx: influxStats,
      pageNames: profile.map((p) => p.name),
      environment,
    });
    await jsonReporter.writeSummary(summary);
    await reporters.close();

    printSummary(summary);
    return this.errors.length > 0 && this.measurements.length === 0 ? 1 : 0;
  }

  private async measureOne(
    entry: UrlProfileEntry,
    playwright: PlaywrightManager,
    lighthouse: LighthouseRunner,
    reporters: CompositeReporter,
    environment: EnvironmentMetadata,
  ): Promise<void> {
    const { config } = this.deps;
    const started = Date.now();
    const url = resolvePageUrl(entry.path, config.testStand).toString();
    const timestamp = new Date().toISOString();

    let authProfile = entry.token;

    try {
      const token = resolveToken(entry.token, entry.name);
      authProfile = token.name;

      // Prepare auth in shared Chromium (storage/cookies). Bearer also passed to Lighthouse.
      await playwright.prepareAuthForSharedBrowser(token);
      await playwright.clearCacheForCold();

      const lh = await lighthouse.measure({
        url,
        port: playwright.getDebuggingPort(),
        token,
        timeoutMs: config.requestTimeoutSec * 1000,
      });

      const result: MeasurementResult = {
        runId: config.runId,
        timestamp: lh.fetchTime || timestamp,
        page: entry.name,
        path: entry.path,
        url,
        profile: config.profileName,
        stand: config.testStand,
        authProfile,
        cacheMode: config.cacheMode,
        metrics: lh.metrics,
        environment,
        durationMs: Date.now() - started,
        status: 'SUCCESS',
      };

      this.measurements.push(result);
      await reporters.reportMeasurement(result);
    } catch (err) {
      const category =
        (err as { category?: MeasurementError['category'] }).category ?? 'LIGHTHOUSE_ERROR';
      const message = err instanceof Error ? err.message : String(err);

      const error: MeasurementError = {
        runId: config.runId,
        timestamp,
        page: entry.name,
        path: entry.path,
        url,
        profile: config.profileName,
        stand: config.testStand,
        authProfile,
        cacheMode: config.cacheMode,
        category,
        message,
        environment,
        durationMs: Date.now() - started,
        status: 'FAILED',
      };

      this.errors.push(error);
      await reporters.reportError(error);

      logger.error(
        [
          `[Browser Performance] Measurement failed (${category})`,
          `Page: ${entry.name}`,
          `URL: ${url}`,
          `Auth profile: ${authProfile}`,
          `Error: ${message}`,
        ].join('\n'),
      );
    }
  }
}
