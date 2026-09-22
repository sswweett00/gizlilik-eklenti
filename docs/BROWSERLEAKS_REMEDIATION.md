# BrowserLeaks Remediation Matrix — Privacy Shield 4.1

This document maps the fields observed in BrowserLeaks-style diagnostics to the layer that can actually control them.

| BrowserLeaks signal | Extension | Tor/Tails | Notes |
| --- | --- | --- | --- |
| Public IP | No | Yes | A direct TCP/QUIC connection always exposes its source IP to the destination. |
| IP geolocation | No | Yes | Public-IP geolocation follows the network-visible address. |
| ISP / ASN | No | Yes | The destination can infer the network owner of the source IP. |
| Hostname of public IP | No | Yes | Reverse DNS belongs to the visible network address. |
| WebRTC local/public IP | Yes | Yes | Privacy Shield hard-blocks page WebRTC and Chrome WebRTC policy. |
| DNS resolver visibility | Partly | Yes | Browser hardening helps; a complete anonymous network path requires Tor/Tails or equivalent. |
| User-Agent mismatch | Yes | Yes | Privacy Shield 4.1 keeps UA native/coherent instead of cross-platform spoofing. |
| Sec-CH-UA mismatch | Yes | Yes | Low-entropy Client Hints stay native; high-entropy hints are removed. |
| Canvas | Yes | Yes | Deterministic noise and Tor Browser anti-fingerprinting reduce uniqueness. |
| WebGL | Partly | Yes | WebGL is hardened, but Chrome still has a different fingerprint architecture from Tor Browser. |
| WebGPU | Yes | Yes | Page API is redacted in maximum mode. |
| Fonts | Yes | Yes | Font/geometry protections reduce browser fingerprinting. |
| Geolocation API | Yes | Yes | Maximum mode is deny-by-default. |
| Screen/window fingerprint | Partly | Yes | Tor Browser's letterboxing/standardization is stronger than a Chromium extension can reproduce. |
| CPU/device memory | Partly | Yes | Extension can normalize browser-visible values, but this is not equivalent to Tor Browser's complete fingerprint model. |
| TLS JA3/JA4 | No | Partly | A MV3 extension does not control Chromium's TLS ClientHello stack. Tor Browser/Tor's own stack changes the visible network behavior. |
| TCP/IP fingerprint / MTU / hops | No | Yes/Partly | These are network/OS-layer properties, not JavaScript properties. |
| HTTP/2 fingerprint | No | Partly | MV3 can modify supported HTTP headers, but not replace Chromium's complete HTTP/2 implementation with Tor Browser's. |
| MAC address on LAN | No | Yes | Websites normally do not receive L2 MAC directly. Local AP/switch can; use Tails/OS private MAC. |
| Tracker correlation | Yes | Yes | DNR tracker blocking plus Tor Browser isolation are stronger together. |
| Cookies / identity | Partly | Yes | A user can still self-identify by logging into an account. |

## The critical conclusion

The BrowserLeaks output in a direct Chromium session cannot be made completely anonymous by changing JavaScript values.

In particular:

1. Public IP, ISP and IP geolocation are network-layer facts.
2. JA3/JA4, TCP/IP and HTTP/2 fingerprints are below the extension's control boundary.
3. Cross-platform UA spoofing is harmful when it disagrees with Client Hints and the underlying network stack.
4. The strongest zero-cost website-facing anonymity stack is native Tails + MAC anonymization + Tor + Tor Browser.
5. Privacy Shield 4.1 is a maximum Chromium hardening layer, not a replacement for Tor Browser.

Tor Project explicitly recommends Tor Browser rather than routing an ordinary browser through Tor because other browsers can expose real IP/DNS/WebRTC information and have different fingerprint/cookie/cache behavior.
