import {
  envVarForToken,
  isKnownTokenName,
  listKnownTokenNames,
  tokens,
  type TokenName,
} from '../config/tokens.js';
import type { ResolvedToken } from '../types/index.js';

export class TokenResolutionError extends Error {
  readonly category = 'AUTH_ERROR' as const;
  readonly tokenName: string;
  readonly envVar: string;
  readonly pageName?: string;

  constructor(tokenName: string, envVar: string, pageName?: string) {
    const pageLine = pageName
      ? `Token "${tokenName}" is required for page:\n"${pageName}"\n\n`
      : `Token "${tokenName}" is required.\n\n`;
    super(
      `[Browser Performance] Token configuration error\n\n${pageLine}Environment variable ${envVar} is not configured.`,
    );
    this.name = 'TokenResolutionError';
    this.tokenName = tokenName;
    this.envVar = envVar;
    this.pageName = pageName;
  }
}

export function resolveToken(tokenName: string, pageName?: string): ResolvedToken {
  if (!isKnownTokenName(tokenName)) {
    throw Object.assign(
      new Error(
        `[Browser Performance] Token configuration error\n\nUnknown token name: "${tokenName}"\n\nKnown tokens:\n${listKnownTokenNames()
          .map((n) => `- ${n}`)
          .join('\n')}`,
      ),
      { category: 'AUTH_ERROR' as const },
    );
  }

  const envVar = envVarForToken(tokenName);
  const value = tokens[tokenName as TokenName];
  if (!value || value.trim() === '') {
    throw new TokenResolutionError(tokenName, envVar, pageName);
  }

  return {
    name: tokenName,
    value: value.trim(),
    envVar,
  };
}
