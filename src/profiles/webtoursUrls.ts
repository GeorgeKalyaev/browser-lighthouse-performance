import type { UrlProfileEntry } from '../types/index.js';

/**
 * Local WebTours demo profile (HP/Mercury sample app).
 * Pair with TEST_STAND=http://127.0.0.1:1080/
 *
 * Pages are public HTML — use token "anonymous".
 */
export const webtoursUrls: readonly UrlProfileEntry[] = [
  {
    name: 'WebTours-Home',
    path: './WebTours/',
    token: 'anonymous',
  },
  {
    name: 'WebTours-HomeHtml',
    path: './WebTours/home.html',
    token: 'anonymous',
  },
  {
    name: 'WebTours-Welcome',
    path: './cgi-bin/welcome.pl?signOff=true',
    token: 'anonymous',
  },
];
