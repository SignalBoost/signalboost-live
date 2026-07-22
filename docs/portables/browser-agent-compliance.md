# Browser Agent — Compliance & Security Model

> Read `ONBOARD.md` first. This document is indexed from ONBOARD Section 12D and
> expands on the Browser Runtime and BPAL sections. Where this document and
> `ONBOARD.md` disagree, `ONBOARD.md` wins and this file must be corrected in
> the same change.

The Browser Agent is the optional third path in the plug-and-play provider
onboarding model (ONBOARD §12C): for setup steps that live on an external
platform — creating a developer app, clicking an OAuth **Authorize** button — a
buyer *may* choose to have a browser driven for them instead of doing it by hand
or through an infrastructure PR.

This document states what the Browser Agent is permitted to do today, what
enforces each limit, and what a buyer or auditor is entitled to rely on.

**The single most important fact: the Browser Agent cannot touch production.**
It cannot log into Vercel, Stripe, Supabase, GitHub, AWS, Cloudflare, or any real
provider account. It drives one loopback sandbox page inside this repository and
nothing else. Everything below is the detail behind that sentence.

## Current posture

| Capability | State | Enforced by |
| --- | --- | --- |
| Production / real-provider execution | **Disabled** | `supportsProduction()` returns false; registration throws on any provider claiming otherwise |
| Sandbox execution | Enabled, loopback only | `launch-profile.ts` allowed-origin set |
| State-changing tasks (`execute_change`) | **Rejected** | `launch-profile.ts` |
| Credential use | None — references only, never literals | `sandbox-adapter.ts` secret-reference resolution |
| Metadata / policy layer (BPAL) | Active, non-executing | `npm run validate:bpal` |

## Two layers, deliberately separated

**BPAL** (`saas/lib/browser-provider/`) is metadata and policy only. It describes
what a provider adapter *would* be allowed to do: capabilities, origins,
navigation profiles, selectors, evidence and verification profiles, health,
versioning. It executes nothing. It does not import Playwright, call Browser
Runtime, resolve credentials, invoke provider SDKs, or mutate provider state.
`npm run validate:bpal` fails the build if execution, credential, provider-mutation,
or Browser Runtime coupling appears inside BPAL, and enforces one registry, one
adapter per provider, and one Vercel adapter.

**Browser Runtime** (`saas/lib/browser-runtime/`) is the only component that can
open a browser. It is independent of Next.js UI, Supabase, and provider SDKs.

The separation is the point: the layer that *describes* provider capability and
the layer that *acts* are different code with different guarantees, so growing
the catalogue of known providers never grows what can be executed.

## Why "disabled" means disabled

Production execution is not off by configuration, and not off by default. It is
structurally rejected:

- The canonical Vercel adapter declares `supportsProduction: () => false` and
  `supportsExecutionMode: (mode) => mode === 'read_only'`.
- `provider-registry.ts` **throws `invalid_provider` at registration time** if a
  provider reports `supportsProduction()` true, declares no capabilities, or fails
  to support read-only inspection. A provider that claims production capability
  cannot be registered at all.
- The sandbox launch profile rejects `execute_change` tasks outright.
- Playwright is a `devDependency` of the `saas` workspace, not a production
  dependency.

Turning production execution on is therefore not a flag flip. It requires code
changes across the adapter, the registry guard, and the launch profile — each
reviewable, and each subject to Luis's explicit approval through the existing
governed flow.

## Origin confinement

Sandbox tasks run against `http://127.0.0.1:4173` / `http://localhost:4173` and
the in-repo `/browser-sandbox/login` route. The runtime does not check the origin
once and trust it afterwards. It re-checks the **live page** origin after
navigation and before and after every click, fill, wait, and screenshot step, so
a redirect cannot carry a session off the approved origin mid-task. Secrets are
resolved only while the page is on an approved origin, and the origin is
re-checked immediately before the value is filled.

## Approval model

Supervisor policy approval authorizes **routing** — that the dispatcher may hand
the exact approved step IDs to an executor. It is not permission to run a
browser. Browser Runtime requires its own signed approvals, and there are two:

1. **Phase one** — authorizes work up to a checkpoint. Protected save steps may
   appear in the task declaration but this token must neither authorize nor
   execute them.
2. **Continuation** — a separately signed token bound to the same task, incident,
   checkpoint, approved origins, exact remaining step IDs, one exact execution ID,
   and the digest of the phase-one approval that created the retained session.

Constraints on both, all enforced before a browser opens:

- Validity capped at **one hour**. The exact boundary is accepted; anything longer
  is rejected.
- Claims must match the task's exact `issuedAt` / `expiresAt`; malformed timestamps
  and windows that do not end after they begin are rejected.
- Canonical encoding only — deterministic key ordering, exactly two base64url
  segments, bounded token size, no unsupported claim fields, at most 128 signed
  step/origin scope entries. Validly signed alternate encodings and duplicate-key
  payloads are rejected.
- **Single use.** Verified token digests and nonces are consumed once per governed
  adapter instance; replay is rejected before a session opens or a continuation runs.

