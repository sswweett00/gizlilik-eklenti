export const STATIC_RULESET_IDS = Object.freeze(['header_rules','tracker_rules','ad_rules','network_rules','url_rules'] as const);
export async function applyStaticRulesets(enabled:boolean):Promise<void>{
  const wanted=enabled?[...STATIC_RULESET_IDS]:[];
  const current=await chrome.declarativeNetRequest.getEnabledRulesets();
  const disable=current.filter((id)=>!wanted.includes(id as typeof STATIC_RULESET_IDS[number]));
  const enable=wanted.filter((id)=>!current.includes(id));
  if(disable.length||enable.length) await chrome.declarativeNetRequest.updateEnabledRulesets({disableRulesetIds:disable,enableRulesetIds:enable});
}
export async function clearDynamicRulesInRange(start:number,endExclusive:number):Promise<void>{
  const dynamic=await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds=dynamic.filter((r)=>r.id>=start&&r.id<endExclusive).map((r)=>r.id);
  if(removeRuleIds.length) await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds});
}
