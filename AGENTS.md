# AGENTS.md — Mandatory entry point for every AI agent

STOP. Before scanning, diagnosing, or changing ANYTHING in this repository, you MUST fully read `ONBOARD.md` at the repository root. That document is the mandatory onboarding for all developers and AI agents. This file is only the pointer plus a condensed capability card — it does not replace `ONBOARD.md`, and neither file replaces inspecting the actual code.

Required order (from ONBOARD.md, non-negotiable):

1. Read `ONBOARD.md` in full.
2. Scan the repository structure.
3. Read the exact files related to the task.
4. Verify current implementation from code before diagnosing or changing anything.
5. Never code, report status, or claim behavior from memory alone. The repo is the source of truth.

---

## Platform capability card (summary — details in ONBOARD.md)

**What SignalBoostAi is:** a U.S.-based AI business growth platform (Next.js App Router + Supabase + Vercel, repo path `saas/`) serving `saas.signalboostapp.com` in 5 languages (en, pt, es, pl, ru). Every user-facing string ships in all 5 languages.

**What the platform CAN do today:**
- AI website building, content improvement, reviews, audio/video studios, podcast tools, guided launchpads.
- COSA campaign pipeline: strategy → assets → video render (FFmpeg brand overlay) → HMI owner approval → publish. Approval gates are never skipped.
- BYOK Campaign Studio (`/agency`): one prompt → full organic campaign (YouTube copy, LinkedIn posts, press release) generated with the USER'S OWN AI key (Anthropic/OpenAI). Users pay providers directly; the platform never absorbs per-use AI costs. Logged-in users store keys once in `user_provider_keys` (AES-256-GCM, service-role only).
- Real press dispatch: generated press releases queue into `press_campaigns` as `pending_owner_review`; owner approves in `/dashboard/marketing/press-outreach`; only then is the journalist emailed (Resend, owner BCC).
- Console Hub (owner-only): provider templates, Key Vault, audits, deployments. Provider templates are live action definitions, not documentation.

**What the platform must NOT do:**
- Never call paid-media, broker, ad, TV, radio, LinkedIn, or YouTube publishing APIs without server-side payment confirmation AND owner approval gates.
- Never store or log user API keys in plaintext. Never expose secrets.
- Never use a platform AI key in BYOK user flows.
- Never bypass owner/HMI approval on any dispatch, publish, spend, delete, rotate, or infrastructure action.

**Adapter/driver model:** new media providers (ElevenLabs, Runway, Kling, …) are added as one catalog entry + one small adapter in `saas/lib/agency/userProviders.ts` implementing the shared contract. The engine, UI, and approval flows never change per provider. Only advertise a provider as "live" once its adapter exists — a user key unlocks billing, not capability.

**Owner workflow constraints (critical):**
- The owner is a non-coder working exclusively through the GitHub web UI, pasting complete file replacements; Vercel auto-deploys from `main`.
- Deliver complete files, never diffs. Split oversized files into parts and merge only at the end — never ask the owner to merge mid-task.
- Type-check against the repo tsconfig (strict: false) before delivering. Never claim builds/tests/deploys succeeded without verification.
- State out-of-band steps explicitly (Vercel env vars, Supabase SQL, provider dashboards).

If your task changes architecture, providers, approval gates, env handling, Supabase schema, or developer instructions, you MUST update `ONBOARD.md` in the same change (Section 18) and add a change-log entry (Section 19).
