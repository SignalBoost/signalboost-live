# SignalBoost COS — Product Strategy & Launch-Readiness Brief

**Status:** Internal strategy. Public-facing copy in this document is written as launch-ready product language, but COS must remain behind admin/private access and feature flags until production-ready. It must not be added to the public navbar, indexed, or publicly priced until approved.

**Languages:** English (`en`), Spanish (`es`), Portuguese-Brazil (`pt`), Polish (`pl`), and Russian (`ru`).

**Day-one i18n rule:** no screen, card, modal, empty state, error, tooltip, nav label, email/outreach template, pricing block, or CTA ships English-only. A page is complete only when all five language dictionaries are complete.

---

## 1. Core Product Definition

COS is the operating brain of SignalBoost.

Inside COS:

1. **Predictive Insight** — sensing and intelligence layer.
2. **Marketing** — voice and content engine.
3. **Sales** — revenue and follow-up engine.
4. **Telemetry** — memory and learning layer.
5. **Approval Layer** — human control and safety governor.

One-sentence customer explanation:

> COS finds the opportunity, writes the first draft, lines up the follow-up, and waits for your approval.

Launch-ready public description:

> SignalBoost COS watches business signals, finds opportunities, creates marketing assets, prepares sales follow-up, and asks the owner for approval before anything is published or sent.

Internal rule: public copy can be confident and present-tense, but it must not be shown to real visitors until the described behavior is actually live.

---

## 2. What Must Stay Hidden Until Launch

- COS landing pages, pricing blocks, and premium module pages must remain behind feature flags or admin/private access.
- COS must stay out of the public navbar until approved.
- COS routes must use `noindex` until launch-ready.
- Pricing should be prepared and translated now, but not exposed publicly until production-ready.
- Credit metering, agent provisioning, and approval workflows must pass acceptance criteria before external accounts can use COS.
- Internal demo/staging access should require owner/admin role checks.

---

## 3. Architecture Overview

COS coordinates five cooperating layers. It does not silently act on its own. It routes work and holds execution at the approval gate.

### Predictive Insight

Consumes authorized platform signals such as website checks, repo checks, cybersecurity previews, audits, reviews, and opportunity-scan output. It emits typed insights: behavior, gap, risk, or opportunity.

### Marketing

Converts insights into draft assets:

- social posts
- short articles
- website copy
- print ad copy
- localized summaries
- security/optimization briefs
- podcast/audio scripts
- campaign ideas

Output is always a draft in Phase 1.

### Sales

Converts insights into lead scoring, outreach plans, demo paths, and proposal scaffolding. Output is always a plan in Phase 1, not automatic outreach.

### Telemetry

Records clicks, scrolls, approvals, rejections, conversions, credit usage, and outcomes. Telemetry feeds future scoring and predictive learning.

### Approval Layer

Every Marketing or Sales artifact begins in `pending_approval`. The owner can approve, edit, regenerate, or reject with a reason. Nothing is published or sent without explicit owner approval.

Recommended data flow:

```text
signal → insight → marketing draft + sales plan → approval gate → owner decision → telemetry
```

---

## 4. Public Visitor Journey

1. **Public page** — explains the product in plain language when COS is launch-ready.
2. **Free tool** — user runs a low-friction check without a long form.
3. **Insight** — COS surfaces one concrete behavior, risk, gap, or opportunity.
4. **Marketing asset** — COS creates a draft asset from the insight.
5. **Sales follow-up plan** — COS prepares a lead/follow-up/demo/proposal path.
6. **Owner approval** — user signs up or enters the workspace to approve before action.

Friction rule: show value before signup. Ask for signup only when the user wants to approve, save, publish, or act.

---

## 5. Owner/Admin Journey

1. Owner/admin signs in.
2. COS dashboard shows ranked insights by impact/confidence/status.
3. Owner opens an insight and sees the paired Marketing draft and Sales plan.
4. Owner edits, regenerates, rejects with reason, or approves.
5. Approved artifacts move to ready state.
6. Phase 1 sends/posts remain manual or explicit owner-triggered actions.
7. Telemetry shows approvals, rejections, conversions, and credits used.
8. Settings manage agents, brands/clients, team access, and language.

---

## 6. Minimum Phase 1 Screens

1. **COS Home / Insight Inbox** — ranked opportunities and risks.
2. **Insight Detail** — insight + marketing draft + sales plan.
3. **Review & Approve** — approval center for all pending items.
4. **Asset Preview** — faithful preview of draft copy/script/social/print asset.
5. **Results** — telemetry, outcomes, approvals, rejections, conversions, credit burn.
6. **Credits & Plan** — usage, balance, plan, upgrade path.
7. **Settings** — agents, brands/clients, team access, language.

Every screen requires empty, loading, and error states in all five languages.

---

## 7. Friendly Navigation Labels

Reference English labels only. Real UI must use copy keys.

- COS Home
- Opportunities
- Review & Approve
- Drafts
- Follow-ups
- Results
- Credits & Plan
- Settings

Use plain verbs instead of system jargon:

- Looks good — approve
- Edit first
- Not now
- Regenerate draft
- Send for approval

---

## 8. Required i18n Copy-Key Groups

All COS copy should be namespaced under `cos.*` and populated for `en`, `es`, `pt`, `pl`, and `ru`.

Suggested groups:

