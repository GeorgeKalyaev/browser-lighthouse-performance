import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  MeasurementError,
  MeasurementResult,
  PerformanceReporter,
  RunSummary,
} from '../types/index.js';

export class JsonFileReporter implements PerformanceReporter {
  private readonly dir: string;
  private readonly measurements: MeasurementResult[] = [];
  private readonly errors: MeasurementError[] = [];
  private summary: RunSummary | undefined;

  constructor(runId: string, resultsRoot = 'results') {
    this.dir = path.resolve(resultsRoot, runId);
  }

  getDirectory(): string {
    return this.dir;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.flush();
  }

  async reportMeasurement(result: MeasurementResult): Promise<void> {
    // Strip any accidental secrets — MeasurementResult must never contain tokens.
    this.measurements.push(result);
    await this.flush();
  }

  async reportError(error: MeasurementError): Promise<void> {
    this.errors.push(error);
    await this.flush();
  }

  async writeSummary(summary: RunSummary): Promise<void> {
    this.summary = summary;
    await this.flush();
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(
      path.join(this.dir, 'measurements.json'),
      `${JSON.stringify(this.measurements, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(this.dir, 'errors.json'),
      `${JSON.stringify(this.errors, null, 2)}\n`,
      'utf8',
    );
    if (this.summary) {
      await writeFile(
        path.join(this.dir, 'summary.json'),
        `${JSON.stringify(this.summary, null, 2)}\n`,
        'utf8',
      );
    }
  }

  static async readJson<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  }
}
