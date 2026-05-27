# Outreach Engine Review

## What exists (Discovery)
- Discovery UX and dashboard flows exist for targeting business categories/locations and prospect discovery.
- Pipeline-oriented UI foundations exist in sales/pipeline pages.
- Core multilingual/i18n scaffolding and plan/credits context are present.

## What's missing (Outreach half)
- Contact extraction/enrichment pipeline (email, contact person, role confidence).
- Compliance policy engine (opt-out text, suppression list, country/state constraints, quiet hours).
- Throttled sending orchestration with provider adapters and retry logic.
- Sequence state tracking (queued, sent, delivered, bounced, replied, blocked).
- Human approval queue and template governance.
- Event ingestion webhooks for provider delivery/reply updates.
- Analytics surfaces for conversion and sender health.

## Proposed structure

```
saas/
  app/api/outreach/
    campaigns/route.ts
    campaigns/[id]/route.ts
    campaigns/[id]/approve/route.ts
    prospects/[id]/enrich/route.ts
    prospects/import/route.ts
    send/dispatch/route.ts
    webhooks/email/route.ts
    suppression/route.ts
  lib/outreach/
    discovery/
      normalizeProspect.ts
    enrichment/
      extractContacts.ts
      verifyEmail.ts
    compliance/
      policy.ts
      suppressionList.ts
      jurisdictionRules.ts
    generation/
      composeEmail.ts
      promptTemplates.ts
    delivery/
      throttle.ts
      queue.ts
      providers/
        resend.ts
        sendgrid.ts
    tracking/
      events.ts
      pipelineState.ts
  types/outreach.ts
```

## API route intent
- `POST /api/outreach/campaigns`: create campaign with targeting + copy constraints.
- `POST /api/outreach/prospects/import`: import discovery output to outreach queue.
- `POST /api/outreach/prospects/:id/enrich`: run contact extraction + confidence scoring.
- `POST /api/outreach/campaigns/:id/approve`: human approval gate.
- `POST /api/outreach/send/dispatch`: throttled batched sending worker trigger.
- `POST /api/outreach/webhooks/email`: provider callbacks for delivered/bounced/replied.
- `GET/POST /api/outreach/suppression`: manage opt-out/suppression records.

## Suggested pipeline states
`discovered -> enriched -> review_required -> approved -> queued -> sent -> delivered|bounced|replied|failed -> closed`
