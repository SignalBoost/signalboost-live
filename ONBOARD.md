# ONBOARD.md

# iTMounts Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.111
**Updated:** 2026-09-11
**Canonical repository:** `SignalBoost/signalboost-live` (internal implementation name; not the public product brand)
**Canonical public product:** **iTMounts**
**Canonical public origin:** `https://itmounts.com`

## COS University terminal-practice reconciliation — 2026-09-11

Practice remediation now distinguishes a request to begin a practice round from confirmation that
the round later ended in failure. Only an explicit terminal-failure reconciliation marker makes the
reopen operation idempotent. A round whose pre-practice remediation request already matches the
current attempt can therefore still reopen study after its exercises fail, without awarding academic
credit or bypassing the fresh independent re-examination requirement.

> This file is the mandatory current-state engineering handoff. Read it before changing the repository and re-query live GitHub, Vercel, Supabase, and runtime configuration whenever the task depends on present state. The complete prior v1.77 operational history is preserved unchanged at `docs/ONBOARD-ARCHIVE-V1.77-2026-09-08.md`; Git history remains authoritative for older chronology. `SKILLS.md` remains the canonical COS University / specialist-education companion.

## Audit zero-finding scope honesty — 2026-09-11

Audit Console zero-finding states are explicitly bounded to the displayed number of scanned files.
They disclose that unscanned files and external controls were not assessed and never describe a
repository as clean or secure. A zero is an absence of supported findings in sampled scope, not a
security certification. The original brand-profile claims are guarded by narrow repository evidence
covering the session-bound anon client, owner RLS, same-origin mutation checks, SameSite cookies, and
generic client-facing database errors.

## Bounded repository-repair verification — 2026-09-11

Platform Engineer repository repair now keeps full-suite validation out of its bounded interactive
turn. Bare or piped `npm test` requests are blocked unless the host can replace them with exact
failed-test paths; the complete repository suite remains a PR CI responsibility. Owned-Audit
recovery seeds its directly relevant regression tests and explicitly requires narrow proof first.
An exit 137 is classified as execution-resource exhaustion and cannot count as reproduction evidence.
This preserves the repair investigation for a narrower proof instead of spending the turn rerunning
the 1,899-test suite.

## COS University healthy motivation and teamwork — 2026-09-10

Every registered agent now receives a transparent, host-derived motivational state from verified
academic and Production evidence. Comparable agents compete only inside the same professional role
and subject. Verified application, retention, and independently evidenced help that improves a
teammate's outcome determine standing; activity volume, confidence, self-report, and unrelated
specialties do not. Failure creates constructive recovery and additional bounded study capacity,
while a stronger comparable peer creates a healthy stretch target. Leadership requires continued
application and team contribution. Integrity violations remove competitive rank, and no motivational
state expands authority. These are functional machine incentives, not claims that agents feel emotion.

Motivation evidence is operationally bounded: expired assessments and expired assurance events are
ignored. Teamwork credit is emitted only by the authoritative verified-outcome path after a
beneficiary's independently scored improvement passes every learning-outcome gate. Integrity
penalties likewise require host-controller evidence and expire into review rather than becoming an
unreviewable permanent label.

## COS University live Production-path verification — 2026-09-10

The owner-only assurance endpoint now reads the append-only receipt ledger for the exact running
Production commit and deployment, verifies every declared University learning path, and reports
each missing, disabled, failed, stale, or unproven path explicitly. A configured route or successful
build is never presented as Production proof; all declared paths must have a fresh successful
host-verifier receipt with their feature gate enabled before the aggregate status becomes verified.

## Durable authenticated repository-patrol ingestion — 2026-09-11

Current branch `feat/security-durable-webhook-ingestion-20260911` connects the authenticated GitHub
webhook adapter to the signed Referee and an append-only Supabase evidence ledger. Supported patrol
events are accepted only after exact-body HMAC verification, signed engagement verification, exact
repository scope, expiry, kill-switch and host-limit checks. The database serializes each engagement
chain, rejects predecessor conflicts, deduplicates deliveries, stores no raw webhook body or secret,
and exposes no public RLS policy. Existing read-only GitHub provider queueing remains intact.

This branch is implementation evidence only until merged, migrated, deployed, configured with a
current signed Guardian engagement/trusted public key, and exercised by a real Production delivery.
An absent patrol engagement does not fabricate security evidence; generic provider ingestion reports
`securityPatrol: not_configured` until the governed patrol configuration is installed.

The follow-up hardening keeps this as a single ingestion path and a single evidence ledger. It rejects
partial or malformed patrol configuration, rejects malformed kill-switch values, bounds evidence-chain
loading, pins security functions to an empty search path, explicitly removes browser-role table access,
and blocks updates or deletes at the database trigger boundary. These controls still do not install a
GitHub webhook or prove live delivery; Production operation requires the migration, secrets, signed
Guardian engagement, authorized webhook configuration, and observed real delivery evidence.

Production database migration `20260911012329` now records and verifies the RPC-only hardening that
was applied after the original ledger migration: service-role direct writes and sequence access are
revoked, the append RPC is the sole write path, browser execution remains denied, its search path is
empty, and update/delete attempts are blocked by the immutable trigger. The ledger contained zero
evidence rows when this correction was verified.

## Autonomous Security Patrol / independent white-hat architecture — 2026-09-10

Owner direction: pursue a company-deployable security capability that combines continuous 24x7 defensive patrol with a separately isolated ethical-hacking assessor. The separation is intentional: a defender that knows its own environment can develop familiarity bias; the assessor must arrive as a stranger and rediscover the environment from the authorized starting position.

Canonical roles:

- **Guardian Agent** — resident internal defender. It may continuously observe authorized enterprise telemetry, learn the environment, correlate anomalies, investigate incidents, recommend or perform policy-authorized containment/remediation, invoke Self-Healing Supervisor capabilities, and verify recovery. Guardian is expected to know the environment deeply.
- **Stranger Agent** — independent white-hat assessor. It must not inherit Guardian/COS/Enterprise Memory, topology, prior vulnerabilities, incident history, credentials, remediation knowledge, or earlier assessment discoveries except what the signed engagement manifest explicitly grants. Each engagement receives isolated state so the Stranger must discover the authorized environment rather than being told where weaknesses are.
- **Referee / Policy Engine** — deterministic host-controlled authorization boundary. It owns target scope, permitted test classes, credentials/access posture, engagement start/end, rate limits, concurrency, safety limits, approver identity, evidence policy, and emergency stop. Neither Guardian, Stranger, COS, learning, nor a specialist may rewrite or expand this authority through reasoning.

