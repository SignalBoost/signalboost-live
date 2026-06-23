# SignalBoost — Whole-Platform Security & Readiness Audit

**Scope:** entire `SignalBoost/signalboost-live` repo @ `main` — repo root, `/app` (marketing deploy → signalboostapp.com), and `/saas` (SaaS deploy → saas.signalboostapp.com).
**Method:** full tarball pulled and scanned offline (645 TS/TSX files). Root API surface (19 routes) read line-by-line; `/saas` (137 routes) pattern-scanned for the specific anti-patterns below + targeted reads.
**Honest limits:** I confirmed source-level patterns. I could **not** see your Vercel project config or live env vars from here, so a few severities are *conditional on which env vars are set in the marketing project* — flagged inline. I did not read all 137 saas routes line-by-line.

---

## Headline

The `/saas` app is comparatively hardened (RBAC middleware, owner-gating, signature-verified webhooks). **The exposure lives in the root marketing app.** The entire root `app/api` surface ships with **no auth layer**, and the repo structure (`stagingDeployment.routes = ['/', '/pricing', '/dashboard', '/staging']`, root `package.json` name `signalboost-live`) indicates the root *is* the deployment behind signalboostapp.com. If that's correct, the routes below are **live on the public marketing domain right now.**

---

## TIER 1 — Production-Exposed Security Issues

| # | File · Line | Finding | Severity | Exploitability | [Block Launch/Sale] |
|---|---|---|---|---|---|
| F1 | `app/api/video/jobs/[id]/route.ts` · 7–18 | **IDOR.** Unauth `GET` returns `video_jobs.select('*').eq('id', id).single()` with **no ownership check**. Any party can enumerate IDs and read any tenant's video job rows. | **HIGH** | **Live threat** *(if `video_jobs` holds real user data/URLs/PII)* | **YES** |
| F2 | `app/api/generate/route.ts` · 12–30 | Unauth `POST` calls OpenAI (`gpt-4o-mini`) with client-supplied prompt. **Unmetered AI cost/key-exhaustion abuse** by anonymous callers. | **HIGH** | **Live threat** *(if `OPENAI_API_KEY` set in marketing project; else falls back to echo)* | **YES (conditional)** |
| F3 | `app/api/sales/draft/route.ts` · 11–60+ | Unauth `POST` calls OpenAI (`max_tokens:900`) per request. Same unmetered cost-abuse vector. | **HIGH** | **Live threat** *(if `OPENAI_API_KEY` set in marketing project)* | **YES (conditional)** |
| F4 | `app/api/concierge/route.ts` · 4–9 | **Client-controlled billing context.** `tier`, `usedMinutes`, `billingProvider` taken straight from request body → `calculateVideoQuota(...)` → returns an `exportEnabled` "decision". A caller passing `tier:'command', usedMinutes:0` flips the gate. | **MEDIUM-HIGH** | **Live threat** *(severity = whatever downstream trusts this decision)* | **YES if any export/usage path trusts it; else NO** |
| F5 | `app/api/admin/telemetry/route.ts` · 4–6 | **Admin-labeled route, zero auth.** Unauth `GET` returns `adminTelemetrySummary` + `saasTelemetryEvents`. Data is derived/static (module map, not credentials), but it's an unauthenticated `/api/admin/*` endpoint leaking internal architecture. | **MEDIUM** | Live threat (info disclosure) | NO (fix fast) |
| F6 | `app/api/brand-profile/route.ts` · 3–11 | **Module-level mutable state**, not tenant DB: `let profile`. Unauth `GET`+`POST` — anyone reads/overwrites a single global object. Also unreliable on serverless (per-lambda, non-persistent). | **MEDIUM** | Live threat (unauth write + global state) | NO (fix fast) |
| F7 | `app/api/video/captions/route.ts` · 9–20 | Unauth file/text processing (`parseCaptionText`) with no size guard → cheap DoS. | LOW-MEDIUM | Live threat | NO |
| F8 | `app/api/staging/route.ts` · 4–12 | `force-static` route publishes internal deployment map (project name, env labels, route list, QA checklist). | LOW-MEDIUM | Live threat (info disclosure) | NO |

---

## TIER 2 — Latent Deployment Risks (root-deploy / wrong-root-dir)

