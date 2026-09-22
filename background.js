import './src/background/badgeManager.js';

/**
 * Privacy Shield — Background Service Worker
 *
 * Responsibilities:
 *  - Initialize privacy API settings on install/startup
 *  - Toggle static rulesets (header rewrite + tracker block) via
 *    declarativeNetRequest.updateEnabledRulesets according to user settings
 *  - Track per-tab identities reported by inject.js (via bridge.js) and
 *    install per-tab session rules for subsequent requests so HTTP headers
 *    (User-Agent, Accept-Language, Sec-CH-UA*) match the JS-level identity
 *  - Manage site exceptions and identity rotation
 *  - Sync extension state via chrome.storage.local and broadcast changes
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
    permissions: true,
    network: true,
    trackers: true,
    ads: true,
    urlCleaner: true,
    browserPrivacy: true,
  },
  timezone: 'auto', // 'auto' = unique per-tab timezone from the city pool
  securityMode: 'maximum_direct',
  geolocationMode: 'deny', // Maximum mode never exposes a synthetic location by default
  spoofedLocation: {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 15,
  },
  excludedDomains: [],
  networkPrivacy: {
    mode: 'direct_hardened',
    torPort: 9050,
  },
};

// Settings subset that content scripts are allowed to see
function publicSettings(s) {
  return {
    enabled: s.enabled,
    securityMode: s.securityMode,
    modules: s.modules,
    timezone: s.timezone,
    geolocationMode: s.geolocationMode,
    spoofedLocation: s.spoofedLocation,
    excludedDomains: s.excludedDomains,
    networkPrivacy: s.networkPrivacy,
  };
}

// ─── Initialization ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[PrivacyShield] Installed:', details.reason);

  const stored = await chrome.storage.local.get('settings');
  const merged = normalizeSettings(stored.settings || DEFAULT_SETTINGS);
  if (JSON.stringify(merged) !== JSON.stringify(stored.settings || null)) {
    await chrome.storage.local.set({ settings: merged });
  }

  await applyPrivacySettings();
  await applyContentSettings();
  await applyRuleSets();
  await applySiteExceptionRules();
  await applyNetworkProxy();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[PrivacyShield] Browser started, applying settings.');
  await resetTabTracking();
  await applyPrivacySettings();
  await applyContentSettings();
  await applyRuleSets();
  await applySiteExceptionRules();
  await applyNetworkProxy();
});

// ─── Privacy API Settings ─────────────────────────────────────────────────────


function privacyModuleForKey(key) {
  if (key === 'network.webRTCIPHandlingPolicy') return 'webrtc';
  if (key === 'network.networkPredictionEnabled') return 'network';
  return 'browserPrivacy';
}

async function applyPrivacySettings() {
  const s = await getSettings();

  try {
    const { privacyPolicy } = await chrome.storage.session.get('privacyPolicy');

    if (!s.enabled) {
      if (privacyPolicy?.original) {
        for (const [key, setting] of HARDENED_PRIVACY_ITEMS()) {
          const original = privacyPolicy.original[key];
          if (original !== undefined) {
            try { await setting.set({ value: original, scope: 'regular' }); } catch (_) {}
          }
        }
      }
      await chrome.storage.session.remove('privacyPolicy');
      return;
    }

    if (!privacyPolicy?.original) {
      const original = {};
      for (const [key, setting] of HARDENED_PRIVACY_ITEMS()) {
        try {
          const current = await setting.get({ scope: 'regular' });
          if (current?.value !== undefined) original[key] = current.value;
        } catch (_) {}
      }
      await chrome.storage.session.set({ privacyPolicy: { original, updatedAt: Date.now() } });
    }

    const stored = (await chrome.storage.session.get('privacyPolicy')).privacyPolicy;
    for (const [key, setting, value] of HARDENED_PRIVACY_ITEMS()) {
      const moduleKey = privacyModuleForKey(key);
      if (s.modules[moduleKey]) {
        try {
          await setting.set({ value, scope: 'regular' });
        } catch (err) {
          console.warn('[PrivacyShield] Privacy setting unavailable:', key, err?.message || err);
        }
      } else {
        const original = stored?.original?.[key];
        if (original !== undefined) {
          try { await setting.set({ value: original, scope: 'regular' }); } catch (_) {}
        }
      }
    }

    console.log('[PrivacyShield] Module-aware privacy policy applied.');
  } catch (err) {
    console.error('[PrivacyShield] Error applying privacy settings:', err);
  }
}


// ─── Browser Content Settings Hardening ──────────────────────────────────────
// The page-world API shims are defense-in-depth. Chrome content settings provide
// a browser-enforced permission boundary for location, camera, microphone,
// advanced clipboard access, notifications and persistent site data.
const HARDENED_CONTENT_SETTINGS = () => [
  ['location', chrome.contentSettings.location, 'block'],
  ['camera', chrome.contentSettings.camera, 'block'],
  ['microphone', chrome.contentSettings.microphone, 'block'],
  ['clipboard', chrome.contentSettings.clipboard, 'block'],
  ['notifications', chrome.contentSettings.notifications, 'block'],
  ['cookies', chrome.contentSettings.cookies, 'session_only'],
];

function contentSettingModuleForKey(key) {
  if (key === 'location') return 'geolocation';
  if (key === 'cookies') return 'browserPrivacy';
  return 'permissions';
}

async function applyContentSettings() {
  try {
    const currentSettings = await getSettings();
    const settingsList = HARDENED_CONTENT_SETTINGS();

    for (const [key, setting, value] of settingsList) {
      const enabled = currentSettings.enabled && currentSettings.modules[contentSettingModuleForKey(key)];
      try {
        if (enabled) {
          await setting.set({
            primaryPattern: '<all_urls>',
            secondaryPattern: '<all_urls>',
            setting: value,
            scope: 'regular',
          });
        } else {
          await setting.clear({ scope: 'regular' });
        }
      } catch (err) {
        console.warn('[PrivacyShield] Content setting unavailable:', key, err?.message || err);
      }
    }
  } catch (err) {
    console.error('[PrivacyShield] Content settings hardening failed:', err);
  }
}


// ─── Direct-Connection Privacy Hardening ────────────────────────────────────

const HARDENED_PRIVACY_ITEMS = () => [
  ['network.webRTCIPHandlingPolicy', chrome.privacy.network.webRTCIPHandlingPolicy, 'disable_non_proxied_udp'],
  ['network.networkPredictionEnabled', chrome.privacy.network.networkPredictionEnabled, false],
  ['websites.hyperlinkAuditingEnabled', chrome.privacy.websites.hyperlinkAuditingEnabled, false],
  ['websites.referrersEnabled', chrome.privacy.websites.referrersEnabled, false],
  ['websites.thirdPartyCookiesAllowed', chrome.privacy.websites.thirdPartyCookiesAllowed, false],
  ['websites.topicsEnabled', chrome.privacy.websites.topicsEnabled, false],
  ['websites.fledgeEnabled', chrome.privacy.websites.fledgeEnabled, false],
  ['websites.adMeasurementEnabled', chrome.privacy.websites.adMeasurementEnabled, false],
  ['services.searchSuggestEnabled', chrome.privacy.services.searchSuggestEnabled, false],
  ['services.alternateErrorPagesEnabled', chrome.privacy.services.alternateErrorPagesEnabled, false],
  ['services.autofillAddressEnabled', chrome.privacy.services.autofillAddressEnabled, false],
  ['services.autofillCreditCardEnabled', chrome.privacy.services.autofillCreditCardEnabled, false],
  ['services.passwordSavingEnabled', chrome.privacy.services.passwordSavingEnabled, false],
];

async function getNetworkPrivacyStatus() {
  const settings = await getSettings();
  const values = {};
  for (const [key, setting] of HARDENED_PRIVACY_ITEMS()) {
    try {
      const current = await setting.get({ scope: 'regular' });
      values[key] = current?.value ?? null;
    } catch (_) {
      values[key] = null;
    }
  }

  let proxyState = null;
  try { proxyState = await getCurrentProxy(); } catch (_) {}

  const torExpected = settings.enabled && settings.networkPrivacy.mode === 'local_tor';
  const torActive = torExpected && isOurTorProxy(proxyState?.value, settings.networkPrivacy.torPort);
  const lastProxyError = (await chrome.storage.session.get('lastProxyError')).lastProxyError || null;

  return {
    mode: settings.securityMode === 'maximum_direct' ? 'maximum_direct' : 'direct_hardened',
    enabled: settings.enabled,
    networkModuleEnabled: settings.modules.network,
    webrtcModuleEnabled: settings.modules.webrtc,
    browserPrivacyModuleEnabled: settings.modules.browserPrivacy,
    proxyMode: settings.networkPrivacy.mode,
    torPort: settings.networkPrivacy.torPort,
    proxyActive: torActive,
    proxyControlLevel: proxyState?.levelOfControl || null,
    sourceIpVisibility: torActive ? 'expected_hidden_via_local_tor' : 'direct_connection_visible',
    webRtcPolicy: values['network.webRTCIPHandlingPolicy'],
    networkPrediction: values['network.networkPredictionEnabled'],
    topicsEnabled: values['websites.topicsEnabled'],
    fledgeEnabled: values['websites.fledgeEnabled'],
    adMeasurementEnabled: values['websites.adMeasurementEnabled'],
    thirdPartyCookiesAllowed: values['websites.thirdPartyCookiesAllowed'],
    lastProxyError,
    note: torActive
      ? 'HTTP(S) web traffic is configured through the local SOCKS5 Tor endpoint with no direct fallback. Verify Tor separately to confirm the local daemon is reachable.'
      : 'A direct web connection exposes its source public IP to the destination. Browser-side IP discovery can be blocked, but hiding the source IP requires an intermediary network path.',
  };
}

// ─── Zero-cost local Tor egress ────────────────────────────────────────────────

const NETWORK_PROXY_BASELINE_KEY = 'networkProxyBaseline';
const TOR_PROXY_HOST = '127.0.0.1';
const TOR_KILL_SWITCH_RULE_ID = 19000;
const TOR_KILL_SWITCH_PRIORITY = 20000;
const VALID_TOR_PORTS = new Set([9050, 9150]);

function torProxyConfig(port) {
  return {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: 'socks5',
        host: TOR_PROXY_HOST,
        port,
      },
    },
  };
}

function proxyServerIsLocalTor(server, port) {
  return !!server &&
    server.scheme === 'socks5' &&
    server.host === TOR_PROXY_HOST &&
    server.port === port;
}

function isOurTorProxy(value, port = 9050) {
  if (!value || value.mode !== 'fixed_servers') return false;
  const rules = value.rules || {};
  const server = rules.singleProxy || rules.proxyForHttp || rules.proxyForHttps;
  return proxyServerIsLocalTor(server, port) &&
    !rules.fallbackProxy &&
    !rules.bypassList?.length;
}

async function getCurrentProxy() {
  try {
    return await chrome.proxy.settings.get({ incognito: false });
  } catch (err) {
    return { value: null, levelOfControl: 'not_controllable', error: err?.message || String(err) };
  }
}

async function setTorKillSwitch(enabled) {
  try {
    const current = await chrome.declarativeNetRequest.getDynamicRules();
    const present = current.some((rule) => rule.id === TOR_KILL_SWITCH_RULE_ID);

    if (enabled && !present) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [],
        addRules: [{
          id: TOR_KILL_SWITCH_RULE_ID,
          priority: TOR_KILL_SWITCH_PRIORITY,
          action: { type: 'block' },
          condition: {
            regexFilter: '^https?://',
          },
        }],
      });
    } else if (!enabled && present) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [TOR_KILL_SWITCH_RULE_ID],
      });
    }
  } catch (err) {
    console.error('[PrivacyShield] Tor kill-switch update failed:', err);
  }
}

async function applyNetworkProxy() {
  if (!chrome.proxy?.settings) return;

  const settings = await getSettings();
  const torSelected = settings.enabled && settings.networkPrivacy?.mode === 'local_tor';
  const stored = await chrome.storage.local.get(NETWORK_PROXY_BASELINE_KEY);
  const baseline = stored[NETWORK_PROXY_BASELINE_KEY];

  try {
    const current = await getCurrentProxy();

    if (torSelected) {
      // Activate the network kill-switch before changing the proxy so the
      // transition itself cannot create a direct-network window.
      await setTorKillSwitch(true);

      if (!baseline?.value) {
        await chrome.storage.local.set({
          [NETWORK_PROXY_BASELINE_KEY]: {
            value: isOurTorProxy(current.value, settings.networkPrivacy.torPort)
              ? { mode: 'system' }
              : (current.value || { mode: 'system' }),
            capturedAt: Date.now(),
          },
        });
      }

      await chrome.proxy.settings.set({
        value: torProxyConfig(settings.networkPrivacy.torPort),
        scope: 'regular',
      });

      const applied = await getCurrentProxy();
      if (isOurTorProxy(applied.value, settings.networkPrivacy.torPort)) {
        await setTorKillSwitch(false);
        await chrome.storage.session.remove('lastProxyError');
      } else {
        await chrome.storage.session.set({
          lastProxyError: {
            message: 'Local Tor proxy was not accepted as the active Chrome proxy configuration.',
            details: 'Kill-switch remains enabled.',
            fatal: true,
            at: Date.now(),
          },
        });
      }
      return;
    }

    const ourTorActive =
      isOurTorProxy(current.value, 9050) ||
      isOurTorProxy(current.value, 9150);

    if (baseline?.value && ourTorActive) {
      await chrome.proxy.settings.set({
        value: baseline.value,
        scope: 'regular',
      });
    }

    if (baseline?.value) {
      await chrome.storage.local.remove(NETWORK_PROXY_BASELINE_KEY);
    }

    // Restore ordinary networking only after the Tor proxy is no longer active.
    await setTorKillSwitch(false);
    await chrome.storage.session.remove('lastProxyError');
  } catch (err) {
    console.error('[PrivacyShield] Local Tor proxy apply/restore failed:', err);
    if (torSelected) {
      await setTorKillSwitch(true);
    }
  }
}

if (chrome.proxy?.onProxyError) {
  chrome.proxy.onProxyError.addListener((details) => {
    getSettings().then(async (settings) => {
      await chrome.storage.session.set({
        lastProxyError: {
          message: String(details?.error || 'Proxy error'),
          details: String(details?.details || ''),
          fatal: details?.fatal === true,
          at: Date.now(),
        },
      });
      if (settings.enabled && settings.networkPrivacy?.mode === 'local_tor') {
        await setTorKillSwitch(true);
      }
    }).catch(() => {});
  });
}

if (chrome.proxy?.settings?.onChange) {
  chrome.proxy.settings.onChange.addListener(() => {
    getSettings().then(async (settings) => {
      if (!settings.enabled || settings.networkPrivacy?.mode !== 'local_tor') return;
      const current = await getCurrentProxy();
      if (!isOurTorProxy(current.value, settings.networkPrivacy.torPort)) {
        await applyNetworkProxy();
      }
    }).catch((err) => console.error('[PrivacyShield] Tor proxy state sync failed:', err));
  });
}

// ─── Static Rulesets ───────────────────────────────────────────────────────────

async function applyRuleSets() {
  const s = await getSettings();
  const wanted = [];

  if (s.enabled) {
    if (s.modules.headers) wanted.push('header_rules');
    if (s.modules.permissions) wanted.push('permission_rules');
    if (s.modules.trackers) wanted.push('tracker_rules');
    if (s.modules.ads) wanted.push('ad_rules');
    if (s.modules.urlCleaner) wanted.push('url_rules');
    if (s.modules.network) wanted.push('network_rules');
  }

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


// ─── Per-Tab Identity Tracking ───────────────────────────────────────────────
//
// Maximum privacy mode deliberately does not rewrite User-Agent or other low-
// entropy headers. The browser's native network identity must stay coherent
// with the first navigation request and Chromium's own Client Hints. We keep
// only a sanitized per-tab profile for status/rotation bookkeeping.

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

  return {
    ua,
    languages: langs.length ? langs : ['en-US', 'en'],
    uaPlatform: str(p.uaPlatform, 40) || 'Unknown',
    uaMobile: p.uaMobile === true,
    city: str(p.city, 64) || 'Hidden',
    timezone: str(p.timezone, 64) || 'UTC',
    platform: str(p.platform, 40) || 'Unknown',
  };
}

async function registerTabProfile(tabId, rawProfile) {
  const profile = sanitizeProfile(rawProfile);
  if (!profile) return;
  const store = await getTabStore();
  store[tabId] = profile;
  await setTabStore(store);
}

async function unregisterTab(tabId) {
  const store = await getTabStore();
  if (!(tabId in store)) return;
  delete store[tabId];
  await setTabStore(store);
}

// Legacy session header rules are actively removed at startup/settings changes
// so upgrades from Privacy Shield <=4.0 cannot retain spoofed header state.
async function rebuildAllSessionRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getSessionRules();
    if (existing.length) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: existing.map((r) => r.id),
      });
    }
  } catch (err) {
    console.error('[PrivacyShield] Session identity cleanup failed:', err);
  }
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


// ─── Message Handling ─────────────────────────────────────────────────────────

const SITE_RULE_ID_BASE = 10000;
const SITE_RULE_PRIORITY = 10000;

const SITE_EXCEPTION_RESOURCE_TYPES = Object.freeze([
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'media', 'websocket', 'other',
]);

async function applySiteExceptionRules() {
  const settings = await getSettings();
  const domains = settings.enabled ? (settings.excludedDomains || []) : [];
  try {
    const current = await chrome.declarativeNetRequest.getDynamicRules();
    const ours = current
      .filter((rule) => rule.id >= SITE_RULE_ID_BASE && rule.id < SITE_RULE_ID_BASE + 200)
      .map((rule) => rule.id);

    const addRules = [];
    domains.slice(0, 100).forEach((domain, index) => {
      const requestRuleId = SITE_RULE_ID_BASE + index * 2;
      const initiatorRuleId = requestRuleId + 1;

      addRules.push({
        id: requestRuleId,
        priority: SITE_RULE_PRIORITY,
        action: { type: 'allow' },
        condition: {
          requestDomains: [domain],
          resourceTypes: SITE_EXCEPTION_RESOURCE_TYPES,
        },
      });

      addRules.push({
        id: initiatorRuleId,
        priority: SITE_RULE_PRIORITY,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [domain],
          resourceTypes: SITE_EXCEPTION_RESOURCE_TYPES,
        },
      });
    });

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ours,
      addRules,
    });
  } catch (err) {
    console.error('[PrivacyShield] Site exception rules failed:', err);
  }
}

function domainMatchesHost(host, domain) {
  return !!host && (host === domain || host.endsWith('.' + domain));
}

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  let domain = value.trim().toLowerCase();
  try {
    if (domain.includes('://')) domain = new URL(domain).hostname.toLowerCase();
  } catch (_) {
    return null;
  }
  domain = domain.replace(/^\.+|\.+$/g, '');
  if (!domain || domain.length > 253 || domain.includes('/') || domain.includes(':')) return null;
  if (domain === 'localhost') return domain;
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  const labels = domain.split('.');
  if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    return null;
  }
  return domain;
}

function isValidTimeZone(value) {
  if (value === 'auto') return true;
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch (_) {
    return false;
  }
}

function sanitizeIncomingSettings(raw) {
  if (!raw || typeof raw !== 'object') return {};

  const out = {};

  if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;

  if (raw.securityMode === 'maximum_direct') {
    out.securityMode = 'maximum_direct';
  }

  if (raw.networkPrivacy && typeof raw.networkPrivacy === 'object' && !Array.isArray(raw.networkPrivacy)) {
    const torPort = Number(raw.networkPrivacy.torPort);
    out.networkPrivacy = {
      mode: raw.networkPrivacy.mode === 'local_tor' ? 'local_tor' : 'direct_hardened',
      torPort: torPort === 9150 ? 9150 : 9050,
    };
  }

  if (raw.modules && typeof raw.modules === 'object' && !Array.isArray(raw.modules)) {
    out.modules = {};
    for (const key of Object.keys(DEFAULT_SETTINGS.modules)) {
      if (typeof raw.modules[key] === 'boolean') out.modules[key] = raw.modules[key];
    }
  }

  if (typeof raw.timezone === 'string' && isValidTimeZone(raw.timezone)) {
    out.timezone = raw.timezone;
  }

  if (typeof raw.geolocationMode === 'string' &&
      ['deny', 'spoof', 'custom'].includes(raw.geolocationMode)) {
    out.geolocationMode = raw.geolocationMode;
  }

  if (raw.spoofedLocation && typeof raw.spoofedLocation === 'object' && !Array.isArray(raw.spoofedLocation)) {
    const la = Number(raw.spoofedLocation.latitude);
    const lo = Number(raw.spoofedLocation.longitude);
    const accuracy = Number(raw.spoofedLocation.accuracy);
    out.spoofedLocation = {
      latitude: Number.isFinite(la) ? Math.min(90, Math.max(-90, la)) : DEFAULT_SETTINGS.spoofedLocation.latitude,
      longitude: Number.isFinite(lo) ? Math.min(180, Math.max(-180, lo)) : DEFAULT_SETTINGS.spoofedLocation.longitude,
      accuracy: Number.isFinite(accuracy) ? Math.min(10000, Math.max(1, accuracy)) : DEFAULT_SETTINGS.spoofedLocation.accuracy,
    };
  }

  if (Array.isArray(raw.excludedDomains)) {
    out.excludedDomains = [...new Set(raw.excludedDomains.map(normalizeDomain).filter(Boolean))].slice(0, 100);
  }

  return out;
}

const LOCAL_TOR_FORCED_MODULES = Object.freeze([
  'webrtc', 'network', 'permissions', 'geolocation', 'browserPrivacy',
]);

function normalizeSettings(raw) {
  const normalized = deepMerge(DEFAULT_SETTINGS, sanitizeIncomingSettings(raw || {}));

  normalized.securityMode = 'maximum_direct';
  normalized.networkPrivacy = {
    mode: normalized.networkPrivacy?.mode === 'local_tor' ? 'local_tor' : 'direct_hardened',
    torPort: normalized.networkPrivacy?.torPort === 9150 ? 9150 : 9050,
  };
  normalized.excludedDomains = Array.isArray(normalized.excludedDomains) ? normalized.excludedDomains : [];
  normalized.modules = {
    ...DEFAULT_SETTINGS.modules,
    ...(normalized.modules || {}),
  };

  if (normalized.enabled && normalized.networkPrivacy.mode === 'local_tor') {
    for (const module of LOCAL_TOR_FORCED_MODULES) normalized.modules[module] = true;
    normalized.geolocationMode = 'deny';
  }

  return normalized;
}


function settingsRequireReload(previous, next) {
  if (!previous || !next) return true;
  if (previous.enabled !== next.enabled) return true;

  const reloadModules = Object.keys(DEFAULT_SETTINGS.modules);
  return reloadModules.some((key) => previous.modules?.[key] !== next.modules?.[key]);
}

async function reloadTabsForDomainChanges(previous, next) {
  const before = new Set(previous?.excludedDomains || []);
  const after = new Set(next?.excludedDomains || []);
  const changedDomains = [...new Set([
    ...[...before].filter((domain) => !after.has(domain)),
    ...[...after].filter((domain) => !before.has(domain)),
  ])];

  if (!changedDomains.length) return;

  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => typeof tab.id === 'number' && typeof tab.url === 'string' && /^(https?|file):/i.test(tab.url))
      .filter((tab) => {
        try {
          const host = new URL(tab.url).hostname.toLowerCase();
          return changedDomains.some((domain) => domainMatchesHost(host, domain));
        } catch (_) {
          return false;
        }
      })
      .map((tab) => chrome.tabs.reload(tab.id))
  );
}

async function reloadProtectionTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => typeof tab.id === 'number' && typeof tab.url === 'string' && /^(https?|file):/i.test(tab.url))
      .map((tab) => chrome.tabs.reload(tab.id))
  );
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}


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
          const updated = normalizeSettings(deepMerge(current, sanitizeIncomingSettings(message.settings)));
          await chrome.storage.local.set({ settings: updated });
          await onSettingsChanged(current, updated);
          sendResponse({ success: true, settings: updated });
          break;
        }

        case 'RESET_SETTINGS': {
          const defaults = normalizeSettings(DEFAULT_SETTINGS);
          const current = await getSettings();
          await chrome.storage.local.set({ settings: defaults });
          await onSettingsChanged(current, defaults);
          sendResponse({ success: true, settings: defaults });
          break;
        }

        case 'GET_STATUS': {
          sendResponse({ success: true, status: await buildStatus() });
          break;
        }

        case 'GET_NETWORK_PRIVACY_STATUS': {
          sendResponse({ success: true, status: await getNetworkPrivacyStatus() });
          break;
        }

        case 'CHECK_TOR': {
          const settings = await getSettings();
          if (!settings.enabled || settings.networkPrivacy.mode !== 'local_tor') {
            sendResponse({ success: false, error: 'Local Tor mode is not enabled.' });
            break;
          }
          try {
            const currentProxy = await getCurrentProxy();
            if (!isOurTorProxy(currentProxy?.value, settings.networkPrivacy.torPort)) {
              throw new Error('The selected local Tor proxy is not active; verification aborted to prevent a direct-network check.');
            }
            const response = await fetch('https://check.torproject.org/api/ip', {
              cache: 'no-store',
              redirect: 'error',
              credentials: 'omit',
            });
            if (!response.ok) throw new Error('Tor verification endpoint returned HTTP ' + response.status);
            const payload = await response.json();
            sendResponse({
              success: true,
              isTor: payload?.IsTor === true,
              exitIp: typeof payload?.IP === 'string' ? payload.IP : null,
            });
          } catch (err) {
            sendResponse({
              success: false,
              error: 'Local Tor connection failed: ' + (err?.message || String(err)),
            });
          }
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



        case 'GET_ACTIVE_TAB': {
          const tab = await getActiveTab();
          const host = tab?.url ? (() => { try { return new URL(tab.url).hostname.toLowerCase(); } catch (_) { return ''; } })() : '';
          const settings = await getSettings();
          sendResponse({
            success: true,
            tab: tab ? { id: tab.id, url: tab.url || '', title: tab.title || '', host } : null,
            excluded: !!host && (settings.excludedDomains || []).some((domain) => domainMatchesHost(host, domain)),
          });
          break;
        }

        case 'TOGGLE_SITE_EXCLUSION': {
          const tab = await getActiveTab();
          if (!tab?.url) {
            sendResponse({ success: false, error: 'No active tab.' });
            break;
          }

          let host = '';
          try { host = new URL(tab.url).hostname.toLowerCase(); } catch (_) {}
          const domain = normalizeDomain(host);
          if (!domain) {
            sendResponse({ success: false, error: 'This page cannot be excluded.' });
            break;
          }

          const current = await getSettings();
          const excludedDomains = new Set(current.excludedDomains || []);
          const excluded = !excludedDomains.has(domain);
          if (excluded) excludedDomains.add(domain);
          else excludedDomains.delete(domain);

          const updated = normalizeSettings({ ...current, excludedDomains: [...excludedDomains] });
          await chrome.storage.local.set({ settings: updated });
          await onSettingsChanged(current, updated);
          sendResponse({ success: true, excluded, host: domain, settings: updated });
          break;
        }

        case 'ROTATE_IDENTITY': {
          const tab = await getActiveTab();
          if (!tab || typeof tab.id !== 'number') {
            sendResponse({ success: false, error: 'No active tab.' });
            break;
          }

          await unregisterTab(tab.id);
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'ROTATE_IDENTITY' });
          } catch (_) {}
          try {
            await chrome.tabs.reload(tab.id);
          } catch (_) {}
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

// Settings are normalized at every read so old/corrupted storage cannot bypass validation.
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return settings ? normalizeSettings(settings) : normalizeSettings(DEFAULT_SETTINGS);
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

  let enabledRulesets = [];
  let sessionRuleCount = 0;
  let siteExceptionCount = (settings.excludedDomains || []).length;
  try { enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets(); } catch (_) {}
  try { sessionRuleCount = (await chrome.declarativeNetRequest.getSessionRules()).length; } catch (_) {}

  const networkPrivacy = await getNetworkPrivacyStatus();

  let activeTab = null;
  try {
    const tab = await getActiveTab();
    if (tab) {
      let host = '';
      try { host = new URL(tab.url || '').hostname.toLowerCase(); } catch (_) {}
      activeTab = {
        id: tab.id,
        host,
        excluded: !!host && (settings.excludedDomains || []).some((domain) => domainMatchesHost(host, domain)),
      };
    }
  } catch (_) {}

  const tabProfiles = await getTabStore();

  let matchedRuleCount = 0;
  if (activeTab && typeof activeTab.id === 'number') {
    try {
      matchedRuleCount = (await chrome.declarativeNetRequest.getMatchedRules({ tabId: activeTab.id })).rules.length;
    } catch (_) {}
  }

  return {
    enabled: settings.enabled,
    modules: settings.modules,
    webrtcPolicy,
    geolocationMode: settings.geolocationMode,
    timezone: settings.timezone,
    excludedDomains: settings.excludedDomains,
    enabledRulesets,
    sessionRuleCount,
    trackedTabCount: Object.keys(tabProfiles).length,
    siteExceptionCount,
    matchedRuleCount,
    activeTab,
    tabProfile,
    networkPrivacy,
  };
}

// ─── Storage Change Listener ──────────────────────────────────────────────────

let settingsApplyQueue = Promise.resolve();
let lastAppliedSettingsFingerprint = null;

function enqueue(task) {
  const run = settingsApplyQueue.then(task, task);
  settingsApplyQueue = run.catch(() => {});
  return run;
}

function settingsFingerprint(settings) {
  return JSON.stringify(normalizeSettings(settings));
}

async function applySettingsRuntime(previousSettings, nextSettings) {
  const settings = nextSettings || await getSettings();
  await applyPrivacySettings();
  await applyContentSettings();
  await applyRuleSets();
  await applySiteExceptionRules();
  await rebuildAllSessionRules();
  await applyNetworkProxy();
  await broadcastSettingsToTabs();

  if (settingsRequireReload(previousSettings, settings)) {
    await reloadProtectionTabs();
  } else {
    await reloadTabsForDomainChanges(previousSettings, settings);
  }

  lastAppliedSettingsFingerprint = settingsFingerprint(settings);
}

async function onSettingsChanged(previousSettings, nextSettings) {
  const settings = nextSettings || await getSettings();
  const fingerprint = settingsFingerprint(settings);
  return enqueue(async () => {
    if (fingerprint === lastAppliedSettingsFingerprint) return;
    await applySettingsRuntime(previousSettings, settings);
  });
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
  if (area !== 'local' || !changes.settings) return;
  const previousSettings = changes.settings.oldValue ? normalizeSettings(changes.settings.oldValue) : null;
  const nextSettings = normalizeSettings(changes.settings.newValue || {});
  onSettingsChanged(previousSettings, nextSettings).catch((err) =>
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