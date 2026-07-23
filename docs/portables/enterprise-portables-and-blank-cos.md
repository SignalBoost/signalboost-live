# Enterprise Portables & the Blank COS Copy

**Audience:** any developer (human or AI) working on the SignalBoost repo.
**Status:** authoritative as of July 2026. Read this before touching any portable,
brand string, or company-identity code.

---

## 1. The one thing you must understand first

**The portables are the product. The SignalBoost platform is only a test rig** — a
place to build and test the portables. Do not optimize for the platform; optimize the
portables for sale.

The portables are built to be **sold to large enterprise / Fortune-500 companies** and
must be **plug-and-play into a buyer's own systems**. This has been the goal since the
project started. It is baseline context, never a surprise.

"LIVE" for a portable means **genuinely working and enterprise-ready**, not a badge
flipped on the marketing page. Never mark a portable live/done unless it truly plugs
into a buyer's stack and runs to enterprise standard.

---

## 2. The business model (why the code is shaped this way)

Luis's own AI is **useless to a buyer as-is**, because it holds *his* company profile.
A buyer does not want an AI that thinks it works for SignalBoost — they want an AI that
works for **them**.

So the product is **the COS engine with the company identity pulled out**. Two ways to
frame the same thing:

- **A copy of the COS with no company profile in it** — ships empty, the buyer fills in
  their company, and it becomes theirs. You are selling the *trained brain*, not a copy
  of Luis's business.
- Everything (or almost everything) is for sale. **Pricing tiers decide how much of the
  engine a buyer gets** (full COS vs. parts).

Luis is a **non-developer**. When communicating with him, frame things in business
terms (what the buyer gets, what it means for the sale), not implementation detail.

---

## 3. The identity mechanism (how a copy knows whom it works for)

All company-identity resolution lives in **`saas/lib/portable/companyIdentity.ts`**.
This is the single file a deployment "points at its company." The resolvers:

