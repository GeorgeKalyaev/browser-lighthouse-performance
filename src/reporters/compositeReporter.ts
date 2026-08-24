import type {
  MeasurementError,
  MeasurementResult,
  PerformanceReporter,
} from '../types/index.js';
import { logger } from '../logging/logger.js';

export class CompositeReporter implements PerformanceReporter {
  constructor(private readonly reporters: PerformanceReporter[]) {}

  async reportMeasurement(result: MeasurementResult): Promise<void> {
    let jsonOk = false;
    let influxOk: boolean | null = null;

    for (const reporter of this.reporters) {
      const name = reporter.constructor.name;
      try {
        await reporter.reportMeasurement(result);
        if (name === 'JsonFileReporter') {
          jsonOk = true;
        }
        if (name === 'InfluxReporter') {
          influxOk = true;
        }
      } catch (err) {
        logger.error(
          `REPORTER_ERROR in ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (name === 'InfluxReporter') {
          influxOk = false;
        }
      }
    }

    logger.blank();
    logger.info(`JSON: ${jsonOk ? 'saved' : 'skipped'}`);
    if (influxOk === null) {
      logger.info('InfluxDB: disabled');
    } else {
      logger.info(`InfluxDB: ${influxOk ? 'sent' : 'failed'}`);
    }
    logger.info('Status: SUCCESS');
  }

  async reportError(error: MeasurementError): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.reportError(error);
      } catch (err) {
        logger.error(
          `REPORTER_ERROR in ${reporter.constructor.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async close(): Promise<void> {
    for (const reporter of this.reporters) {
      try {
        await reporter.close();
      } catch (err) {
        logger.error(
          `REPORTER_ERROR on close (${reporter.constructor.name}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  getStats(): { sent: number; failed: number } {
    let sent = 0;
    let failed = 0;
    for (const reporter of this.reporters) {
      if (reporter.getStats) {
        const s = reporter.getStats();
        sent += s.sent;
        failed += s.failed;
      }
    }
    return { sent, failed };
  }
}
