#!/usr/bin/env bash
set -u

echo "=== Privacy Shield Linux Audit ==="
echo
echo "[Interfaces]"
ip -brief link 2>/dev/null || true
echo
echo "[IPv4 routes]"
ip -4 route 2>/dev/null || true
echo
echo "[IPv6 addresses]"
ip -6 addr 2>/dev/null || true
echo
echo "[NetworkManager MAC policy]"
if command -v nmcli >/dev/null 2>&1; then
  nmcli -f NAME,TYPE,802-11-wireless.cloned-mac-address connection show 2>/dev/null || true
else
  echo "nmcli not installed"
fi
echo
echo "[Tor process]"
pgrep -a tor 2>/dev/null || echo "tor process not found"
echo
echo "[DNS]"
if command -v resolvectl >/dev/null 2>&1; then
  resolvectl status 2>/dev/null | sed -n "1,120p"
else
  cat /etc/resolv.conf 2>/dev/null || true
fi
echo
echo "Audit only. This script does not make direct Chromium traffic anonymous."