Supported assessment postures may include, only when explicitly authorized by the engagement manifest:

1. internet stranger / unauthenticated external perspective;
2. contractor or vendor with bounded remote access;
3. ordinary employee identity;
4. assumed-compromised endpoint;
5. privileged-insider perspective.

The assessment posture is input to the Referee, not a shortcut around it. A Stranger engagement that models an insider may receive only the exact knowledge/credentials required for that scenario.

Canonical operating loop:

```text
Guardian: observe -> reason -> investigate -> contain/repair -> verify -> continue patrol

Stranger: receive signed scope -> discover -> assess -> validate authorized findings
          -> preserve evidence -> report -> end isolated engagement

Referee: authorize/deny every active action and stop the engagement when scope/time/policy expires

After remediation: launch a fresh isolated Stranger retest -> verify the weakness independently
```

The Guardian and Stranger are deliberately asymmetric: **the defender may know everything it is authorized to know; the attacker starts knowing almost nothing beyond the engagement contract.** This is a product feature, not an inconvenience.

Non-negotiable boundaries:

- no target, identity, network, cloud account, application, tenant, or action outside the signed engagement scope;
- authorization expires automatically at the engagement boundary and fails closed when ambiguous;
- no persistence, stealth/evasion, destructive behavior, credential theft/exfiltration, or unrestricted lateral movement by default;
- active validation must be explicitly permitted by action class and remain bounded/non-destructive;
- deterministic target/scope matching is authoritative over model reasoning;
- rate limits, concurrency ceilings, blast-radius limits, and an emergency kill switch are host-enforced;
- every consequential action and finding produces tamper-evident audit/evidence records sufficient to reconstruct what was attempted, allowed/denied, observed, changed, and verified;
- learning may improve detection, prioritization, investigation, explanation, remediation, and test selection, but **learning never widens authorization**;
- Stranger state/memory isolation is mandatory and may not be bypassed merely because Guardian, COS, Self-Healing Supervisor, or Enterprise Memory already knows the answer;
- Guardian-to-Stranger disclosure is prohibited during a blind engagement unless the manifest explicitly defines that disclosure as part of the scenario;
- Stranger findings may be released to Guardian/Self-Healing only after the governed evidence boundary permits it, after which remediation and a fresh independent retest may occur;
- customer deployment may be container, VM, appliance/portable, or another isolated enterprise-hosted form, but deployment form never weakens the authorization boundary.

Implementation order for this capability:

```text
1. signed engagement + authorization/scope schema
2. deterministic Referee / policy enforcement + expiry + kill switch
3. Guardian/Stranger identity and memory isolation
4. passive inventory/telemetry and evidence pipeline
5. safe discovery and vulnerability assessment
6. Self-Healing/Guardian remediation handoff and proof
7. separately gated controlled validation
8. fresh isolated Stranger retest and measurable security-improvement evidence
```

Do not begin with unrestricted exploit execution. Establish the authorization, role isolation, evidence, and fail-closed control plane first.

**Current status:** this section records the accepted architecture/direction. It is not evidence that the Autonomous Security Patrol or Stranger ethical-hacking capability is already implemented or Production-ready.

## Autonomous Security Patrol expansion: repo, IP and defensive counterintelligence — 2026-09-10

The security mission covers the enterprise **inside and outside the running application**. Guardian must eventually treat the software-development/supply-chain environment and information-exposure surface as first-class patrol zones rather than assuming runtime telemetry is the whole security boundary.

Canonical patrol surfaces:

```text
1. Runtime / enterprise patrol
   endpoints, servers, identities, applications, cloud, network, databases, logs and configuration

2. Repository / software-supply-chain patrol
   repositories, commits, branches, pull requests, dependencies, CI/CD, workflow changes,
   build artifacts, code-signing/provenance, secrets exposure, IaC/config drift and deployment lineage

3. Intellectual-property / reconnaissance patrol
   authorized repository access patterns, sensitive-project access, mass clone/download behavior
   where observable, public metadata and information exposure, roadmap/research leakage,
   and combinations of benign-looking public signals that reveal protected work
```

The repository patrol is not merely another application feature. Where architecture permits, its monitoring/evidence path should remain independently observable so compromise of the application does not automatically blind the repository/supply-chain defender. Conversely, runtime Guardian evidence must be able to identify compromise caused by an apparently normal repository or deployment change.

When authorized telemetry indicates a suspected intrusion, intellectual-property theft, insider-risk event, repository compromise, or espionage/reconnaissance attempt, Guardian must open a durable **Incident Evidence Record** and preserve the maximum relevant evidence legitimately observable within scope. Depending on the environment this may include timestamps, source/destination IP and ports, ASN/provider, geolocation estimate, authenticated account/session identity, authentication method, device/client characteristics, failed/successful login activity, targeted systems/files/repos, commands or API calls when recorded, repository clone/download/change activity where observable, process/file hashes, network connections, privilege changes, data-access scope, persistence indicators, containment actions, remediation, and verification results.

Evidence and attribution are separate:

- observed facts are recorded as evidence;
- inferred identity, affiliation, intent, campaign relationship, or state/organizational attribution is a hypothesis with explicit confidence and competing explanations;
- IP address, country estimate, language, timezone, ASN, device signal, or account identity alone does not prove who the human intruder is;
- VPNs, proxies, Tor, cloud relays, compromised hosts, shared infrastructure, stolen credentials, and spoofed indicators must remain live alternative explanations when applicable.

For serious incidents, the evidence system should support a tamper-evident case package suitable for authorized review by company security, counsel, insurers, CERT/CSIRT teams, regulators, law enforcement, or other competent authorities. The package should preserve original timestamps, hashes/integrity proofs, provenance, chain-of-custody events, affected assets, actions taken, and an explicit separation of observation from inference. **Evidence preservation never grants external-disclosure authority by itself.**

