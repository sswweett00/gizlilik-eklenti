/**
 * Privacy Shield — popup.js
 *
 * Handles all popup UI interactions:
 *  - Load & display current settings from background
 *  - Master toggle (enable/disable entire extension)
 *  - Per-module toggles
 *  - Timezone & geolocation preset selectors
 *  - Custom coordinate inputs
 *  - Quick-location buttons
 *  - Live status display
 *  - Settings persistence via background message passing
 */

'use strict';

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

const masterToggle       = document.getElementById('masterToggle');
const statusDot          = document.getElementById('statusDot');
const statusLabel        = document.getElementById('statusLabel');
const activeModulesCount = document.getElementById('activeModulesCount');
const ipLockDot         = document.getElementById('ipLockDot');
const ipLockTitle       = document.getElementById('ipLockTitle');
const ipLockSub         = document.getElementById('ipLockSub');
const timezoneSelect     = document.getElementById('timezoneSelect');
const geoModeSelect      = document.getElementById('geoModeSelect');
const spoofLocationSection = document.getElementById('spoofLocationSection');
const latInput           = document.getElementById('latInput');
const lngInput           = document.getElementById('lngInput');
const webrtcPolicyValue  = document.getElementById('webrtcPolicyValue');
const tabIdentityValue   = document.getElementById('tabIdentityValue');
const geoModeValue       = document.getElementById('geoModeValue');
const rulesetValue       = document.getElementById('rulesetValue');
const trackedTabsValue   = document.getElementById('trackedTabsValue');
const matchedRuleCountValue = document.getElementById('matchedRuleCountValue');
const networkModeSelect = document.getElementById('networkModeSelect');
const torPortRow = document.getElementById('torPortRow');
const torPortSelect = document.getElementById('torPortSelect');
const verifyTorBtn = document.getElementById('verifyTorBtn');
const networkModeValue = document.getElementById('networkModeValue');
const networkVisibilityValue = document.getElementById('networkVisibilityValue');
const currentSiteHost    = document.getElementById('currentSiteHost');
const identitySummary    = document.getElementById('identitySummary');
const siteExceptionBtn   = document.getElementById('siteExceptionBtn');
const rotateIdentityBtn  = document.getElementById('rotateIdentityBtn');
const resetBtn           = document.getElementById('resetBtn');
const moduleToggles      = document.querySelectorAll('.module-toggle');
const moduleCards        = document.querySelectorAll('.module-card');

// ─── State ────────────────────────────────────────────────────────────────────

let currentSettings = null;
let activeTabInfo = null;
let saveTimer = null;
let saveRevision = 0;

// ─── Initialization ───────────────────────────────────────────────────────────

