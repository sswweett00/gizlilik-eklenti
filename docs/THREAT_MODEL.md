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
| Public IP | Local Tor / Tor Browser | Local Tor changes the browser egress, but the local machine still connects to the Tor entry; global correlation remains possible |
| DNS | Tor Browser / Tails | Other applications can still leak |
| WebRTC | Tor Browser + Privacy Shield | Future browser changes |
| WebTransport | DNR + page API block | Future transport APIs |
| Canvas | standardized browser behavior | Other fingerprint surfaces |
| WebGL/WebGPU | browser hardening | Novel APIs/rendering side channels |
| Fonts | standardized/restricted browser behavior | OS-level side channels |
| Geolocation API | permission deny + IP-geolocation blocks + Tor-only egress | IP-derived location is based on the Tor exit when the Tor path is verified |
| Cookies/storage | isolation and session hygiene | Deliberate login still identifies user |
| MAC | Tails/OS randomization | Local network still sees the randomized address |
| Downloads | isolate/open only inside privacy session | Malicious external apps can bypass browser protections |
## AEGIS-9 system threats

The browser extension is only one trust boundary. AEGIS-9 additionally addresses:

- accidental direct routing by putting anonymous application qubes behind `sys-whonix`;
- cross-activity contamination with Qubes app/disposable qubes;
- host/device exposure through Qubes device isolation;
- persistent browser state by using disposable qubes;
- local observer awareness of Tor through optional Tor Bridges;
- host-to-Gateway trust reduction through optional physical isolation.

Qubes explicitly supports strong isolation, disposables, device isolation and Whonix integration. Whonix documents physical isolation as a method of reducing the trusted computing base, while warning that it is more difficult and less tested than standard VM deployments. citeturn978663search3turn978663search0