Defensive counterintelligence is now a formal University/specialist direction. `SKILLS.md` defines the graduate specialization and `docs/defensive-counterintelligence-adversary-studies.md` defines its detailed curriculum. The learning objective is to study adversary tactics, insider-risk patterns, cyber/industrial espionage cases, repository/supply-chain compromise, social engineering, exfiltration patterns, detection engineering, digital forensics, attribution discipline, and defensive countermeasures so defenders recognize and defeat those behaviors.

Learning adversary tactics never widens operational authority. No learned technique, specialist degree, confidence score, or threat severity grants permission for hack-back, retaliatory intrusion, destructive action, out-of-scope surveillance, credential theft/exfiltration, or targeting third parties. Active Stranger validation remains separately isolated and Referee-governed under the signed engagement manifest.

Defensive deception may later include governed canary documents/tokens, honey services, decoy repository paths/assets, or other non-harmful tripwires. These mechanisms must be designed to detect unauthorized access without harming unrelated people, creating unsafe credentials, or manufacturing attribution.

**Current status:** this section records accepted architecture, curriculum linkage, and evidence requirements. It is not a claim that repo patrol, counterintelligence automation, forensic packaging, or authority-support integrations are already implemented or Production-ready.

## COS University remediation source diversification — 2026-09-10

Failed-exam remediation preserves all learning-admission and examiner-isolation gates while rotating
the leading host-owned curriculum theme on each 15-minute learning slot. Acquisition connectors use
that rotated curriculum focus before the broad subject label, while relevance evaluation continues
to use the complete subject and question. A plan that rejects one result set as duplicate, irrelevant,
or low-confidence therefore searches a materially different focus instead of acquiring the same
eleven weak documents forever. The gap identity, curriculum, hidden examination, and evidence
thresholds do not change.

## COS University automatic Production-outcome correlation — 2026-09-10

Authoritative Production outcome ingestion can now carry agent- and subject-scoped University
evidence. The existing verified-outcome recorder automatically converts that envelope into the
immutable learning-assurance ledger, using the authoritative outcome reference as practical proof.
No University claim is created without an explicit academic envelope, and the normal retention,
transfer, independent-scoring, source-attribution, sample-size, and measured-improvement gates remain.

## COS University real-world outcome evidence — 2026-09-10

The assurance ledger now accepts immutable, agent- and subject-scoped learning-outcome decisions.
Promotion requires an improved post-study score, unseen transfer, practical execution with a measured
Production improvement, delayed retention, verified source attribution, and independent scoring.
Missing or regressed evidence is recorded as a failed decision and cannot be presented as learning.

## COS University delayed-retention execution — 2026-09-10

University delayed retention is now an explicit independently scored academic stage and scheduled
Production path. After at least 14 days, the host replays a previously passed hidden cross-domain
transfer case with cache and external-AI credit prohibited. The replay cannot count as a new
holdout variant, and a Production pass cannot raise a subject to A without retained transfer.

## COS University owner-directed study bridge — 2026-09-10

Newly admitted owner-fed books, articles, video transcripts, documentation, and notes are attached to durable COS University study plans and receive non-credit study proof. Duplicate or rejected chunks do not manufacture a new attempt. The owner dashboard reports whether University recording succeeded. This bridge never writes assessment evidence or awards a grade; unseen transfer and delayed-retention gates remain independent.

## COS University enrollment contract — 2026-09-10

Every AI agent may enroll without first proving that it is a qualified learner. Enrollment assigns
the program's required curriculum. The agent graduates only after passing every required subject
and the remaining graduation gates. A subject failure triggers remediation and re-examination; it
never disqualifies the enrolled agent from learning. Fine-tuning readiness applies to a governed
training method or model artifact, not to the agent's right to attend the University.

## COS University Production acceptance instrumentation — 2026-09-10

Every scheduled University route now writes a deployment- and commit-bound Production receipt to
the append-only assurance ledger. Receipts prove route execution only; they never claim learning or
mastery. The controlled fine-tuning cron packages candidates produced by repeated independent
failure, cryptographically separates training and holdout manifests, and records fail-closed host
decisions. It cannot train or promote without separate approvals and post-training independent,
safety, transfer, retention, canary, and rollback evidence.

## COS University advanced professional curricula — 2026-09-10

The shared A/A+ generalist foundation remains mandatory. Five additional Master's tracks provide
advanced education in aerospace/nuclear safety systems, molecular/biomedical sciences,
neuroscience/biophysics, actuarial/insurance risk, and quantum/theoretical physics. Existing
quantitative and enterprise programs now explicitly include formal epistemology, calibration,
mechanism design, organizational anthropology, field operations, rhetoric, and crisis leadership.
Every track retains independent examination, unseen transfer, verified practical work, and capstone
requirements; document exposure or simulation alone does not graduate an agent.

## COS University role-to-curriculum assignment — 2026-09-10

Host-controlled AI roles now map deterministically to the matching advanced program and its complete
module list. The role assignment is considered only after the common undergraduate credential is
awarded, overrides accidental strongest-subject ranking at Master's admission, and never expands
authority. COS remains on generalist continuing education unless a separate specialist role is
explicitly assigned.

## COS University autonomous registered-agent cycle — 2026-09-10

A bounded, secret-gated Production cycle now enumerates the durable University agent registry,
automatically enrolls every registered identity through the same host admission gate, reads its
evidence-backed academic record, and routes its next action to study, remediation, independent
examination, or completed graduation. Missing evidence never becomes a pass or credential.

## COS University multi-agent independent examinations — 2026-09-10

The undergraduate independent-exam worker now accepts a durable agent identity. Exam run keys,
assessment reads, and assessment writes are isolated by that identity, while host-generated hidden
exams and independent scoring remain unchanged. The autonomous registered-agent cycle executes
eligible exams directly rather than only reporting that an exam is due.

The canonical `software-specialist` identity is registered under the software-engineering role and
therefore enters the common undergraduate curriculum before its advanced specialist program.

## COS University multi-agent continuous study — 2026-09-10

