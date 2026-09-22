# Privacy Shield 4.9

Privacy Shield is a Manifest V3 Chromium-first privacy extension with mandatory Tor-only website egress with zero-cost local Tor SOCKS5 and browser hardening.

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
- `rules/` — header, permission-policy, tracker, ad, network and URL-cleaning rules
- `tests/` — static regression and Vitest unit tests

CRXJS supports Vite-bundled isolated and MAIN-world content scripts; MAIN-world files can use the `.iife.ts` convention so they are emitted as self-contained IIFEs.

## Privacy layers

The hardened build blocks browser Geolocation, common public-IP discovery and third-party IP-geolocation APIs, WebRTC/WebTransport/WebSocket/EventSource/ping surfaces, Bluetooth/USB/HID/Serial/MIDI and sensor surfaces, high-entropy Client Hints, Storage Access API re-grants, service-worker registration and push subscriptions. Canvas protection also covers OffscreenCanvas 2D export paths, while Navigator hardening standardizes common OS media-query preferences exposed through matchMedia().

It also standardizes the page locale to en-US and the HTTP Accept-Language profile, applies browser content-setting controls where supported, and removes high-confidence tracking query parameters with declarative DNR.

Chrome documents contentSettings as a browser-level per-site control surface for location, camera, microphone, advanced clipboard access, notifications and cookies. Declarative Net Request supports query transformations including removal of query parameters.

## Storage and threat model

Settings are stored with chrome.storage.local rather than sync/cloud storage. The MAIN-world hardening layer never trusts page-controlled sessionStorage for security state and never uses Math.random() for its privacy seed.

While active, Privacy Shield 4.9 does not expose a direct-network configuration. Chromium is forced toward a local SOCKS5 Tor endpoint (`127.0.0.1:9050` or `127.0.0.1:9150`) with no direct fallback. The browser remains fail-closed until the Tor exit is verified. This changes the network path so the destination is expected to see the Tor exit address instead of the local public IP; it still does not reproduce Tor Browser's full anti-fingerprinting model.

## URL cleaning

The URL cleaner removes high-confidence tracking parameters such as utm_*, gclid, fbclid, msclkid and yclid. Ambiguous generic parameters such as ref are intentionally preserved to reduce site breakage.

## Browser support

The primary validated path is Chromium/Chrome MV3. Firefox metadata remains in the manifest, but the `chrome.proxy`-based Local Tor mode and some browser-level privacy controls require independent Firefox runtime validation before being treated as equivalent.

## Build

npm install
npm run typecheck
npm test
npm run validate
npm run build

The CI workflow runs the same validation sequence and verifies the generated dist/manifest.json.

## Network path

- **Tor-only:** Chromium is forced onto `127.0.0.1:9050` or `127.0.0.1:9150` through SOCKS5. The extension configures no direct fallback or bypass list and keeps a network kill-switch active until the Tor exit is verified.
- Settings are normalized back to Tor-only even if an old configuration, import file or direct-mode value is supplied.
- When the Tor endpoint is unavailable, browser web requests fail closed instead of using the public source IP. SOCKS5 handles TCP-based web traffic; WebRTC UDP is independently disabled.

This mode is zero-cost when Tor is running locally. It is a network-path integration, not a reimplementation of Tor, and it should not be treated as equivalent to Tor Browser's complete anti-fingerprinting and isolation model.


## Recent hardening in 4.8

- Browser-enforced Permissions-Policy response rules complement the page-world permission shims for geolocation, camera, microphone and hardware/sensor interfaces. Chrome DNR supports response-header modification, and Permissions-Policy can deny these features with empty allowlists. citeturn549246search2turn549246search0
- OffscreenCanvas 2D image reads/exports receive the same deterministic canvas-noise treatment as ordinary canvas paths.
- Common OS preference media queries exposed via matchMedia() are standardized under the Navigator hardening module.
- Tracker and ad blocklists were expanded without increasing the number of static blocking rules.
- Local Tor SOCKS5 egress was added with 9050/9150 support, fail-closed verification, proxy-state monitoring and restoration of the user's previous proxy configuration.
- Additional IP-echo and server-side IP tracing endpoints were blocked.