| # | File · Line | Finding | Severity | Status | [Block] |
|---|---|---|---|---|---|
| F9 | `app/api/login/route.ts` · 3–20 | **Stub auth.** Returns `{success:true, message:'Login API working', received: body}` — performs **no authentication**, echoes the posted body. If anything client-side ever calls `/api/login` on the marketing domain, it "succeeds" with no auth. | HIGH *(as a trap)* | Deployment/Package risk | **YES (sale)** |
| F10 | `app/api/signup/route.ts` · 3–20 | Stub signup, same echo pattern, creates no user. | HIGH *(as a trap)* | Deployment/Package risk | **YES (sale)** |
| F11 | root `app/` (whole tree) | Root has a full **second Next app with no auth middleware** (19 routes). If a buyer/Vercel ever sets the project root to `/` instead of `/saas`, every Tier-1 finding above becomes the *primary* surface. | HIGH | Deployment risk | **YES (sale)** — document the root-dir requirement explicitly |

---

## TIER 3 — Buyer-Package & Portability Risks (degrade valuation)

| # | File · Line | Finding | Severity | [Block Sale] |
|---|---|---|---|---|
| F12 | `app/api/generate-voice/route.ts` · 4–6 | Stub returns hardcoded `/demo/sample.mp3` — fake "generation". | MEDIUM | NO (but fix before diligence) |
| F13 | `app/api/generate-graphic/route.ts` · 4–6 | Stub returns hardcoded `/demo/sample.png`. | MEDIUM | NO |
| F14 | `app/api/generate-website/route.ts` · 6–18 | Returns a hardcoded inline HTML template, not real generation. | MEDIUM | NO |
| F15 | `app/api/dashboard/route.ts` · 5–20 | Mock stats endpoint (`projects:12…`). **Correctly guarded** to non-production (404 in prod) — clean, but it's dead weight in the package. | LOW | NO |
| F16 | `app/api/generate/route.ts` · 18 | Silent fallback `"SignalBoost draft (${mode}…): ${prompt}"` when no key — presents as working AI to a buyer testing without keys. | LOW | NO |

---

## TIER 4 — Product-Readiness & UX Integrity

| # | File · Line | Finding | Severity | [Block] |
|---|---|---|---|---|
| F17 | `components/admin/AdminSectionView.tsx` · 21 | `'Not tracked yet'` override — admin metrics render placeholders instead of data. | LOW | NO |
| F18 | `app/admin/partners/page.tsx` · 32 | `'Not tracked yet. Connect partner click analytics…'` placeholder on partner analytics. | LOW | NO |
| F19 | `components/hub/console/ProviderConsoleCard.tsx` · 69, 126, 154 | `'Coming soon'` / `'Not available yet'` provider action templates — incomplete provider actions shown as preview. | LOW | NO |

*UX no-op scan: `onClick={()=>{}}` / `href="#"` across `/saas` → **0 hits.** Clean.*

---

## TIER 5 — Low-Priority Code Quality

| # | File · Line | Finding | Severity | [Block] |
|---|---|---|---|---|
| F20 | `app/api/dashboard/route.ts`, login, signup, generate-* | `catch (err: any)` explicit-any throughout root routes. | LOW | NO |
| F21 | `saas/app/api/hub/env/route.ts` · 40 | `let cachedProjectId` module cache — benign memoization, **not** tenant data. No action needed; listed for completeness. | INFO | NO |
| F22 | `saas/app/api/checkout/route.ts` · 33 | Reads `body.plan` from client — **acceptable** *iff* price is server-derived from the plan key (the existing compatibility bridge). Verify the Stripe price is never taken from the client. | INFO → MEDIUM if price is client-trusted | NO (verify) |

---

## Review items I flagged but did not fully resolve (honest gaps)

- **33 of 137 `/saas` routes** had no obvious auth-token import. Many are legitimately public (Stripe webhook uses signature verification, cron routes use a secret, health/config). This needs a targeted pass route-by-route — I did not confirm each of the 33 individually.
- **F2/F3 severities are conditional** on whether `OPENAI_API_KEY` exists in the *marketing* Vercel project. If it doesn't, they degrade to harmless. Worth checking in Vercel.
- I could not confirm the live Vercel root-dir setting; F11 assumes the structure (root = marketing deploy) reflects production.

## Recommended fix order

1. **F1** (IDOR) — add owner/tenant ownership check or auth gate to `video/jobs/[id]`.
2. **F2, F3** — gate behind auth + per-user rate limit, or remove from the marketing app entirely if unused.
3. **F4** — derive tier/usage **server-side** from the authenticated session; never trust body for billing.
4. **F9, F10** — delete the stub login/signup routes from root (real auth is in `/saas`), or replace with explicit 410/redirect.
5. **F5, F6** — auth-gate telemetry; move `brand-profile` to a tenant-scoped Supabase table.
6. **F12–F16** — strip demo/stub generation routes before diligence, or wire them to the real `/saas` engines.
