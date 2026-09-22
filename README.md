# Privacy Shield 4.5

Privacy Shield is a Manifest V3 privacy extension built around a hardened direct-connection Chromium/Firefox WebExtensions architecture.

## Implemented architecture

- `src/background/index.ts` — runtime entry point
- `src/background/ruleManager.ts` — ruleset lifecycle
- `src/background/urlCleaner.ts` — URL tracking-parameter rule generation
- `src/background/badgeManager.ts` — current-document matched-rule badge
- `src/content/content-isolated.ts` — isolated bridge entry
- `src/content/inject-main.iife.ts` — MAIN-world hardening entry
- `src/shared/constants.ts` — privacy constants
- `src/shared/types.ts` — typed settings/state contracts
- `src/shared/storage.ts` — validated local-only settings storage
- `src/popup/` — dashboard packaged through Vite
- `src/options/` — validated import/export and legacy-exclusion cleanup
- `public/rules/` — tracker, ad, network and URL-cleaning rules
- `tests/` — static regression and Vitest unit tests

CRXJS supports Vite-bundled isolated and MAIN-world content scripts; MAIN-world files can use the `.iife.ts` convention so they are emitted as self-contained IIFEs.

## Privacy layers

The hardened build blocks browser Geolocation, common public-IP discovery and third-party IP-geolocation APIs, WebRTC/WebTransport/WebSocket/EventSource/ping surfaces, Bluetooth/USB/HID/Serial/MIDI and sensor surfaces, high-entropy Client Hints, Storage Access API re-grants, service-worker registration and push subscriptions. Canvas protection also covers OffscreenCanvas 2D export paths, while Navigator hardening standardizes common OS media-query preferences exposed through matchMedia().

It also standardizes the page locale to en-US and the HTTP Accept-Language profile, applies browser content-setting controls where supported, and removes high-confidence tracking query parameters with declarative DNR.

Chrome documents contentSettings as a browser-level per-site control surface for location, camera, microphone, advanced clipboard access, notifications and cookies. Declarative Net Request supports query transformations including removal of query parameters.

## Storage and threat model

Settings are stored with chrome.storage.local rather than sync/cloud storage. The MAIN-world hardening layer never trusts page-controlled sessionStorage for security state and never uses Math.random() for its privacy seed.

One boundary is fundamental: a direct network connection still exposes its source public IP to the destination. The extension can block browser-side IP-discovery and geolocation APIs, but it cannot replace the source IP without an intermediary network path.

## URL cleaning

The URL cleaner removes high-confidence tracking parameters such as utm_*, gclid, fbclid, msclkid and yclid. Ambiguous generic parameters such as ref are intentionally preserved to reduce site breakage.

## Cross-browser target

The manifest includes Firefox MV3 distribution metadata and the runtime uses WebExtensions APIs with feature checks where Chromium and Firefox differ. Firefox-specific signing metadata is included for MV3 distribution.

## Build

npm install
npm run typecheck
npm test
npm run validate
npm run build

The CI workflow runs the same validation sequence and verifies the generated dist/manifest.json.

## Direct-connection limitation

This project is deliberately not a proxy/VPN/Tor implementation. If the destination must not see the real public IP, the browser must use Tor, VPN, proxy or another intermediary network path. Privacy Shield is the browser-side hardening layer; AEGIS-9 / Qubes-Whonix remains the system-level anonymity companion.
