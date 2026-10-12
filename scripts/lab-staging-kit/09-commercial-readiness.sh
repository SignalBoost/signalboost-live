#!/usr/bin/env bash
# Phase 5: free checks; HTTP accessibility never establishes policy or consent approval.
source "$(dirname "$0")/lib/common.sh"
need STAGING_APP_URL
assert_staging
for p in terms privacy legal signup onboarding; do
  code=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$STAGING_APP_URL/$p" || echo 000)
  id="PAGE_$(printf '%s' "$p" | tr '[:lower:]' '[:upper:]')"
  if [[ "$code" == 200 || "$code" == 302 || "$code" == 307 ]]; then
    record "$id" unverified "/$p responds HTTP $code; policy wording, routing, consent and unaided UI require human review"
  else
    record "$id" failed "/$p returned HTTP $code"
  fi
done
record ONBOARDING_UNAIDED unverified "Unaided customer must complete signup, sign-in, workspace, provider setup and first experiment"
record ERROR_REPORTING_CLEAN unverified "Verify actual customer API returns sanitized actionable errors and observability captures correlation IDs"
record RELEASE_VERIFIED unverified "Compare tested deployment SHA to final production SHA and exercise rollback before launch"
record DESIGN_PARTNERS unverified "Optional subsequent design-partner validation; not a prerequisite for self-service operation"
