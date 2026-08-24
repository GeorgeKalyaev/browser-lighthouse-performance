import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateUrlProfile } from '../src/validation/validateConfig.js';

describe('empty fields in profile', () => {
  it('flags empty name and path', async () => {
    const profiles = await import('../src/profiles/index.js');
    const original = profiles.urlProfiles.smokeUrls;

    (profiles.urlProfiles as { smokeUrls: typeof original }).smokeUrls = [
      { name: '', path: '', token: '' },
    ];

    try {
      const result = validateUrlProfile('smokeUrls', 'https://test.example.local/');
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'NAME_EMPTY'));
      assert.ok(result.issues.some((i) => i.code === 'PATH_EMPTY'));
      assert.ok(result.issues.some((i) => i.code === 'TOKEN_EMPTY'));
    } finally {
      (profiles.urlProfiles as { smokeUrls: typeof original }).smokeUrls = original;
    }
  });

  it('flags unknown token name', async () => {
    const profiles = await import('../src/profiles/index.js');
    const original = profiles.urlProfiles.smokeUrls;

    (profiles.urlProfiles as { smokeUrls: typeof original }).smokeUrls = [
      { name: 'X', path: './x', token: 'ghostToken' },
    ];

    try {
      const result = validateUrlProfile('smokeUrls', 'https://test.example.local/');
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'TOKEN_UNKNOWN'));
    } finally {
      (profiles.urlProfiles as { smokeUrls: typeof original }).smokeUrls = original;
    }
  });
});
