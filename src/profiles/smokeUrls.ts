import type { UrlProfileEntry } from '../types/index.js';

/** Short smoke profile for quick local checks. */
export const smokeUrls: readonly UrlProfileEntry[] = [
  {
    name: 'Главная',
    path: './dashboard',
    token: 'userToken',
  },
];
