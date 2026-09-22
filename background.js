/**
 * Privacy Shield — Background Service Worker
 *
 * Responsibilities:
 *  - Initialize privacy API settings on install/startup
 *  - Toggle static rulesets (header rewrite + tracker block) via
 *    declarativeNetRequest.updateEnabledRulesets according to user settings
 *  - Track per-tab identities reported by inject.js (via bridge.js) and
 *    install per-tab session rules so that HTTP headers (User-Agent,
 *    Accept-Language, Sec-CH-UA*) match the JS-level identity of each tab
 *  - Sync extension state via chrome.storage.sync and broadcast changes
 */

// ─── Default Settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  enabled: true,
  modules: {
    webrtc: true,
    canvas: true,
    webgl: true,
    audio: true,
    fonts: true,
    navigator: true,
    screen: true,
    geolocation: true,
    timezone: true,
    headers: true,
  },
  timezone: 'auto', // 'auto' = unique per-tab timezone from the city pool
  geolocationMode: 'spoof', // 'deny' | 'spoof' (per-tab city) | 'custom'
  spoofedLocation: {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 15,
  },
};

// Settings subset that content scripts are allowed to see
function publicSettings(s) {
  return {
    enabled: s.enabled,
    modules: s.modules,
    timezone: s.timezone,
    geolocationMode: s.geolocationMode,
    spoofedLocation: s.spoofedLocation,
  };
}

// ─── Initialization ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[PrivacyShield] Installed:', details.reason);

  const stored = await chrome.storage.sync.get('settings');
  const merged = stored.settings
    ? deepMerge(DEFAULT_SETTINGS, stored.settings)
    : DEFAULT_SETTINGS;
  if (JSON.stringify(merged) !== JSON.stringify(stored.settings || null)) {
    await chrome.storage.sync.set({ settings: merged });
  }

  await applyPrivacySettings();
  await applyRuleSets();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[PrivacyShield] Browser started, applying settings.');
  await resetTabTracking();
  await applyPrivacySettings();
  await applyRuleSets();
});

// ─── Privacy API Settings ─────────────────────────────────────────────────────

const PRIVACY_ITEMS = () => [
  chrome.privacy.network.webRTCIPHandlingPolicy,
  chrome.privacy.network.networkPredictionEnabled,
  chrome.privacy.websites.hyperlinkAuditingEnabled,
  chrome.privacy.websites.referrersEnabled,
  chrome.privacy.websites.thirdPartyCookiesAllowed,
];

async function applyPrivacySettings() {
  const s = await getSettings();

  try {
    if (!s.enabled) {
      // Clear everything we ever set, otherwise policies would persist
      // while the extension reports itself as disabled.
      for (const item of PRIVACY_ITEMS()) {
        try {
          await item.clear({ scope: 'regular' });
        } catch (_) {}
      }
      return;
    }

    if (s.modules.webrtc) {
      await chrome.privacy.network.webRTCIPHandlingPolicy.set({
        value: 'disable_non_proxied_udp',
        scope: 'regular',
      });
    } else {
      await chrome.privacy.network.webRTCIPHandlingPolicy.clear({ scope: 'regular' });
    }

    await chrome.privacy.network.networkPredictionEnabled.set({
      value: false,
      scope: 'regular',
    });
    await chrome.privacy.websites.hyperlinkAuditingEnabled.set({
      value: false,
      scope: 'regular',
    });
    await chrome.privacy.websites.referrersEnabled.set({
      value: false,
      scope: 'regular',
    });
    await chrome.privacy.websites.thirdPartyCookiesAllowed.set({
      value: false,
      scope: 'regular',
    });

    console.log('[PrivacyShield] Privacy API settings applied.');
  } catch (err) {
    console.error('[PrivacyShield] Error applying privacy settings:', err);
  }
}

// ─── Static Rulesets ───────────────────────────────────────────────────────────

const HEADER_RULESET_ID = 'header_rules';
const TRACKER_RULESET_ID = 'tracker_rules';

