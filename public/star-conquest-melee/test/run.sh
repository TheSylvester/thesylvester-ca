#!/usr/bin/env bash
# Thin wrapper: resolve a Node binary and hand every argument to test/run.mjs.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node || true)"
[ -z "$NODE" ] && NODE="$HOME/.nvm/versions/node/v22.18.0/bin/node"
if [ ! -x "$NODE" ]; then
  echo "no node binary found on PATH or at ~/.nvm/versions/node/v22.18.0" >&2
  exit 1
fi
exec "$NODE" "$DIR/run.mjs" "$@"
