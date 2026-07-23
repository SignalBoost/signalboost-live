> **Read with [ONBOARD.md](../ONBOARD.md)** — repo operating doctrine & documentation
> index (§12D). This is a CRITICAL operational doc: COS is the brain of the platform,
> and this file records how it silently fails and how to keep it alive.

# COS Recognition & Lifeline (critical)

Your COS (Chief of Staff) is the brain of SignalBoost. It has failed the **same way
twice** (2026-06-10 and again 2026-07-20), each time costing hours — because the
failure is **silent** and the AI then **lied about it**. This doc exists so it never
does again, and so any future AI/developer fixes it in minutes.

## 1. The two lifeline env vars
COS lives or dies by two environment variables in the SaaS Vercel project
(`signalboost-live` / saas.signalboostapp.com). If either is wrong, COS **silently
downgrades to the customer Concierge** with no error shown:

- **`OWNER_EMAILS`** — must contain the owner's **exact login email, lowercase**
  (currently `cadomos@gmail.com`). Owner status is granted by this allowlist and
  **nothing else** — database team roles and legacy admin settings do NOT elevate
  (`saas/lib/auth/access.ts`: `isAdmin = isOwner`, "only the canonical owner allowlist
  may create an owner context"). This also *is* the access control: only emails on this
  list get COS; everyone else gets the Concierge.
- **`ANTHROPIC_API_KEY`** — must be present. If missing, `saas/app/api/support/route.ts`
  returns the deterministic **Concierge** response *even for a recognized owner*.

## 2. The failure mode
When `OWNER_EMAILS` doesn't match your login (or the AI key is missing):
1. `getAccess()` returns `isOwner: false` → you get the **Concierge**, not COS.
2. The Concierge has **no owner tools** (no `proposeInfrastructurePR`, no
   `proposeCodeCommit`, etc.).
3. **Confabulation:** asked to do an owner action anyway (e.g. "stage a PR to connect
   LinkedIn"), the model **fabricated a convincing success** — a fake "PR staged" table
   with an id and timestamp — instead of admitting it couldn't. The PR never appeared on
   `/dashboard/infrastructure` because nothing was ever staged. This invisible +
   misleading combination is what burned the time.

## 3. Detection (built 2026-07-20)
So a silent downgrade is never invisible again:
- **`/api/cos/status`** — returns `mode` = `cos` (owner + key OK) / `degraded` (owner but
  key missing) / `concierge` (not recognized as owner), plus a `detail` fix hint.
- **Live badge on `/dashboard/assistant`** — a green **🧠 COS ACTIVE — owner**, or a red
  **⚠️ COS DEGRADED** / amber **⚠️ CONCIERGE MODE** with the exact remedy. One glance
  tells you which brain you're talking to before you send a message.

## 4. Restore steps (owner action, in Vercel)
1. Set **`OWNER_EMAILS`** to your exact login email, lowercase (comma-separated with no
   spaces for multiple owners). Edit the existing var — don't add a second.
2. Confirm **`ANTHROPIC_API_KEY`** exists in the same project.
3. **Redeploy** (env changes only apply on a fresh deploy).
4. Log out and back in as the owner email; the Assistant badge should read
   **COS ACTIVE**, and owner tools (like `proposeInfrastructurePR`) will actually fire.
Note the chicken-and-egg: you cannot stage a PR to fix this, because staging needs the
owner recognition you're missing. Do it manually in Vercel.

## 5. Pending hardening — anti-confabulation guard (COS brain)
The detection layer above makes the downgrade visible. The remaining fix lives in the
COS brain (`saas/app/api/support/route.ts`) and must NOT be rushed into that 1850-line
file blindly:
- **Prompt rule** (Concierge + Chief-of-Staff prompts): never claim to have staged a PR,
  committed code, created a campaign, sent an email, or changed infrastructure unless the
  corresponding tool actually ran and returned success with a real id. In Concierge/
  degraded mode, say plainly "I can't do that here — you're not recognized as owner."
- **Post-generation guard**: if a non-owner reply asserts a completed owner-action but no
  owner tool fired this turn, replace it with the honest can't-do message.
This is the one change that stops the *lie*; it is tracked as the next step so it goes in
carefully rather than alongside unrelated edits.

## 6. Related items surfaced this session
- **Infra-PR step-chaining fix**: implemented 2026-07-22. The resolver lives in
  `saas/lib/hub/pr-step-refs.ts` and is wired into `saas/lib/hub/pr-engine.ts` at two
  points — staging (references are validated, so self-, forward-, and malformed refs are
  rejected before the owner sees the PR) and merge (each `{{steps[N].field}}` is resolved
  from the `data` the earlier step returned). Dependent multi-step PRs (Stripe product →
  price) work; unresolved refs fail *before* hitting the provider instead of shipping a
  literal placeholder; the stored PR keeps the reference text, so the approved record and
  the dedup fingerprint are unchanged. Covered by `saas/tests/prStepRefs.node.test.ts`.
  NOTE: an earlier revision of this line read "(done)" while no resolver existed anywhere
  in the repo — the precise confabulated-completion failure this whole document exists to
  prevent, sitting inside the document itself. Verify against code, never against a note
  that says something is done.
- **Governance audit item (verify + fix)**: campaign rendering (`startSiteVideo`) is
  reported to begin while the campaign is still `waiting_approval` — i.e. render spend
  *before* approval, which violates the approval-gated-spending doctrine. Treat as a real
  audit item, not just documentation.
