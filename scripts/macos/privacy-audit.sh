#!/bin/zsh
set -u
echo "=== Privacy Shield macOS Audit ==="
echo
echo "[Wi-Fi hardware]"
networksetup -listallhardwareports
echo
echo "[Interfaces]"
ifconfig | egrep "^[a-z0-9]+:|ether |inet |inet6 " || true
echo
echo "[Tor Browser / Tor processes]"
pgrep -alf "Tor Browser|tor" || true
echo
echo "Set Private Wi-Fi Address to Rotating in macOS System Settings for the relevant networks."
echo "Audit only: no setting is modified."