The continuous University learner now carries each registered agent identity through academic-state
reads, study-plan creation, material acquisition, accepted-study proof, and failed-exam remediation.
Specialist plan keys and learning slots are isolated so one agent cannot consume another agent's
study attempt or remediation. The registered-agent cycle now executes study/remediation work as well
as independent exams; accepted material remains non-credit until independent assessment succeeds.

## COS University multi-agent deliberate practice — 2026-09-10

The autonomous registered-agent cycle now reconciles terminal deliberate-practice failures for the exact agent identity after each practice execution. A specialist failure reopens that specialist's study attempt; it cannot be stranded by COS-only reconciliation, transferred across identities, or treated as academic credit.

The deliberate-practice worker now carries the enrolled agent identity through study-plan reads,
proof fences, practice-skill provenance, queue metadata, stale recovery, claim validation, and
execution reconciliation. The registered-agent cycle launches bounded practice after accepted study.
Practice remains non-credit and cannot substitute for an independent exam.

Practice eligibility follows durable accepted-study proof, not whether the same scheduler tick
acquired another document. A registered agent therefore cannot lose its practice turn merely
because its prior study is already current.

The registered-agent cycle now gives identity-scoped `ready_for_exam` plans priority over generic
academic routing, examines the exact subject or language dimension, and reconciles the plan only
from the independent result. Passing completes the plan; failure supersedes it so the existing
failure-remediation path can create a fresh study attempt.

## COS University remediation re-exam identity — 2026-09-10

An independently failed exam and the fresh exam after study/practice must never share the ordinary
daily run key. Ready-plan examinations use a stable identity scoped to agent, study-plan id, study
attempt, and exact subject/language target. Retries of the same attempt remain idempotent, while a
new remediation round receives a new hidden seed and unseen exam. Ordinary scheduled exams retain
their daily idempotency. A prior terminal exam can therefore no longer complete or supersede newly
earned `ready_for_exam` evidence without executing the plan-bound re-examination.

The learner also repairs the legacy collision state when the latest failed exam still owns a
superseded plan containing both host-accepted study proof and completed deliberate-practice proof.
Recovery restores only `ready_for_exam`; it grants no grade or academic credit, and the new
independent examiner remains authoritative.

## COS University applied-knowledge qualification — 2026-09-10

Knowledge becomes qualification only when it improves independently verified real work. The
registered-agent cycle now converts an agent-scoped, independently scored learning-outcome assurance
event into the existing `production_transfer` stage only after revalidating baseline improvement,
unseen transfer, practical execution, delayed retention, source attribution, a nonzero real-world
sample, and a better measured outcome. This applies to COS and every registered specialist.

A degree is not permission to abandon the discipline. The agent's host-assigned role continues to
control its specialist curriculum and work routing after graduation. Current competence remains
separate from the immutable historical credential: applied evidence expires, later failure weakens
standing, and missing recent application triggers continuing education/recertification. Cross-domain
help is allowed, but it does not replace applying the agent's assigned specialty when relevant,
authorized work exists.

---

# iTMounts public brand and domain cutover — 2026-09-08

The owner selected **iTMounts** as the canonical public product identity. The rename is a public-brand/domain migration, **not** a fork of the platform and not a blind rename of internal implementation identifiers.

## Exact public spelling

The public brand is always:

**iTMounts**

Rules:

- lowercase `i`;
- uppercase `T`;
- uppercase `M`;
- lowercase `ounts`;
- one word, no space;
- domain names remain lowercase as normal: `itmounts.com`.

Do not introduce `ITMounts`, `ItMounts`, `iT Mounts`, `itMounts`, `SignalBoostAi`, `SignalBoost AI`, or `SignalBoost` as a new customer-facing product label.

## Public tagline

Canonical public tagline:

**AI software that works for you**

## Concierge wording

The homepage Concierge eyebrow is fixed as:

**`YOUR iTMounts CONCIERGE`**

The public assistant is **iTMounts Concierge**. COS remains the internal intelligence/orchestration name and is not renamed merely for branding.

Public copy should prefer Concierge language rather than exposing internal architecture unnecessarily. A public surface may invoke COS behind the scenes, but COS remains the brain and Concierge remains the public delivery layer.

## Logo / wordmark direction

Approved direction:

- compact Roman-style **iTMounts** wordmark;
- mounted-`T` icon/base motif;
- keep the mark small in the existing navigation footprint rather than using an oversized presentation logo;
- mounted-`T` app/favicon asset direction is implemented at `saas/app/icon.svg`;
- preserve the current dark product UI unless a separate design task explicitly changes it.

The wordmark is the primary logo; the mounted-`T` mark is the compact icon/fav/app-mark treatment.

## Canonical public domain

Canonical public application origin:

`https://itmounts.com`

The owner purchased `itmounts.com` through GoDaddy. DNS was connected to the existing Vercel project; no new backend or cloned application was created.

Observed DNS/application setup from the owner-guided cutover:

```text
GoDaddy apex A record:
@ -> 216.150.1.1

GoDaddy www record:
www -> itmounts.com

Vercel:
itmounts.com     -> Production
www.itmounts.com -> 308 Permanent Redirect -> itmounts.com
```

Both `itmounts.com` and `www.itmounts.com` were observed by the owner as **Valid Configuration** in Vercel. The owner then opened `https://itmounts.com` successfully and separately verified that `https://www.itmounts.com` changes to `https://itmounts.com`.

Do not add a second backend, second Supabase project, second COS, second Builder, or cloned runtime for the new domain. The domain points at the existing platform.

## Public origin architecture

The public-origin migration keeps the same:

- Vercel / Next.js application;
- Supabase/database;
- COS;
- Concierge;
- Software Specialist;
- Builder;
- Platform Engineer owner-repair capability;
- APIs;
- jobs / durable History;
- cron jobs;
- learning stores;
- provider integrations;
- governed execution boundaries.

The new domain changes the customer identity/origin, not the platform architecture.

## Merged public-brand implementation

PR **#1992** — `feat(brand): launch iTMounts public identity on itmounts.com`

Accepted scope:

