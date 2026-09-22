import { describe, expect, it } from 'vitest';
import { buildUrlCleanerRule } from '../src/background/urlCleaner';

describe('URL cleaner rules', () => {
  it('splits tracking-parameter matching into small regex rules', () => {
    const rules = buildUrlCleanerRule();
    expect(rules.length).toBeGreaterThanOrEqual(18);
    expect(rules.every((rule) => rule.action.type === 'redirect')).toBe(true);
    expect(rules.every((rule) => rule.condition?.resourceTypes).toBeDefined()).toBe(true);
    expect(rules.some((rule) => rule.condition?.regexFilter?.includes('utm_source'))).toBe(true);
    expect(rules.some((rule) => rule.condition?.regexFilter?.includes('fbclid'))).toBe(true);
    expect(rules.some((rule) => rule.condition?.regexFilter?.includes('gclid'))).toBe(true);
    expect(rules.every((rule) => (rule.condition?.regexFilter ?? '').length < 256)).toBe(true);

    const allRemoved = rules.every((rule) =>
      rule.action.redirect?.transform?.queryTransform?.removeParams?.includes('fbclid')
    );
    expect(allRemoved).toBe(true);

    expect(rules.every((rule) => (
      JSON.stringify(rule.condition?.resourceTypes) === JSON.stringify(['main_frame', 'sub_frame'])
    ))).toBe(true);
  });
});
