# Privacy Shield — Zero-Cost Deployment Guide

## Security boundary

Privacy Shield hardens the browser layer. It does **not** change the source IP of a direct network connection.

For the complete zero-cost anonymity stack:

~~~text
Tails (native boot)
  -> MAC address anonymization
  -> Tor
  -> Tor Browser
  -> anonymous session discipline
~~~

Do not turn ordinary Chrome/Edge into a pseudo-Tor browser. Tor Project recommends Tor Browser because other browsers can leak the real IP through DNS/WebRTC and expose fingerprinting, cookies, cache and OS details.

## Windows

### Maximum-anonymity path

1. Prepare a verified Tails USB from the official Tails documentation.
2. Boot Tails natively rather than in a VM.
3. Keep MAC Address Anonymization enabled.
4. Start Tor.
5. Use Tor Browser only for the anonymous session.
6. Do not open Chrome/Edge for the same anonymous activity.
7. Do not sign into personally identifying accounts.
8. Use Security Level "Safer" or "Safest" as required.
9. Shut Tails down after the session.

### Windows-only baseline

Enable:

~~~text
Settings
  -> Network & Internet
  -> Wi-Fi
  -> Random hardware addresses
~~~

Disable Windows Location for the user where appropriate.

This does not replace Tor for website-visible IP anonymity.

## Linux

For NetworkManager Wi-Fi profiles:

~~~bash
nmcli connection show
sudo nmcli connection modify "YOUR-WIFI-NAME" 802-11-wireless.cloned-mac-address random
sudo nmcli connection down "YOUR-WIFI-NAME"
sudo nmcli connection up "YOUR-WIFI-NAME"
ip link show
~~~

Prefer native Tails for maximum anonymity instead of reproducing the full Tor/OS policy manually.

## macOS

Enable:

~~~text
System Settings
  -> Wi-Fi
  -> Details
  -> Private Wi-Fi Address
  -> Rotating
~~~

Disable unnecessary Location Services for anonymous sessions.

For maximum anonymity, use Tails natively when supported rather than modifying normal macOS browsers into a pseudo-Tor browser.

## Tor operational rules

- Use Tor Browser.
- Do not use another browser through a Tor SOCKS port for ordinary web anonymity.
- Do not install fingerprint-changing extensions into Tor Browser.
- Do not torrent over Tor.
- Do not open downloaded documents in external applications during an anonymous session.
- Do not mix anonymous and personal accounts.
- Use New Identity when full identity separation is required.
- Use a Tor Bridge when hiding the fact that you connect to Tor from a local observer matters.
- If Tor is unavailable, stop the anonymous session.

## Verification

Test in the same privacy session:

~~~text
https://browserleaks.com/ip
https://check.torproject.org/
https://browserleaks.com/dns
https://browserleaks.com/webrtc
https://browserleaks.com/canvas
https://browserleaks.com/webgl
https://browserleaks.com/fonts
https://coveryourtracks.eff.org/
~~~

Expected properties:

- Website-visible IP is not the home/public ISP IP.
- DNS does not expose the home ISP resolver unexpectedly.
- WebRTC does not expose the real network identity.
- Fingerprint resembles the standardized Tor Browser population rather than a unique custom profile.
- Local network sees a randomized/private MAC when the OS feature is enabled.

## Privacy Shield Chromium mode

### Tor-only

Privacy Shield 4.9 does not provide a direct-network posture while active. Keep the extension active and run a local Tor SOCKS5 endpoint; until the exit path is verified, browser web traffic remains blocked.

### Tor-only — zero-cost browser egress

When Tor is already running locally, Privacy Shield 4.9 can configure Chromium itself to use:

~~~text
127.0.0.1:9050  -> Tor service
127.0.0.1:9150  -> Tor Browser's local SOCKS endpoint
~~~

In the Privacy Shield popup choose `Tor-only — mandatory fail-closed SOCKS5`, select the matching port, then use `Verify Tor`. The extension stores the previous Chrome proxy configuration, removes proxy bypasses, monitors proxy errors and activates a network kill-switch when the selected Tor endpoint is not active. That prevents a silent return to a direct connection.

Chrome's SOCKS5 implementation resolves target hostnames through the proxy, but it proxies TCP URL requests rather than UDP; Privacy Shield therefore independently blocks WebRTC UDP and WebTransport. This Tor-only path is still not equivalent to Tor Browser's full browser-level anti-fingerprinting and isolation model. For a disposable anonymous session, native Tails + Tor Browser remains the stronger system design.

If Tor-only is unavailable, do not treat the session as anonymous. The extension is intentionally designed to surface the failure rather than silently claim IP protection.