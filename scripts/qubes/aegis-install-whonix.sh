#!/usr/bin/env bash
set -euo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then APPLY=1; fi

echo "=== AEGIS-9 Qubes-Whonix installer ==="
echo "Supported target: Qubes R4.3 + Qubes-Whonix 18"

if (( APPLY == 0 )); then
  echo
  echo "DRY RUN only."
  echo "Official install sequence:"
  echo "  sudo qubes-dom0-update"
  echo "  qvm-template install --enablerepo=qubes-templates-community whonix-gateway-18 whonix-workstation-18"
  echo "  sudo qubesctl state.sls qvm.anon-whonix"
  echo
  echo "Run with --apply only from Qubes dom0 after reading the official"
  echo "Qubes-Whonix installation documentation."
  exit 0
fi

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run qvm-template/qvmctl operations as the normal dom0 user; sudo is invoked where required."
else
  echo "Running as user: $(id -un)"
fi

sudo qubes-dom0-update
qvm-template install --enablerepo=qubes-templates-community whonix-gateway-18 whonix-workstation-18
sudo qubesctl state.sls qvm.anon-whonix

echo
echo "Verify:"
echo "  qvm-prefs anon-whonix netvm"
echo "  qvm-prefs anon-whonix default_dispvm"