| Function | Returns | Use for |
| --- | --- | --- |
| `contentBrand(facts, fallback='[YOUR COMPANY]')` | the company's real name if set, else a **visible placeholder** — never the platform brand | **user-generated content** (a signed-in user's website/outreach) |
| `hostBrandName()` / `hostBrandUrl()` | `PORTABLE_BRAND_NAME` / `PORTABLE_BRAND_URL` env, else **`SignalBoost`** | the **host/owner** brand (e.g. the platform's own mandatory video overlay, owner/COS output) |
| `portableBrandName()` / `portableBrandUrl()` | see §4 | a **sellable copy** of the COS whose default must never be the seller |
| `isSoldCopy()` | `true` when `PORTABLE_SOLD_COPY === 'true'` | marks a deployment as a sold/blank copy |

### The rule of thumb

- **User-facing content path** (a signed-in user creating their own website, video,
  outreach): use `contentBrand()`. A missing name becomes `[YOUR COMPANY]`, **never**
  the platform brand.
- **Owner / COS / host path** (the platform's own operations, admin-gated
  `/api/cos/*` routes): use `hostBrandName()`. Resolves to SignalBoost on Luis's
  deploy, a buyer's brand on theirs — **never** a hardcoded literal, **never** a
  placeholder.
- **A sellable copy of the COS brain**: use `portableBrandName()` (see §4).
- **Deployment mechanics are NOT brand identity** — do not touch them. Examples that
  must stay hardcoded: the real git branch convention `SignalBoost/patch-*`, the real
  audit URL `saas.signalboostapp.com/website-optimizer`, the design-system colors
  (gold `#ffc300`, cyan `#1af0ff`), real pricing tiers. These are facts about the
  specific machine a deploy runs on, not the brand it speaks as.

> **Hard-won lesson:** a past mass find-and-replace "decouple" **degraded Luis's own
> output** by neutralizing owner-only defaults to placeholders. Before changing any
> brand string, check whether the path is **owner/COS** (→ `hostBrandName()`) or
> **user-facing** (→ `contentBrand()`), and leave **deployment mechanics** alone.
> They need opposite treatments. Never blanket-swap.

---

## 4. The blank COS copy (no company profile)

The sellable product Luis chose: **a copy of the COS with no company profile**, that
speaks as `[YOUR COMPANY]` until the buyer configures their own. It can never
accidentally speak as SignalBoost.

Implemented by `portableBrandName()` / `portableBrandUrl()` in
`companyIdentity.ts`. Resolution order:

1. `PORTABLE_BRAND_NAME` set → the **buyer's own brand** (they configured it).
2. else if `isSoldCopy()` (i.e. `PORTABLE_SOLD_COPY=true`) → **`[YOUR COMPANY]`**
   placeholder — a blank copy before configuration. Never the seller name.
3. else (Luis's own deployment, no flags) → defers to `hostBrandName()` = **SignalBoost**.

### One codebase, three deployments — switched by env flags

| Deployment | Env | Brand shown | Notes |
| --- | --- | --- | --- |
| **Seller (Luis)** | nothing set | `SignalBoost` | unchanged, behaves exactly as before |
| **Blank sold copy** | `PORTABLE_SOLD_COPY=true` | `[YOUR COMPANY]` | cannot say SignalBoost; empty until filled |
| **Configured buyer** | `PORTABLE_BRAND_NAME=Acme Corp` | `Acme Corp` | their company everywhere |

The COS brain — **`saas/app/api/support/route.ts`** (the primary Chief-of-Staff /
Concierge brain; **not** `cos-backup`, which is a small read-only failover COS) — uses
`portableBrandName()` in both system-prompt identity lines (`conciergePrompt` and
`chiefOfStaffPrompt`). Guarded by **`saas/tests/portableBrandResolver.node.test.ts`**.

### Scope status (be honest about this)

- ✅ The COS **brain's identity** (who it says it is / works for) is blank-copy-ready.
- ⛔ The larger COS **engine** (`saas/lib/cos`, ~90 files) still has brand woven through
  its content-generation paths. A **fully** blank engine copy is a larger pass still
  ahead. The switch and the pattern now exist; apply `hostBrandName()` /
  `contentBrand()` per the §3 rule to each generation path, owner-vs-user checked.

---

## 5. OPEN PRODUCT QUESTION (needs Luis's decision)

**Should the blank/no-profile COS copy be offered as its own portable (a standalone
"blank COS" product line), or sold together (bundled with the other portables / as one
package)?**

This is a packaging / go-to-market decision, **not** technical. Do not assume either
way. Raise it with Luis. Both are supportable by the current code — the difference is
how it's licensed and priced, not how it's built.

---

## 6. The two reference patterns (copy these, don't reinvent)

Every portable becomes enterprise-ready by applying one or both of these already-proven
patterns:

### 6a. The portable-kernel (company identity + factual discipline)
`saas/portable-kernel/` — host-agnostic (no Next/Supabase/SDK). Provides
`CompanyProfilePort` ("who do I work for"), `FACTUAL_DISCIPLINE` + `findPlaceholders`
(never invent product/brand/person/quote/stat/date; emit a visible `[PLACEHOLDER]`),
`buildFactualPreamble`, and the agent pattern **"an agent prepares, a human releases"**
(fill the whole form, queue for approval, never auto-dispatch). This *is* the COS
function expressed portably, so a buyer's AI does what the COS does without the COS
existing. **Reference adopter:** `press-media-*` (the one fully-clean portable) and
`marketing-sales-host/director.ts`.

### 6b. The HostContext boundary (injected infrastructure)
`saas/lib/supervisor/portable/host-context.ts` — interfaces the **buyer** implements
against **their** stack: `SecretsProvider` (their vault), `NotificationSink` (their
email/Slack/ServiceNow/PagerDuty/SIEM), `ApproverDirectory` (their SSO-resolved
approvers), `HostBranding` (their product name + console URL), plus a
database-neutral `EnterpriseDispatchStore` (their SQL, not Supabase). The portable
core names no platform, reads no env, imports no host singleton; any platform fallback
is quarantined to one clearly-labeled adapter. **Reference adopter:** `selfHealing`
(the Supervisor), including its Vercel-ingestion decoupling
(`providers/vercel/portable/`).

---

## 7. The 9 portables and their status

Marketing page source of truth: `saas/app/page.tsx` PORTABLES array.

| Portable (key) | Code home | Enterprise-ready? |
| --- | --- | --- |
| **press** | `press-media-core` / `-host` | ✅ clean core — the reference |
| **render** | `render-core` / `-host` | core nearly clean (small cleanup) |
| **marketingSales** | `marketing-sales-core` / `-host` | core nearly clean (generator kernel-fixed) |
| **browser** | `lib/browser-provider` + `browser-runtime` | low coupling; production gate built; needs a live Chromium **server** (only true non-code dependency) |
| **selfHealing** | `lib/supervisor` | HostContext boundary + Vercel decoupling built |
| **chiefOfStaff** (AI Assistant / COS) | brain: `app/api/support/route.ts` | identity now via `portableBrandName()`; engine pass ahead |
| **console** | `console-core` / `-host` | core still leaks brand/supabase/env/email |
| **integrations** | `lib/engine` + `provider-framework` | datastore-coupled; no core/host split |
| **campaign** (agency) | `lib/cos` (~90 files) | the COS engine; brand woven through — apply §3 rule per path |

**Priority for remaining work** (worst-coupled first = most sales-blocking): campaign →
console → integrations → finish selfHealing store-factory → chiefOfStaff engine →
render/marketingSales polish → cross-cutting (SIEM/audit export, integration
contract/docs/DDL). Browser separately needs its live browser server.

---

## 8. The enterprise-ready checklist (the real bar a buyer's security team applies)

1. **Zero host coupling** — core names no platform, reads no env, imports no host
   singleton; coupling only in the `*-host` layer.
2. **Pluggable secrets** — buyer's vault via interface.
3. **Pluggable notifications** — buyer's email/Slack/ServiceNow/PagerDuty/SIEM.
4. **Pluggable datastore** — buyer's SQL, not Supabase-specific.
5. **Buyer SSO / approver identity** — roles and approval chains, not a single owner email.
6. **Audit → their SIEM** in a format their auditors accept (SOC 2 / ISO 27001).
7. **Integration contract** — versioned interfaces, reference deployment, DDL, docs, so
   the buyer's engineers install it without Luis.

---

## 9. Working conventions (repo-specific gotchas)

- **Verify against actual repo code before building.** Prior notes have been wrong in
  both directions (work marked done that wasn't; work marked pending already shipped; a
  deliberate safety "wall" mistaken for an oversight). Grep the live tree first.
- **Node strip-types gotcha:** `--experimental-strip-types --check` validates *syntax*
  only, never types. Constructor **parameter properties** are non-erasable and break
  loading — use explicit field assignment. Nested `${}` inside backtick-array elements
  can choke the runtime parser even when `--check` passes — prefer string concatenation
  for complex HTML.
- **Delivery for Luis (non-coder):** full-file replacements or downloadable files he
  drag-drops into GitHub web — never diffs/snippets he must merge. Name delivered files
  with the **full destination path, `~`-separated** (e.g.
  `lib~portable~companyIdentity.ts`) so a file cannot be pasted to the wrong path.
- **Repo's recurring failure mode:** on commit, **new files get silently skipped** and
  **similar-named files get content-swapped**. After any handoff, verify committed state
  by **content**, not just presence.
