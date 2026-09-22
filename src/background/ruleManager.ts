export const STATIC_RULESET_IDS = Object.freeze([
  'header_rules',
  'tracker_rules',
  'ad_rules',
  'network_rules',
  'url_rules',
] as const);

export type StaticRulesetId = (typeof STATIC_RULESET_IDS)[number];

export interface StaticRulesetModules {
  headers: boolean;
  trackers: boolean;
  ads: boolean;
  network: boolean;
  urlCleaner: boolean;
}

export const RULESET_MODULE_MAP: Readonly<Record<keyof StaticRulesetModules, StaticRulesetId>> = Object.freeze({
  headers: 'header_rules',
  trackers: 'tracker_rules',
  ads: 'ad_rules',
  network: 'network_rules',
  urlCleaner: 'url_rules',
});

export function getWantedRulesetIds(enabled: boolean, modules: Partial<StaticRulesetModules> = {}): StaticRulesetId[] {
  if (!enabled) return [];
  return (Object.keys(RULESET_MODULE_MAP) as Array<keyof StaticRulesetModules>)
    .filter((module) => modules[module] !== false)
    .map((module) => RULESET_MODULE_MAP[module]);
}

export async function applyStaticRulesets(
  enabled: boolean,
  modules: Partial<StaticRulesetModules> = {},
): Promise<void> {
  const wanted = getWantedRulesetIds(enabled, modules);
  const current = await chrome.declarativeNetRequest.getEnabledRulesets();
  const disable = current.filter((id) => !wanted.includes(id as StaticRulesetId));
  const enable = wanted.filter((id) => !current.includes(id));
  if (disable.length || enable.length) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: disable,
      enableRulesetIds: enable,
    });
  }
}

export async function clearDynamicRulesInRange(start: number, endExclusive: number): Promise<void> {
  const dynamic = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = dynamic
    .filter((r) => r.id >= start && r.id < endExclusive)
    .map((r) => r.id);
  if (removeRuleIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  }
}
