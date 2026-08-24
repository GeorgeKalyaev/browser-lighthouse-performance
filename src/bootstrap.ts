import { loadRunnerConfig } from './config/loadConfig.js';
import {
  formatIssuesBlock,
  validateConfiguration,
  validateTokensForProfile,
  validateUrlProfile,
} from './validation/validateConfig.js';
import { PlaywrightManager } from './browser/playwrightManager.js';
import { LighthouseRunner } from './lighthouse/lighthouseRunner.js';
import { ConsoleReporter } from './reporters/consoleReporter.js';
import { JsonFileReporter } from './reporters/jsonFileReporter.js';
import { InfluxReporter } from './reporters/influxReporter.js';
import { CompositeReporter } from './reporters/compositeReporter.js';
import { runPreflight } from './runner/preflight.js';
import { PerformanceRunner } from './runner/performanceRunner.js';
import { buildEnvironmentMetadata, collectStaticVersions } from './utils/versions.js';
import { logger } from './logging/logger.js';
import type { PerformanceReporter, RunnerConfig, UrlProfileEntry } from './types/index.js';

export interface BootstrapOptions {
  checkOnly?: boolean;
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<number> {
  let config: RunnerConfig;
  try {
    config = loadRunnerConfig();
  } catch (err) {
    logger.error(
      `[Browser Performance] Configuration error\n\n${err instanceof Error ? err.message : String(err)}\n\nBrowser performance test aborted.`,
    );
    return 1;
  }

  const staticVersions = collectStaticVersions();

  // --- Fail-fast validation (no Chrome/Lighthouse yet) ---
  const configIssues = validateConfiguration(config);
  const profileResult = validateUrlProfile(config.profileName, config.testStand);

  if (!profileResult.ok || !profileResult.profile) {
    for (const issue of profileResult.issues) {
      logger.error(issue.message);
    }
    return 1;
  }

  const tokenIssues = validateTokensForProfile(profileResult.profile);
  const allIssues = [...configIssues, ...tokenIssues];
  if (allIssues.length > 0) {
    logger.error(formatIssuesBlock(allIssues));
    return 1;
  }

  const profile = profileResult.profile;
  printBanner(config, staticVersions, profile);

  // --- Browser launch ---
  const playwright = new PlaywrightManager(config);
  let environment = buildEnvironmentMetadata('Chromium', 'unknown');

  try {
    const launched = await playwright.launch();
    environment = buildEnvironmentMetadata(launched.browserName, launched.browserVersion);
  } catch (err) {
    logger.error(
      `[Browser Performance] BROWSER_ERROR\n\n${err instanceof Error ? err.message : String(err)}\n\nBrowser performance test aborted.`,
    );
    await playwright.close();
    return 1;
  }

  logger.blank();
  logger.info('Profile validation: OK');
  logger.info('Token validation: OK');
  logger.info('Browser: OK');

  const preflight = await runPreflight({
    config,
    profile,
    environment,
  });

  if (!preflight.ok) {
    logger.error(preflight.fatalMessage ?? 'Preflight failed.');
    await playwright.close();
    return 1;
  }

  logger.info('Pages: OK');
  if (config.influx.enabled) {
    logger.info('InfluxDB: OK');
  } else {
    logger.info('InfluxDB: disabled');
  }
  logger.blank();

  if (options.checkOnly) {
    logger.section('Browser Performance preflight OK');
    logger.info('Profile OK');
    logger.info('Tokens OK');
    logger.info('Browser OK');
    logger.info('Pages OK');
    logger.info(config.influx.enabled ? 'InfluxDB OK' : 'InfluxDB skipped (disabled)');
    await playwright.close();
    return 0;
  }

  const jsonReporter = new JsonFileReporter(config.runId);
  await jsonReporter.init();

  const reportersList: PerformanceReporter[] = [
    new ConsoleReporter(),
    jsonReporter,
  ];
  if (config.influx.enabled) {
    reportersList.push(new InfluxReporter(config.influx, environment));
  }
  const reporters = new CompositeReporter(reportersList);

  const runner = new PerformanceRunner({
    config,
    profile,
    environment,
    playwright,
    lighthouse: new LighthouseRunner(config),
    reporters,
    jsonReporter,
  });

  const onSignal = (): void => {
    runner.requestStop();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    return await runner.run();
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    logger.info('Closing browser...');
    await playwright.close();
  }
}

function printBanner(
  config: RunnerConfig,
  versions: ReturnType<typeof collectStaticVersions>,
  profile: readonly UrlProfileEntry[],
): void {
  logger.section('Browser Performance Test');
  logger.blank();
  logger.info(`Run ID: ${config.runId}`);
  logger.info(`Profile: ${config.profileName}`);
  logger.info(`Stand: ${config.testStand}`);
  logger.info(`Run time: ${config.runTimeSec} sec`);
  logger.info(`Pacing: ${config.pacingSec} sec`);
  logger.info(`Timeout: ${config.requestTimeoutSec} sec`);
  logger.info(`Cache mode: ${config.cacheMode}`);
  logger.blank();
  logger.info(`Node: ${versions.nodeVersion}`);
  logger.info(`Playwright: ${versions.playwrightVersion}`);
  logger.info('Chromium: (detected at browser launch)');
  logger.info(`Lighthouse: ${versions.lighthouseVersion}`);
  logger.blank();
  logger.info('InfluxDB:');
  logger.info(`  Enabled: ${config.influx.enabled}`);
  if (config.influx.enabled) {
    logger.info(`  URL: ${config.influx.url}`);
    logger.info(`  Database: ${config.influx.database}`);
    logger.info(`  Measurement: ${config.influx.measurement}`);
  }
  logger.blank();
  logger.info(`URLs: ${profile.length}`);
  logger.blank();
}
