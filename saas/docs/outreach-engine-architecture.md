# Outreach Engine Architecture Proposal

## A. Outreach engine architecture

### Suggested file structure
- `app/api/outreach/discovery/route.ts` — ingest category/location, execute discovery job.
- `app/api/outreach/contacts/route.ts` — extract and normalize contact channels.
- `app/api/outreach/messages/generate/route.ts` — generate channel-specific copy.
- `app/api/outreach/messages/send/route.ts` — enforce throttling/compliance and queue send actions.
- `app/api/outreach/pipeline/route.ts` — stage transitions and timeline updates.
- `lib/outreach/discovery/` — scrapers (`metadata.ts`, `emails.ts`, `social.ts`, `forms.ts`).
- `lib/outreach/contacts/normalize.ts` — canonical contact method mapping.
- `lib/outreach/messages/` — personalization, prompt templates, opt-out guardrails.
- `lib/outreach/pipeline/stages.ts` — stage machine helpers.
- `components/outreach/` — reusable dashboard widgets and kanban board.

### API route structure
- `POST /api/outreach/discovery` (category/location)
- `POST /api/outreach/contacts/extract` (discovery_id[])
- `POST /api/outreach/messages/generate` (contact_id + channel)
- `POST /api/outreach/messages/send` (message_id[])
- `PATCH /api/outreach/pipeline/:id` (stage transitions)
- `GET /api/outreach/*` for page data hydration

## B. Database schema
- `outreach_discovery`: category/location, business identity fields, score + metadata.
- `outreach_contacts`: owner email + form URL + social DM targets + normalized json.
- `outreach_messages`: channel/body/status, compliance + throttle buckets + opt-out.
- `outreach_pipeline`: lifecycle stage with milestone timestamps and timeline.

## C. UI pages
Under `app/dashboard/outreach`:
- `discovery/page.tsx`
- `contacts/page.tsx`
- `outreach/page.tsx`
- `pipeline/page.tsx` (kanban columns: discovered/contacted/replied/booked/won)

## D. i18n fixes
- Enforce key-driven copy in dashboard, podcasters, builder, operator, apprentice.
- Ensure components derive labels from `useI18n()` and rerender on language switch.
- Ensure operator/apprentice response helpers consume selected locale dictionary.

## E. Merge conflicts
Checked target files and found no conflict markers in:
- `app/dashboard/apprentice/page.tsx`
- `app/dashboard/video/page.tsx`
- `app/podcasters/page.tsx`

## F. Documentation updates
- Confirm `docs.pricing.a1` updated to:
  - Website: $19 / $49 / $149
  - Podcast: $29 / $79 / $299 (Network starting at $299/mo)
  across locale dictionaries under both `locales/` and `public/i18n/`.
