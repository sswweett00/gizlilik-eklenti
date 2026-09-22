# Privacy Shield Threat Model

## Adversaries

### Ordinary website / ad network
JavaScript, network requests, WebRTC/WebTransport, storage, browser APIs, headers and third-party resources.

### ISP / local network
Can observe the connection to Tor, local network metadata and the local MAC address.

### Fingerprinting service
Combines canvas, WebGL/WebGPU, fonts, screen, locale, timezone, navigator, Client Hints, audio and API behavior.

### Identity correlator
Combines cookies, login identifiers, email, phone, timing and behavior.

### Endpoint compromise
Malware, browser exploits, kernel/root compromise or privileged software can defeat browser-layer privacy.

### Global traffic analyst
Can potentially correlate traffic timing/volume across Tor entry and exit observations.

## Attack-surface matrix

| Surface | Primary defense | Residual risk |
| --- | --- | --- |
| Public IP | Tor / Tor Browser | Tor entry sees the user connection; global correlation remains possible |
| DNS | Tor Browser / Tails | Other applications can still leak |
| WebRTC | Tor Browser + Privacy Shield | Future browser changes |
| WebTransport | DNR + page API block | Future transport APIs |
| Canvas | standardized browser behavior | Other fingerprint surfaces |
| WebGL/WebGPU | browser hardening | Novel APIs/rendering side channels |
| Fonts | standardized/restricted browser behavior | OS-level side channels |
| Geolocation API | permission deny | IP-based inference |
| Cookies/storage | isolation and session hygiene | Deliberate login still identifies user |
| MAC | Tails/OS randomization | Local network still sees the randomized address |
| Downloads | isolate/open only inside privacy session | Malicious external apps can bypass browser protections |