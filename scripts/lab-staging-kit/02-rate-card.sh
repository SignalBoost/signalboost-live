#!/usr/bin/env bash
# Adds ONE verified price entry. Values must be copied by a person from the provider's published pricing page.
# Nothing here is a default price. No provider calls.
source "$(dirname "$0")/lib/common.sh"
need STAGING_DB_URL RATE_PROVIDER_KIND RATE_MODEL RATE_INPUT_USD_PER_MTOK RATE_OUTPUT_USD_PER_MTOK RATE_SOURCE_URL RATE_VERIFIED_BY RATE_VERIFIED_AT
[[ "$RATE_SOURCE_URL" == https://* ]] || { echo "RATE_SOURCE_URL must be the provider's https pricing page" >&2; exit 2; }
psql_db -v pk="$RATE_PROVIDER_KIND" -v m="$RATE_MODEL" -v i="$RATE_INPUT_USD_PER_MTOK" -v o="$RATE_OUTPUT_USD_PER_MTOK" \
  -v ov="${RATE_OVERHEAD_TOKENS:-64}" -v sm="${RATE_SAFETY_MARGIN:-1.10}" -v src="$RATE_SOURCE_URL" -v by="$RATE_VERIFIED_BY" -v at="$RATE_VERIFIED_AT" <<'SQL' > /tmp/rc.txt
insert into lab.teacher_rate_cards(provider_kind,model,input_usd_per_mtok,output_usd_per_mtok,request_overhead_tokens,safety_margin,source_url,verified_by,verified_at)
values(:'pk',:'m',:'i',:'o',:'ov',:'sm',:'src',:'by',:'at')
on conflict do nothing;
select id||' '||provider_kind||' '||model||' in='||input_usd_per_mtok||' out='||output_usd_per_mtok||' overhead='||request_overhead_tokens||' margin='||safety_margin||' src='||source_url||' by='||verified_by||' at='||verified_at
  from lab.active_teacher_rate_card(:'pk',:'m');
SQL
f=$(evidence rate-card < /tmp/rc.txt)
[[ -s /tmp/rc.txt ]] && record RATE_CARD_ACTIVE passed "Verified price entry active for $RATE_PROVIDER_KIND/$RATE_MODEL" "$f" || record RATE_CARD_ACTIVE failed "No active price entry after insert" "$f"
# Price list must be unreachable from app roles.
priv=$(psql_db -c "select string_agg(r||':'||has_table_privilege(r,'lab.teacher_rate_cards','select'),' ') from unnest(array['anon','authenticated','service_role']) r")
echo "$priv" | evidence rate-card-privileges >/dev/null
[[ "$priv" != *true* ]] && record RATE_CARD_LOCKED passed "App roles cannot read or change the price list" rate-card-privileges.txt || record RATE_CARD_LOCKED failed "An app role can read the price list: $priv" rate-card-privileges.txt
