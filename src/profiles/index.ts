import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UrlProfileEntry, UrlProfileMap } from '../types/index.js';

/**
 * URL profiles are JSON files under profiles/ (or PROFILES_DIR).
 * K8s Job can refresh them at runtime via git clone without rebuilding the image.
 */

let cached: UrlProfileMap | null = null;

function resolveProfilesDir(): string {
  if (process.env.PROFILES_DIR?.trim()) {
    return process.env.PROFILES_DIR.trim();
  }
  // src/profiles/index.ts  → ../../profiles
  // dist/profiles/index.js → ../../profiles
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'profiles');
}

function isProfileEntry(value: unknown): value is UrlProfileEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.name === 'string' &&
    typeof e.path === 'string' &&
    typeof e.token === 'string'
  );
}

export function loadProfilesFromDisk(dir = resolveProfilesDir()): UrlProfileMap {
  const map: UrlProfileMap = {};
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch (err) {
    throw new Error(
      `Cannot read URL profiles from ${dir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  for (const file of files) {
    const name = file.replace(/\.json$/i, '');
    const raw = readFileSync(join(dir, file), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isProfileEntry)) {
      throw new Error(`Invalid profile JSON: ${join(dir, file)} (expected array of {name,path,token})`);
    }
    map[name] = parsed;
  }
  return map;
}

export function getUrlProfiles(): UrlProfileMap {
  if (!cached) {
    cached = loadProfilesFromDisk();
  }
  return cached;
}

/** @deprecated use getUrlProfiles() — kept for tests that patch the registry */
export const urlProfiles: UrlProfileMap = new Proxy({} as UrlProfileMap, {
  get(_t, prop: string | symbol) {
    if (typeof prop !== 'string') return undefined;
    return getUrlProfiles()[prop];
  },
  set(_t, prop: string | symbol, value: readonly UrlProfileEntry[]) {
    if (typeof prop !== 'string') return false;
    const map = { ...getUrlProfiles(), [prop]: value };
    cached = map;
    return true;
  },
  ownKeys() {
    return Reflect.ownKeys(getUrlProfiles());
  },
  getOwnPropertyDescriptor(_t, prop) {
    if (typeof prop !== 'string') return undefined;
    const v = getUrlProfiles()[prop];
    if (v === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value: v };
  },
});

export function listProfileNames(): string[] {
  return Object.keys(getUrlProfiles());
}

export function getUrlProfile(name: string): readonly UrlProfileEntry[] | undefined {
  return getUrlProfiles()[name];
}

/** Clear cache after git-sync or in tests. */
export function resetProfilesCache(): void {
  cached = null;
}
