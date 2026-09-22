# Privacy Shield 4.9 — Security Architecture

## Executive Summary

Privacy Shield 4.8 is a Chromium-first privacy-hardening extension with a single Tor-only network posture when the extension is active. The Local Tor mode uses Chromium's proxy API to point the browser at a locally running Tor SOCKS5 endpoint; no paid VPN or remote proxy service is required.

The extension never normalizes an active configuration to a direct network path. Local Tor changes the network path by making Chromium use a local SOCKS5 Tor endpoint. If the endpoint is unavailable, Privacy Shield keeps the kill-switch active and does not configure a direct fallback proxy.

The achievable security goal is: reduce browser-side fingerprinting, block major alternate browser transport surfaces, minimize tracking/telemetry APIs, keep JavaScript and request identities coherent, enforce a maximum direct-privacy baseline, validate all settings, and report residual risk honestly.

## Architecture

### Components

1. Main-world injector: inject.js. Runs at document_start and hardens WebRTC, WebTransport, Canvas, WebGL, Audio, DOM geometry, Navigator, Client Hints, Screen, Geolocation, Permissions, and Timezone APIs.
2. Isolated bridge: bridge.js. Relays profiles and settings between the page world and extension service worker using cryptographically signed settings updates from an isolated-world signing key. The main-world verifier still shares the page JavaScript environment, so the browser's MAIN/ISOLATED trust boundary remains a platform limitation rather than a substitute for a native isolated execution boundary.
3. Background service worker: background.js. Owns browser privacy policies, static/dynamic DNR state, sanitized per-tab profile bookkeeping, validation, site exceptions, rotation, tab lifecycle and status reporting.
4. Declarative network rules: header_rules, permission_rules, tracker_rules, ad_rules, network_rules and url_rules. The permission ruleset adds a browser-enforced Permissions-Policy response layer. Network rules also block common IP-echo and IP-geolocation lookup endpoints.
5. Zero-cost deployment assets: OS audit tools and deployment guidance for Windows, Linux, macOS, native Tails, Tor and Tor Browser. Tor/Tails are intentionally external system components; the extension never attempts to impersonate or reimplement them.

### Data Flow

Navigation -> document_start injector -> isolated bridge -> service worker profile/status registration -> browser privacy/DNR policy. The first navigation remains native; legacy per-tab header spoofing is no longer used.
Network-path change -> validated local settings -> browser proxy API -> localhost SOCKS5 Tor endpoint, with no direct proxy fallback.
Settings change -> local storage -> service worker validation -> privacy APIs/DNR/proxy update -> signed MAIN-world update -> targeted tab reload when required.

## Threat Model

### In scope

- First-party and third-party websites.
- Tracking scripts and ad networks.
- Fingerprinting libraries.
- WebRTC and alternate browser transport probes.
- Attempts to infer device properties from navigator, screen, GPU, audio, canvas, fonts and Client Hints.
- Page JavaScript attempting to forge extension settings messages.

### Out of scope or fundamentally constrained

- The destination server seeing the public source IP of a direct connection.
- ISP/local-network observation.
- A compromised operating system, browser binary, kernel or privileged extension.
- New browser bugs or future fingerprint surfaces outside the extension's control.
- Identity correlation through user accounts, cookies or external identifiers that remain intentionally usable.

## Implementation

### Browser privacy policy

The extension hardens WebRTC IP handling, network prediction, hyperlink auditing, referrers, third-party cookies, Topics, FLEDGE, ad measurement, search suggestions, alternate error pages, autofill and password-saving prompts where the Chrome privacy API exposes those controls. Safe Browsing is intentionally not disabled.

Controlled settings are snapshotted in session storage and restored when protection is disabled during the active extension session.

### Maximum direct mode

The `maximum_direct` browser-hardening baseline remains active, but the network path itself is mandatory Local Tor. Critical network/privacy modules cannot be disabled while the Tor-only posture is active. Geolocation is deny-by-default. Site exceptions do not disable page-world protections in maximum mode, and their DNR allow rules deliberately do not bypass the WebTransport or ping/beacon blocks. Chrome's WebRTC IP handling policy is also set to disable non-proxied UDP. Media-device enumeration is minimized.

### WebRTC

RTCPeerConnection is blocked in the page world while protection is active. Chrome's WebRTC IP policy is also forced to `disable_non_proxied_udp`.

### WebTransport and telemetry

WebTransport is blocked at the page API boundary and with a DNR rule. HTTP ping/beacon requests are also blocked in the hardened network ruleset to reduce silent telemetry channels.

### Fingerprint coherence

Per-tab profiles correlate browser version, platform, GPU family, screen size and hardware capacity instead of independently randomizing every property. Canvas protection also covers OffscreenCanvas 2D export paths, and Navigator hardening standardizes selected OS media-query preferences exposed through `matchMedia()`.

