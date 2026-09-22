import { describe, expect, it } from 'vitest';
import { STATIC_RULESET_IDS, getWantedRulesetIds } from '../src/background/ruleManager';

describe('rule manager invariants', () => {
  it('declares all supported static rulesets', () => {
    expect(STATIC_RULESET_IDS).toEqual([
      'header_rules',
      'tracker_rules',
      'ad_rules',
      'network_rules',
      'url_rules',
    ]);
  });
});

  it('maps individual module toggles to rulesets', () => {
    expect(getWantedRulesetIds(true, {
      headers: true,
      trackers: false,
      ads: false,
      network: true,
      urlCleaner: false,
    })).toEqual(['header_rules', 'network_rules']);
    expect(getWantedRulesetIds(false, {
      headers: true,
      trackers: true,
      ads: true,
      network: true,
      urlCleaner: true,
    })).toEqual([]);
  });