- canonical public brand config uses **iTMounts**;
- canonical public site URL uses `https://itmounts.com`;
- public metadata / application name / OpenGraph / organization schema use the public brand seam;
- public footer uses iTMounts;
- translated display copy routes legacy public brand text through the public-brand seam;
- public Concierge display copy uses iTMounts;
- compact Roman-style navigation wordmark direction added;
- mounted-`T` favicon/app mark added;
- backend/COS/Builder/repository/database identifiers are not blindly renamed.

PR **#1994** — `fix(brand): preserve iTMounts casing in legacy public copy`

Reason for the follow-up: an uppercase rendered string such as `YOUR SIGNALBOOST CONCIERGE` survived the first display transformation even though the header already showed iTMounts. #1994 made legacy public-brand replacement case-insensitive and added regression coverage so upper/lowercase legacy display variants resolve to **iTMounts** while implementation identifiers remain intact.

#1994 merged as `5d01c06cc75952365d436b2053cf62a4ad949de9`. Vercel Production deployment `dpl_GGqzT5NF9FamQ34PW7AMmPy2ccJc` was observed **READY**. Subsequent current-main work must preserve this brand contract.

## Public SignalBoost removal rule

**All customer-facing SignalBoost branding is retired.**

On rendered public/customer surfaces, public metadata, authentication copy, emails intended as product branding, social/share metadata, browser-sandbox labels, public docs/marketing copy, and translated UI strings:

```text
SignalBoostAi  -> iTMounts
SignalBoost AI -> iTMounts
SignalBoost    -> iTMounts
```

The replacement must be case-insensitive for display strings so `SIGNALBOOST` cannot leak through.

This does **not** authorize a repository-wide search/replace. Internal/historical `SignalBoost` identifiers may remain when they are implementation/history rather than public branding, including:

- repository owner/name;
- database/migration identifiers;
- internal service names;
- historical PR/deployment evidence;
- old branch names;
- internal code symbols where renaming would create unnecessary risk;
- legacy contact addresses;
- archived ONBOARD history;
- legacy domain references required for migration/compatibility checks.

The public brand layer and the implementation layer are deliberately separated.

---

# Legacy SignalBoost domain boundary

Current legacy compatibility origins are not the canonical product address:

- `saas.signalboostapp.com` — legacy production-compatible origin;
- `www.saas.signalboostapp.com` — legacy redirect to the old apex/subdomain;
- `signalboost-live.vercel.app` — Vercel project origin/alias.

Do not market these as the public iTMounts address.

## Intended final legacy redirect

After the hostname-dependency audit is complete, the intended compatibility behavior is:

```text
https://saas.signalboostapp.com/<path>
    -> 308 Permanent Redirect
https://itmounts.com/<path>
```

`www.saas.signalboostapp.com` should ultimately land on the same canonical iTMounts origin.

**Do not switch the old production origin to a permanent redirect until the hostname-sensitive dependency audit is complete.** The goal is to avoid breaking auth, callback, cookie, payment, or email flows while still making iTMounts canonical.

## Hostname-dependency audit before retiring the old origin

Verify/update every dependency that materially depends on the public origin:

1. Supabase Auth Site URL.
2. Supabase allowed redirect URLs.
3. OAuth provider callback/redirect URLs.
4. Password-reset links.
5. Magic-link / email-auth destinations.
6. Stripe success/cancel/return URLs where applicable.
7. Stripe webhook assumptions only where hostname-dependent.
8. CORS allowlists.
9. CSP origin rules.
10. Cookie domain / secure-cookie assumptions.
11. Environment variables containing absolute public URLs.
12. Canonical metadata.
13. Sitemap URLs.
14. `robots.txt` references where applicable.
15. OpenGraph/social share URLs.
16. Product email links/templates.
17. Public documentation links.
18. Hard-coded `saas.signalboostapp.com` references that are true runtime/public-origin dependencies rather than historical/internal evidence.

After these are verified, change the old SignalBoost SaaS origin to a path-preserving 308 redirect and verify auth, Concierge, Builder, billing, email, and principal public routes through `itmounts.com`.

Keep ownership of `signalboostapp.com` for legacy/corporate/internal compatibility unless the owner separately decides otherwise.

---

# Mandatory first-read / repo-scan rule

Every developer, AI coding agent, reviewer, operator, contractor, specialist, or infrastructure assistant working in this repository must:

1. Read the current root `ONBOARD.md` first.
2. Read `SKILLS.md` for COS learning, grading, graduation, remediation, and graduate-specialist architecture when relevant.
3. Query current `main` before changing anything.
4. Inspect current open PRs and concurrent work that could overlap.
5. Query exact Vercel Production/Preview state when deployment truth matters.
6. Query current Supabase migrations/schema when database truth matters.
7. Read the exact task-related files before editing.
8. Re-scan after `main` advances or when concurrent agents may have changed the task area.
9. Verify implementation/runtime behavior from code plus actual evidence rather than memory.
10. Never report a merge, deployment, fix, or acceptance as complete without the corresponding evidence.

This is mandatory because multiple developers/agents may work concurrently. Stale repository context is not acceptable evidence.

The prior v1.77 detailed history remains available at:

`docs/ONBOARD-ARCHIVE-V1.77-2026-09-08.md`

Read that archive when older implementation chronology, exact historical deployment IDs, or prior acceptance boundaries are relevant.

---

# Repository write / integration discipline

Current integration contract for PRs targeting `main`:

- do not write directly to `main`;
- create/update a task branch from current `main`;
- every PR targeting `main` must modify `.github/main-write-token`;
- the token must identify the exact current PR base SHA and exact PR branch;
- PR body must carry the exact current `ONBOARD_ACK_BLOB` and `REPO_SCAN_HEAD` required by Onboarding Enforcement;
- include the current `SKILLS_ACK_BLOB` when relevant / available;
- if `main` advances, re-scan/reconcile and refresh the integration token/acknowledgements rather than merging stale work;
- required checks and applicable Vercel Preview must be green before integration;
- merge to `main` through GitHub's **merge** method, not a direct/squash/rebase write that violates the repository's integration history rules;
- use the expected PR head SHA when merging;
- after merge, verify the merged PR state, new main SHA, two-parent merge commit, and applicable Production health.

An explicit owner request such as `go`, `commit and merge`, or an already-authorized routine repair is execution authority only within these repository controls. It does not turn a red/stale PR into a safe merge.

