# Privacy Verification

## Static extension audit

Run:

~~~bash
node tests/validate.mjs
~~~

The suite validates MV3, permissions, DNR IDs, WebRTC/WebTransport/ping controls, WebGPU protection, DNS prefetch response policy, maximum mode, geolocation deny-by-default and removal of proxy-era code.

## Browser verification

~~~text
https://browserleaks.com/ip
https://browserleaks.com/dns
https://browserleaks.com/webrtc
https://browserleaks.com/canvas
https://browserleaks.com/webgl
https://browserleaks.com/fonts
https://coveryourtracks.eff.org/
~~~

Run the tests from the same session and capture before/after results when changing a single control.

## Local MAC verification

Linux:

~~~bash
ip link
nmcli device show
~~~

Windows:

~~~powershell
getmac /v
~~~

macOS:

~~~bash
networksetup -listallhardwareports
~~~
## AEGIS system verification

On Qubes dom0, verify:

~~~bash
qvm-prefs anon-whonix netvm
qvm-prefs anon-whonix default_dispvm
~~~

Expected anonymous path:

~~~text
anon-whonix -> sys-whonix -> Tor
~~~

Never use `sys-net` directly as the `netvm` for an anonymous application qube. Qubes-Whonix documents `sys-whonix` as the Tor-connected gateway and `anon-whonix` as the application qube. citeturn549859search2turn549859search6
