import { loadTestUrls } from './loadTestUrls.js';
import { smokeUrls } from './smokeUrls.js';
import { criticalUrls } from './criticalUrls.js';
import { adminUrls } from './adminUrls.js';
import { webtoursUrls } from './webtoursUrls.js';
import type { UrlProfileEntry, UrlProfileMap } from '../types/index.js';

export const urlProfiles: UrlProfileMap = {
  loadTestUrls,
  smokeUrls,
  criticalUrls,
  adminUrls,
  webtoursUrls,
};

export function listProfileNames(): string[] {
  return Object.keys(urlProfiles);
}

export function getUrlProfile(name: string): readonly UrlProfileEntry[] | undefined {
  return urlProfiles[name];
}

export {
  loadTestUrls,
  smokeUrls,
  criticalUrls,
  adminUrls,
  webtoursUrls,
};
