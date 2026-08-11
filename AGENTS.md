<!-- AGENTS.md -->
# AGENTS.md — Mandatory entry point for every AI agent

STOP. Before scanning, diagnosing, or changing ANYTHING in this repository, you MUST fully read `ONBOARD.md` at the repository root. That document is the mandatory onboarding for all developers and AI agents. This file is only the pointer plus a condensed capability card — it does not replace `ONBOARD.md`, and neither file replaces inspecting the actual code.

Required order (from ONBOARD.md, non-negotiable):

1. Read `ONBOARD.md` in full.
2. Scan the repository structure.
3. Read the exact files related to the task.
4. Verify current implementation from code before diagnosing or changing anything.
5. Never code, report status, or claim behavior from memory alone. The repo is the source of truth.

For Marketing & Sales work, also read `docs/marketing-sales-current-state.md` and `saas/docs/marketing-sales-module-design.md` before using older status estimates or build sequences.

---

## Platform capability card (summary — details in ONBOARD.md)

**What SignalBoostAi is:** a U.S.-based AI business growth platform (Next.js App Router + Supabase + Vercel, repo path `saas/`) serving `saas.signalboostapp.com` in 5 languages (en, pt, es, pl, ru). Every user-facing string ships in all 5 languages.

**Current Marketing & Sales architecture (2026-08-10):** core architecture/product code is built. COS-first reasoning uses SignalBoost-owned cache/memory/Knowledge Graph/learning/local reasoning before cloud fallback; the Business Intelligence Corpus is internal-first and provider fallback is limited to insufficient confidence/freshness; Communication Hub, CRM production paths, Revenue Intelligence, Universal Adapter/provider-neutral seams, campaign/outreach approval and execution layers are present. Enterprise Release Candidate status remains evidence-based and must not be inferred from architecture or a green build. Use `saas/lib/release-candidate/marketing-sales.ts` and `docs/enterprise-release-candidate.md`.

**Business Intelligence Corpus:** workflow complete; population continues toward 5,000 reusable companies. Last production observation recorded in docs on 2026-08-10 was 461/5000 = 9.22%; this is a dated operational observation, not a software-completion percentage. Live owner/admin surface: `/dashboard/data/business-intelligence-corpus`.

**What the platform CAN do today:**
- AI website building, content improvement, reviews, audio/video studios, podcast tools, guided launchpads.
- COSA campaign pipeline: strategy → assets → video render (FFmpeg brand overlay) → HMI owner approval → publish. Approval gates are never skipped.
- BYOK Campaign Studio (`/agency`): one prompt → full organic campaign (YouTube copy, LinkedIn posts, press release) generated with the USER'S OWN AI key. Users pay providers directly; the platform never absorbs per-use AI costs. Logged-in users store keys once in `user_provider_keys` (AES-256-GCM, service-role only).
- Real press dispatch: generated press releases queue into `press_campaigns` as `pending_owner_review`; owner approves in `/dashboard/marketing/press-outreach`; only then is the journalist emailed (Resend, owner BCC).
- Console Hub (owner-only): provider templates, Key Vault, audits, deployments. Provider templates are live action definitions, not documentation.

**What the platform must NOT do:**
- Never call paid-media, broker, ad, TV, radio, LinkedIn, or YouTube publishing APIs without server-side payment confirmation AND owner approval gates.
- Never store or log user API keys in plaintext. Never expose secrets.
- Never use a platform AI key in BYOK user flows.
- Never bypass owner/HMI approval on any dispatch/publish/spend/infrastructure action.
- Never claim a descriptor-only integration is production-live merely because it exists in a catalog.
- Never mark Marketing & Sales enterprise RC complete without recorded passing evidence for every required RC gate.

**Zero-manual-entry enterprise UI rule:**
- Read and follow `docs/zero-manual-entry-ui.md` for COSA, Campaign Studio, Launchpad, and every enterprise campaign/configuration workspace.
- Do not add campaign-generation `<input type="text">` or `<textarea>` controls. URL fields must use `type="url"` with strict validation.
- Use shared searchable schema-backed selects for categorical values and card selection for AI-generated creative choices.
- Preserve all human approval gates. Zero manual entry does not mean zero human control.

**Adapter/driver model:** new media providers are added as one catalog entry + one small adapter implementing the shared contract. The engine, UI, and approval flows never change per provider. Only advertise a provider as "live" once its production method exists and the buyer/provider prerequisites are satisfied — a key unlocks billing/access, not capability.

**Strip-safety rule (non-negotiable):**
- The test suites run `node --test` directly on `.ts` sources. Node STRIPS types there; it does not compile them. Any TypeScript feature that emits runtime code cannot be stripped and throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` at module load.
- NEVER write constructor parameter properties, `enum`, `namespace`, `export =`, or `import x = require()` in guarded directories. Use plain erasable TypeScript/ESM.
- `npm run validate:strip-safe` enforces this and runs in `prebuild`.

**Test fixtures that look like credentials:**
- A fake secret in a test must carry an `EXAMPLE` / `NOTAREAL` marker IN THE VALUE. Never use a realistic vendor prefix.

**Owner workflow constraints (critical):**
- The owner works through GitHub/Vercel rather than local coding. Keep changes in coherent batches so CI/Vercel do not redeploy for every tiny edit.
- Commit a NEW module in the same coherent batch before/with any file that imports it. After interruptions, re-check what actually landed.
- Type-check against the repo tsconfig before claiming success. Never claim builds/tests/deploys succeeded without verification.
- State out-of-band steps explicitly (Vercel env vars, Supabase SQL, provider dashboards).

Keep `ONBOARD.md` and the current-state docs useful when durable architecture/status changes. Documentation never substitutes for inspecting current code.
