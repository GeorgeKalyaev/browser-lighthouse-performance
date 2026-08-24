import type { UrlProfileEntry } from '../types/index.js';

/**
 * Default load-test URL profile.
 * Domains live in TEST_STAND — only relative paths here.
 * `name` must be unique within the profile (Influx/Grafana page id).
 */
export const loadTestUrls: readonly UrlProfileEntry[] = [
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
  {
    name: 'Админка-пользователи',
    path: './admin/users',
    token: 'adminToken',
  },
];
