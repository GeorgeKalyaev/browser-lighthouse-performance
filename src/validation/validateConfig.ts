import { isAbsoluteHttpUrl, resolvePageUrl } from '../utils/url.js';
import { getUrlProfile, listProfileNames } from '../profiles/index.js';
import { isKnownTokenName, envVarForToken, tokens, type TokenName } from '../config/tokens.js';
import type { InfluxConfig, RunnerConfig, UrlProfileEntry } from '../types/index.js';

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ProfileValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  profile?: readonly UrlProfileEntry[];
}

export function validateTestStand(testStand: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!testStand) {
    issues.push({
      code: 'TEST_STAND_MISSING',
      message: 'TEST_STAND is missing.',
    });
    return issues;
  }
  if (!isAbsoluteHttpUrl(testStand)) {
    issues.push({
      code: 'TEST_STAND_INVALID',
      message: [
        'TEST_STAND is invalid:',
        `"${testStand}"`,
        '',
        'Expected absolute URL, for example:',
        'https://test.example.local/',
      ].join('\n'),
    });
    return issues;
  }

  try {
    // Smoke-resolve a relative path the same way runtime does.
    resolvePageUrl('./health', testStand);
  } catch (err) {
    issues.push({
      code: 'TEST_STAND_RESOLVE',
      message: `TEST_STAND cannot resolve relative paths: ${String(err)}`,
    });
  }
  return issues;
}

export function validateInfluxConfig(influx: InfluxConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!influx.enabled) {
    return issues;
  }
  if (!influx.url) {
    issues.push({
      code: 'INFLUX_URL_MISSING',
      message: 'INFLUX_ENABLED=true but INFLUX_URL is not configured.',
    });
  } else if (!isAbsoluteHttpUrl(influx.url)) {
    issues.push({
      code: 'INFLUX_URL_INVALID',
      message: `INFLUX_URL must be an absolute http(s) URL, got: "${influx.url}"`,
    });
  }
  if (!influx.database) {
    issues.push({
      code: 'INFLUX_DATABASE_MISSING',
      message: 'INFLUX_ENABLED=true but INFLUX_DATABASE is not configured.',
    });
  }
  if (!influx.measurement) {
    issues.push({
      code: 'INFLUX_MEASUREMENT_MISSING',
      message: 'INFLUX_MEASUREMENT is empty.',
    });
  }
  return issues;
}

export function validateRunnerNumbers(config: RunnerConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const checks: Array<[string, number]> = [
    ['RUN_TIME', config.runTimeSec],
    ['PACING', config.pacingSec],
    ['PERF_REQUEST_TIMEOUT', config.requestTimeoutSec],
  ];
  for (const [name, value] of checks) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        code: `${name}_INVALID`,
        message: `${name} must be a positive number of seconds, got: ${value}`,
      });
    }
  }
  return issues;
}

export function validateUrlProfile(
  profileName: string,
  testStand: string,
): ProfileValidationResult {
  const issues: ValidationIssue[] = [];
  const profile = getUrlProfile(profileName);

  if (!profile) {
    issues.push({
      code: 'PROFILE_NOT_FOUND',
      message: [
        '[Browser Performance] Profile not found',
        '',
        'Requested:',
        profileName,
        '',
        'Available profiles:',
        ...listProfileNames().map((n) => `- ${n}`),
      ].join('\n'),
    });
    return { ok: false, issues };
  }

  if (profile.length === 0) {
    issues.push({
      code: 'PROFILE_EMPTY',
      message: `Profile "${profileName}" is empty.`,
    });
    return { ok: false, issues };
  }

  const nameIndex = new Map<string, string[]>();

  profile.forEach((entry, index) => {
    const label = `entry[${index}]`;

    if (entry.name === undefined || entry.name === null) {
      issues.push({ code: 'NAME_MISSING', message: `${label}: name is missing.` });
    } else if (String(entry.name).trim() === '') {
      issues.push({ code: 'NAME_EMPTY', message: `${label}: name is empty.` });
    } else {
      const name = String(entry.name);
      const paths = nameIndex.get(name) ?? [];
      paths.push(entry.path ?? `(missing path @ ${label})`);
      nameIndex.set(name, paths);
    }

    if (entry.path === undefined || entry.path === null) {
      issues.push({ code: 'PATH_MISSING', message: `${label} ("${entry.name}"): path is missing.` });
    } else if (String(entry.path).trim() === '') {
      issues.push({ code: 'PATH_EMPTY', message: `${label} ("${entry.name}"): path is empty.` });
    } else if (testStand && isAbsoluteHttpUrl(testStand)) {
      try {
        resolvePageUrl(entry.path, testStand);
      } catch (err) {
        issues.push({
          code: 'PATH_RESOLVE',
          message: `${label} ("${entry.name}"): cannot resolve path "${entry.path}" against TEST_STAND: ${String(err)}`,
        });
      }
    }

    if (entry.token === undefined || entry.token === null) {
      issues.push({ code: 'TOKEN_MISSING', message: `${label} ("${entry.name}"): token is missing.` });
    } else if (String(entry.token).trim() === '') {
      issues.push({ code: 'TOKEN_EMPTY', message: `${label} ("${entry.name}"): token is empty.` });
    } else if (!isKnownTokenName(entry.token)) {
      issues.push({
        code: 'TOKEN_UNKNOWN',
        message: `${label} ("${entry.name}"): unknown token "${entry.token}".`,
      });
    }
  });

  for (const [name, paths] of nameIndex) {
    if (paths.length > 1) {
      issues.push({
        code: 'NAME_DUPLICATE',
        message: [
          '[Browser Performance] Profile validation failed',
          '',
          `Duplicate page name detected: "${name}"`,
          '',
          'Conflicting URLs:',
          ...paths.map((p, i) => `  ${i + 1}. ${p}`),
          '',
          'Each "name" in PERFORMANCE_URLS_PROFILE must be unique.',
          '',
          'Browser performance test aborted.',
        ].join('\n'),
      });
    }
  }

  return { ok: issues.length === 0, issues, profile };
}

export function validateTokensForProfile(
  profile: readonly UrlProfileEntry[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const needed = new Map<string, string>();

  for (const entry of profile) {
    if (!isKnownTokenName(entry.token)) {
      continue;
    }
    if (!needed.has(entry.token)) {
      needed.set(entry.token, entry.name);
    }
  }

  for (const [tokenName, pageName] of needed) {
    if (tokenName === 'anonymous') {
      continue;
    }
    const envVar = envVarForToken(tokenName as TokenName);
    const value = tokens[tokenName as TokenName];
    if (!value || value.trim() === '') {
      issues.push({
        code: 'TOKEN_VALUE_MISSING',
        message: [
          '[Browser Performance] Token configuration error',
          '',
          `Token "${tokenName}" is required for page:`,
          `"${pageName}"`,
          '',
          `Environment variable ${envVar} is not configured.`,
        ].join('\n'),
      });
    }
  }

  return issues;
}

export function validateConfiguration(config: RunnerConfig): ValidationIssue[] {
  return [
    ...validateTestStand(config.testStand),
    ...validateRunnerNumbers(config),
    ...validateInfluxConfig(config.influx),
  ];
}

export function formatIssuesBlock(issues: ValidationIssue[]): string {
  return [
    '[Browser Performance] Configuration error',
    '',
    ...issues.map((i) => i.message),
    '',
    'Browser performance test aborted.',
  ].join('\n');
}
