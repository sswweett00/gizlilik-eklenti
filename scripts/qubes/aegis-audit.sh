#!/usr/bin/env bash
set -u

echo "=== AEGIS-9 Qubes Audit ==="

for qube in sys-whonix anon-whonix; do
  if command -v qvm-check >/dev/null 2>&1 && qvm-check "$qube" >/dev/null 2>&1; then
    echo
    echo "[$qube]"
    qvm-prefs "$qube" netvm 2>/dev/null || true
    qvm-prefs "$qube" default_dispvm 2>/dev/null || true
  else
    echo "$qube: missing"
  fi
done

echo
echo "[Anonymous path expectation]"
echo "anon-whonix -> sys-whonix -> Tor"

echo
echo "Audit only. No settings changed."
