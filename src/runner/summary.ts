import type {
  EnvironmentMetadata,
  MeasurementError,
  MeasurementResult,
  RunSummary,
} from '../types/index.js';
import { logger } from '../logging/logger.js';

export function emptyPageStats(
  pageNames: string[],
): Record<string, { success: number; failed: number }> {
  const pages: Record<string, { success: number; failed: number }> = {};
  for (const name of pageNames) {
    pages[name] = { success: 0, failed: 0 };
  }
  return pages;
}

export function buildSummary(input: {
  runId: string;
  configuredRunTimeSec: number;
  actualDurationSec: number;
  measurements: MeasurementResult[];
  errors: MeasurementError[];
  influx: { sent: number; failed: number };
  pageNames: string[];
  environment: EnvironmentMetadata;
}): RunSummary {
  const pages = emptyPageStats(input.pageNames);
  for (const m of input.measurements) {
    pages[m.page] = pages[m.page] ?? { success: 0, failed: 0 };
    pages[m.page].success += 1;
  }
  for (const e of input.errors) {
    pages[e.page] = pages[e.page] ?? { success: 0, failed: 0 };
    pages[e.page].failed += 1;
  }

  return {
    runId: input.runId,
    configuredRunTimeSec: input.configuredRunTimeSec,
    actualDurationSec: input.actualDurationSec,
    totalMeasurements: input.measurements.length + input.errors.length,
    successful: input.measurements.length,
    failed: input.errors.length,
    influx: input.influx,
    pages,
    environment: input.environment,
  };
}

export function printSummary(summary: RunSummary): void {
  logger.blank();
  logger.section('Browser Performance Test completed');
  logger.blank();
  logger.info(`Run ID: ${summary.runId}`);
  logger.blank();
  logger.info(`Configured run time: ${summary.configuredRunTimeSec} sec`);
  logger.info(`Actual duration: ${summary.actualDurationSec} sec`);
  logger.blank();
  logger.info(`Total measurements: ${summary.totalMeasurements}`);
  logger.info(`Successful: ${summary.successful}`);
  logger.info(`Failed: ${summary.failed}`);
  logger.blank();
  logger.info('InfluxDB:');
  logger.info(`  sent: ${summary.influx.sent}`);
  logger.info(`  failed: ${summary.influx.failed}`);
  logger.blank();
  logger.info('Pages:');
  logger.blank();
  for (const [name, stats] of Object.entries(summary.pages)) {
    logger.info(name);
    logger.info(`  success: ${stats.success}`);
    logger.info(`  failed: ${stats.failed}`);
    logger.blank();
  }
}
