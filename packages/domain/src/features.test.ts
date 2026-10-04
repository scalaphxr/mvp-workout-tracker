import { describe, expect, it } from 'vitest';

import { FEATURES, hasFeature } from './features';

describe('hasFeature', () => {
  it('opens every Pro feature as a beta, for guests and signed-in users alike', () => {
    for (const feature of FEATURES) {
      expect(hasFeature(null, feature)).toBe(true);
      expect(hasFeature({ id: '0192a7c4-0000-7000-8000-000000000000' }, feature)).toBe(true);
    }
  });
});
