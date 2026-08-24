import { createRequire } from 'node:module';
import type { EnvironmentMetadata } from '../types/index.js';

const require = createRequire(import.meta.url);

function readPackageVersion(pkgName: string): string {
  try {
    const pkg = require(`${pkgName}/package.json`) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function collectStaticVersions(): Pick<
  EnvironmentMetadata,
  'nodeVersion' | 'playwrightVersion' | 'lighthouseVersion'
> {
  return {
    nodeVersion: process.version,
    playwrightVersion: readPackageVersion('playwright'),
    lighthouseVersion: readPackageVersion('lighthouse'),
  };
}

export function buildEnvironmentMetadata(
  browserName: string,
  browserVersion: string,
): EnvironmentMetadata {
  return {
    ...collectStaticVersions(),
    browserName,
    browserVersion,
  };
}
