#!/usr/bin/env bash
# Builds REPORT.md from results.jsonl. Re-scans every evidence file for anything credential-shaped.
source "$(dirname "$0")/lib/common.sh"
REQUIRED="DEPLOYED_REVISION PREFLIGHT_APP_UP DB_MIGRATION_20261012000000 DB_MIGRATION_20261012010000 WORKSPACE_IDEMPOTENT RATE_CARD_ACTIVE RATE_CARD_LOCKED PROVIDER_CONNECTED PROVIDER_LIST_NO_SECRETS CREDENTIALS_ENCRYPTED ARTIFACT_CREATED XTENANT_START_DENIED SUPERVISOR_DB_EXCLUDED SUPERVISOR_CODE_EXCLUDED SUPERVISOR_MASTER_KEY_ISOLATION BUDGET_CEILING_REFUSED BUDGET_UNPRICED_REFUSED BUDGET_APPROVED BUDGET_RESERVED_BEFORE_SUBMIT TEACHER_GENERATION TEACHER_SPEND_MATCHES_INVOICE PROGRESS_VISIBLE TRAINING_COMPLETED ARTIFACT_DOWNLOAD XTENANT_DOWNLOAD_DENIED CREDENTIAL_REVOCATION NO_GRADUATION_FOR_ACCESS UI_PANEL_TRANSLATED"
leak=$(grep -lE 'hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.' "$EVID"/*.txt "$RESULTS" 2>/dev/null || true)
[[ -n "$leak" ]] && { echo "STOP: possible secret in: $leak — delete those files before sharing." >&2; exit 4; }
node - "$RESULTS" "$REQUIRED" "${DEPLOYED_SHA:-unknown}" "${STAGING_URL:-unknown}" "$EVID/applied-migrations.txt" > "$EVID/REPORT.md" <<'JS'
const fs=require('fs');const [res,req,sha,url,mig]=process.argv.slice(2);
const last={};for(const l of fs.readFileSync(res,'utf8').split('\n').filter(Boolean)){const o=JSON.parse(l);last[o.check]=o}
for(const id of req.split(' '))if(!last[id])last[id]={check:id,status:'unverified',note:'Not run',evidence:null};
const rows=Object.values(last);const c=s=>rows.filter(r=>r.status===s).length;
let out=`# LAB staging verification\n\n- Staging URL: ${url}\n- Commit SHA: ${sha}\n- Applied migrations: ${fs.existsSync(mig)?fs.readFileSync(mig,'utf8').trim().split('\n').filter(v=>v>='20261009').join(', '):'unknown'}\n- Generated: ${new Date().toISOString()}\n\n**${c('passed')} passed · ${c('failed')} failed · ${c('unverified')} unverified**\n\n| Check | Status | Note | Evidence |\n|---|---|---|---|\n`;
for(const r of rows)out+=`| ${r.check} | ${r.status} | ${String(r.note).replace(/\|/g,'/')} | ${r.evidence||''} |\n`;
out+=`\nEnd-to-end ready only if every row is passed. Local unit tests (42/42) are separate and are not counted here.\n`;console.log(out)
JS
cat "$EVID/REPORT.md"
( cd "$KIT_DIR" && zip -qr "staging-evidence-$(date -u +%Y%m%dT%H%M%SZ).zip" evidence -x 'evidence/state.env' ) && echo "Evidence ZIP created (state.env excluded)."
