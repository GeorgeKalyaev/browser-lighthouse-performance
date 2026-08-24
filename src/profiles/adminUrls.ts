import type { UrlProfileEntry } from '../types/index.js';

export const adminUrls: readonly UrlProfileEntry[] = [
  {
    name: 'Админка-пользователи',
    path: './admin/users',
    token: 'adminToken',
  },
];
