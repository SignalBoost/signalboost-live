<!-- AGENTS.md -->
# AGENTS.md — Mandatory entry point for every AI agent

STOP. Before scanning, diagnosing, or changing ANYTHING in this repository, you MUST fully read `ONBOARD.md` at the repository root. That document is the mandatory onboarding for all developers and AI agents. This file is only the pointer plus a condensed capability card — it does not replace `ONBOARD.md`, and neither file replaces inspecting the actual code.

Required order (from ONBOARD.md, non-negotiable):

1. Read `ONBOARD.md` in full.
2. Read `docs/HANDOFF-2026-08-13.md` for the current dated takeover state.
3. For COS cognitive/active-learning work, read `docs/HANDOFF-COS-ACTIVE-LEARNING-2026-08-13.md`.
4. For Self-Healing work, read `docs/portables/self-healing-monitoring-current-state-20260813.md`.
5. Scan the repository structure and current `main`.
6. Read the exact files related to the task.
7. Verify current implementation/runtime from code and live evidence before diagnosing or changing anything.
8. Never code, report status, or claim behavior from memory alone. The repo is the source of truth.

For Marketing & Sales work, also read `docs/marketing-sales-current-state.md` and `saas/docs/marketing-sales-module-design.md` before using older status estimates or build sequences.

---

## Platform capability card (summary — details in ONBOARD.md)

**What SignalBoostAi is:** a U.S.-based AI business growth platform (Next.js App Router + Supabase + Vercel, repo path `saas/`) serving `saas.signalboostapp.com` in 5 languages (en, pt, es, pl, ru). Every user-facing string ships in all 5 languages.

**Current COS state (2026-08-13):** COS is the provider-neutral intelligence/governance/memory layer. Current development local reasoner remains `qwen2.5-coder:32b` on RunPod. `qwen3:30b` is the intended durable bootstrap/default in code but is NOT yet live on the existing running pod. Gemini is part of the governed fallback/teacher path. The cognitive lifecycle and durable active-learning loop are merged; one procedural skill (`diagnose-tenant-specific-tail-latency`) is empirically `validated` from 2/2 practice + 3/3 distinct holdouts. Only validated/learned/mastered skills can enter live COS reasoning, and procedural `[SK#]` use is tracked separately from factual evidence.

**Current Self-Healing state (2026-08-13):** native proactive API/database/storage/TLS monitoring is production-runtime-verified. PR #1159 closes native anomaly → bounded connector evidence → COS-first diagnosis → existing Agent Gateway/MCP governed remediation without adding new mutation authority. Consequential actions remain approval-gated/fail-closed. Obtain a controlled real anomalous acceptance trace before claiming repeated full end-to-end remediation runtime evidence.

**Current Marketing & Sales architecture:** core architecture/product code is built. COS-first reasoning uses SignalBoost-owned cache/memory/Knowledge Graph/learning/local reasoning before cloud fallback; the Business Intelligence Corpus is internal-first and provider fallback is limited to insufficient confidence/freshness; Communication Hub, CRM production paths, Revenue Intelligence, Universal Adapter/provider-neutral seams, campaign/outreach approval and execution layers are present. Enterprise Release Candidate status remains evidence-based and must not be inferred from architecture or a green build. Use `saas/lib/release-candidate/marketing-sales.ts` and `docs/enterprise-release-candidate.md`.

**Business Intelligence Corpus:** workflow complete; population continues toward 5,000 reusable companies. Historical counts in documentation are dated operational observations, not software-completion percentages. Live owner/admin surface: `/dashboard/data/business-intelligence-corpus`.

**What the platform CAN do today:**
- AI website building, content improvement, reviews, audio/video studios, podcast tools, guided launchpads.
- COSA campaign pipeline: strategy → assets → video render (FFmpeg brand overlay) → HMI owner approval → publish. Approval gates are never skipped.
- BYOK Campaign Studio (`/agency`): one prompt → full organic campaign (YouTube copy, LinkedIn posts, press release) generated with the USER'S OWN AI key. Users pay providers directly; the platform never absorbs per-use AI costs. Logged-in users store keys once in `user_provider_keys` (AES-256-GCM, service-role only).
- Real press dispatch: generated press releases queue into `press_campaigns` as `pending_owner_review`; owner approves in `/dashboard/marketing/press-outreach`; only then is the journalist emailed (Resend, owner BCC).
- Console Hub (owner-only): provider templates, Key Vault, audits, deployments. Provider templates are live action definitions, not documentation.
- COS cognitive learning: teacher signals are captured separately from factual knowledge; generalized procedural candidates can be practiced and independently holdout-validated; only sufficiently validated skills enter live reasoning.
- Native Self-Healing monitoring plus governed anomaly-to-remediation routing through the same connector/Agent Gateway boundaries intended for buyers.

**What the platform must NOT do:**
- Never call paid-media, broker, ad, TV, radio, LinkedIn, or YouTube publishing APIs without server-side payment confirmation AND owner approval gates.
- Never store or log user API keys in plaintext. Never expose secrets or `/workspace/cos-api-key`.
- Never use a platform AI key in BYOK user flows.
- Never bypass owner/HMI approval on any dispatch/publish/spend/infrastructure action.
- Never claim a descriptor-only integration is production-live merely because it exists in a catalog.
- Never mark Marketing & Sales enterprise RC complete without recorded passing evidence for every required RC gate.
- Never claim Qwen3 is live until the running production/local reasoner is verified to serve it.
- Never call a teacher answer trusted truth, retrieval "use," or locally generated training data an independent holdout.

**Zero-manual-entry enterprise UI rule:**
- Read and follow `docs/zero-manual-entry-ui.md` for COSA, Campaign Studio, Launchpad, and every enterprise campaign/configuration workspace.
- Do not add campaign-generation `<input type="text">` or `<textarea>` controls. URL fields must use `type="url"` with strict validation.
- Use shared searchable schema-backed selects for categorical values and card selection for AI-generated creative choices.
- Preserve all human approval gates. Zero manual entry does not mean zero human control.

**Adapter/driver model:** new media/providers/models/connectors are added behind shared contracts. The core engine, memory, governance and UI should not become provider-specific. Only advertise an integration as "live" once its production method exists and the buyer/provider prerequisites are satisfied — a key unlocks billing/access, not capability.

**BYOM/BYOA enterprise rule:** COS must not require Qwen, RunPod, OpenAI, Anthropic or Gemini. Buyer-owned models/agents/credentials/compute must remain replaceable. COS-owned memory, procedural skills, provenance and governance must survive model swaps. Read `docs/portables/cos-byom-byoa-enterprise.md`.

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
- State out-of-band steps explicitly (Vercel env vars, Supabase SQL, provider dashboards, RunPod terminal work).
- Re-check current `main` because multiple agents may work concurrently.

Keep `ONBOARD.md` and the current-state docs useful when durable architecture/status changes. Documentation never substitutes for inspecting current code and live state.