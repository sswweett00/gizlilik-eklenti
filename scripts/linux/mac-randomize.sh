#!/usr/bin/env bash
set -euo pipefail
PROFILE="${1:-}"

command -v nmcli >/dev/null 2>&1 || { echo "NetworkManager/nmcli is required." >&2; exit 1; }

echo "Available profiles:"
nmcli -t -f NAME,TYPE connection show

if [[ -z "$PROFILE" ]]; then
  echo
  echo "Usage: sudo bash scripts/linux/mac-randomize.sh \"YOUR-WIFI-NAME\""
  exit 2
fi

sudo nmcli connection modify "$PROFILE" 802-11-wireless.cloned-mac-address random
sudo nmcli connection down "$PROFILE" || true
sudo nmcli connection up "$PROFILE"

echo "Current interface state:"
ip link show