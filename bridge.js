/**
 * Privacy Shield — bridge.js (ISOLATED world content script)
 *
 * Relay between inject.js (MAIN world, no chrome.* access) and the
 * background service worker:
 *   - forwards REGISTER_PROFILE / REQUEST_SETTINGS from inject → background
 *   - pushes SETTINGS_UPDATE from background → inject
 *
 * Anti-forgery: the bridge mints a one-time token and announces it to the
 * MAIN world; inject.js only accepts SETTINGS_UPDATE messages carrying it.
 * Note: window.postMessage is a shared bus, so a targeted attacker that
 * sniffs the announcement can still forge messages. Settings changes are
 * re-pushed by the background on every popup save, which overwrites forged
 * values quickly; forged relaxations within that window are a known,
 * documented limitation of MAIN/ISOLATED messaging.
 */

'use strict';

(function PsBridge() {
  const TOKEN =
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10);

  function postSettings(settings) {
    try {
      window.postMessage(
        { __privacyShieldType: 'SETTINGS_UPDATE', token: TOKEN, settings },
        '*'
      );
    } catch (_) {}
  }

  function fetchAndPushSettings() {
    try {
      chrome.runtime
        .sendMessage({ type: 'GET_TAB_SETTINGS' })
        .then((resp) => {
          if (resp && resp.success) postSettings(resp.settings);
        })
        .catch(() => {});
    } catch (_) {}
  }

  // MAIN world → background
  window.addEventListener(
    'message',
    (event) => {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.__privacyShield !== true) return;

      if (d.type === 'REGISTER_PROFILE' && d.profile && typeof d.profile === 'object') {
        try {
          chrome.runtime
            .sendMessage({ type: 'REGISTER_PROFILE', profile: d.profile })
            .catch(() => {});
        } catch (_) {}
      } else if (d.type === 'REQUEST_SETTINGS') {
        fetchAndPushSettings();
      }
    },
    false
  );

  // background → MAIN world (settings changed in popup, pushed to every tab)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'SETTINGS_UPDATE' && msg.settings) {
      postSettings(msg.settings);
    }
  });

  // Announce token, then pull current settings so the tab applies them
  // as early as possible (inject.js caches them to sessionStorage).
  try {
    window.postMessage({ __privacyShieldType: 'PS_TOKEN', token: TOKEN }, '*');
  } catch (_) {}
  fetchAndPushSettings();
})();
