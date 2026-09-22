/**
 * Privacy Shield — bridge.js (ISOLATED world content script)
 *
 * Relay between inject.js (MAIN world, no chrome.* access) and the
 * background service worker.
 *
 * Settings anti-forgery:
 *   - A non-extractable P-256 private key lives only in this isolated world.
 *   - MAIN receives only the public verification key.
 *   - Every SETTINGS_UPDATE is signed and carries a monotonically increasing
 *     sequence number, preventing forged or replayed relaxations.
 */

'use strict';

(function PsBridge() {
  let signingKeyPair = null;
  let settingsSequence = 0;

  function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async function initSigningKey() {
    try {
      signingKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify']
      );

      const publicKeyJwk = await crypto.subtle.exportKey('jwk', signingKeyPair.publicKey);
      window.postMessage(
        { __privacyShieldType: 'SETTINGS_VERIFY_KEY', publicKeyJwk },
        '*'
      );
      return true;
    } catch (_) {
      signingKeyPair = null;
      return false;
    }
  }

  async function postSettings(settings) {
    if (!signingKeyPair?.privateKey) return;

    try {
      const sequence = ++settingsSequence;
      const payload = JSON.stringify({ sequence, settings });
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        signingKeyPair.privateKey,
        new TextEncoder().encode(payload)
      );

      window.postMessage(
        {
          __privacyShieldType: 'SETTINGS_UPDATE',
          sequence,
          payload,
          signature: bytesToBase64(new Uint8Array(signature)),
        },
        '*'
      );
    } catch (_) {}
  }

  function fetchAndPushSettings() {
    try {
      chrome.runtime
        .sendMessage({ type: 'GET_TAB_SETTINGS' })
        .then((resp) => {
          if (resp && resp.success) return postSettings(resp.settings);
          return undefined;
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
      void postSettings(msg.settings);
      return;
    }

    if (msg && msg.type === 'ROTATE_IDENTITY') {
      try {
        window.postMessage({ __privacyShieldType: 'ROTATE_IDENTITY' }, '*');
        sendResponse({ success: true });
      } catch (_) {
        sendResponse({ success: false });
      }
      return true;
    }
  });

  // Fail closed: without Web Crypto the MAIN world retains its secure defaults.
  void initSigningKey().then((ready) => {
    if (!ready) return;
    fetchAndPushSettings();
  });
})();
