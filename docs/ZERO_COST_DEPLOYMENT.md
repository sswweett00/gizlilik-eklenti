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

For ordinary Chromium sessions without Tor/Tails:

- Keep Maximum Direct mode enabled.
- Do not interpret "direct hardened" as IP anonymity.
- Browser-side IP discovery and fingerprint surfaces are hardened, but a direct TCP/QUIC destination still sees the real source IP.
- Use the Tor/Tails stack when website-visible IP anonymity is required.