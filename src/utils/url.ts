export function resolvePageUrl(path: string, testStand: string): URL {
  return new URL(path, testStand);
}

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Origin used for storage/cookie prep (no path). */
export function standOrigin(testStand: string): string {
  const url = new URL(testStand);
  return url.origin;
}