Resumption replays only post-checkpoint steps. Navigation, credential entry, and
preparation steps are never replayed.

## Credentials

The Browser Agent never receives a credential value. Tasks reference secrets
symbolically (`sandbox://credentials/email`); references are resolved at fill time
and never logged, persisted, or returned. Approval tokens, task and incident
identity, timestamps, executable steps, and metadata do not cross the browser-launch
boundary — session factories and launch-profile providers receive only a detached,
frozen provider/adapter/mode/approved-origin scope.

## Evidence and verification

Evidence is captured before the approval boundary. Every terminal result
(`paused`, `completed`, `failed`) carries a deterministic verification report from
the portable verifier. **A paused or completed execution is not valid unless that
report reads `verified`**; a failed execution retains a failed report for audit.
Verification failure is never stored as success.

Persisted records are sanitized metadata only. They never contain secret literals,
cookies, authorization headers, browser storage, raw HTML, Playwright objects,
provider responses, or sensitive stack traces.

## Durability boundary

Live browser sessions are held in memory and are not migratable. No audit or
persistence record can resume a lost session. On restart, non-terminal executions
are marked `abandoned_after_restart` or expired; continuing requires a new
execution ID, a new policy decision, and fresh approvals. Retained records and
sessions expire with the approved task boundary and are removed and closed
automatically.

Persisted execution history is **audit-only**. It cannot authorize, replay, resume,
approve, retry, or launch anything.

## What the Browser Agent will never do

These are boundaries by design, not current limitations (ONBOARD §12C):

- Supply a buyer's identity.
- Receive or enter a 2FA code.
- Solve a CAPTCHA.
- Obtain a platform's own API approval (LinkedIn, TikTok, Meta review).

These remain human and platform-side permanently. Any onboarding flow that appears
to automate them is a defect.

## Buyer guarantees

A buyer of a portable that ships the Browser Agent is entitled to rely on:

1. **The Agent is optional.** Every setup task has a manual path and an
   infrastructure-PR path. No onboarding step may hard-depend on AI (ONBOARD §12C).
   The Agent is the more costly path, offered by choice.
2. **It cannot reach their accounts.** Production and real-provider execution are
   structurally disabled, not merely unconfigured.
3. **It cannot spend their money.** Financial actions are outside the sandbox
   profile entirely.
4. **Approval is never implied.** Policy approval, phase-one approval, and
   continuation approval are three separate controls; none grants another.
5. **Nothing is hidden.** Every execution produces a sanitized, verifiable audit
   record, reviewable at `/dashboard/supervisor/executions`.

## Operator surfaces

| Surface | Access | Capability |
| --- | --- | --- |
| `/dashboard/supervisor/providers` | Admin | Read-only BPAL diagnostics. No forms, no mutation controls, no provider requests. |
| `/dashboard/supervisor/executions` | Admin | Read-only sandbox execution history. Cannot resume, approve, retry, or launch. |
| `/dashboard/supervisor` (SOC) | Owner / admin | Read-only monitoring plus the global AI kill switch. |

The kill switch (`system_status.ai_autonomous_execution_enabled`) blocks autonomous
cron, webhook, and Supervisor ingress and fails closed when status cannot be
verified. Restoring it re-enables ingress only; it never bypasses an approval gate.

## Known limitations

Stated plainly, because a compliance document that omits them is worthless:

- Execution and retained-session stores are in-process test infrastructure.
- Supervisor dispatcher at-most-once tracking is in-memory; process-restart durable
  tracking is deferred, so duplicate-dispatch protection does not survive a restart.
- Browser Runtime live execution against anything other than the local sandbox is
  disconnected. Production BrowserExecutor, Vercel browser automation, live provider
  credentials, and external provider mutation remain prohibited.

## Verifying these claims

Do not take this document's word for it (ONBOARD §2, §20):

```bash
npm run validate:bpal          # BPAL execution/credential/mutation coupling guard
node --test tests/browserApproval.node.test.ts \
            tests/browserApprovalEnvelope.node.test.ts \
            tests/browserRuntime.node.test.ts \
            tests/browserSandboxProfile.node.test.ts \
            tests/browserSandboxAdapter.node.test.ts \
            tests/browserResume.node.test.ts \
            tests/browserVerification.node.test.ts \
            tests/browserRuntimeSanitization.node.test.ts
```

Key files: `saas/lib/browser-provider/vercel/vercel-browser-adapter.ts`
(`supportsProduction`), `saas/lib/browser-provider/provider-registry.ts`
(registration guard), `saas/lib/browser-runtime/launch-profile.ts` (origins,
`execute_change` rejection), `saas/lib/browser-runtime/approval.ts` (approval
bounds), `saas/lib/supervisor/executors/browser/` (dispatch boundary).

Related: `docs/browser-provider-sdk.md` (SDK reference),
`docs/red-team/mission-001-red-team-review.md`,
`docs/command-control-charter.md`, `saas/docs/console/pr-cockpit-security-model.md`.