---

# Core product architecture

Canonical topology:

```text
Customer / owner goal
      |
      v
Concierge / Owner Assistant / delivery surface
      |
      v
COS — sole generalist brain, intent owner, orchestration and final judgment
      |
      +--> Software Specialist
      |      +--> Builder (sandboxed app/code work)
      |      +--> Platform Engineer (owner-gated repository repair)
      |
      +--> Security / Marketing & Sales / Design / Finance /
           Operations / Research / future specialists
      |
      v
structured evidence/results/uncertainty
      |
      v
COS review / synthesis / governed action or answer
```

## COS

COS means **Chief of Staff** for the owner-facing role and remains the internal reasoning/orchestration brain.

COS responsibilities include:

- understand the real goal rather than merely classify keywords;
- perform available authorized research/verification rather than assign routine investigation back to the owner;
- coordinate specialists while retaining final responsibility;
- distinguish evidence from inference;
- challenge weak proposals;
- track real persisted commitments/blockers without inventing tracking;
- act autonomously on routine reversible work within authorization;
- escalate consequential or difficult-to-reverse actions at the appropriate boundary;
- learn from governed evidence, practice, independent exams, outcomes, and failures.

The public iTMounts rename does not change COS's internal name or role.

## Concierge

Concierge is the **public face / delivery layer**, not a separate brain.

Rules:

- public Concierge uses COS in public scope;
- public scope must never inherit private owner/admin/company context merely because the browser is authenticated;
- public product branding is **iTMounts**;
- public Concierge must not expose internal Enterprise Memory, private Knowledge Graph, internal repository/admin tools, secrets, private strategy, or owner-only context;
- public failures fail safely rather than falling into a private backup brain;
- public provenance comes from recorded turn provenance, not model reconstruction;
- users should receive useful trial value before being forced to register where the product contract allows it.

**COS is the brain. Concierge is the public face.**

## Specialists

Specialists are expert workers under COS, not independent competing brains.

- broad professional proficiency first, specialization second;
- specialist depth never widens authorization by itself;
- specialists return evidence/results/uncertainty through COS;
- COS may challenge, combine, or reject specialist outputs;
- multiple specialists may be assembled for cross-domain work;
- a degree, benchmark result, or specialist label never grants spending, merge, production, tenant, or approval authority.

## Software Specialist

Canonical family: `software`.

Initial capability family includes:

- `software.analyze`;
- `software.build`;
- `software.repair`;
- `software.platform-repair`;
- `software.verify`.

Builder and Platform Engineer are capabilities of the Software Specialist, not separate brains.

### Builder

Builder is the sandboxed engineering environment for creating, editing, running, testing, debugging, and repairing user/project code.

Owner goal: **a complete harness engineering experience/environment**, not a one-shot code generator.

Builder should support connected:

1. project context;
2. inference/reasoning;
3. file/dependency/command execution;
4. fresh verification and repair;
5. durable task/project/conversation continuity;
6. permission isolation and interruption recovery;
7. truthful evidence-based explanation/guidance.

For repairs, completion requires evidence, not prose:

```text
reproduce / prove failure
-> change
-> rerun the same relevant proof
-> pass
```

A diagnostic command such as `git log`, `grep`, `sed`, or `cat` is not a passing regression proof. Test/build/typecheck/lint or another task-specific proving command must close the loop.

The repository-repair proof controller added in #1981 forces the relevant proof before mutation and after mutation rather than relying only on the model to remember to rerun it. Narration must not call a diagnostic failure a reproduced regression.

Builder may explain a failure, but explanation cannot replace execution when the user asked to fix it.

### Platform Engineer

Platform Engineer is the owner-authorized repository-repair capability of the Software Specialist for the configured iTMounts platform repository.

Authority remains bounded:

- owner/project/deployed-target verification before repository repair;
- ephemeral staged repository;
- no inheritance of broad credentials;
- network denied after allowed preparation where required;
- no secret disclosure;
- no autonomous widening of repository/Production authority;
- repair must produce fresh proof;
- repository integration still follows main-write/PR/merge governance.

---

# Concierge visual-continuity repair — 2026-09-09

Current repair branch: `fix/concierge-visual-continuity-identity-20260909` (not Production until merged and deployed).

The reported iTMounts logo conversation exposed four coupled defects: elliptical visual follow-ups lost their earlier user-supplied logo objective; ordinary text synthesis replaced requested execution; success copy could survive without a renderable preview/download artifact; and a public employer question reached model inference and invented a government affiliation.

Repair contract:

- resolve short visual revisions only from an earlier explicit **user** visual request in the same submitted conversation;
- never treat assistant prose as authority for follow-up routing;
- unrelated requests exit the visual lane;
- visual delivery success requires a renderable preview/download artifact;
- public Concierge identity questions use deterministic product identity and never invent employment or government affiliation;
- the exact reported six-turn transcript is a mandatory regression.

# Public Concierge company identity repair — 2026-09-09

The public model prompt still described the retired product name as authoritative after the iTMounts cutover. A live question asking for the company's name therefore returned SignalBoost even though rendered UI branding was correct.

Repair contract:

- public Concierge system prompts pass through the canonical `publicBrandText` seam before inference;
- internal COS presentation labels resolve to `PUBLIC_BRAND.name`, never a hard-coded legacy brand;
- direct public company-name questions resolve deterministically to **iTMounts**;
- legacy repository/service/domain identifiers may remain internal but cannot override public product identity;
- the reported logo-then-company-name exchange is a mandatory regression.

# Runtime inference / provider source of truth

The model/provider is replaceable compute. **COS is the learner.**

Never treat a source-code model string, old deployment observation, ONBOARD entry, or model memory as current runtime truth.

Current runtime identity must come from verified live configuration/telemetry.

Relevant runtime variables include:

```text
LOCAL_AI_BASE_URL
LOCAL_AI_ALLOWED_HOSTS
LOCAL_AI_MODEL
DEEPINFRA_BUILDER_MODEL
LOCAL_AI_EMBEDDING_MODEL
LOCAL_AI_REASONING_EFFORT
LOCAL_AI_MANAGED_PROVIDER
LOCAL_AI_API_KEY   # server-side secret; never print/commit
```

