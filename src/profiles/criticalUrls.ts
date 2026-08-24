import type { UrlProfileEntry } from '../types/index.js';

export const criticalUrls: readonly UrlProfileEntry[] = [
  {
    name: 'Главная',
    path: './dashboard',
    token: 'userToken',
  },
  {
    name: 'Карточка проекта',
    path: './projects/1001',
    token: 'userToken',
  },
];
