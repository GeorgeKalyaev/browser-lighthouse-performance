/**
 * Logical token names used in URL profiles.
 * Values come from environment variables — never hardcode secrets.
 *
 * `anonymous` is for public pages (no secret required).
 */
export const TOKEN_ENV_MAP = {
  userToken: 'USER_TOKEN',
  adminToken: 'ADMIN_TOKEN',
  anonymous: 'ANONYMOUS_TOKEN',
} as const;

export type TokenName = keyof typeof TOKEN_ENV_MAP;

/** Live view of token env values (re-read on each access). */
export const tokens: Record<TokenName, string | undefined> = {
  get userToken() {
    return process.env.USER_TOKEN;
  },
  get adminToken() {
    return process.env.ADMIN_TOKEN;
  },
  get anonymous() {
    // Public pages: default placeholder so env is not required.
    return process.env.ANONYMOUS_TOKEN?.trim() || 'anonymous';
  },
};

export function isKnownTokenName(name: string): name is TokenName {
  return Object.prototype.hasOwnProperty.call(TOKEN_ENV_MAP, name);
}

export function envVarForToken(name: TokenName): string {
  return TOKEN_ENV_MAP[name];
}

export function listKnownTokenNames(): TokenName[] {
  return Object.keys(TOKEN_ENV_MAP) as TokenName[];
}

export function isAnonymousToken(name: string): boolean {
  return name === 'anonymous';
}
