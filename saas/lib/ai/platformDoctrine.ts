// saas/lib/ai/platformDoctrine.ts
// ─────────────────────────────────────────────────────────────────────────────
// THE single source of truth for SignalBoost's platform rules.
//
// Both the Concierge "Prompt Compiler" (which translates messy human requests
// into clean specs) and the COS PromptStrategy (which renders the executor's
// authoritative system prompt) import from here. Author the rules once; never
// duplicate them into a prompt string by hand again. When the doctrine changes,
// it changes in exactly one place and both consumers update.
//
// These blocks are deliberately terse and imperative — they are model context,
// not docs. Keep every line a hard, checkable rule.
// ─────────────────────────────────────────────────────────────────────────────

/** What the platform is built on, and the non-obvious constraints that follow. */
export const PLATFORM_STACK = `TECH STACK (hard constraints):
- Next.js (App Router) + React, TypeScript. tsconfig is NON-STRICT: use the flat
  { ok: boolean; error?: string } result style — discriminated unions do not narrow here.
- Tailwind IS installed, but component styling uses INLINE STYLE OBJECTS ONLY.
  Never emit Tailwind utility classes for layout/spacing/effects (e.g. fixed,
  top-16, right-0, h-[calc(...)]) — in this repo they render as nothing. Translate
  any such intent into an inline style object.
- Supabase (Postgres + Auth + Storage) is the backend. Server routes use the
  service-role key server-side only; the browser uses the anon key.
- Deployed on Vercel. "Green" means the build compiled — not that anything was
  visually verified.`

/** How anything that renders must look and behave. Extracted from real fixes. */
export const DESIGN_DOCTRINE = `DESIGN DOCTRINE (apply to anything that renders):
- Palette: dark navy/black gradients (rgba(15,23,42) → rgba(3,7,18)); accents
  gold #ffc300 and cyan #1af0ff; white text with rgba(255,255,255,.5) secondary;
  hairline borders rgba(255,255,255,.08–.12); border-radius 14–24px. Reuse the
  shared sb-* classes (sb-console, sb-input, sb-button-primary, …). Never invent
  brand colors, fonts, or component libraries.
- Glassmorphism is inline: pair backdropFilter AND WebkitBackdropFilter — blur(8px)
  for overlay backdrops over rgba(3,7,18,.72), blur(12px) for cards over
  linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96)); lifted shadow
  0 24px 70px rgba(0,0,0,.6).
- NO HARDCODED HEIGHTS that can clip content. Never lock a panel to a fixed vh/px
  height; use height:auto with a maxHeight cap and overflow:auto, plus reflowing
  flex/grid (minWidth:0, flexWrap:wrap, minmax(0,1fr) columns).
- THE 80px NAVBAR: the SaaS navbar is 80px tall. Full-height regions use
  calc(100vh - 80px); modal/panel content caps at calc(100vh - 120px). Fixed
  overlays start BELOW the navbar (position:fixed, top:80, left:0, right:0,
  bottom:0 — never inset:0). Content must never render behind the navbar.
- NO DEAD-ENDS: every modal, drawer, or panel must have an always-reachable exit.
  Give it a sticky header (position:sticky, top:0, zIndex:3, solid background) so
  Close never scrolls away, AND support backdrop-click-to-close. Never leave a
  surface a user cannot exit.`

/** How a change is allowed to reach the codebase. Enforced by the executor. */
export const EXECUTION_RULES = `EXECUTION RULES (how a change reaches the repo):
- ISOLATE ON A BRANCH: every change goes to an ai/* preview branch, NEVER main.
  The owner merges; the preview branch IS the proposal, not the chat.
- FULL FILES ONLY: commit the complete file — no fragments, no placeholders, no
  TODOs. One file per commit; multi-file changes share one branch.
- VERIFY AFTER COMMIT: immediately after each commit, call verifyCommittedFile
  ({ branch, path, expectedContent }) and confirm expectedLines === actualLines
  before reporting success. A line-count mismatch means the write did not land —
  re-read the file on the branch, rebuild the complete file, and commit again.
  Never claim a change is done without a verified, matching commit in the same step.`

/** The full doctrine, in the order a reader should absorb it. */
export const PLATFORM_DOCTRINE = `${PLATFORM_STACK}

${DESIGN_DOCTRINE}

${EXECUTION_RULES}`
