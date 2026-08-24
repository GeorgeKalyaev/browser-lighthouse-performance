import type { PerformanceMetrics } from '../types/index.js';

type LighthouseAudit = {
  id?: string;
  numericValue?: number;
  score?: number | null;
  details?: {
    items?: Array<Record<string, unknown>>;
  };
};

type LighthouseResultLike = {
  audits?: Record<string, LighthouseAudit | undefined>;
};

function readAuditMs(
  audits: Record<string, LighthouseAudit | undefined> | undefined,
  id: string,
): number | null {
  const audit = audits?.[id];
  if (!audit || typeof audit.numericValue !== 'number' || !Number.isFinite(audit.numericValue)) {
    return null;
  }
  return audit.numericValue;
}

function readCls(
  audits: Record<string, LighthouseAudit | undefined> | undefined,
): number | null {
  const audit = audits?.['cumulative-layout-shift'];
  if (!audit || typeof audit.numericValue !== 'number' || !Number.isFinite(audit.numericValue)) {
    return null;
  }
  return audit.numericValue;
}

/**
 * TTFB source (explicit):
 *
 * Primary: Lighthouse audit `server-response-time` → `numericValue` (milliseconds).
 * This audit measures time from the start of the request until the first byte of
 * the main document response (Time To First Byte / server response time).
 *
 * Fallback: observed metric `timeToFirstByte` from the `metrics` audit details,
 * if present (also milliseconds).
 *
 * We do NOT substitute FCP/LCP/TTFB-lookalikes.
 */
export function extractTtfbMs(lhr: unknown): number | null {
  const audits = asAudits(lhr);
  const fromServerResponse = readAuditMs(audits, 'server-response-time');
  if (fromServerResponse !== null) {
    return fromServerResponse;
  }

  const metricsAudit = audits?.['metrics'];
  const details = metricsAudit?.details as { items?: Array<Record<string, unknown>> } | undefined;
  const items = details?.items;
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0];
    const ttfb = first?.timeToFirstByte;
    if (typeof ttfb === 'number' && Number.isFinite(ttfb)) {
      return ttfb;
    }
  }

  return null;
}

export function extractPerformanceMetrics(lhr: unknown): PerformanceMetrics {
  const audits = asAudits(lhr);
  return {
    speedIndex: readAuditMs(audits, 'speed-index'),
    fcp: readAuditMs(audits, 'first-contentful-paint'),
    lcp: readAuditMs(audits, 'largest-contentful-paint'),
    tbt: readAuditMs(audits, 'total-blocking-time'),
    cls: readCls(audits),
    ttfb: extractTtfbMs(lhr),
  };
}

function asAudits(
  lhr: unknown,
): Record<string, LighthouseAudit | undefined> | undefined {
  if (!lhr || typeof lhr !== 'object') {
    return undefined;
  }
  const audits = (lhr as LighthouseResultLike).audits;
  return audits as Record<string, LighthouseAudit | undefined> | undefined;
}
