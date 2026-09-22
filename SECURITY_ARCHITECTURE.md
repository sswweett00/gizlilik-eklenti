# Privacy Shield 4.3 — Security Architecture

## Executive Summary

Privacy Shield 4.3 is a Chromium privacy-hardening extension plus an AEGIS-9 zero-cost system deployment model for direct network connections. It does not configure or depend on a proxy, VPN, or Tor.

The system deliberately does not claim to hide the public source IP of a normal direct TCP/QUIC connection. A destination server necessarily receives the network source address of the connection that reaches it. Network-layer anonymity therefore remains outside the capability of a browser extension without an intermediary network path.

The achievable security goal is: reduce browser-side fingerprinting, block major alternate browser transport surfaces, minimize tracking/telemetry APIs, keep JavaScript and request identities coherent, enforce a maximum direct-privacy baseline, validate all settings, and report residual risk honestly.

## Architecture

### Components

1. Main-world injector: inject.js. Runs at document_start and hardens WebRTC, WebTransport, Canvas, WebGL, Audio, DOM geometry, Navigator, Client Hints, Screen, Geolocation, Permissions, and Timezone APIs.
2. Isolated bridge: bridge.js. Relays profiles and settings between the page world and extension service worker using a bridge-minted token.
3. Background service worker: background.js. Owns Chrome privacy policies, DNR rules, per-tab identities, validation, site exceptions, rotation, tab lifecycle and status reporting.
4. Declarative network rules: header_rules, tracker_rules and network_rules. The network ruleset blocks WebTransport and ping/beacon telemetry.
5. Zero-cost deployment assets: OS audit tools and deployment guidance for Windows, Linux, macOS, native Tails, Tor and Tor Browser. Tor/Tails are intentionally external system components; the extension never attempts to impersonate or reimplement them.

### Data Flow

Navigation -> document_start injector -> bridge profile registration -> service worker -> per-tab DNR session identity -> subsequent requests.
Settings change -> sync storage -> service worker validation -> privacy APIs/DNR update -> broadcast -> required tab reload.

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

The default `maximum_direct` posture forces all browser privacy modules on while the extension master switch is enabled. Geolocation is deny-by-default. Site exceptions do not disable page-world protections in maximum mode, and their DNR allow rules deliberately do not bypass the WebTransport or ping/beacon blocks. Chrome's WebRTC IP handling policy is also set to disable non-proxied UDP. Media-device enumeration is minimized.

### WebRTC

RTCPeerConnection is blocked in the page world while protection is active. Chrome's WebRTC IP policy is also forced to `disable_non_proxied_udp`.

### WebTransport and telemetry

WebTransport is blocked at the page API boundary and with a DNR rule. HTTP ping/beacon requests are also blocked in the hardened network ruleset to reduce silent telemetry channels.

### Fingerprint coherence

Per-tab profiles correlate browser version, platform, GPU family, screen size and hardware capacity instead of independently randomizing every property.

### Header coherence

Static global User-Agent spoofing is avoided. Per-tab session rules are installed after profile registration so JavaScript and later network requests can advertise a consistent identity.

The first navigation request is intentionally left native. The project no longer attempts to rewrite it because a document_start script cannot retroactively modify that request, and cross-platform spoofing can create a detectable split identity.

### Identity entropy

Per-tab profile bookkeeping prefers `crypto.getRandomValues()` at `document_start`. The network/browser identity itself remains native and coherent; randomness is used for deterministic privacy-noise seeds, not for cross-platform User-Agent spoofing.

### State and trust boundaries

Page JavaScript is treated as hostile. Settings are schema-normalized, profile data is sanitized before network-rule construction, DNR mutations are serialized, and main-world settings updates require the bridge token.

## System-Level Anonymity Architecture

The extension cannot alter a direct network source IP. When website-visible IP anonymity is required, the recommended zero-cost stack is native Tails with MAC address anonymization, Tor, and Tor Browser. Tor Project explicitly recommends Tor Browser instead of routing another browser through Tor because other browsers can leak real IP/DNS/WebRTC information and expose identifying fingerprint, cookie and cache state.

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

Configuration is validated, rules have explicit priorities, concurrent DNR mutations are serialized, and untrusted page messages cannot directly authenticate as extension settings without the bridge token.

### Availability

High-compatibility APIs are preferred where possible. FontFaceSet.check is left native, canvas serialization uses a temporary surface, live AudioBuffers are not permanently modified, and unavailable browser settings are handled individually. WebRTC/WebTransport blocking intentionally trades some site functionality for stronger privacy.

### Authentication

The extension is self-contained and has no remote authentication service. Its security boundary is page JavaScript -> main-world injector -> isolated bridge -> service worker.

### Anonymity

Network anonymity is not achievable under the stated no-proxy/VPN/Tor constraint. Without an intermediary or equivalent network-path change, the destination can observe the public source IP of the direct connection.

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

Privacy Shield 3.0 should be treated as a production-oriented direct-connection privacy hardener, not as an anonymous networking system.

The correct security property is: maximum browser-side privacy, explicit residual-risk disclosure, strong local leak resistance, coherent tab identities, and no false promise that a browser extension can hide the public IP of a direct network connection without changing the network path.


## AEGIS-9 system profile

For website-visible IP anonymity, Privacy Shield is paired with Qubes-Whonix/Tor rather than trying to emulate a Tor network in a browser extension. The current documented target is Qubes R4.3 + Whonix 18, using `anon-whonix -> sys-whonix -> Tor` and `whonix-workstation-18-dvm` for disposable sessions. citeturn303752search2turn602539search0turn602539search1
