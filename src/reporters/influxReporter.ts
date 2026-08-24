import type {
  EnvironmentMetadata,
  InfluxConfig,
  MeasurementError,
  MeasurementResult,
  PerformanceReporter,
} from '../types/index.js';
import { logger } from '../logging/logger.js';

const MAX_RETRIES = 3;

/**
 * InfluxDB 1.8 reporter via Line Protocol HTTP API (/write).
 *
 * Tags (cardinality-safe):
 *   page, profile, stand, run_id, cacheMode
 *
 * Note: tag key is `run_id` (snake_case) to align with existing JMeter Backend Listener
 * TAG_run_id used in grafana-dashboards / JmeterReport, so Grafana can correlate runs.
 *
 * Fields (ms except CLS):
 *   speedIndex, fcp, lcp, ttfb, tbt, cls, durationMs
 *
 * Metadata fields (not tags — avoids cardinality growth):
 *   path, url, authProfile, browserVersion, playwrightVersion, lighthouseVersion, nodeVersion, status
 *
 * Timestamp: nanoseconds of the actual measurement time (not run start).
 */
export class InfluxReporter implements PerformanceReporter {
  private sent = 0;
  private failed = 0;
  private readonly pending: Promise<void>[] = [];

  constructor(
    private readonly config: InfluxConfig,
    private readonly environment: EnvironmentMetadata,
  ) {}

  getStats(): { sent: number; failed: number } {
    return { sent: this.sent, failed: this.failed };
  }

  async reportMeasurement(result: MeasurementResult): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    const line = this.formatMeasurementLine(result);
    const task = this.writeWithRetry(line, result.page, result.runId);
    this.pending.push(task);
    await task;
  }

  async reportError(error: MeasurementError): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    const line = this.formatErrorLine(error);
    const task = this.writeWithRetry(line, error.page, error.runId);
    this.pending.push(task);
    await task;
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.pending);
  }

  async ping(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const pingUrl = new URL('/ping', this.config.url);
      const response = await fetch(pingUrl, { method: 'GET' });
      const version = response.headers.get('x-influxdb-version') ?? undefined;
      if (!response.ok && response.status !== 204) {
        return { ok: false, version, error: `HTTP ${response.status}` };
      }
      // Ensure database exists / is reachable via a cheap show databases or write check
      const queryUrl = new URL('/query', this.config.url);
      queryUrl.searchParams.set('q', 'SHOW DATABASES');
      if (this.config.username) {
        queryUrl.searchParams.set('u', this.config.username);
      }
      if (this.config.password) {
        queryUrl.searchParams.set('p', this.config.password);
      }
      const qRes = await fetch(queryUrl);
      if (!qRes.ok) {
        return { ok: false, version, error: `Query failed: HTTP ${qRes.status}` };
      }
      return { ok: true, version: version ?? '1.x' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private formatMeasurementLine(result: MeasurementResult): string {
    const tags = this.formatTags({
      page: result.page,
      profile: result.profile,
      stand: new URL(result.stand).host,
      run_id: result.runId,
      cacheMode: result.cacheMode,
    });

    const fields: string[] = [];
    this.pushNumeric(fields, 'speedIndex', result.metrics.speedIndex);
    this.pushNumeric(fields, 'fcp', result.metrics.fcp);
    this.pushNumeric(fields, 'lcp', result.metrics.lcp);
    this.pushNumeric(fields, 'ttfb', result.metrics.ttfb);
    this.pushNumeric(fields, 'tbt', result.metrics.tbt);
    this.pushNumeric(fields, 'cls', result.metrics.cls, false);
    fields.push(`durationMs=${Math.round(result.durationMs)}i`);
    fields.push(`path=${quoteString(result.path)}`);
    fields.push(`url=${quoteString(result.url)}`);
    fields.push(`authProfile=${quoteString(result.authProfile)}`);
    fields.push(`browserVersion=${quoteString(result.environment.browserVersion)}`);
    fields.push(`playwrightVersion=${quoteString(result.environment.playwrightVersion)}`);
    fields.push(`lighthouseVersion=${quoteString(result.environment.lighthouseVersion)}`);
    fields.push(`nodeVersion=${quoteString(result.environment.nodeVersion)}`);
    fields.push(`status=${quoteString('SUCCESS')}`);

    const ts = toNanoTimestamp(result.timestamp);
    return `${this.config.measurement},${tags} ${fields.join(',')} ${ts}`;
  }

  private formatErrorLine(error: MeasurementError): string {
    const tags = this.formatTags({
      page: error.page,
      profile: error.profile,
      stand: safeHost(error.stand),
      run_id: error.runId,
      cacheMode: error.cacheMode,
      category: error.category,
    });

    const fields = [
      `durationMs=${Math.round(error.durationMs)}i`,
      `path=${quoteString(error.path)}`,
      `url=${quoteString(error.url)}`,
      `authProfile=${quoteString(error.authProfile)}`,
      `message=${quoteString(error.message)}`,
      `status=${quoteString('FAILED')}`,
      `browserVersion=${quoteString(this.environment.browserVersion)}`,
      `playwrightVersion=${quoteString(this.environment.playwrightVersion)}`,
      `lighthouseVersion=${quoteString(this.environment.lighthouseVersion)}`,
      `nodeVersion=${quoteString(this.environment.nodeVersion)}`,
    ];
    if (error.httpStatus !== undefined) {
      fields.push(`httpStatus=${error.httpStatus}i`);
    }

    const ts = toNanoTimestamp(error.timestamp);
    return `${this.config.measurement},${tags} ${fields.join(',')} ${ts}`;
  }

  private formatTags(tags: Record<string, string>): string {
    return Object.entries(tags)
      .map(([k, v]) => `${escapeTag(k)}=${escapeTag(v)}`)
      .join(',');
  }

  private pushNumeric(
    fields: string[],
    key: string,
    value: number | null,
    asInteger = true,
  ): void {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    if (asInteger) {
      fields.push(`${key}=${Math.round(value)}i`);
    } else {
      fields.push(`${key}=${value}`);
    }
  }

  private async writeWithRetry(line: string, page: string, runId: string): Promise<void> {
    let lastError = 'unknown';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.writeOnce(line);
        this.sent += 1;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        logger.error(
          [
            '[InfluxDB] REPORTER_ERROR',
            `timestamp: ${new Date().toISOString()}`,
            `page: ${page}`,
            `runId: ${runId}`,
            `reason: ${lastError}`,
            `retry: ${attempt}/${MAX_RETRIES}`,
          ].join('\n'),
        );
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }
    }
    this.failed += 1;
  }

  private async writeOnce(line: string): Promise<void> {
    const writeUrl = new URL('/write', this.config.url);
    writeUrl.searchParams.set('db', this.config.database);
    writeUrl.searchParams.set('precision', 'ns');
    if (this.config.username) {
      writeUrl.searchParams.set('u', this.config.username);
    }
    if (this.config.password) {
      writeUrl.searchParams.set('p', this.config.password);
    }

    const response = await fetch(writeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: line,
    });

    if (response.status !== 204 && response.status !== 200) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
  }
}

function escapeTag(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/ /g, '\\ ')
    .replace(/,/g, '\\,')
    .replace(/=/g, '\\=');
}

function quoteString(value: string): string {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function toNanoTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  const safe = Number.isFinite(ms) ? ms : Date.now();
  return `${BigInt(safe) * 1_000_000n}`;
}

function safeHost(stand: string): string {
  try {
    return new URL(stand).host;
  } catch {
    return stand;
  }
}
