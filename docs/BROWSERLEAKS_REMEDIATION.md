# BrowserLeaks Remediation Matrix — Privacy Shield 4.9

This document maps the fields observed in BrowserLeaks-style diagnostics to the layer that can actually control them.

| BrowserLeaks signal | Extension | Tor/Tails | Notes |
| --- | --- | --- | --- |
| Public IP | Direct: No · Local Tor: network-path change | Yes | Direct mode exposes the source IP; Local Tor routes Chromium through localhost SOCKS5 Tor with no direct fallback when active. |
| IP geolocation | Direct: Partly · Local Tor: strongly reduced | Yes | Direct mode blocks common lookup APIs but the destination can geolocate the source IP; Local Tor changes the source IP presented to the destination. |
| ISP / ASN | Direct: No · Local Tor: Tor exit ISP/ASN | Yes | Direct mode exposes the user's network owner. Local Tor changes the visible network owner to the Tor exit. |
| Hostname of public IP | No | Yes | Reverse DNS belongs to the visible network address. |
| WebRTC local/public IP | Yes | Yes | Privacy Shield hard-blocks page WebRTC and Chrome WebRTC policy. |
| DNS resolver visibility | Partly | Yes | Browser hardening helps; a complete anonymous network path requires Tor/Tails or equivalent. |
| User-Agent mismatch | Yes | Yes | Privacy Shield 4.1 keeps UA native/coherent instead of cross-platform spoofing. |
| Sec-CH-UA mismatch | Yes | Yes | Low-entropy Client Hints stay native; high-entropy hints are removed. |
| Canvas | Yes | Yes | Deterministic noise and Tor Browser anti-fingerprinting reduce uniqueness. |
| WebGL | Partly | Yes | WebGL is hardened, but Chrome still has a different fingerprint architecture from Tor Browser. |
| WebGPU | Yes | Yes | Page API is redacted in maximum mode. |
| Fonts | Yes | Yes | Font/geometry protections reduce browser fingerprinting. |
| Geolocation API | Yes | Yes | Maximum mode hard-denies the page API and reports geolocation permission as denied. |
| Screen/window fingerprint | Partly | Yes | Tor Browser's letterboxing/standardization is stronger than a Chromium extension can reproduce. |
| CPU/device memory | Partly | Yes | Extension can normalize browser-visible values, but this is not equivalent to Tor Browser's complete fingerprint model. |
| TLS JA3/JA4 | No | Partly | A MV3 extension does not control Chromium's TLS ClientHello stack. Tor Browser/Tor's own stack changes the visible network behavior. |
| TCP/IP fingerprint / MTU / hops | No | Yes/Partly | These are network/OS-layer properties, not JavaScript properties. |
| HTTP/2 fingerprint | No | Partly | MV3 can modify supported HTTP headers, but not replace Chromium's complete HTTP/2 implementation with Tor Browser's. |
| MAC address on LAN | No | Yes | Websites normally do not receive L2 MAC directly. Local AP/switch can; use Tails/OS private MAC. |
| Tracker correlation | Yes | Yes | DNR tracker blocking plus Tor Browser isolation are stronger together. |
| Cookies / identity | Partly | Yes | A user can still self-identify by logging into an account. |

## Location-specific conclusion

Privacy Shield now hard-denies the browser Geolocation API and blocks common third-party IP-geolocation API endpoints. This prevents many page-side lookup shortcuts, but it cannot prevent the website that receives the connection from geolocating the source public IP.

## Network-path conclusion

A direct Chromium session cannot be made network-anonymous by changing JavaScript values. Local Tor mode changes the network path, but BrowserLeaks can still observe Chromium-specific fingerprint and behavior signals that are outside the extension's control.

In particular:

1. Public IP, ISP and IP geolocation are network-layer facts.
2. JA3/JA4, TCP/IP and HTTP/2 fingerprints are below the extension's control boundary.
3. Cross-platform UA spoofing is harmful when it disagrees with Client Hints and the underlying network stack.
4. The strongest zero-cost website-facing anonymity stack is native Tails + MAC anonymization + Tor + Tor Browser.
5. Privacy Shield 4.9 Local Tor is a Chromium network-path integration plus hardening layer, not a replacement for Tor Browser.

Tor Project explicitly recommends Tor Browser rather than routing an ordinary browser through Tor because other browsers can expose real IP/DNS/WebRTC information and have different fingerprint/cookie/cache behavior.