- `cos.nav.*`
- `cos.public.hero.*`
- `cos.public.how.*`
- `cos.public.modules.*`
- `cos.tool.*`
- `cos.insight.*`
- `cos.asset.*`
- `cos.sales.*`
- `cos.approval.*`
- `cos.dashboard.*`
- `cos.credits.*`
- `cos.pricing.*`
- `cos.empty.*`
- `cos.error.*`
- `cos.tooltip.*`
- `cos.email.*`
- `cos.outreach.*`
- `cos.status.*`

Ship gate:

```text
No copy keys = no implementation.
No five-language dictionaries = no page.
No Polish/Russian layout test = not ready.
```

Polish/Russian layout rules:

- Budget 30–35% more text length than English.
- Avoid fixed-width buttons and pills.
- Allow two-line wraps where needed.
- Clamp card titles to two lines and add tooltips for overflow.
- Test screens using the longest translation, not English.
- Format prices and numbers per locale.

---

## 9. Pricing Positioning

COS is a premium add-on outside the $199 SignalBoost Pro plan.

### SignalBoost Pro — $199/month

Core platform, free tools, website/repo/security checks, basic workspace, and owner-approved workflows.

### COS Growth Team — $499/month add-on

- 1 COS agent
- 10,000 Predictive Action Credits/month
- Hosted by SignalBoost
- Best for startups and small businesses ready to grow

Positioning:

> Turn business signals into approved marketing and sales work without hiring a full team first.

### COS Agency / Multi-Agent — $1,299/month add-on

- Up to 5 COS agents
- 40,000 Predictive Action Credits/month
- Brand/client separation
- Centralized billing
- Best for agencies and multi-brand businesses

Positioning:

> Run COS per client or brand from one cockpit while keeping data cleanly separated.

### COS Enterprise Private Cloud — $3,500–$5,000+/month, billed annually

- BYO Azure/OpenAI/Anthropic/ElevenLabs/infrastructure
- Private deployment or controlled enterprise environment
- Data residency and compliance alignment
- Best for banks, enterprises, and regulated buyers

Positioning:

> Your models, your cloud, your compliance boundary. COS runs inside your walls.

Predictive Action Credit examples:

- 1 credit = one lead scored
- 1 credit = one insight generated
- 1 credit = one localized outreach draft
- 1 credit = one social/print content draft
- 50 credits = one 5-minute podcast/audio script package

Phase 1 rule: do not define credits as automatic email sends or automatic social posts.

---

## 10. Cost-Benefit Buyer Pitch

COS should be positioned around leverage, speed, multilingual coverage, and control.

Good framing:

> COS gives a small team the operating leverage of a marketing analyst, content assistant, and sales coordinator — without hiring all three roles first.

Avoid:

- guaranteed revenue claims
- headcount replacement promises
- fully automated growth claims
- unsupervised bot language

Approval-first is a premium feature, not a limitation.

---

## 11. Phase 1 Acceptance Criteria

- All Marketing/Sales artifacts start as `pending_approval`.
- No automatic email sending.
- No automatic social posting.
- Owner can approve, edit, regenerate, or reject with reason.
- Rejection reasons are logged to telemetry.
- Credits decrement visibly and audibly per generated unit.
- Out-of-credit state blocks generation gracefully with localized copy.
- All Phase 1 screens render correctly in `en`, `es`, `pt`, `pl`, and `ru`.
- COS remains invisible to non-owner/admin roles.
- COS is absent from public navbar until approved.
- COS routes are `noindex` until launch.
- Role gating is enforced server-side.
- Telemetry records approvals, rejections, conversions, and credit usage.
- No scraping of private systems.
- Inputs come only from public, connected, or authorized sources.
- Every approve/reject/act event has an audit trail.

---

## 12. Risks and Guardrails

### Premature exposure

Keep feature flags, `noindex`, server-side role checks, and no public nav entry.

### Overclaiming

Launch-ready copy must only be shown once the behavior is real.

### Over-automation

Phase 1 remains approval-first. No silent sends or posts.

### Credit confusion

Show balance, cost before generate, and low-balance warnings.

### Brand/client data bleed

Agency tier must enforce brand/client separation at the data layer, not only the UI.

### i18n gaps

Add a CI check that fails if any `cos.*` key is missing in any of the five languages.

### Enterprise key handling

BYO keys must live in encrypted vault/storage and must never be logged.

---

## 13. Rollout Plan

### Phase 1 — Private Approval-First Core

- Insight Inbox
- Insight Detail
- Marketing draft + Sales plan
- Approval Center
- Asset Preview
- Telemetry/Results
- Credits & Plan
- Settings
- One COS agent
- Manual or explicit owner-triggered action only
- Full five-language copy
- Hidden, noindex, admin/feature-flag access only

### Phase 2 — Scale and Multi-Agent

- Agency/multi-agent support
- Brand/client separation
- Better telemetry-driven scoring
- Batch approvals
- Optional owner-confirmed send helpers
- Controlled public exposure of Growth pricing only when copy is true and stable

### Phase 3 — Enterprise Private Cloud

- BYO Azure/OpenAI/Anthropic/ElevenLabs
- Private deployment model
- Compliance/audit packaging
- Data residency
- SSO and deeper role controls
- Enterprise pricing exposure

Approval-first remains the default posture.

---

## 14. Immediate Build Notes

- Keep PR #125 focused on the portable COS foundation.
- Implement this strategy in a follow-up PR.
- Add `cosCopy.ts` or equivalent copy registry after confirming the existing i18n structure.
- Gate COS routes and nav behind owner/admin and feature flags.
- Add `noindex` until launch.
- Add CI check for missing `cos.*` keys across all five language dictionaries.
- Keep COS additive to the current dashboard. Avoid restructuring existing pages until the foundation is stable.