async function applyRuleSets() {
  const s = await getSettings();
  const wanted = [];
  if (s.enabled && s.modules.headers) wanted.push(HEADER_RULESET_ID);
  if (s.enabled) wanted.push(TRACKER_RULESET_ID);

  try {
    const current = await chrome.declarativeNetRequest.getEnabledRulesets();
    const disable = current.filter((id) => !wanted.includes(id));
    const enable = wanted.filter((id) => !current.includes(id));
    if (disable.length || enable.length) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: disable,
        enableRulesetIds: enable,
      });
    }
  } catch (err) {
    console.error('[PrivacyShield] Ruleset toggle failed:', err);
  }
}

// ─── Per-Tab Identity → Session DNR Rules ────────────────────────────────────
//
// inject.js generates a unique profile per tab and reports it through
// bridge.js. We then make the network layer agree with the JS layer by
// rewriting UA / Accept-Language / Sec-CH-UA headers *for that tab only*
// (session rules, cleared on browser restart). Rules are grouped by
// profile so tabs that happened to roll the same identity share one rule.

const SESSION_RULE_ID_BASE = 5000;
const MAX_SESSION_RULES = 900; // DNR hard limit is 1000

const RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'xmlhttprequest', 'script',
  'stylesheet', 'image', 'font', 'object', 'media', 'other',
];

async function getTabStore() {
  const { tabProfiles } = await chrome.storage.session.get('tabProfiles');
  return tabProfiles || {};
}

async function setTabStore(store) {
  await chrome.storage.session.set({ tabProfiles: store });
}

function sanitizeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const str = (v, max) =>
    typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
  const ua = str(p.ua, 512);
  if (!ua || !/^Mozilla\/\d/.test(ua)) return null;

  const langs = Array.isArray(p.languages)
    ? p.languages.filter((l) => str(l, 35)).slice(0, 6)
    : [];
  const brands = Array.isArray(p.brands)
    ? p.brands
        .filter(
          (b) =>
            b &&
            typeof b.brand === 'string' &&
            b.brand.length > 0 &&
            b.brand.length <= 40 &&
            typeof b.version === 'string' &&
            /^[\d.]+$/.test(b.version)
        )
        .slice(0, 6)
    : [];

  return {
    ua,
    languages: langs.length ? langs : ['en-US', 'en'],
    brands,
    uaPlatform: str(p.uaPlatform, 40) || 'Windows',
    uaMobile: p.uaMobile === true,
    city: str(p.city, 64) || 'Unknown',
    timezone: str(p.timezone, 64) || 'UTC',
    platform: str(p.platform, 40) || 'Unknown',
  };
}

function profileKey(p) {
  return [
    p.ua,
    p.languages.join(','),
    p.brands.map((b) => `${b.brand}/${b.version}`).join(','),
    p.uaPlatform,
    p.uaMobile ? 1 : 0,
  ].join('|');
}

function buildHeadersForProfile(p) {
  const requestHeaders = [
    { header: 'User-Agent', operation: 'set', value: p.ua },
    {
      header: 'Accept-Language',
      operation: 'set',
      value: buildAcceptLanguage(p.languages),
    },
  ];

  const isChromiumLike = Array.isArray(p.brands) && p.brands.length > 1;
  if (isChromiumLike) {
    requestHeaders.push(
      {
        header: 'Sec-CH-UA',
        operation: 'set',
        value: p.brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', '),
      },
      {
        header: 'Sec-CH-UA-Platform',
        operation: 'set',
        value: `"${p.uaPlatform}"`,
      },
      {
        header: 'Sec-CH-UA-Mobile',
        operation: 'set',
        value: p.uaMobile ? '?1' : '?0',
      }
    );
  } else {
    // Safari-style identity: must not send any Client-Hints headers
    for (const h of ['Sec-CH-UA', 'Sec-CH-UA-Platform', 'Sec-CH-UA-Mobile']) {
      requestHeaders.push({ header: h, operation: 'remove' });
    }
  }
  return requestHeaders;
}

function buildSessionRule(ruleId, tabIds, profile) {
  return {
    id: ruleId,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: buildHeadersForProfile(profile) },
    condition: {
      urlFilter: '*',
      tabIds: tabIds.slice(),
      resourceTypes: RESOURCE_TYPES,
    },
  };
}

