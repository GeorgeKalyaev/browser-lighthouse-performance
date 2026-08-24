import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUrlProfile,
} from '../src/validation/validateConfig.js';

/**
 * Duplicate-name validation is implemented inside validateUrlProfile.
 * We exercise it by temporarily patching the profile registry.
 */
describe('duplicate page name fail-fast', () => {
  it('reports conflicting URLs and aborts-style message', async () => {
    const profiles = await import('../src/profiles/index.js');
    const original = profiles.urlProfiles.loadTestUrls;

    (profiles.urlProfiles as { loadTestUrls: typeof original }).loadTestUrls = [
      { name: 'Главная', path: './dashboard', token: 'userToken' },
      { name: 'Главная', path: './reports', token: 'userToken' },
    ];

    try {
      const result = validateUrlProfile('loadTestUrls', 'https://test.example.local/');
      assert.equal(result.ok, false);
      const dup = result.issues.find((i) => i.code === 'NAME_DUPLICATE');
      assert.ok(dup);
      assert.match(dup!.message, /Duplicate page name detected: "Главная"/);
      assert.match(dup!.message, /\.\/dashboard/);
      assert.match(dup!.message, /\.\/reports/);
      assert.match(dup!.message, /Browser performance test aborted/);
    } finally {
      (profiles.urlProfiles as { loadTestUrls: typeof original }).loadTestUrls = original;
    }
  });
});
