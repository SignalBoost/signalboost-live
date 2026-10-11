#!/usr/bin/env bash
# Shared helpers. Secrets are read ONLY from environment variables, never written to disk or printed.
set -euo pipefail
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVID="$KIT_DIR/evidence"; mkdir -p "$EVID"; chmod 700 "$EVID"
RESULTS="$EVID/results.jsonl"
STATE="$EVID/state.env"   # non-secret IDs only (org ids, run ids, user ids)
touch "$RESULTS" "$STATE"; chmod 600 "$RESULTS" "$STATE"
set +u; source "$STATE"; set -u

need() { for v in "$@"; do [[ -n "${!v:-}" ]] || { echo "Missing required variable: $v" >&2; exit 2; }; done; }
need_tool() { for t in "$@"; do command -v "$t" >/dev/null || { echo "Missing tool: $t" >&2; exit 2; }; done; }
save_state() { local k="$1" v="$2"; grep -v "^$k=" "$STATE" > "$STATE.tmp" || true; echo "$k=$v" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; export "$k=$v"; }

# Remove anything that looks like a credential before it reaches evidence or the terminal.
redact() { python3 "$KIT_DIR/lib/redact.py"; }

# record CHECK_ID passed|failed|unverified "plain-language note" [evidence-file]
record() {
  local id="$1" status="$2" note="$3" file="${4:-}"
  case "$status" in passed|failed|unverified) ;; *) echo "bad status $status" >&2; exit 2;; esac
  local clean; clean=$(printf '%s' "$note" | redact)
  node -e 'const [id,s,n,f]=process.argv.slice(1);console.log(JSON.stringify({check:id,status:s,note:n,evidence:f||null,at:new Date().toISOString()}))' "$id" "$status" "$clean" "$file" >> "$RESULTS"
  printf '%-34s %-10s %s\n' "$id" "$status" "$clean"
}

# Save a response as sanitized evidence. Usage: evidence NAME <<< "$body"
evidence() { local f="$EVID/$1.txt"; redact > "$f"; chmod 600 "$f"; echo "$1.txt"; }

# Every network/database operation verifies explicit staging identity.
assert_staging() { python3 "$KIT_DIR/lib/safe_io.py" targets; }
psql_db() { assert_staging; python3 "$KIT_DIR/lib/safe_io.py" psql "$@"; }
customer_token() { assert_staging; python3 "$KIT_DIR/lib/safe_io.py" session "$1"; }
session_cookie() { python3 "$KIT_DIR/lib/safe_io.py" cookie; }
lab_api() {
  assert_staging
  local who="$1" method="$2" path="$3" body="${4:-}"
  printf '%s' "$body" | python3 "$KIT_DIR/lib/safe_io.py" api "$who" "$method" "$path" | redact
}
json_get() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a==null?a:a[k],o);console.log(v==null?"":typeof v==="object"?JSON.stringify(v):v)}catch{console.log("")}})' "$1"; }
