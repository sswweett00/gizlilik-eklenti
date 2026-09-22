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
const timezoneSelect     = document.getElementById('timezoneSelect');
const geoModeSelect      = document.getElementById('geoModeSelect');
const spoofLocationSection = document.getElementById('spoofLocationSection');
const latInput           = document.getElementById('latInput');
const lngInput           = document.getElementById('lngInput');
const webrtcPolicyValue  = document.getElementById('webrtcPolicyValue');
const tabIdentityValue   = document.getElementById('tabIdentityValue');
const geoModeValue       = document.getElementById('geoModeValue');
const resetBtn           = document.getElementById('resetBtn');
const moduleToggles      = document.querySelectorAll('.module-toggle');
const moduleCards        = document.querySelectorAll('.module-card');

// ─── State ────────────────────────────────────────────────────────────────────

let currentSettings = null;
let saveTimer = null;

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
  updateGlobalStatusIndicator(settings.enabled);
  document.body.classList.toggle('shield-disabled', !settings.enabled);

  // Module toggles
  moduleToggles.forEach((toggle) => {
    const key = toggle.dataset.key;
    const enabled = settings.modules[key] !== false;
    toggle.checked = enabled;
    updateModuleCardState(toggle.closest('.module-card'), enabled);
  });

  updateActiveModulesCount(settings);

  // Timezone
  timezoneSelect.value = settings.timezone || 'auto';

  // Geolocation mode
  geoModeSelect.value = settings.geolocationMode || 'spoof';
  toggleSpoofLocationSection(settings.geolocationMode === 'custom');

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

function renderStatus(status) {
  if (!status) return;

  webrtcPolicyValue.textContent = formatWebRTCPolicy(status.webrtcPolicy);
  geoModeValue.textContent =
    GEO_MODE_LABELS[status.geolocationMode] || capitalizeFirst(status.geolocationMode);

  const p = status.tabProfile;
  tabIdentityValue.textContent = p
    ? `${p.city} · ${p.timezone} · ${p.platform}`
    : 'No identity yet (reload the page)';
}

function renderErrorState() {
  statusLabel.textContent = 'Error';
  statusDot.className = 'status-dot inactive';
}

function updateGlobalStatusIndicator(enabled) {
  statusDot.className = `status-dot ${enabled ? 'active' : 'inactive'}`;
  statusLabel.textContent = enabled ? 'Protected' : 'Disabled';
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

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Master toggle
masterToggle.addEventListener('change', () => {
  if (!currentSettings) return;
  currentSettings.enabled = masterToggle.checked;
  updateGlobalStatusIndicator(currentSettings.enabled);
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
  if (!currentSettings) return;
  currentSettings.geolocationMode = geoModeSelect.value;
  toggleSpoofLocationSection(geoModeSelect.value === 'custom');
  geoModeValue.textContent =
    GEO_MODE_LABELS[geoModeSelect.value] || capitalizeFirst(geoModeSelect.value);
  scheduleSave();
});

// Coordinate inputs
latInput.addEventListener('input', debounce(() => {
  if (!currentSettings) return;
  const val = parseFloat(latInput.value);
  if (!isNaN(val) && val >= -90 && val <= 90) {
    currentSettings.spoofedLocation.latitude = val;
    scheduleSave();
  }
}, 500));

lngInput.addEventListener('input', debounce(() => {
  if (!currentSettings) return;
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
  saveTimer = setTimeout(saveSettings, 300);
}

async function saveSettings() {
  if (!currentSettings) return;
  try {
    const response = await sendMessage({ type: 'UPDATE_SETTINGS', settings: currentSettings });
    if (response.success) {
      currentSettings = response.settings;
      // Refresh status panel after save
      const statusResponse = await sendMessage({ type: 'GET_STATUS' });
      if (statusResponse.success) renderStatus(statusResponse.status);
    }
  } catch (err) {
    console.error('[PrivacyShield Popup] Save error:', err);
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