async function init() {
  try {
    const response = await sendMessage({ type: 'GET_SETTINGS' });
    if (response.success) {
      currentSettings = response.settings;
      renderUI(currentSettings);
    }

    const statusResponse = await sendMessage({ type: 'GET_STATUS' });
    if (statusResponse.success) {
      renderStatus(statusResponse.status);
    }

    await refreshActiveTab();
    moduleToggles.forEach((toggle) => {
      toggle.setAttribute('aria-label', (toggle.dataset.key || 'protection') + ' protection');
    });
  } catch (err) {
    console.error('[PrivacyShield Popup] Init error:', err);
    renderErrorState();
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderUI(settings) {
  if (!settings) return;

  // Master toggle
  masterToggle.checked = settings.enabled;

  updateGlobalStatusIndicator(settings.enabled, settings.modules);
  document.body.classList.toggle('shield-disabled', !settings.enabled);

  masterToggle.disabled = false;
  masterToggle.removeAttribute('aria-disabled');
  const localTorLock = settings.enabled && settings.networkPrivacy?.mode === 'local_tor';
  const forcedModules = new Set(['webrtc', 'network', 'permissions', 'geolocation', 'browserPrivacy']);

  moduleToggles.forEach((toggle) => {
    const key = toggle.dataset.key;
    const enabled = settings.modules[key] !== false;
    const forced = localTorLock && forcedModules.has(key);
    toggle.checked = enabled;
    toggle.disabled = forced;
    if (forced) {
      toggle.setAttribute('aria-disabled', 'true');
      toggle.title = 'Required while Local Tor is active';
    } else {
      toggle.removeAttribute('aria-disabled');
      toggle.removeAttribute('title');
    }
    updateModuleCardState(toggle.closest('.module-card'), enabled);
  });

  updateActiveModulesCount(settings);

  // Timezone
  timezoneSelect.value = settings.timezone || 'auto';
  timezoneSelect.disabled = !settings.enabled || settings.modules.timezone === false;

  // Geolocation mode
  geoModeSelect.value = settings.geolocationMode || 'deny';
  geoModeSelect.disabled = !settings.enabled || settings.modules.geolocation === false;
  toggleSpoofLocationSection(settings.geolocationMode === 'custom' && settings.enabled && settings.modules.geolocation !== false);

  if (networkModeSelect) {
    networkModeSelect.value = settings.networkPrivacy?.mode || 'direct_hardened';
    networkModeSelect.disabled = !settings.enabled;
  }
  if (torPortSelect) {
    torPortSelect.value = String(settings.networkPrivacy?.torPort || 9050);
  }
  if (torPortRow) {
    torPortRow.hidden = settings.networkPrivacy?.mode !== 'local_tor';
  }

  // Coordinates
  if (settings.spoofedLocation) {
    latInput.value = settings.spoofedLocation.latitude ?? '';
    lngInput.value = settings.spoofedLocation.longitude ?? '';
  }
}

const GEO_MODE_LABELS = {
  deny: 'Block',
  spoof: 'Per-tab city',
  custom: 'Custom coordinates',
};

function renderNetworkPrivacyStatus(status) {
  const mode = status?.networkPrivacy;
  if (!mode) return;

  const localTor = mode.proxyMode === 'local_tor';
  const torActive = localTor && mode.proxyActive === true;

  if (networkModeValue) {
    networkModeValue.textContent = localTor
      ? (torActive ? 'Local Tor · active' : 'Local Tor · not active')
      : 'Direct hardened';
  }
  if (networkVisibilityValue) {
    networkVisibilityValue.textContent = torActive
      ? 'Expected hidden behind Tor'
      : 'Visible to destination';
  }

  if (!mode.enabled) {
    if (ipLockDot) ipLockDot.className = 'ip-lock-dot';
    if (ipLockTitle) ipLockTitle.textContent = 'Protection disabled';
    if (ipLockSub) ipLockSub.textContent = 'Privacy Shield is currently disabled.';
    return;
  }

  if (localTor) {
    const incognitoGap = mode.incognitoAccessAllowed && !mode.incognitoProxyConfigured;
    const unavailableIncognito = !mode.incognitoAccessAllowed && mode.incognitoProxyConfigured !== true;
    if (ipLockDot) ipLockDot.className = torActive && !incognitoGap && !unavailableIncognito ? 'ip-lock-dot protected' : 'ip-lock-dot inactive';
    if (ipLockTitle) {
      ipLockTitle.textContent =
        torActive && !incognitoGap && !unavailableIncognito
          ? 'Local Tor egress active'
          : 'Local Tor selected — protection incomplete';
    }
    if (ipLockSub) {
      ipLockSub.textContent =
        torActive && !incognitoGap && !unavailableIncognito
          ? 'Regular and available incognito proxy scopes are routed through the selected local SOCKS5 endpoint. Direct fallback is disabled.'
          : unavailableIncognito
            ? 'Allow this extension in Incognito to guarantee the same Tor proxy and kill-switch coverage there.'
            : 'The selected Tor proxy is not active in every controllable browser scope. Traffic remains fail-closed.';
    }
    return;
  }

  const active = !!mode.networkModuleEnabled || !!mode.webrtcModuleEnabled || !!mode.browserPrivacyModuleEnabled;
  if (ipLockDot) ipLockDot.className = active ? 'ip-lock-dot protected' : 'ip-lock-dot';
  if (ipLockTitle) ipLockTitle.textContent = active ? 'Direct connection hardened' : 'Network hardening disabled';
  if (ipLockSub) {
    if (!active) {
      ipLockSub.textContent = 'Network, WebRTC and browser-level privacy modules are disabled.';
    } else {
      ipLockSub.textContent = 'Browser-side IP discovery and network leak surfaces are hardened, but a direct connection still exposes the public source IP.';
    }
  }
}

function renderStatus(status) {
  if (!status) return;

  webrtcPolicyValue.textContent = formatWebRTCPolicy(status.webrtcPolicy);
  geoModeValue.textContent =
    GEO_MODE_LABELS[status.geolocationMode] || capitalizeFirst(status.geolocationMode);

  if (rulesetValue) {
    const rules = Array.isArray(status.enabledRulesets) ? status.enabledRulesets : [];
    rulesetValue.textContent = rules.length ? rules.join(', ') : 'Off';
  }
  if (trackedTabsValue) trackedTabsValue.textContent = String(status.trackedTabCount ?? 0);
  if (matchedRuleCountValue) matchedRuleCountValue.textContent = String(status.matchedRuleCount ?? 0);

  const p = status.tabProfile;
  tabIdentityValue.textContent = p
    ? p.city + ' · ' + p.timezone + ' · ' + p.platform
    : 'No identity yet (reload the page)';

  if (status.activeTab) {
    renderSiteInfo({ tab: { id: status.activeTab.id, url: '', host: status.activeTab.host }, excluded: status.activeTab.excluded });
  }

  renderNetworkPrivacyStatus(status);
}

function renderErrorState() {
  statusLabel.textContent = 'Error';
  statusDot.className = 'status-dot inactive';
}

function updateGlobalStatusIndicator(enabled, modules = {}) {
  const total = Object.keys(modules).length;
  const active = Object.values(modules).filter(Boolean).length;

  if (!enabled) {
    statusDot.className = 'status-dot inactive';
    statusLabel.textContent = 'Disabled';
    return;
  }
  if (active === 0) {
    statusDot.className = 'status-dot inactive';
    statusLabel.textContent = 'No modules';
    return;
  }
  if (total > 0 && active < total) {
    statusDot.className = 'status-dot partial';
    statusLabel.textContent = 'Partial';
    return;
  }
  statusDot.className = 'status-dot active';
  statusLabel.textContent = 'Protected';
}

function updateModuleCardState(card, enabled) {
  if (!card) return;
  card.classList.toggle('module-active', enabled);
}

function updateActiveModulesCount(settings) {
  if (!settings.enabled) {
    activeModulesCount.textContent = 'Extension disabled';
    return;
  }
  const total = Object.keys(settings.modules).length;
  const active = Object.values(settings.modules).filter(Boolean).length;
  if (active === total) {
    activeModulesCount.textContent = 'All modules enabled';
  } else if (active === 0) {
    activeModulesCount.textContent = 'All modules disabled';
  } else {
    activeModulesCount.textContent = `${active} of ${total} modules active`;
  }
}

function toggleSpoofLocationSection(show) {
  spoofLocationSection.style.display = show ? 'block' : 'none';
}

function renderSiteInfo(info) {
  activeTabInfo = info || null;
  const host = info?.tab?.host || '';
  const supported = !!host && !host.startsWith('chrome') && host !== 'newtab';

  if (currentSiteHost) currentSiteHost.textContent = host || 'Unavailable';

  if (identitySummary && currentSettings) {
    const excluded = !!info?.excluded || (host && (currentSettings.excludedDomains || []).includes(host));
    identitySummary.textContent = excluded ? 'Privacy disabled for this site' : 'Protected for this tab';
  }

  if (siteExceptionBtn) {
    siteExceptionBtn.disabled = !supported;
    siteExceptionBtn.textContent = info?.excluded ? 'Allow protection' : 'Exclude site';
  }
}

async function refreshActiveTab() {
  try {
    const response = await sendMessage({ type: 'GET_ACTIVE_TAB' });
    if (response && response.success) renderSiteInfo(response);
  } catch (err) {
    console.error('[PrivacyShield Popup] Active tab lookup failed:', err);
    renderSiteInfo(null);
  }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

siteExceptionBtn?.addEventListener('click', async () => {
  siteExceptionBtn.disabled = true;
  const previous = siteExceptionBtn.textContent;
  siteExceptionBtn.textContent = 'Updating…';
  try {
    const response = await sendMessage({ type: 'TOGGLE_SITE_EXCLUSION' });
    if (response?.success) {
      if (response.settings) currentSettings = response.settings;
      renderSiteInfo({
        tab: { id: activeTabInfo?.tab?.id, url: activeTabInfo?.tab?.url || '', host: response.host },
        excluded: response.excluded,
      });
      const statusResponse = await sendMessage({ type: 'GET_STATUS' });
      if (statusResponse.success) renderStatus(statusResponse.status);
      await refreshActiveTab();
    } else {
      siteExceptionBtn.textContent = 'Unavailable';
      setTimeout(() => { siteExceptionBtn.textContent = previous; }, 1000);
    }
  } catch (err) {
    console.error('[PrivacyShield Popup] Site exception error:', err);
    siteExceptionBtn.textContent = 'Error';
    setTimeout(() => { siteExceptionBtn.textContent = previous; }, 1000);
  } finally {
    siteExceptionBtn.disabled = false;
  }
});

rotateIdentityBtn?.addEventListener('click', async () => {
  rotateIdentityBtn.disabled = true;
  rotateIdentityBtn.textContent = 'Rotating…';
  try {
    const response = await sendMessage({ type: 'ROTATE_IDENTITY' });
    if (response?.success) identitySummary.textContent = 'New identity on next load';
  } catch (err) {
    console.error('[PrivacyShield Popup] Identity rotation error:', err);
  } finally {
    setTimeout(() => {
      rotateIdentityBtn.textContent = 'Rotate identity';
      rotateIdentityBtn.disabled = false;
    }, 800);
  }
});



networkModeSelect?.addEventListener('change', () => {
  if (!currentSettings) return;
  const mode = networkModeSelect.value === 'local_tor' ? 'local_tor' : 'direct_hardened';
  currentSettings.networkPrivacy = {
    mode,
    torPort: Number(torPortSelect?.value) === 9150 ? 9150 : 9050,
  };
  if (torPortRow) torPortRow.hidden = mode !== 'local_tor';
  scheduleSave();
});

torPortSelect?.addEventListener('change', () => {
  if (!currentSettings) return;
  currentSettings.networkPrivacy = {
    mode: currentSettings.networkPrivacy?.mode === 'local_tor' ? 'local_tor' : 'direct_hardened',
    torPort: Number(torPortSelect.value) === 9150 ? 9150 : 9050,
  };
  scheduleSave();
});

verifyTorBtn?.addEventListener('click', async () => {
  verifyTorBtn.disabled = true;
  verifyTorBtn.textContent = 'Checking…';
  try {
    const response = await sendMessage({ type: 'CHECK_TOR' });
    if (response?.success && response?.isTor) {
      verifyTorBtn.textContent = 'Tor verified';
      if (ipLockSub) ipLockSub.textContent = 'Tor verification succeeded; the browser is reaching the Tor Project through the local Tor path.';
    } else {
      verifyTorBtn.textContent = response?.success ? 'Not a Tor exit' : 'Tor failed';
      if (ipLockSub) ipLockSub.textContent = response?.error || 'The selected proxy did not verify as Tor.';
    }
  } catch (err) {
    verifyTorBtn.textContent = 'Tor failed';
    if (ipLockSub) ipLockSub.textContent = err?.message || 'Tor verification failed.';
  } finally {
    setTimeout(() => {
      verifyTorBtn.textContent = 'Verify Tor';
      verifyTorBtn.disabled = false;
    }, 1800);
  }
});

// Master toggle
masterToggle.addEventListener('change', () => {
  if (!currentSettings) return;
  currentSettings.enabled = masterToggle.checked;
  updateGlobalStatusIndicator(currentSettings.enabled, currentSettings.modules);
  updateActiveModulesCount(currentSettings);
  document.body.classList.toggle('shield-disabled', !currentSettings.enabled);
  scheduleSave();
});

// Per-module toggles
moduleToggles.forEach((toggle) => {
  toggle.addEventListener('change', () => {
    if (!currentSettings) return;
    const key = toggle.dataset.key;
    currentSettings.modules[key] = toggle.checked;
    updateModuleCardState(toggle.closest('.module-card'), toggle.checked);
    updateActiveModulesCount(currentSettings);
    scheduleSave();
  });
});

// Timezone selector
timezoneSelect.addEventListener('change', () => {
  if (!currentSettings) return;
  currentSettings.timezone = timezoneSelect.value;
  scheduleSave();
});

// Geo mode selector
geoModeSelect.addEventListener('change', () => {
  if (!currentSettings || currentSettings.modules.geolocation === false) return;
  currentSettings.geolocationMode = geoModeSelect.value;
  toggleSpoofLocationSection(geoModeSelect.value === 'custom');
  geoModeValue.textContent =
    GEO_MODE_LABELS[geoModeSelect.value] || capitalizeFirst(geoModeSelect.value);
  scheduleSave();
});

// Coordinate inputs
latInput.addEventListener('input', debounce(() => {
  if (!currentSettings || currentSettings.modules.geolocation === false || !currentSettings.spoofedLocation) return;
  const val = parseFloat(latInput.value);
  if (!isNaN(val) && val >= -90 && val <= 90) {
    currentSettings.spoofedLocation.latitude = val;
    scheduleSave();
  }
}, 500));

lngInput.addEventListener('input', debounce(() => {
  if (!currentSettings || currentSettings.modules.geolocation === false || !currentSettings.spoofedLocation) return;
  const val = parseFloat(lngInput.value);
  if (!isNaN(val) && val >= -180 && val <= 180) {
    currentSettings.spoofedLocation.longitude = val;
    scheduleSave();
  }
}, 500));

// Quick location buttons
document.querySelectorAll('.quick-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!currentSettings) return;
    const lat = parseFloat(btn.dataset.lat);
    const lng = parseFloat(btn.dataset.lng);
    latInput.value = lat;
    lngInput.value = lng;
    currentSettings.spoofedLocation.latitude = lat;
    currentSettings.spoofedLocation.longitude = lng;
    scheduleSave();

    // Visual feedback
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    setTimeout(() => {
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 800);
  });
});

// Reset button
resetBtn.addEventListener('click', async () => {
  resetBtn.textContent = 'Resetting…';
  resetBtn.disabled = true;

  try {
    const response = await sendMessage({ type: 'RESET_SETTINGS' });
    if (response.success) {
      currentSettings = response.settings;
      renderUI(currentSettings);

      const statusResponse = await sendMessage({ type: 'GET_STATUS' });
      if (statusResponse.success) renderStatus(statusResponse.status);
    }
  } catch (err) {
    console.error('[PrivacyShield Popup] Reset error:', err);
  } finally {
    resetBtn.textContent = 'Reset Defaults';
    resetBtn.disabled = false;
  }
});

// ─── Save Logic ───────────────────────────────────────────────────────────────

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  const revision = ++saveRevision;
  saveTimer = setTimeout(() => { void saveSettings(revision); }, 300);
}

function cloneSettings(settings) {
  return typeof structuredClone === 'function'
    ? structuredClone(settings)
    : JSON.parse(JSON.stringify(settings));
}

async function saveSettings(revision = saveRevision) {
  if (!currentSettings) return;
  const payload = cloneSettings(currentSettings);
  try {
    const response = await sendMessage({ type: 'UPDATE_SETTINGS', settings: payload });
    if (revision !== saveRevision) return;
    if (response?.success) {
      currentSettings = response.settings;
      const statusResponse = await sendMessage({ type: 'GET_STATUS' });
      if (statusResponse.success) renderStatus(statusResponse.status);
    } else {
      console.error('[PrivacyShield Popup] Save rejected:', response?.error || 'unknown error');
    }
  } catch (err) {
    if (revision === saveRevision) {
      console.error('[PrivacyShield Popup] Save error:', err);
    }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function capitalizeFirst(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatWebRTCPolicy(policy) {
  const labels = {
    'disable_non_proxied_udp': 'Strict (No UDP)',
    'default_public_and_private_interfaces': 'Default',
    'default_public_interface_only': 'Public Only',
    'disable_non_proxied_udp_if_possible': 'Best Effort',
  };
  return labels[policy] || policy || '—';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
