/**
 * Privacy Shield v2.2 — bridge.js (ISOLATED world content script)
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
  function mintToken() {
    const bytes = new Uint8Array(32);
    try {
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      // The bridge token is authentication for MAIN/ISOLATED messaging only;
      // do not fall back to Date.now()/Math.random() entropy.
      return '';
    }
  }
  const TOKEN = mintToken();
  if (!TOKEN) return;

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

  // background → MAIN world
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'SETTINGS_UPDATE' && msg.settings) {
      postSettings(msg.settings);
      return;
    }

    if (msg && msg.type === 'ROTATE_IDENTITY') {
      try {
        window.postMessage({
          __privacyShieldType: 'ROTATE_IDENTITY',
          token: TOKEN,
        }, '*');
        sendResponse({ success: true });
      } catch (_) {
        sendResponse({ success: false });
      }
      return true;
    }
  });

  // Announce token, then pull current settings so the tab applies them
  // as early as possible (inject.js caches them to sessionStorage).
  try {
    window.postMessage({ __privacyShieldType: 'PS_TOKEN', token: TOKEN }, '*');
  } catch (_) {}
  fetchAndPushSettings();
})();
