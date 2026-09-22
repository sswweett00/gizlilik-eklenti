import { describe, expect, it } from 'vitest';
import { buildUrlCleanerRule } from '../src/background/urlCleaner';

describe('URL cleaner rule', () => {
  it('removes common tracking parameters declaratively', () => {
    const rule = buildUrlCleanerRule();
    expect(rule.action.type).toBe('redirect');
    expect(rule.redirect?.transform?.queryTransform?.removeParams).toContain('utm_source');
    expect(rule.redirect?.transform?.queryTransform?.removeParams).toContain('fbclid');
    expect(rule.redirect?.transform?.queryTransform?.removeParams).toContain('gclid');
    expect(rule.condition?.resourceTypes).toEqual(['main_frame', 'sub_frame']);
  });
});