// Does an existing rule already encode exactly this profile's headers?
function sameHeaders(headers, profile) {
  if (!Array.isArray(headers)) return false;
  const want = buildHeadersForProfile(profile);
  if (headers.length !== want.length) return false;
  return want.every(
    (w) =>
      headers.some(
        (h) =>
          h.header === w.header &&
          h.operation === w.operation &&
          h.value === w.value
      )
  );
}

// Serialize rule mutations — concurrent REGISTER_PROFILE messages could
// otherwise read-modify-write the session rules over each other.
let _ruleQueue = Promise.resolve();
function enqueue(fn) {
  const run = _ruleQueue.then(fn, fn);
  _ruleQueue = run.catch(() => {});
  return run;
}

async function registerTabProfile(tabId, rawProfile) {
  const profile = sanitizeProfile(rawProfile);
  if (!profile) return;

  const s = await getSettings();
  const store = await getTabStore();
  store[tabId] = profile;
  await setTabStore(store);

  if (!s.enabled || !s.modules.headers) return;

  await enqueue(async () => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const removeRuleIds = rules
      .filter((r) => (r.condition.tabIds || []).includes(tabId))
      .map((r) => r.id);
    const addRules = [];

    // Reuse the group that already matches this exact identity
    let reused = false;
    for (const r of rules) {
      if (removeRuleIds.includes(r.id)) continue;
      if (sameHeaders(r.action.requestHeaders, profile)) {
        removeRuleIds.push(r.id);
        addRules.push(
          buildSessionRule(r.id, (r.condition.tabIds || []).concat([tabId]), profile)
        );
        reused = true;
        break;
      }
    }

    if (!reused) {
      const kept = new Set(
        rules.map((r) => r.id).filter((id) => !removeRuleIds.includes(id))
      );
      let id = SESSION_RULE_ID_BASE;
      while (kept.has(id)) id++;

      if (id >= SESSION_RULE_ID_BASE + MAX_SESSION_RULES) {
        // Out of rule IDs: evict the first group to make room.
        const victim = rules.find(
          (r) =>
            !removeRuleIds.includes(r.id) &&
            !(r.condition.tabIds || []).includes(tabId)
        );
        if (victim) {
          removeRuleIds.push(victim.id);
          for (const t of victim.condition.tabIds || []) delete store[t];
          await setTabStore(store);
        }
        addRules.push(buildSessionRule(SESSION_RULE_ID_BASE, [tabId], profile));
      } else {
        addRules.push(buildSessionRule(id, [tabId], profile));
      }
    }

    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
  });
}

async function unregisterTab(tabId) {
  const store = await getTabStore();
  if (!(tabId in store)) return;
  delete store[tabId];
  await setTabStore(store);

  await enqueue(async () => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const affected = rules.filter((r) => (r.condition.tabIds || []).includes(tabId));
    if (affected.length === 0) return;
    const removeRuleIds = affected.map((r) => r.id);
    const addRules = [];
    for (const r of affected) {
      const rest = (r.condition.tabIds || []).filter((t) => t !== tabId);
      if (rest.length > 0) {
        addRules.push({ ...r, condition: { ...r.condition, tabIds: rest } });
      }
    }
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
  });
}

// Rebuild every session rule from the stored profiles (used after the
// headers module / master toggle changed).
async function rebuildAllSessionRules() {
  const s = await getSettings();
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existing.map((r) => r.id);
  const addRules = [];

  if (s.enabled && s.modules.headers) {
    const store = await getTabStore();
    const byKey = new Map();
    for (const [tabIdStr, profile] of Object.entries(store)) {
      const k = profileKey(profile);
      if (!byKey.has(k)) byKey.set(k, { tabIds: [], profile });
      byKey.get(k).tabIds.push(Number(tabIdStr));
    }
    let nextId = SESSION_RULE_ID_BASE;
    for (const { tabIds, profile } of byKey.values()) {
      if (nextId >= SESSION_RULE_ID_BASE + MAX_SESSION_RULES) break;
      addRules.push(buildSessionRule(nextId, tabIds, profile));
      nextId++;
    }
  }

  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
}

