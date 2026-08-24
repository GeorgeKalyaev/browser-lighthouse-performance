import type {
  MeasurementError,
  MeasurementResult,
  PerformanceReporter,
} from '../types/index.js';
import { logger } from '../logging/logger.js';

function fmtMs(value: number | null): string {
  if (value === null) {
    return 'unavailable';
  }
  return `${Math.round(value)} ms`;
}

function fmtCls(value: number | null): string {
  if (value === null) {
    return 'unavailable';
  }
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

export class ConsoleReporter implements PerformanceReporter {
  async reportMeasurement(result: MeasurementResult): Promise<void> {
    logger.divider();
    logger.blank();
    logger.info(`Page: ${result.page}`);
    logger.info(`URL: ${result.url}`);
    logger.blank();
    logger.info(`Auth: ${result.authProfile}`);
    logger.info(`Cache: ${result.cacheMode}`);
    logger.blank();
    logger.info(`Speed Index: ${fmtMs(result.metrics.speedIndex)}`);
    logger.info(`FCP: ${fmtMs(result.metrics.fcp)}`);
    logger.info(`LCP: ${fmtMs(result.metrics.lcp)}`);
    logger.info(`TTFB: ${fmtMs(result.metrics.ttfb)}`);
    logger.info(`TBT: ${fmtMs(result.metrics.tbt)}`);
    logger.info(`CLS: ${fmtCls(result.metrics.cls)}`);
    logger.blank();
    logger.info(`Duration: ${(result.durationMs / 1000).toFixed(1)} sec`);
  }

  async reportError(error: MeasurementError): Promise<void> {
    logger.divider();
    logger.blank();
    logger.info(`Page: ${error.page}`);
    logger.info(`URL: ${error.url}`);
    logger.blank();
    logger.info(`Auth: ${error.authProfile}`);
    logger.info(`Cache: ${error.cacheMode}`);
    logger.blank();
    logger.error(`Category: ${error.category}`);
    logger.error(`Error: ${error.message}`);
    if (error.httpStatus !== undefined) {
      logger.error(`HTTP status: ${error.httpStatus}`);
    }
    logger.blank();
    logger.info('Status: FAILED');
  }

  async close(): Promise<void> {
    // no-op
  }
}
