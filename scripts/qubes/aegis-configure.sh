#!/usr/bin/env bash
set -euo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

need qvm-check
need qvm-prefs

echo "=== AEGIS-9 Qubes/Whonix profile ==="

for qube in sys-whonix anon-whonix; do
  if ! qvm-check "$qube" >/dev/null 2>&1; then
    echo "Missing required qube: $qube" >&2
    echo "Install Qubes-Whonix first." >&2
    exit 2
  fi
done

echo
echo "[Current network path]"
qvm-prefs anon-whonix netvm || true
echo "[Current default disposable]"
qvm-prefs anon-whonix default_dispvm || true

echo
echo "[Recommended policy]"
echo "anon-whonix netvm -> sys-whonix"
echo "anon-whonix default_dispvm -> whonix-workstation-18-dvm"

if ! qvm-check whonix-workstation-18-dvm >/dev/null 2>&1; then
  echo "WARNING: whonix-workstation-18-dvm is missing."
  echo "Install/configure Qubes-Whonix first."
  if (( APPLY == 1 )); then exit 3; fi
fi

if (( APPLY == 0 )); then
  echo
  echo "DRY RUN: nothing changed."
  echo "Run with --apply to set the anonymous qube network path."
  exit 0
fi

echo
echo "Applying anonymous network path..."
qvm-prefs anon-whonix netvm sys-whonix
qvm-prefs anon-whonix default_dispvm whonix-workstation-18-dvm

echo
echo "Result:"
qvm-prefs anon-whonix netvm
qvm-prefs anon-whonix default_dispvm

echo
echo "IMPORTANT:"
echo "- Keep personal qubes on their existing, separate network paths."
echo "- Do not attach sys-net directly to anon-whonix."
echo "- Configure disposable templates separately."
echo "- Use Tor Browser inside anon-whonix."