async function resetTabTracking() {
  await chrome.storage.session.remove('tabProfiles');
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    if (rules.length) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: rules.map((r) => r.id),
      });
    }
  } catch (_) {}
}

chrome.tabs.onRemoved.addListener((tabId) => {
  unregisterTab(tabId).catch(() => {});
});

function buildAcceptLanguage(languages) {
  return languages
    .map(
      (lang, i) =>
        i === 0 ? lang : `${lang};q=${Math.max(0.1, 1 - i * 0.1).toFixed(1)}`
    )
    .join(',');
}

// ─── Message Handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_SETTINGS': {
          sendResponse({ success: true, settings: await getSettings() });
          break;
        }

        case 'UPDATE_SETTINGS': {
          const current = await getSettings();
          const updated = deepMerge(current, sanitizeIncomingSettings(message.settings));
          await chrome.storage.sync.set({ settings: updated });
          sendResponse({ success: true, settings: updated });
          break;
        }

        case 'RESET_SETTINGS': {
          await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
          sendResponse({ success: true, settings: DEFAULT_SETTINGS });
          break;
        }

        case 'GET_STATUS': {
          sendResponse({ success: true, status: await buildStatus() });
          break;
        }

        case 'GET_TAB_SETTINGS': {
          sendResponse({
            success: true,
            settings: publicSettings(await getSettings()),
          });
          break;
        }

        case 'REGISTER_PROFILE': {
          if (sender.tab && typeof sender.tab.id === 'number') {
            await registerTabProfile(sender.tab.id, message.profile);
          }
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (err) {
      console.error('[PrivacyShield] Message handler error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true; // Keep message channel open for async response
});

// Clamp user-supplied values before they reach storage / DNR rules
function sanitizeIncomingSettings(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = { ...raw };
  if (typeof out.timezone === 'string' && out.timezone.length > 64) delete out.timezone;
  if (out.geolocationMode && !['deny', 'spoof', 'custom'].includes(out.geolocationMode)) {
    delete out.geolocationMode;
  }
  if (out.spoofedLocation) {
    const la = Number(out.spoofedLocation.latitude);
    const lo = Number(out.spoofedLocation.longitude);
    out.spoofedLocation = {
      latitude: Number.isFinite(la) ? Math.min(90, Math.max(-90, la)) : 40.7128,
      longitude: Number.isFinite(lo) ? Math.min(180, Math.max(-180, lo)) : -74.006,
      accuracy: 15,
    };
  }
  return out;
}

async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return settings ? deepMerge(DEFAULT_SETTINGS, settings) : DEFAULT_SETTINGS;
}

// ─── Status Builder ───────────────────────────────────────────────────────────

async function buildStatus() {
  const settings = await getSettings();

  let webrtcPolicy = null;
  try {
    const result = await chrome.privacy.network.webRTCIPHandlingPolicy.get({});
    webrtcPolicy = result.value;
  } catch (_) {}

  let tabProfile = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && typeof tab.id === 'number') {
      const store = await getTabStore();
      tabProfile = store[tab.id] || null;
    }
  } catch (_) {}

  return {
    enabled: settings.enabled,
    modules: settings.modules,
    webrtcPolicy,
    geolocationMode: settings.geolocationMode,
    timezone: settings.timezone,
    tabProfile,
  };
}

// ─── Storage Change Listener ──────────────────────────────────────────────────

async function onSettingsChanged() {
  await applyPrivacySettings();
  await applyRuleSets();
  await enqueue(() => rebuildAllSessionRules());
  await broadcastSettingsToTabs();
}

async function broadcastSettingsToTabs() {
  const pub = publicSettings(await getSettings());
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((t) => typeof t.id === 'number')
      .map((t) =>
        chrome.tabs.sendMessage(t.id, { type: 'SETTINGS_UPDATE', settings: pub })
      )
  );
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  console.log('[PrivacyShield] Settings changed, reapplying...');
  onSettingsChanged().catch((err) =>
    console.error('[PrivacyShield] Reapply failed:', err)
  );
});

// ─── Utility: Deep Merge ──────────────────────────────────────────────────────

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] !== null &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}
