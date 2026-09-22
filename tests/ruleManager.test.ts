import { describe, expect, it } from 'vitest';
import { STATIC_RULESET_IDS } from '../src/background/ruleManager';

describe('rule manager invariants', () => {
  it('keeps all security rulesets enabled in the hardened build', () => {
    expect(STATIC_RULESET_IDS).toEqual([
      'header_rules',
      'tracker_rules',
      'ad_rules',
      'network_rules',
      'url_rules',
    ]);
  });
});
