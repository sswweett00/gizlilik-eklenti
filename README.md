# Privacy Shield

Privacy Shield is a Manifest V3 Chromium extension focused on reducing common browser fingerprinting and tracking signals while keeping the underlying browser behavior as coherent as possible.

## What changed in 2.3.0

- Per-tab identity profiles now correlate browser family/version, screen size, hardware capacity and GPU family instead of selecting every signal independently.
- Static global User-Agent and Accept-Language rewriting was removed. Per-tab header rewriting now uses session rules after a tab profile is registered, avoiding a global header identity that conflicts with the JavaScript identity.
- Canvas toBlob() now serializes a temporary noised canvas instead of restoring pixels before the asynchronous encoder runs.
- Audio fingerprint protection no longer mutates live AudioBuffer channel data; analyser outputs and offline-render fingerprint reads are hardened instead.
- The fake WEBGL_debug_renderer_info object was removed; WebGL parameters are masked while the real extension object remains intact.
- Timezone spoofing is now date-aware so DST and historical offsets are not frozen to the current day.
- Geolocation permission state is kept coherent with the spoof/deny mode through the Permissions API.
- Privacy-sensitive settings are schema-normalized on every read/write.
- Protection-affecting setting changes reload existing HTTP(S)/file tabs so module toggles actually take effect.
- Per-site exclusions bypass both extension JS protections and DNR tracker/header rules after the settings are applied and the page is reloaded.
- Added one-click identity rotation for the active tab.
- Added richer live status, keyboard focus states and accessible module labels.
- Removed unused scripting, activeTab and webNavigation permissions.
- Added static validation tests and a GitHub Actions workflow.

## Architecture

### Main-world injector

`inject.js` runs at `document_start` and patches browser APIs that are commonly queried for fingerprinting:

- WebRTC
- Canvas
- WebGL
- Audio
- Fonts / geometry
- Navigator / Client Hints
- Screen
- Geolocation
- Timezone / Intl
- Permissions

The generated profile is stored in `sessionStorage` so navigation within the same tab keeps the same identity.

### Isolated-world bridge

`bridge.js` is the only content-script layer with access to `chrome.runtime`. It relays profile/settings messages and carries the token used to authenticate background to main-world settings messages.

### Background service worker

`background.js` owns:

- Chrome privacy API configuration
- static DNR rulesets
- per-tab DNR session rules
- settings validation and persistence
- site exception rules
- tab lifecycle cleanup
- identity rotation
- extension-wide setting synchronization

## Important limitation

A browser navigation request is sent before a `document_start` content script can report its generated profile. Therefore the very first request of a fresh navigation is intentionally not rewritten to a fake per-tab User-Agent. Subsequent requests are rewritten consistently with the registered tab profile. This avoids the worse failure mode where the first request uses one global identity while JavaScript advertises another.

## Validation

The repository contains:

- `tests/validate.mjs` for manifest/rules/source invariants
- `.github/workflows/validate.yml` for Node syntax checks and static regression checks

The GitHub connector exposed no workflow run/status result for the commits in this repository, so the changes are committed to `main` but the CI result could not be independently observed from the available GitHub status endpoint.

## Direct-Connection Privacy

Privacy Shield does not use a proxy, VPN or Tor. It hardens browser-side privacy and blocks WebRTC/WebTransport leak surfaces, but a normal direct TCP/QUIC connection still exposes its source public IP to the destination server. No browser extension can change that network-layer fact without changing the network path.

Chrome's privacy API exposes the WebRTC IP handling policy and other browser privacy settings, while Declarative Net Request can block and modify supported network requests, including the WebTransport resource type. citeturn126478search0turn126478search1

See SECURITY_ARCHITECTURE.md for the full threat model, data flow, residual risks and production guidance.