`DEEPINFRA_BUILDER_MODEL` is required for Builder/Platform Engineer execution. Missing/blank configuration fails closed; do not silently select a model from source, docs, memory, or an old accepted run.

RunPod is retired from the active architecture. Do not reintroduce it as a reasoner, embedding, or compute dependency merely because dormant legacy code/history mentions it.

---

# COS learning / University contract

`SKILLS.md` is the detailed canonical education blueprint. This section records the operational invariants that every implementation must preserve.

COS is developed as an elite multidisciplinary **generalist first**. Specialists add depth after/alongside evidence-gated foundations; they do not replace COS.

Canonical learning loop:

```text
perform
-> observe objective outcome
-> identify weakness / subject / competency
-> acquire appropriate governed material if needed
-> study
-> deliberate practice
-> use tools / perform authorized work where capability requires action
-> independent unseen exam
-> transfer exam
-> Production outcome evidence where applicable
-> retain / strengthen / remediate / weaken / quarantine
```

Key rules:

- reading a source is not mastery;
- embedding a document is not competence;
- queue counts are not learning proof;
- self-generated practice is not independent validation;
- model self-assessment never earns a grade;
- a failed exam must trigger useful remediation, not evaluator weakening;
- mutable current-world facts remain live-evidence problems rather than timeless learned facts;
- garbage-in/garbage-out remains controlling: learn what improves COS, a specialist, or active work—not what merely increases corpus size;
- verified specialist lessons should flow back to COS when generalizable;
- authority and expertise remain separate axes;
- A/A+ / Master's / PhD labels require independent evidence defined in `SKILLS.md`.
- University study plans use an explicit hybrid machine-adapted learning design: supervised,
  unsupervised, semi-supervised, self-supervised, reinforcement/verified-feedback, RAG where
  appropriate, and controlled fine-tuning candidacy across structured, semi-structured, and
  unstructured material;
- promotion requires independently measured improvement, unseen transfer, practical execution,
  delayed retention, and source attribution; exposure or embedding never counts as learning.

Feed COS remains the normal owner learning intake. Material may be routed deeper to relevant specialists without requiring the owner to paste the same material into each worker.


## University learning assurance — 2026-09-10

Current branch `feat/cos-university-learning-assurance-20260910` adds three host-controlled seams:

- controlled fine-tuning remains disabled/candidate-only until dataset and training approvals,
  cryptographic training/holdout separation, independent improvement, safety and transfer passes,
  delayed retention, a healthy Production canary, and a rollback artifact are all present;
- every feature-gated University learning path is declared in one registry and Production proof must
  match the deployed commit, enabled gate, successful invocation, durable evidence, host verifier,
  and a fresh observation window;
- learning promotion requires baseline-to-post-study gain, unseen transfer, practical evidence,
  delayed retention, source attribution, and an improved real-world outcome with nonzero samples.

The append-only `cos_university_learning_assurance_events` ledger stores host evidence for these
decisions. This implementation is the control/evidence foundation; it is not itself a claim that a
model was fine-tuned or that all Production paths have already produced valid receipts.

Production follow-up found that the first assurance registry grouped or omitted several scheduled
routes. The v1.84 repair enumerates subject and language A-range, Master's admission/progress, and
PhD admission/progress independently, with a regression that fails whenever any scheduled
`cos-university-*` route lacks an explicit assurance mapping.

## Builder University Production outcomes — 2026-09-10

Builder now sends every generation-fenced terminal job result into the authoritative verified
Production-outcome recorder for the enrolled `software-specialist` and `computer_science` subject.
Host-proven workspace execution with a proving command after the final mutation, or a healthy
watched Production merge/deployment, may be recorded as success;
a completed patch/review artifact without Production proof is only observed, and a terminal job
failure remains failure. Delivery is idempotent per job claim and evidence-recording failure cannot
undo the already-persisted Builder result.

Repository repairs paused for asynchronous merge reconciliation emit no early outcome. Their
generation-scoped evidence is written only after the lifecycle's fenced terminal merge or
superseded-base update, preventing a pre-terminal observation from consuming the final evidence key.
The runner infers this pending state directly from the raw repository writeback fields, before the
database transition adds `repository_merge_pending`. A healthy Production watch records success, a
rolled-back deployment records failure, and an unresolved or non-Production watch remains observed.

This is raw real-world evidence, not an academic grade. Builder never constructs its own University
baseline, transfer, retention, attribution, or independent-scoring envelope. The University
controller must correlate those independent records before #2048's promotion path may treat a
successful Builder outcome as practical learning proof.

---

# Freshness / evidence rules

For mutable external facts, current evidence wins over pretrained/model memory.

- ordinary external factual lookups live-verify by default when the fact can change;
- historical/conceptual questions may use timeless/local reasoning where appropriate;
- private iTMounts system-of-record questions stay internal;
- current officeholders, law/rules, security/CVEs, releases/versions, finance, weather, sports, and similar mutable facts require fresh evidence appropriate to the claim;
- authority-owned questions prefer first-party/institutional evidence;
- secondary evidence must not be presented as the owning rule when authoritative evidence is absent;
- successful retrieval is not successful synthesis;
- a bounded retry of local synthesis does not permit weaker grounding or external/model-memory fallback;
- source date and authority still matter even when a page was retrieved now.

No model-memory assertion becomes authoritative merely because the model sounds confident.

---

# Security / governance invariants

Non-negotiable:

