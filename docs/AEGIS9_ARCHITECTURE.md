# AEGIS-9 Deployment Profile

## Purpose

AEGIS-9 is the system-level companion architecture for Privacy Shield. It does not attempt to reimplement Tor, Qubes OS, Whonix or Tails inside a browser extension.

The recommended free/open-source stack is:

```text
Physical network
      |
      v
sys-net
      |
      v
sys-firewall
      |
      v
sys-whonix  ----> Tor
      |
      v
anon-whonix
      |
      v
Disposable anon qube
      |
      v
Tor Browser
```

Qubes OS 4.3 provides strong isolation, disposables, Whonix integration and device isolation. Qubes-Whonix uses `sys-whonix` as the Tor gateway and `anon-whonix` for Tor-routed applications. citeturn978663search3turn549859search2

## Recommended single-host profile

1. Install supported Qubes OS.
2. Install Qubes-Whonix from the Qubes post-install setup.
3. Keep `sys-whonix` as the network path for `anon-whonix`.
4. Never attach a direct `sys-net` network path to an anonymous qube.
5. Configure a dedicated disposable template for anonymous work.
6. Use Tor Browser inside `anon-whonix`/the disposable.
7. Keep personal accounts and personal qubes completely separate.
8. Do not pass webcam, microphone, USB, Bluetooth or unrelated devices into anonymous qubes unless required.

Official Qubes-Whonix documentation states that `sys-whonix` connects to Tor and `anon-whonix` is the application Qube used over Tor. citeturn549859search2turn549859search6

## Disposable model

Qubes disposables are ephemeral qubes whose persistent state is discarded when shut down. A qube can select its own default disposable template, and that template can itself be configured for Whonix networking. citeturn549859search1turn549859search7

The provisioning helper in this repository defaults to dry-run and requires an explicit `--apply`.

## Physical-isolation maximum profile

For a stricter threat model, use two dedicated computers:

```text
Gateway computer:
  NIC 1 -> Internet
  NIC 2 -> isolated Ethernet
  Whonix-Gateway / Tor only

Workstation computer:
  one Ethernet NIC
  Qubes / Whonix-Workstation
  no alternate network path
```

Whonix documents this physical-isolation architecture as a way to reduce the trusted computing base. It requires a gateway with two network adapters and a workstation with only the isolated wired NIC. The project also warns that physical isolation is harder to configure and less tested than ordinary VM deployments. citeturn978663search0turn978663search1

## Bridge profile

When hiding obvious Tor use from a local observer is important, configure a Tor Bridge using Whonix's Anon Connection Wizard rather than manually rewriting Tor configuration. The wizard supports bridge transports such as obfs4 and meek-azure. citeturn549859search4

## Privacy Shield role

Privacy Shield 4.1 remains a Chromium direct-hardening extension:

- WebRTC block
- WebTransport block
- WebGPU redaction
- tracker blocking
- beacon/ping blocking
- geolocation deny-by-default
- fingerprint-surface hardening
- native/coherent browser identity

It does **not** replace the Tor network, Qubes isolation or Whonix routing.