### Header coherence

Static global User-Agent spoofing is avoided. Per-tab profile data is retained only for status/coherence bookkeeping; request headers remain native so the first navigation and subsequent Chromium-generated Client Hints cannot be split by cross-platform spoofing.

### Identity entropy

Per-tab profile bookkeeping prefers `crypto.getRandomValues()` at `document_start`. The network/browser identity itself remains native and coherent; randomness is used for deterministic privacy-noise seeds, not for cross-platform User-Agent spoofing.

### State and trust boundaries

Page JavaScript is treated as hostile. Settings are schema-normalized, profile data is sanitized before network-rule construction, DNR mutations are serialized, and main-world settings updates use signed messages plus monotonic sequence checks.

## System-Level Anonymity Architecture

The extension cannot alter a direct network source IP. When website-visible IP anonymity is required, use a network-path intermediary such as Tor or a VPN rather than treating browser-side hardening as IP anonymization. Tor Project explicitly recommends Tor Browser instead of routing another browser through Tor because other browsers can leak real IP/DNS/WebRTC information and expose identifying fingerprint, cookie and cache state.

The repository includes `docs/ZERO_COST_DEPLOYMENT.md`, `docs/THREAT_MODEL.md`, `docs/VERIFICATION.md` and platform audit/setup scripts to operationalize this architecture.

## Configuration Guidelines

Recommended production posture:

- Protection: ON
- WebRTC: ON
- Network Surfaces: ON
- Canvas/WebGL/Audio/Fonts/DOM: ON
- Navigator/Screen/Headers: ON
- Permissions coherence: ON
- Geolocation: deny unless required
- Timezone: auto or deliberately selected
- Tracker blocking: ON
- Site exceptions: only where necessary

Do not treat a spoofed browser profile as IP anonymization. It changes browser-observable attributes but cannot change the source IP of a direct network connection.

## Security Analysis

### Confidentiality

Browser-side disclosure is reduced for device capabilities, GPU identity, display geometry, canvas output, audio characteristics, font geometry, locale/timezone, geolocation, permission state and high-entropy Client Hints.

### Integrity

Configuration is validated, rules have explicit priorities, concurrent DNR mutations are serialized, and untrusted page messages cannot directly replace extension settings without a valid bridge signature.

### Availability

High-compatibility APIs are preferred where possible. FontFaceSet.check is left native, canvas serialization uses a temporary surface, live AudioBuffers are not permanently modified, and unavailable browser settings are handled individually. WebRTC/WebTransport blocking intentionally trades some site functionality for stronger privacy.

### Authentication

The extension is self-contained and has no remote authentication service. Its security boundary is page JavaScript -> main-world injector -> isolated bridge -> service worker.

### Anonymity

Website-visible IP anonymity is attempted only through the verified Local Tor network path. The extension remains fail-closed until the Tor exit is verified; it does not silently fall back to the public source IP. This is still browser-layer protection, not a guarantee against a compromised OS/browser or against Tor traffic correlation. Residual risks include browser fingerprinting, account-based identification, application behaviors outside the proxied browser, Tor network correlation and future browser implementation changes.

### Residual Risks

- Browser implementation bugs.
- New fingerprinting APIs in future Chrome versions.
- Page-initiated preconnect or DNS behaviors that Chrome documents are not all disabled by the network prediction preference.
- Conflicting extensions or enterprise policy.
- OS/network compromise.
- Account and login identifiers that are intentionally usable by the site.

## Testing

The repository contains static validation for manifest permissions, JavaScript syntax, DNR rule structure, proxy-surface removal, WebRTC hard blocking, WebTransport blocking, privacy-policy controls and the direct-IP disclosure UI.

Recommended runtime validation matrix: Chrome stable/Beta/Chromium on Windows, Linux and macOS; WebRTC sites; WebTransport sites; fingerprinting test pages; geolocation/permission pages; heavy third-party tracking pages; and Incognito split mode.

## Conclusion

Privacy Shield 4.8 is a browser privacy hardener with an optional localhost Tor egress path. Direct Hardened mode provides leak resistance without changing the source IP; Local Tor changes the network path and deliberately avoids direct fallback. Neither mode should be treated as a complete substitute for Tor Browser or a system-wide anonymous networking stack.


## AEGIS-9 system profile

For website-visible IP anonymity, Privacy Shield is paired with Qubes-Whonix/Tor rather than trying to emulate a Tor network in a browser extension. The current documented target is Qubes R4.3 + Whonix 18, using `anon-whonix -> sys-whonix -> Tor` and `whonix-workstation-18-dvm` for disposable sessions. citeturn303752search2turn602539search0turn602539search1