- never hard-code or expose provider secrets;
- owner/admin routes remain server-gated;
- cron routes remain protected;
- preserve tenant/org scoping and RLS/service-role assumptions;
- no unauthenticated Production validation backdoors;
- external/managed providers never become governance authority;
- unknown/consequential/destructive/financial/security actions fail closed or require the applicable approval boundary;
- routine reversible work should proceed autonomously when already authorized rather than asking for unnecessary approval;
- learned retrieval/worker/tool/skill preference cannot widen authorization;
- specialist expertise/degree cannot widen authorization;
- autonomous security roles remain knowledge- and authority-separated: Guardian familiarity must not contaminate blind Stranger assessments;
- every Stranger/ethical-hacking engagement requires a host-enforced signed scope with expiry, permitted action classes, rate/blast-radius limits, audit evidence, and kill switch; AI reasoning cannot widen it;
- defensive counterintelligence/repo patrol may preserve authorized security evidence but may not perform hack-back, retaliatory intrusion, out-of-scope surveillance, or assert identity/affiliation from weak indicators;
- incident evidence and attribution must remain separate, with confidence-qualified inference and tamper-evident provenance/chain-of-custody support;
- no hidden chain-of-thought persistence;
- private certification prompts/rubrics must not be exposed or committed without an explicit protected diagnostic need;
- public Concierge never inherits owner/admin/private-company context merely because the browser is owner-authenticated;
- public provenance comes from recorded turn telemetry, not model reconstruction;
- OAuth/token material remains server-side and encrypted where the connector contract requires it;
- read-only connector scopes must not silently become write/content scopes;
- capability discovery/grants do not themselves authorize execution;
- Data Center Operations Phase 1 remains advisory/read-only unless a separately governed control phase is explicitly accepted;
- a branding/domain migration must not weaken security, auth, payment, tenant, or evidence boundaries.

Never weaken evidence gates, private holdouts, authorization, tenant isolation or lifecycle rules merely to make a dashboard green.

---

# Status language — mandatory precision

Use actual states, not optimistic shorthand.

A branch is not Production. A green build is not capability acceptance.
Verify implementation and runtime behavior from code plus live evidence before diagnosing or reporting status.

A plan is not execution.  
A branch is not Production.  
A queue row is not a completed action.  
A green build is not capability acceptance.  
A Preview fix is not a Production fix.  
A deployment marked READY is not proof every user flow works.  
An encountered skill is not validated learning.  
A self-generated practice pass is not independent validation.  
A model claim is not host evidence.  
A diagnostic read is not regression proof.  
A successful retrieval is not necessarily successful grounded synthesis.  
A current page may contain stale content.  
A metadata-only Drive permission is not authorization to read Drive file contents.  
A capability grant is not execution delegation.  
An MCP-compatible port is not a hosted MCP endpoint.  
A correlated alert cluster is not proven physical root cause.  
A specialist's expertise is not permission to widen authority.  
A legacy domain still serving the app is not the canonical public origin.  
A public brand transform is not permission for a blind internal rename.

---

# Immediate iTMounts migration priorities

1. Preserve exact public spelling **iTMounts** and exact homepage eyebrow **`YOUR iTMounts CONCIERGE`**.
2. Sweep/verify rendered public surfaces for legacy SignalBoost display leakage, including translated/generated strings.
3. Treat `https://itmounts.com` as canonical in new public code/content.
4. Complete the hostname-dependency audit across Supabase Auth, OAuth callbacks, reset/magic links, Stripe return flows, CORS/CSP/cookies, env absolute URLs, metadata/sitemap/robots/OpenGraph, emails, docs, and true runtime hard-coded old-host references.
5. Only after that audit is green, convert `saas.signalboostapp.com` to a path-preserving 308 redirect to `https://itmounts.com` and verify critical flows.
6. Keep the existing backend/runtime intact; do not create a parallel iTMounts stack.
7. Retain `signalboostapp.com` ownership for legacy/corporate/internal compatibility unless the owner separately decides otherwise.

---

# Immediate engineering priorities beyond branding

The name/domain cutover does not suspend the active engineering/learning program. Continue current-main work only after re-querying live state.

Priority themes remain:

- Builder harness reliability, inference, continuity, truthful explanation, and fresh proof closure;
- Software Specialist as the canonical coding/deep-software worker under COS;
- COS Chief-of-Staff reliability measured by objective acceptance rather than self-report;
- COS University remediation -> accepted study -> deliberate practice -> independent exam integrity;
- real Production outcome evidence before claiming learned/mastered capability;
- current-world evidence/freshness discipline;
- specialist learning that deepens organizational competence without creating competing brains;
- Self-Healing Supervisor integration and objective repair/outcome evidence;
- Autonomous Security Patrol: establish signed authorization/scope, deterministic Referee enforcement, Guardian/Stranger isolation, and evidence controls before active validation capability;
- Repo/IP/Counterintelligence Patrol: monitor runtime plus repository/supply-chain and information-exposure surfaces, preserve intrusion evidence, and train the Defensive Counterintelligence specialist under `SKILLS.md` without widening authority;
- provider/integration hardening without widening authority;
- Data Center Operations remains read-only/advisory until separately governed.

For detailed historical implementation/acceptance chronology through v1.77, use the archived ONBOARD file and Git history rather than inflating current-state claims from memory.

---

# Definition of success

The public product is **iTMounts**. COS remains the internal generalist brain. Concierge is the public face. Specialists are expert workers. Builder is the Software Specialist's governed engineering harness.

Success means:

- users see one coherent iTMounts identity at `itmounts.com`;
- public SignalBoost branding no longer leaks into rendered customer surfaces;
- the old domain remains only a safe compatibility path until redirect cutover is proven;
- the rename does not split the backend or break auth, payments, callbacks, cookies, email, or tenant boundaries;
- COS becomes more capable through independently verified experience, learning, exams, and outcomes;
- Builder fixes are completed with real proof and truthful narration;
- specialists deepen execution quality while COS retains cross-domain orchestration/final judgment;
- authority remains governed independently of intelligence;
- developers/agents read current repo truth before acting and reconcile concurrent work rather than guessing;
- Production claims resolve to actual merged code, READY deployment, and the live evidence appropriate to the claim.

**iTMounts is the public product. COS is the brain. Concierge is the public face. Specialists are expert workers.**


## Semantic identity routing — 2026-09-09

Public identity is a two-layer contract:

1. Deterministic handling may answer obvious identity wording immediately.
2. Every unmatched public prompt is classified by the deep COS reasoner before domain naming or other workflows. The classifier distinguishes existing platform identity, Concierge employer identity, and actual naming work.
3. Identity answers always render canonical static facts from `lib/public-brand.ts`; model output may select intent and language but may never supply the company name.
4. Malformed or ambiguous semantic verdicts fail closed into normal routing.

This prevents phrasing gaps from sending “What is this platform called?” into name generation while preserving deep-learning interpretation rather than expanding a permanent regex list.
