#!/usr/bin/env bash
# Resolve a Node binary, run the seven browser suites through test/run.mjs,
# then the Node↔browser parity suite (test/node-golden.mjs) as the eighth
# reported line. No `exec` here any more — exec'ing run.mjs made everything
# after it dead code, and the parity line must run and fold its exit status
# in. `--only <suite>` still narrows: a browser suite name skips the parity
# line, and `--only node-golden` runs the parity line alone.
#
# The full gate ALSO runs the five server unit suites. rewind.test.mjs pins
# the phase-15 vt clamp trio and the six individually gated malicious-vt
# checks (a new test file is INVISIBLE to this gate until the loop below
# names it — that lesson is why this comment exists). snapshot.test.mjs pins
# the wire record — the contract js/net.js decodes — identity.test.mjs pins the
# seat grants, the epochs and the resolved-ack rule, tune.test.mjs pins the
# dev tune path's two gates (loopback AND SCMELEE_DEV, with X-Forwarded-For
# disqualifying) plus the honest two-key table (tuneEcho inert, KILLSEAT
# dev-only — the phase-10 "sim-inert" note is superseded), and
# release.test.mjs pins the row-10 input-loss release rule, the reissue
# neutralization included; a gate that skipped any of them would let a wire
# field, an identity rule, the dev route or a held order move unguarded.
# Green, they print nothing (the eight reported lines stay the eight suites);
# red, they print node's own TAP output and fail the run.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$(command -v node || true)"
[ -z "$NODE" ] && NODE="$HOME/.nvm/versions/node/v22.18.0/bin/node"
if [ ! -x "$NODE" ]; then
  echo "no node binary found on PATH or at ~/.nvm/versions/node/v22.18.0" >&2
  exit 1
fi

only=""
prev=""
for arg in "$@"; do
  [ "$prev" = "--only" ] && only="$arg"
  prev="$arg"
done

code=0
if [ "$only" != "node-golden" ]; then
  "$NODE" "$DIR/run.mjs" "$@" || code=$?
fi
if [ -z "$only" ] || [ "$only" = "node-golden" ]; then
  "$NODE" "$DIR/node-golden.mjs" || code=$?
fi
if [ -z "$only" ]; then
  for t in snapshot identity tune release rewind; do
    out="$("$NODE" --test "$DIR/../server/$t.test.mjs" 2>&1)" || {
      echo "$t.test.mjs FAILED:"
      echo "$out"
      code=1
    }
  done
fi
exit $code
