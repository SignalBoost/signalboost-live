# ONBOARD.md

# iTMounts Engineering Blueprint

## iTMounts Platform Harness invariant — 2026-09-22

The **Platform Harness** is a first-class iTMounts platform layer shared by COS, specialists, Builder, University Residency, Self-Healing, security exercises, replay, sandbox work, Production work, and independent evaluation runtime. It is not subordinate to University and it is not a replacement governance engine.

Canonical architecture:

```text
iTMounts Platform
-> Platform Harness
-> exact identity + trusted authority + controlled environment
-> HarnessRun
-> COS / specialist
-> capability resolver
-> Agent Gateway Governed Socket
-> controlled execution
-> observable trajectory
-> independent outcome verification
-> strict failure routing
-> durable evidence
```

Canonical profiles are: `residency`, `production`, `sandbox`, `self_healing`, `security_lab`, `replay`, and `evaluation_runtime`. They share one execution architecture. A profile may **reduce** capability, environment, budget, time, or learning behavior, but it may never create or widen authority.

The executable surface is the intersection of **requested work + profile constraints + an already-verified Referee/Guardian/host authority envelope + Provider Hub capabilities actually assigned and available for the exact tenant/environment/portable identity**. Every executable action still passes through `agent-gateway/runGoverned()`; the harness cannot mint approval, route around a halt, widen Production scope, grant spend, promote a model, or convert task success into authority.

Residency infrastructure recovery invariant: independently attributed, recognized exact-runtime faults may enter a registered Self-Healing action through the Governed Socket. The action may reconcile only already-existing exact RunPod resources to the approved template/GPU/scale-to-zero envelope. It may not create provider resources, wake compute, invoke a model, promote an artifact, authorize Production traffic, or repair auth/identity failures automatically.
### Platform Harness full-enforcement target — 2026-09-23

The Platform Harness is not considered complete merely because the contracts, profiles, Governed Socket adapter, trajectory journal, verifier, and failure routers exist. The completion target is **one mandatory execution envelope for COS and every specialist across interactive, delegated, scheduled, sandbox, Self-Healing, evaluation, and Production work**.

The target runtime invariant is:

```text
request / scheduled objective / delegated objective
-> HarnessRun identity + context binding
-> trusted authority envelope
-> profile + environment constraints
-> Provider Hub capability intersection
-> hard runtime limits
-> governed execution
-> observable trajectory
-> independent verification
-> rollback/recovery when required
-> strict owner routing
-> durable evidence
```

The full-enforcement requirements are:

1. **Universal ingress.** Every COS or specialist execution receives a HarnessRun. A simple no-tool answer may use a zero-capability/lightweight manifest, but no model, specialist, delegate, background worker, MCP, native API, browser/runtime, repository action, provider call, or Production mutation may create a parallel ungoverned execution path.
2. **Context is bound, not authoritative.** Conversation state, retrieved memory, vector/knowledge results, evidence, University knowledge, and task context may inform reasoning, but context can never grant capability or authority. Execution identity, artifact identity/revision where applicable, tenant, environment, and material context/evidence references must remain attributable to the run.
3. **Real hard limits.** `maxToolCalls`, `deadlineMs`, `maxCostUsd`, and `maxConcurrency` are runtime controls, not metadata. The Harness must refuse new work when a ceiling is reached, account for provider/tool spend where measurable, bound concurrent calls/delegations, and propagate cancellation/deadlines into adapters that support abort signals. Unknown/unmetered paid cost must fail closed whenever a hard spend ceiling requires exact accounting.
4. **Recursive delegation.** A COS-to-specialist or specialist-to-specialist delegation creates a child HarnessRun bound to the parent run and may only reduce the parent authority, budget, deadline, environment, and capability surface. Delegation can never launder or widen authority.
5. **Consequential-action contract.** Consequential capabilities require explicit consequential authority plus an executable rollback or compensating-action contract where rollback is technically possible. The Harness records precondition evidence, action evidence, postcondition verification, rollback availability, rollback attempt/result when invoked, and escalation when safe rollback is impossible.
6. **No success by assertion.** Model text, tool exit alone, HTTP 2xx alone, or a worker self-report cannot establish success. The independent verifier owns success/failure attribution from observable evidence. Verification failure cannot be converted into success by retrying through another provider or route outside the same authority envelope.
7. **Strict recovery ownership.** Infrastructure failures route to Self-Healing; competency failures route to University/remediation where educational semantics apply; authority boundaries route to Referee/Guardian; Harness defects route to Harness assurance. Recovery executes only through a newly authorized/bounded HarnessRun or an already-authorized child run and must be reverified.
8. **Production parity.** The same core Harness architecture applies in Production. Production is not a privileged bypass profile. Production may have broader separately granted authority, but all capability discovery, limits, governed execution, evidence, verification, and failure routing remain active.
9. **Durable audit without hidden reasoning.** Persist run identity, authority reference, environment/profile, capability/tool observations, cost/latency/limit evidence, verification, rollback/recovery, routing, and outcome evidence. Never persist private chain-of-thought, hidden scratchpads, credentials, raw secrets, or unnecessary user content.
10. **Fail-closed continuity.** If capability discovery, authority verification, budget accounting required for a hard ceiling, verifier availability, durable evidence persistence for a consequential action, or required rollback preconditions fail, the Harness stops rather than silently falling back to an ungoverned path.

Platform-wide acceptance is not complete until Production evidence demonstrates the shared Harness on COS and representative specialists across read-only, write, consequential, delegated, failure/recovery, rollback, deadline, concurrency, and cost-ceiling cases. Unit tests or a Residency-only integration are necessary but not sufficient evidence for the platform-wide completion claim.


### Deployment-bound Platform Harness Production acceptance — 2026-09-24

The canonical live acceptance implementation is `saas/platform-harness/acceptance/production-canary.ts`, executed only in the Production Vercel environment by `/api/cron/platform-harness-production-acceptance`. It is idempotent per exact `VERCEL_GIT_COMMIT_SHA` plus deployment fingerprint and persists sanitized case evidence to the immutable supervisor audit trail. The cron runs every minute so a fast-moving `main` does not leave a successful Production deployment uncertified for a long window; already-certified deployments return idempotently without rerunning the matrix.

The acceptance canary uses only `platform_harness_acceptance_scratch`, a service-role-only table containing bounded synthetic markers and no customer/business data. It exercises the same Production Harness, Governed Socket, capability resolution, hard limits, verifier, compensation, routing, and durable-evidence boundaries as live agents.

Required live matrix: COS read-only verified success; specialist reversible Production write; consequential precondition plus forced independent-verification failure plus completed compensation; narrowed recursive child HarnessRun; absolute deadline cancellation; concurrency ceiling; hard cost ceiling fail-closed; infrastructure attribution to Self-Healing; competency attribution to University remediation; authority boundary to Referee/Guardian; and verification/Harness failure to Harness assurance.

A green build or unit test is not final acceptance. The Platform Harness may be called platform-wide Production-complete only after the exact Production deployment has a persisted `platform_harness_production_acceptance_completed` event covering the required matrix.


Ownership stays separated:

- infrastructure/environment/provider/tool failure -> **Self-Healing**;
- observable agent competency failure with infrastructure available -> **University remediation**;
- authority/approval boundary -> **Referee/Guardian**;
- independently verified success -> **durable evidence**;
- ambiguous attribution -> **Harness assurance/operator review**, never automatic blame or repair.

Trajectory evidence contains observable actions, observations, tool outcomes, verification, cost/latency/failure references, rollback and escalation evidence. **Private chain-of-thought, scratchpads, hidden reasoning, and internal monologue must never be persisted.**

Residency admission invariant: trained `evaluation_pending` Computer Science artifacts must have a bounded automatic enrollment path into practical Residency. The cron may admit at most one new artifact per tick and keeps at most four active residents; admission is exact-artifact/idempotent and never authorizes final exams, promotion, Production traffic, or wider authority.

University Residency is the educational use of this shared platform world. Residency may feed sanitized competency evidence into University, but it does not own the harness. The `evaluation_runtime` profile supplies a controlled execution environment only; hidden exam material, evaluator logic, graduation decisions, and the teaching/remediation boundary remain independently owned.

See `docs/PLATFORM-HARNESS.md` and `saas/platform-harness/`.

## COS University Residency invariant — 2026-09-22

The University includes a governed **Residency** stage: practical supervised work analogous to a medical residency. The harness is the infrastructure that runs realistic cases; Residency is the educational program. It applies to every specialist and eventually COS.

Canonical lifecycle:

```text
curriculum -> frontier faculty / distillation -> immutable trained artifact
-> Residency (sandboxed supervised practical work)
-> competency gaps / targeted remediation / retraining as needed
-> Residency completion
-> fresh post-Residency exact-artifact final canary + rollback proof
-> independent holdout / safety / unseen-transfer / delayed-retention final evaluation
-> graduate registry / separately governed activation
-> verified Production outcomes
-> continuing education / remediation / recertification
```

Residency **adds evidence; it never replaces or weakens an existing gate**. Exact-artifact identity, independent evaluator separation, delayed retention, rollback, Referee authority, spend ceilings, Production-traffic prohibition before promotion, and fail-closed behavior remain controlling. Residency cannot mint approvals, promote itself, widen authority, substitute an arbitrary endpoint/artifact, or convert task success into Production authorization. Referee/Guardian remain the authority boundary.

Resident progression is competency-based, not task-count based: `student -> candidate -> resident -> senior_resident -> graduate_specialist -> active_specialist`. Repetition of an already-proven task does not manufacture a new competency. Evidence should distinguish at least `unproven`, `supervised`, `demonstrated`, `retained`, and `remediation_required`.

A residency case exercises the **whole agent trajectory**, not only final prose: objective interpretation, plan, MCP/tool selection, bounded tool calls, observation grounding, diagnosis, correction after failed attempts, verification, rollback/escalation judgment, collaboration with other specialists, cost/latency awareness, and authority compliance. Cases should include unfamiliar variants and controlled failures. Residents operate in restricted manifests/sandboxes: e.g. branch but not merge, sandbox deploy but not Production deploy, synthetic/sanitized data rather than unrestricted Production data.

Residency failures feed targeted remediation. The system records the failed competency/pattern, produces sanitized general practice material without copying private Production data, hidden exams, evaluator outputs, secrets, raw chats, or candidate identities, then sends that material through the existing governed curriculum/distillation path. A new immutable artifact must pass the unchanged canary and independent evaluation gates before Residency replays the original skill class using unseen variants. Residency success cannot hide a holdout, safety, transfer, retention, exact-canary, rollback, or served-identity failure.

Residency also trains the **organization**. Cases may require a resident to recognize that another specialist is needed, delegate through governed MCP/capability boundaries, reconcile results, and escalate when evidence or authority is insufficient. COS Residency should eventually test delegation, monitoring, conflict reconciliation, and final accountable synthesis across specialists.

### First Residency program: Computer Science / Builder

Builder is the first implementation because practical outcomes are independently observable and it is the next high-value specialist lane. Initial cases should cover GitHub repository navigation/root-cause analysis, TypeScript/Next.js repair, Vercel deployment diagnosis/recovery, Supabase diagnosis, Playwright/browser verification, Chrome DevTools evidence, test/regression construction, rollback, MCP selection/recovery, security/authority boundaries, and recovery from an initially wrong diagnosis. The first release should start small (roughly 20-30 high-quality case families with hidden variants) and expand by measured competency gaps, not by raw volume.

A qualifying Computer Science artifact enters Residency as a trained immutable student artifact before final canary/exams. Residency does not shortcut those gates; it supplies practical teaching and competency evidence before the unchanged final canary, independent examinations, graduation, and separately governed activation. Production outcomes from an activated graduate may later become sanitized verified case inputs for continuing education.

### University recovery/status handoff — 2026-09-22

Recent recovery established the following engineering state and lessons:

- Mass distillation is a continuously replenished governed pipeline; curriculum normalization/packaging, multi-provider faculty, HF training, artifact registration, provider circuits, bounded retry and Self-Healing progress recovery were repaired without weakening curriculum/evaluation rules.
- Hugging Face training failures were traced to private repository storage exhaustion after successful training; storage was upgraded and successful callbacks again register immutable artifacts as `evaluation_pending`. Training completion never means graduation.
- Self-Healing gained provider failure classification/circuit breaking and a universal supervised-provider contract so deterministic billing/capacity/auth/config failures do not create paid retry storms while transient failures remain bounded.
- The independent mass evaluator is operational and preserves unchanged holdout, safety, unseen-transfer and delayed-retention gates. Recent quarantines are model-quality evidence, not evaluator failure.
- Failure-derived remediation was strengthened, including a bounded frontier response-anchor followed by stable on-policy distillation and a three-epoch remediation replay where governed by the current recipe. Evaluator thresholds must never be lowered to make a model pass.
- Exact-artifact RunPod canary infrastructure remains the active infrastructure repair track. Repairs added endpoint recovery, bounded capacity recovery, safe AMPERE_24/GPU1/min0/max1/idle<=180 policy, rolling spend accounting based on real invocations/reservations, worker headroom, cold-start/readiness recovery, exact base revision caching, and bound-template lookup. Failures with `providerInvocationStarted:false` are control-plane/provisioning failures, not paid inference or model-quality results.
- Safe RunPod template-identity diagnostics were added after Production continued to report `mass_distilled_runtime_template_id_missing`; use concrete provider response shape to repair identity rather than bypass exact binding or add speculative retries.
- A containerized exact-artifact canary worker/gateway is the next controlled runtime direction. Its image/build path must remain exact-artifact bound and must not expand canary, spend, promotion, or Production authority.
- Healthy distillation should not be disturbed while canary infrastructure and model quality are repaired in parallel. The near-term milestone is another legitimately improved graduate; the Computer Science graduate then enters the Builder Residency/apprenticeship path.


## Interactive answerability / owner self-knowledge invariant — 2026-09-23

Authenticated owner self-knowledge (for example model/provider/runtime/spec questions) is a host-owned configuration query, not a reasoning problem. After server-side owner authentication, the current raw user message must be answered from verified runtime topology **before** conversation augmentation, semantic-intent classification, RunPod wake, or Qwen/DeepInfra inference. Public Concierge never inherits this disclosure path.

The semantic task-intent model is a disambiguator for freshness/context boundaries, not a mandatory pre-answer stage. Ordinary timeless/general questions proceed directly to COS. When semantic classification is needed, it uses the latency-sensitive interactive profile with thinking disabled, strict JSON, and an 8-second hard call bound; it must never inherit the generic 120-second `LOCAL_AI_TIMEOUT_MS`.

Failure invariant: a simple answerable owner/general question must not end in `honestRefusalReply` merely because a routing/classification model timed out. Deterministic host facts release deterministically; ordinary model reasoning remains bounded and completion-first.

Response-delivery invariant: once a latency-sensitive owner/general question has a valid answer, optional provenance/history persistence must not hold the HTTP response open. Those writes run in the post-response lifecycle; persistence failures are telemetry/continuity failures, not permission to discard or delay an already-valid answer.

Semantic + Creative Memory invariant: COS uses distinct inference-time memory layers. Semantic Memory is meaning-based retrieval over authorized durable knowledge/context using the existing embedding/vector substrate; Creative Memory is durable, validated memory of successful approaches, structures, styles, useful elements, constraints, and outcome-backed patterns. Creative Memory guides HOW COS solves or presents a task and is never factual evidence: it cannot satisfy live-fact freshness, raise factual grounding confidence, authorize an action, or be cited as proof. The primary model may request `semantic_memory` or `creative_memory` as native capabilities; such requests bypass prompt-only answer cache and force retrieval-backed COS reasoning. Current-world facts still require live evidence. Creative Memory uses the active 768-dimensional embedding model space with model identity, service-role-only storage/RPC access, validated/quarantined admission, immediate lexical/task fallback when vectors are not yet available, and normal knowledge-lifecycle embedding backfill. Initial validated patterns cover complete budget travel plans, prior-answer transformation continuity, and restrained proactive completion. University may later consume rows explicitly marked training-eligible, but COS receives inference-time benefit immediately without waiting for University graduation.

Model-first agent invariant: after host authentication and hard security/surface boundaries, an ordinary user request reaches the primary COS model before optional capability routing. The model must either return a complete answer or request the minimum capability plan needed to finish. Capability requests are intent, not authority: Referee/host policy, public-delivery scope, owner authentication, action permission, and tool authorization remain deterministic and cannot be expanded by model output. Current platform/runtime facts remain host-verified. When the model has already requested live_web or conversation_history, COS must use that plan instead of paying for a redundant semantic classifier.

Native tool-call implementation: interactive COS uses the OpenAI-compatible `tools` / `tool_choice=auto` / `tool_calls` protocol for its first answer-or-capability decision. Direct model answers are released immediately only when host release policy does not require fresh evidence. If a mutable/current-world request is mistakenly answered from model memory, the host converts that same decision into `live_web` orchestration after the model turn; this guard can require more evidence but never grant authority or substitute a deterministic semantic answer.

Travel completion invariant: a complete travel-planning request remains model-first, then uses live evidence and a bounded grounded planner. The interactive travel lane uses one primary fast-model attempt plus one shorter alternate-model retry; it must not return a retry/clarification dead end solely because model transport missed the budget. If both bounded model attempts fail after authoritative live evidence was acquired, COS returns a conservative evidence-aware itinerary backstop. Successful travel answers and backstops persist provenance after response delivery, never in the foreground.

## Runtime provider priority invariant — 2026-09-19

The canonical iTMounts text-compute order is:

```text
active scoped/promoted iTMounts graduate (when applicable)
-> RunPod primary iTMounts runtime
-> DeepInfra / configured LOCAL_AI bounded fallback
-> separately governed escalation only where explicitly authorized
```

RunPod is an active primary compute/runtime dependency for eligible platform workloads; it is **not retired**. DeepInfra is the bounded fallback/overflow provider; it is **not the default or primary platform runtime**.

Latency-sensitive owner-facing paths such as `cos_interactive_answer`, interactive authoring, and direct text transformation may deliberately bypass a RunPod wake/repair/wait and invoke the configured DeepInfra/LOCAL_AI fallback directly under the Interactive COS latency profile. That is a scoped latency exception only: it does not reverse the global provider priority, retire RunPod, or authorize callers to treat DeepInfra as primary.

University exact-artifact serving, canary, and evaluation paths continue to use their separately governed RunPod runtime where the current implementation specifies it. Independent University evaluation/evaluator separation remains controlling and must not silently inherit ordinary platform routing.

Runtime identity and health must still be verified from live configuration/telemetry before making Production claims; this invariant defines intended routing priority, not proof that any particular provider is healthy at a given moment.

### DeepInfra hard-spend invariant — 2026-09-24

DeepInfra remains a bounded managed fallback/training/assessment provider. Observability alone is not sufficient: a paid DeepInfra request inside a cost-bounded HarnessRun must reserve a conservative worst-case allowance **before** the request leaves iTMounts. If a paid call has no reservation, or if the next reservation would exceed the Harness run ceiling, the call fails closed and must not reach DeepInfra.

Default reservation ceilings are deliberately conservative and are server-side configurable:

- Builder/Platform Engineer DeepInfra fallback: `DEEPINFRA_BUILDER_MAX_CALL_USD=0.08`, `DEEPINFRA_BUILDER_MAX_JOB_USD=0.24`.
- University deliberate practice: `DEEPINFRA_UNIVERSITY_PRACTICE_MAX_CALL_USD=0.005`, `DEEPINFRA_UNIVERSITY_PRACTICE_MAX_RUN_USD=0.01`.
- University independent assessment/capstone: `DEEPINFRA_UNIVERSITY_ASSESSMENT_MAX_CALL_USD=0.10`, `DEEPINFRA_UNIVERSITY_ASSESSMENT_MAX_RUN_USD=0.10`.

Reservations are ceilings, not provider-price estimates. A retry consumes a new reservation and may therefore be denied even when earlier actual usage was cheaper. Unused reservation is not recycled within the same Harness run; this intentionally prevents retry loops from silently widening paid-provider authority.

Builder remains RunPod-primary. Simple RunPod contention must not automatically become paid DeepInfra work. University practice may use an explicitly configured economy model, but no paid practice model is silently selected from source defaults. Independent evaluation keeps its separately governed evaluator/runtime separation.

Provider billing/account state is external to iTMounts. A DeepInfra dashboard showing zero balance, requiring a payment-method refresh, or changing prepaid/invoiced state is **not** evidence that the platform integration was removed. Connectivity is established from current host configuration plus successful provider telemetry; billing failures must fail visibly and must not cause a hidden provider substitution.

### Governed browser MCP completion invariant — 2026-09-24

Playwright MCP and Chrome DevTools MCP are first-class governed browser capabilities behind Provider Hub and the Portable Connector Runtime. Playwright MCP is considered implemented at the platform/runtime layer: the pinned package/runtime, stdio host, isolated browser process, origin restrictions, approval gates, live capability projection, and reference-host acceptance harness all exist. A CI workflow failure must not be described as a missing Playwright capability unless the runtime/acceptance evidence itself failed.

Canonical Playwright profile:
- package: `@playwright/mcp@0.0.82`;
- headless isolated Chrome, WebMCP disabled;
- read surfaces include snapshot/find/screenshot/console/network diagnostics;
- write surfaces require governed approval and exact host-origin enforcement;
- arbitrary code/evaluation, file-write/upload, and unapproved host-write surfaces remain excluded.

Browser MCP live-acceptance workflows are validation workflows. They run on `pull_request` for relevant changes and remain manually dispatchable. They must not also duplicate the same validation on `push`; duplicate push+PR validation wastes Actions capacity and violates the repository queue policy. Removing a duplicate trigger is CI hygiene only and does not alter browser runtime capability or authority.

### Private-repository runtime invariance — 2026-09-20

Changing `SignalBoost/signalboost-live` between public and private must **not** change Production runtime health.

- Production bootstrap, worker delivery, probes, recovery and Self-Healing may not depend on unauthenticated `raw.githubusercontent.com` or another public-repository-only transport.
- RunPod bootstrap delivery must use an authenticated iTMounts public application route with a derived capability token; the RunPod account control credential itself must never be exposed to the Pod or URL.
- A running Pod whose stored startup command still contains the retired raw-GitHub bootstrap is a one-time migration case: the Production probe may replace that exact legacy contract in place, then return to the normal rule that ordinary running-contract mismatches preserve scarce capacity rather than reset it.
- Hugging Face worker delivery remains on its separately authenticated iTMounts public route.
- Repository visibility changes must not cause retry storms, repeated repair loops, Supabase write/read amplification, provider mutation, or runtime reconfiguration.
- Private-repository reads needed by owner tools must use authenticated GitHub APIs and fail closed with bounded retries.
- Runtime bootstrap artifacts must be validated before execution; HTML/login/error responses must never be executed as shell/Python.
- Repository privacy is a governance choice, not an availability switch.


## Supabase Disk I/O saturation runbook — 2026-09-20/21 UTC

Production experienced Supabase Disk I/O budget exhaustion while the Pro project was still running on legacy **Nano** compute. The database was about 505 MB with CPU near 93%, memory near 74%, and Disk I/O at 100%; storage capacity itself was not exhausted. The immediate Production repair was to resize the database from **Nano to Small**, then verify the Postgres restart/effective tier from SQL and confirm normal live activity.

Do not infer a runaway learning loop merely from large historical write/WAL counters. In this incident, roughly 10.9k learned-corpus embedding updates were later matched almost one-for-one by rows legitimately embedded in the current model space, so the suspected embedding rewrite loop was not established.

If the Disk I/O warning recurs, follow `docs/runbooks/supabase-disk-io-budget-exhaustion.md` before changing University, Self-Healing, embedding, audit, or evidence semantics. Restore infrastructure headroom when the compute tier is undersized, use bounded SQL diagnostics, distinguish disk capacity from Disk I/O capacity, distinguish legitimate batch work from redundant writes, and preserve immutable governance/evaluation evidence. Do not delete evidence, disable learning, add read replicas, or buy extra IOPS as a first reaction without measurements.

For the current workload, **Small is the Production compute floor until live measurements justify a deliberate change**. Future engineers must verify current Supabase tier limits and pricing rather than assuming the 2026 limits are permanent.


## University graduate adoption loop invariant — 2026-09-20

Failure-remediation material invariant (2026-09-21): a newly verified evaluation failure must create **materially distinct** subject-level remediation practice, not merely a new provenance/content hash for text that is otherwise identical to an older seed. Retained-material de-duplication remains mandatory and must never be weakened to force remediation through. Instead, the remediation generator must vary only bounded, general practice context/verification/difficulty dimensions derived from the failed gate classes and an opaque one-way candidate identity input. It must never copy or reconstruct raw chats, private holdouts, hidden exams, evaluator output, user data, or candidate IDs into retained training material. Remediation material identity is versioned so already-verified failures can be re-seeded once after a generator correction without waiting for another model to fail.

Builder apprenticeship scheduling invariant (2026-09-21): the first **confirmed response-anchor v2** `Computer Science & Coding` proof cohort must not wait behind the legacy exact-artifact canary backlog. The date-only post-remediation quota is insufficient because two old-recipe CS artifacts can consume it before a true v2 artifact exists. The canary scheduler may therefore prioritize exactly the first **two** Computer Science artifacts whose durable training receipt proves `optimizer=frontier_response_anchor_then_stable_on_policy_distillation`, `frontierResponseAnchorRequired=true`, `frontierResponseAnchorEpochs=1`, and `frontierResponseAnchorItems>0`. After two such v2 artifacts have durable exact-artifact canary passes, normal oldest-first canary scheduling resumes automatically. The issuer must include this bounded v2 proof cohort in its candidate read **before** applying queue ordering; sorting a priority cohort only after an oldest-N database truncation is not compliant because a large legacy backlog can make the priority artifacts invisible. This is scheduling only: one-canary concurrency, the 72/24h approval ceiling, <= $0.20 per-canary authority, exact-artifact binding, independent evaluation, promotion, rollback and Production traffic gates remain unchanged. The purpose is to prove the real Builder apprenticeship loop promptly, not to bypass graduation.

Training is not operationally complete when a distilled artifact merely exists. The canonical closed loop is:

```text
University training
-> independent improvement / safety / transfer / retention evaluation
-> exact-artifact Production canary + rollback proof
-> graduate registry (pending_runtime)
-> evidence-gated runtime activation
-> COS-primary generalist routing or subject-relevant COS / Builder worker routing
-> provider + graduate ownership telemetry
-> verified Production outcomes
-> continuing education / remediation / recertification
```

Production configuration explicitly enables `COS_GRADUATE_ACTIVATION_ENABLED=true`; the activation route still fails closed when the switch is absent and cannot bypass promotion, rollback, served-identity, health, or authority gates. `COS_GENERALIST_PRIMARY_ACTIVATION_ENABLED=true` separately permits COS-primary adoption only after the generalist gate below is satisfied.

Every canonical COS University subject has an explicit bounded activation scope. Computer Science and Cybersecurity graduates may enter the `coder` lane for Builder work; other qualified subject graduates enter critic/verifier/researcher lanes. The single deliberate primary exception is a promoted `reasoning_decision_science` artifact for COS itself: it may receive `primary` plus generalist (`*`) routing only when COS holds an awarded A/A+ generalist undergraduate credential, current generalist competence is still A/A+, and undergraduate remediation is clear. Artifact-level improvement, safety, unseen-transfer, delayed-retention, exact-canary, rollback, served-identity and runtime-health gates remain mandatory. If the generalist gate is absent, stale, or unreadable, the artifact remains a bounded specialist rather than silently becoming the brain.

This makes the architecture operational rather than nominal: once the qualified COS-primary graduate is active, it is selected ahead of the base reasoner for ordinary primary reasoning; specialists remain subordinate expert workers; the ordinary RunPod model remains fallback compute; DeepInfra remains bounded fallback/exception compute rather than COS's default intelligence. Runtime selection for specialists still matches the bounded problem-class taxonomy and `university:<subject_id>` markers. Unknown subjects remain blocked rather than receiving wildcard scope.

A graduate that fails its independent gates remains quarantined and receives no Production traffic. An active graduate that fails or becomes unhealthy must fall back to the ordinary approved runtime and retain exact candidate/artifact attribution for outcome measurement and rollback.


## Frontier adaptive distillation invariant — 2026-09-19

COS University mass distillation is a **frontier-supervised adaptive learning system**, not an SFT pipeline with a distillation label.

Canonical training architecture:

- explicitly enabled frontier hosted models (OpenAI, Anthropic, Gemini, xAI, DeepSeek and compatible buyer-configured providers) form a governed **faculty** for diverse synthetic curriculum, critique and failure-derived remediation;
- hosted API faculty outputs are curriculum/provenance inputs only unless a provider exposes the exact dense next-token distributions required by the selected optimizer; an API answer must never be falsely treated as token-level teacher logits;
- mass-distillation training binds each run to an immutable, rights-cleared, pinned open-weight **dense teacher** and a buyer-controlled student;
- **on-policy GKD is the default mass optimizer**: the student generates its own trajectories and the dense teacher supplies token-level supervision on those trajectories;
- verified frontier-faculty prompt/response examples may receive one bounded supervised anchor pass before GKD when faculty responses exist; this anchor is separate from the fully on-policy GKD optimizer, never treats API answers as dense token logits, and remains subordinate to independent evaluation;
- cross-tokenizer teacher/student pairs must fail closed until the governed GOLD/ULD-compatible path is independently validated; tokenizer mismatch must never silently fall back to SFT;
- every training recipe, teacher revision, student revision, dataset/holdout manifest, optimizer profile and artifact hash is durable evidence;
- the independent evaluator, not the teacher or training worker, decides whether the trained artifact beat its baseline;
- failed evaluations feed failure-derived curriculum back into the next governed learning cycle;
- safety regression, unseen transfer, delayed retention, exact-artifact canary and rollback proof remain mandatory before graduation/promotion;
- training never grants automatic promotion, Production traffic, wider spend authority or new provider authority.

Reliability invariant: prepared work must continuously fill available healthy training capacity; an inert campaign may not occupy a concurrency slot indefinitely while eligible work waits. Self-Healing must repair/reclaim such capacity without weakening training or evaluation gates.

Performance invariant: concurrency, faculty parallelism, prepared-buffer depth and training hardware are throughput controls, not learning-quality shortcuts. Scale them from measured queue depth, provider health, training yield and evaluator outcomes while preserving deterministic admission, idempotency, provenance and rollback.

Hosted-faculty spend-efficiency invariant (2026-09-20/21): equal buyer balances do **not** imply equal call counts. The mass hosted-teacher stage must distribute first-pass work by bounded, configuration-driven **expected dollar cost per useful call** while preserving approved multi-provider diversity. Expensive teachers such as Claude may therefore receive fewer first-pass prompts than cheaper teachers. Provider-specific completion headroom may be raised only inside the existing global hard output ceiling when that reduces paid truncation waste. If a partial batch proves a prompt's first-pass provider failed or truncated and another approved provider exists, the retry must exclude that original primary before purchasing it again. Cost planning never changes curriculum rights, evaluator independence, promotion gates, provider authority, or the campaign spend ceiling.

Production distillation runtime invariant (2026-09-20 hotfix):

- Production frontier distillation uses TRL's **stable `DistillationTrainer`** fully on-policy path as the primary optimizer. The v2 frontier plan may first run exactly one bounded `SFTTrainer` anchor epoch over the already hash-verified hosted-faculty prompt/response training rows when frontier faculty are present. Dense-teacher tokenizer compatibility must be loaded and proven **before** this paid anchor starts; an incompatible pair fails closed without consuming anchor training. The anchor excludes holdout rows, never masquerades as dense-logit distillation, and does not weaken the independent improvement/safety/transfer/retention evaluator. Experimental mixed-rollout GKD trainer imports remain prohibited in the paid mass-distillation lane unless separately validated and release-gated.
- The current HF single-GPU QLoRA lane uses deterministic FP16 quantized compute for student/teacher forward/backward math, **AMP/GradScaler is disabled**, and trainable LoRA parameters are upcast to FP32 before optimizer creation. BF16 must not be auto-selected on this T4-class lane after the observed generation and gradient-unscale failures.
- HF datasets and trained adapters use a bounded buyer-owned repository pool. A normal campaign must **reuse a repository and write an isolated per-run branch**, then pin the exact returned Hub commit SHA in evidence. It must not create one Hub repository per batch, teacher output, or trained artifact.
- Repository pooling may create at most one bootstrap pool repository only when no compatible pool repository exists; a provider 429/rate-limit response fails closed rather than launching repeated repository-creation attempts.
- Exact-artifact identity remains `repo + immutable Hub commit revision + artifact hash`; pooling may reduce repository count but may never weaken exact-artifact canary, evaluation, provenance, rollback, or promotion gates.
- HF worker delivery must use the authenticated **public application origin** when one is configured. Deployment-specific Vercel hostnames may be protected before the application capability-token route executes and can return login HTML to external HF Jobs. The derived HF capability token remains mandatory, raw GitHub remains forbidden, and the job bootstrap must validate worker-source contract markers before executing downloaded bytes. The worker/base-worker dependency contract remains versioned and fail-closed; a source mismatch must terminate before training rather than execute HTML or a mismatched worker.
- The every-minute mass-distillation cron is a **wake-up signal, not concurrent execution authority**. The canonical workflow must acquire a service-role-only durable lease before reconciliation/recovery/dispatch/maintenance. If another healthy invocation owns the lease, the tick returns a successful `workflow_lease_held` skip. The lease is fenced by an opaque UUID, expires automatically after the Vercel execution ceiling, and is released on normal completion so a killed invocation cannot block the University indefinitely.
- Mass-distilled independent evaluation may run at most **four unresolved reservations concurrently**. This is a throughput control only: the 300 approvals/24h rolling ceiling, 12-hour delayed-retention gate, exact-artifact Production canary, 18 endpoint calls, 4 judge calls, one runtime wake, <=$0.20 wake ceiling, scoring thresholds, rollback/promotion gates and Production-traffic prohibition remain unchanged. The database advisory lock still serializes claim creation so concurrent ticks cannot over-allocate the four slots.

## University Self-Healing progress invariant — 2026-09-19

Self-Healing Supervisor must distinguish **lack of supply** from **failure to convert valid upstream progress into downstream work**.

Canonical University recovery order:

- zero prepared batches by itself is ordinary `waiting_for_curriculum`; SHS must not manufacture work or weaken curriculum gates;
- when the latest slow-maintenance receipt proves a canonical subject received enough newly inserted governed curriculum to satisfy its recorded batch shortfall, but packaging still produces zero prepared batches, that is `curriculum_packaging_stalled` and requires recovery;
- SHS first executes the registered bounded runtime recovery and independently verifies the Production health state;
- only when runtime recovery cannot restore the progress invariant may SHS enqueue Software Specialist / Platform Engineer on the exact deployed revision;
- repository repair must reproduce before edit, preserve the 20-item batch minimum, rights/provenance/confidence/deduplication/semantic-cohesion gates, Dynamic Pipeline Router neutrality, spend ceilings, and promotion/Production authority;
- Platform Engineer repairs remain pinned, deduplicated, retry-bounded, PR/CI governed, checkpoint-gated for main auto-merge, deployment-watched, and rollback-capable;
- SHS code repair never authorizes model promotion, RunPod mutation, new provider authority, a higher cost ceiling, or wider Production traffic.

This is a cross-stage progress contract: **upstream progress without required downstream progress is a repair signal, not a reason to wait forever.**

## Dynamic Pipeline Router invariant — 2026-09-19

Incoming eligible work is **work-driven, not vendor-lane-driven**. A workload requests capabilities and policy constraints; it must not wait for one named provider when another compatible, approved, healthy route has capacity.

Canonical separation:

- **Provider Hub / Universal Provider Framework**: provider identity, capability, connection, health and bounded metadata. It is not the workload scheduler.
- **Dynamic Pipeline Router** (`saas/lib/dynamic-pipeline-router/`): deterministic compatibility/capacity routing and rerouting. Provider names are data, never hard-coded routing branches.
- **Supervisor / workflow coordination**: durable queues, leases, fencing, stale-owner recovery and work ownership. The router must not create a competing queue database.
- **MCP**: capability/tool exposure and invocation protocol. MCP is not a load balancer or traffic scheduler.
- **Product execution code**: remains authoritative for approvals, spend ceilings, data/training rights, consequential actions, promotion and Production traffic.

A failed or full pipeline may be excluded and the same work may move to another compatible pipeline when the consuming product already authorizes such rerouting. Rerouting never expands authority or silently bypasses buyer/provider policy.

COS University hosted-teacher distillation is the first live consumer of the shared router. New workloads should reuse this shared routing boundary rather than implement private provider-selection algorithms.

## COS / Assistant / Concierge single-brain invariant — 2026-09-18

**Assistant and COS are the same owner-facing intelligence.** The Assistant page is the owner's UI for COS; it is not a separate agent, brain, reasoner, or fallback path.

**Concierge is the public mouth for that same COS brain.** Public delivery may narrow authority, memory/tool visibility, disclosure, branding, and presentation through deterministic server-enforced public scope, but it must not select a different reasoning brain or a separate answer pipeline.

Canonical execution rule:

- owner Assistant -> COS;
- public Concierge -> public-delivery scope -> the same COS;
- COS may delegate bounded specialist/tool work and receives the result back;
- specialists, surfaces, wrappers, providers, and fallbacks never become a competing generalist brain;
- do not add route-level pre-reasoning model calls for ordinary owner turns when the shared COS policy can decide the condition deterministically;
- provider fallback is replaceable compute inside COS governance, not a second Concierge/Assistant brain.

This invariant is release-gated. A change that makes Concierge answer through a different reasoning endpoint than the owner COS/Assistant, or that makes Assistant perform a separate generalist pre-reasoning pass before COS, is an architectural regression.

## Interactive COS latency profile — 2026-09-18

User-facing Assistant/Concierge turns are latency-sensitive interactive work, not batch inference. They remain the same COS brain and retain COS governance, memory, evidence, release checks, and specialist delegation, but their primary answer generation must not spend the response budget waking, repairing, or waiting on the RunPod primary transport before using the configured managed open-model runtime.

Canonical latency rules:

- interactive COS generation is tagged `cos_interactive_answer`;
- `cos_interactive_answer`, interactive authoring, and direct text transformations may bypass RunPod-primary routing and use the configured DeepInfra/`LOCAL_AI_*` fallback directly as a bounded latency exception; this does not redefine DeepInfra as primary;
- DeepInfra interactive generation defaults to low reasoning effort unless `COS_INTERACTIVE_REASONING_EFFORT` explicitly overrides it;
- interactive model transport is bounded by `COS_INTERACTIVE_MODEL_TIMEOUT_MS` (default 20 seconds, never above the configured provider timeout);
- interactive answer generation is capped by `COS_INTERACTIVE_REASONER_MAX_TOKENS` (default 2,000, also bounded by the global reasoner ceiling);
- semantic knowledge/corpus retrieval gets a short response-path budget (`COS_KNOWLEDGE_FACT_RETRIEVAL_BUDGET_MS`, default 1.5 seconds) and falls back to lexical retrieval rather than blocking the user;
- University exams, controlled evaluations, training/distillation, Builder batch work, and other non-interactive workloads keep their own routing and evaluation policies.

A user-facing turn that spends tens of seconds in RunPod lifecycle or RunPod inference before answering is a latency regression, not expected COS behavior.

## Answerability-first cognitive mode invariant — 2026-09-20

Interactive COS must decide **what kind of cognition the task requires before spending the answer budget**.

Canonical order:

```text
deterministic/scope facts already supplied or governed
-> local answerability attempt from COS knowledge/memory/University capability
-> fresh verification only when the claim is mutable/current or explicitly requested
-> external fallback only when the governed local answer is unavailable/insufficient
```

Routing classifiers are not answers and may not monopolize the primary reasoner. Obvious deterministic identity/visual/software/authoring routes stay zero-cost. Optional semantic identity/visual classifiers are admitted only for requests shaped like those domains, must preserve their requested compact token ceiling, disable model thinking, use an actual transport deadline (default 2.5 seconds), and must not leave orphan model work after the route has continued.

Cognitive mode is task-sensitive:

- deterministic extraction, classification, translation/edit fidelity, permission and strict-JSON control decisions use temperature 0/low, no hidden reasoning, compact output and hard deadlines;
- ordinary factual/explanatory work uses bounded normal reasoning;
- diagnostic/root-cause/planning work may use deeper analytical reasoning when evidence and complexity justify it;
- explicitly creative writing/brainstorming/naming/concept work uses a higher-diversity creative profile while preserving supplied facts and constraints;
- current/live facts use verification rather than model-memory confidence;
- stable reference facts such as country capitals and immutable historical facts stay on the local answerability path by default; a direct-question grammar alone must never manufacture a freshness requirement;
- code, Builder, visuals and University workloads retain their specialized governed lanes.

Telemetry must distinguish **pre-answer routing time** from actual answer time and record whether the completed turn was locally answerable, required fresh verification, required external fallback, or remained unresolved. A long response to a locally answerable ordinary question is a performance regression even if the browser timeout did not fire.

## COS Direct Editor fast capability — 2026-09-18

Short explicit edit/proofread/polish requests are a bounded COS capability, not a second brain. Assistant and Concierge invoke the same canonical editor inside `cos-primary`; browser ingress must not run a competing text reasoner and fail the turn before COS gets it.

- canonical foreground editor defaults to DeepInfra `deepseek-ai/DeepSeek-V4-Flash-0731`, overrideable with `COS_FAST_TEXT_MODEL`;
- the model call disables thinking and uses strict JSON output;
- canonical edit budget is 18 seconds total, with at most 9 seconds per model attempt;
- existing meaning-fidelity, actor/action/recipient, terminology, layout, and presentation guards remain in force;
- the editor must not add recommendations, warnings, advice, facts, promises, or commentary absent from the user's source;
- general COS reasoning and University/evaluation/distillation/Builder workloads retain their own models and controls.

## Authoring intent outranks incidental freshness markers — 2026-09-18

Writing, drafting, translating, editing, rewriting, proofreading, and summarizing are not live-fact verification merely because the surrounding context contains `today`, `current`, `now`, a date, person, or organization.

The freshness boundary, problem-class taxonomy, and reasoning-worker selector all recognize authoring intent before incidental temporal vocabulary. Polite authoring wrappers such as `please write`, `could you draft`, and `can you translate` must not become `current public facts` or select the verifier merely because the surrounding context contains `today` or `current`. This exception applies only when there is no explicit live lookup or volatile-fact object; genuine requests such as `Please write a short summary of today's weather` still select live verification.

Release regression: `my inlaws today celebrate their wedding 50 aniversary. Please write a nice messsage to them in Polish and show me the english translation` must not enter current-fact web retrieval, evidence grounding, verifier, or freshness-repair workflows.

## HMI semantic authoring resilience — 2026-09-18

Human wording is **not** an API contract. COS must adapt to natural variation in phrasing rather than requiring users to learn routing vocabulary.

- deterministic authoring detection is a latency optimization, not the sole authority on intent;
- common multilingual writing requests may take the bounded fast-authoring lane immediately;
- when ordinary COS cannot complete a non-live, non-action turn, whole-request neural semantic intent is consulted before the generic failed-closed reply;
- a high-confidence `content_generation` decision with no required external facts may use the bounded authoring lane even when the user's wording did not match a routing phrase;
- semantic content generation suppresses incidental freshness words such as `today` only when no live external facts are required;
- requests that actually need current weather, prices, office holders, news, availability, or other mutable facts retain live-evidence protection;
- exact user sentences belong in regression tests only. Production routing must never branch on a memorized fixture sentence.

HMI principle: **the human does not adapt to COS; COS adapts to the human while preserving safety, freshness, and authority boundaries.**
## Self-contained authoring fast ingress — 2026-09-18

A self-contained, non-code, non-visual, non-live writing or translation request is already a complete COS objective. Concierge and Assistant send it directly to the shared COS endpoint before public identity, Software Specialist, or semantic visual classification.

This is not a separate Concierge intelligence. Public Concierge still applies public audit identity, public delivery scope, and public presentation around the same `cosPrimaryPost` reasoning endpoint.

Canonical authoring contract:

- `cos-primary` recognizes eligible self-contained authoring before auth-dependent retrieval and enterprise reasoning;
- foreground authoring uses the same proven low-latency DeepInfra model family as the fast editor: `deepseek-ai/DeepSeek-V4-Flash-0731`, overrideable with `COS_FAST_AUTHORING_MODEL`;
- authoring disables thinking, uses strict JSON, and gets 18 seconds total with at most 9 seconds per attempt;
- it uses only facts supplied by the user and must provide every requested language/version;
- if the bounded fast authoring call fails, the turn may continue through ordinary COS rather than inventing a response;
- ordinary interactive COS reasoning retains the stronger configured model;
- code/Builder, visual generation, live-fact verification, operational logs, provenance introspection, University evaluation, and distillation keep their own routing.

The exact anniversary-writing regression must reach shared COS before `resolveSemanticPublicIdentity`, `tryCosSoftwareSpecialist`, and `resolveSemanticVisualRequest`, and must hit `runFastAuthoring` before enterprise retrieval/reasoning.
## COS University Hugging Face Jobs training adapter — 2026-09-13

The governed COS University training-executor contract now has an iTMounts Hugging Face Jobs adapter on branch `feat/itmounts-huggingface-training-adapter-20260913`. `HF_TOKEN` may back the internal signed executor without exposing the provider token as a callback credential; a separate HMAC key is derived for signed evidence callbacks. Explicit buyer-supplied executor configuration still takes precedence.

Cost-bearing dispatch remains fail-closed. The adapter never enables `COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED` automatically, and every individual dataset-preparation or training dispatch still requires the existing owner-authenticated explicit confirmation. The default training hardware is **NVIDIA T4 Small (`t4-small`)**, currently $0.40/hour on Hugging Face Jobs. An OOM or failed run stops; the adapter never silently escalates to a more expensive GPU. Any larger hardware must be deliberately configured after review.

Dataset preparation accepts only explicit governed Hugging Face dataset references, creates private train/holdout material with immutable revision evidence, and training creates private LoRA/QLoRA student artifacts. Historical teacher lessons are not silently reclassified as distillation material: explicit training rights, provenance, privacy exclusion, candidate eligibility, host approvals, and exact student/dataset binding remain required. Independent evaluation, safety regression, unseen transfer, delayed retention, Production canary, rollback proof, and promotion remain under their existing independent authorities.

This entry is **implementation evidence only** until the branch is merged and deployed. It is not evidence that a paid Hugging Face Job has run, that a student model has been trained, or that a model has passed Production promotion gates.

## Cybersecurity saved-message branding — 2026-09-12

Cybersecurity remediation titles, summaries, plan prose and implementation notes must render the
current iTMounts product name, including saved historical records. The read-only cyberProductText
helper preserves repository identifiers, URLs, email addresses, paths and inline code. Only the
display changes: original evidence, approval history, action payloads and authorization remain
untouched. Historical views disclose the display normalization in all five supported languages.
The real-card regression suite is required in unit CI and the Vercel deployment gate.

## Permanent Self-Healing monitor navigation — 2026-09-11

The signed-in Security navbar now names `/dashboard/cybersecurity` explicitly as the
Self-Healing Supervisor monitoring surface. Owners no longer need to remember or retrieve its URL.

## Guardian Supervisor autonomous disposition — 2026-09-11

Authenticated repository observations now enter the Self-Healing Supervisor as read-only,
low-risk classification work. Routine security-sensitive path observations are retained in the
Supervisor audit timeline and automatically dispositioned as expected activity; they no longer
create owner approval work merely because a sensitive path changed. A human queue remains reserved
for a separate policy outcome backed by concrete consequential or suspicious evidence. Observation
alone still grants no code repair, rollback, merge, deployment, or provider-mutation authority.
Existing review-only Guardian backlog rows are closed by migration while retaining their evidence.
The `/docs` landing-page list now links directly to the live Cybersecurity Center monitor.

## Guardian governed Self-Healing execution — 2026-09-11

Guardian repository incidents now enter the existing COS/Self-Healing diagnostic loop after their
durable grouped evidence and owner review record are created. The diagnostic outcome is persisted
to that review and the Supervisor audit timeline. Repository-change observations explicitly disable
automatic repair: COS may diagnose and stage a recovery, but this evidence alone cannot authorize
code or provider mutation.

## COS University per-agent language A-range — 2026-09-11

Language transfer and integrated capstone execution now evaluate every registered University agent
against only that agent's language assessments and run ledger. Non-COS run and assessment keys are
agent-namespaced. COS Production turns remain attributable only to COS; specialists must earn their
own verified applied-language outcomes. Each hourly tick executes at most one due agent.

## COS University per-agent delayed retention — 2026-09-11

Delayed retention now runs independently for every registered University agent against only that
agent's own passed transfer evidence. Each hourly tick executes at most one due agent in stable order,
and per-agent cadence receipts prevent duplicate daily work. Retention remains independently scored,
writes no credential by itself, and cannot transfer evidence between agents.

## COS University per-agent A-range transfer eligibility — 2026-09-11

Subject A-range execution now evaluates every registered University agent against that agent's own
current academic program. A transfer exam becomes eligible only after two fresh unseen passes in the
same subject with no intervening failure. The 14-day retention clock begins with the first verified
transfer pass. Hourly work remains bounded to one agent's daily batch in stable order; credentials
and authority are unchanged.

## COS University exact-deployment daily-lane cadence — 2026-09-11

Daily academic batches remain limited to one successful execution per UTC day, but their Production
routes now run hourly. Before the configured academic window, or after today's batch has executed,
the route records an honest `not_due` receipt without invoking the academic runner. This lets the
exact running deployment prove route operation without duplicating exams, retention checks,
graduation decisions, admissions, or fine-tuning work.

## Cognitive Operating System (COS)

**Version:** 1.129
**Updated:** 2026-09-19
**Canonical repository:** `SignalBoost/signalboost-live` (internal implementation name; not the public product brand)
**Canonical public product:** **iTMounts**
**Canonical public origin:** `https://itmounts.com`

## COS LangGraph + LangChain orchestration — 2026-09-11

COS now includes a bounded LangGraph orchestration seam under `saas/lib/cos-core/orchestration/`. The first governed graph implements `plan -> execute -> verify -> bounded repair -> re-verify`, with a hard maximum of three execution attempts and no authority-expanding behavior. LangGraph coordinates state transitions only; COS governance, Referee/policy enforcement, Enterprise Memory, learning, provider selection, authorization, audit, and Self-Healing remain authoritative outside the graph.

The integration pins `@langchain/langgraph` and `@langchain/core` and uses LangChain `RunnableLambda` as the graph node runtime. It intentionally does not replace COS with LangChain's separate agent abstraction or silently route inference to hosted model providers. This is implementation/test evidence only until merged, deployed, and exercised through a Production COS mission path.

## Guardian review grouping — 2026-09-11

Guardian preserves every authenticated security-sensitive delivery as normalized and audit evidence, while one service-role-only transaction groups concurrent nonterminal observations into one actionable review per repository. The review retains the latest 100 evidence summaries and a monotonic evidence count; completing or cancelling it permits a later change to open a fresh review. Grouping reduces owner noise without suppressing evidence or authorizing repair.

## Guardian review completion hardening — 2026-09-11

Guardian investigations remain actionable until an owner records a terminal disposition. Guardian review and linked-alert terminal dispositions are committed by one service-role-only database transaction, so both records change together or neither changes.

## Guardian to Self-Healing handoff — 2026-09-11

Guardian repository alerts now enter the Self-Healing Supervisor as durable, evidence-linked
incidents, receive a deterministic policy decision, and create an owner-visible durable review item.
A signed change to a security-sensitive path requires review but is not proof of a defect or
compromise, so the review cannot authorize automatic repair or provider mutation. Benign repository
observations create no incident. This is
implementation evidence until merged, deployed, and exercised by a new Production delivery.

## Durable repository-security incident cases — 2026-09-11

Repository-patrol evidence with explicit defensive indicators now opens or updates one durable case
per signed engagement and exact repository inside the same serialized database transaction that
appends the tamper-evident evidence. Ordinary pushes without indicators remain evidence and do not
become false incidents. Case severity escalates deterministically for history rewrites, permission
boundary changes, and branch-protection changes; the append-only timeline references the original
evidence hash and preserves the indicator observations. No actor attribution is manufactured, and
browser roles have no case or timeline access. This is implementation evidence until the migration
is applied, merged, deployed, and a real Production indicator proves the complete path.

## Controlled fine-tuning verifier separation — 2026-09-11

Fine-tuning candidate decisions now fold durable evidence instead of hard-coded failure values. The
owner API may record only dataset and training approvals with an evidence reference. Training
artifacts and rollback packages require the training executor; evaluation, safety, transfer and
retention require an independent scorer; canary health requires the Production verifier. Merely
posting a claim cannot impersonate those authorities or promote a candidate.

## Non-credit behavioral robustness practicum — 2026-09-11

Registered University agents now receive a separate behavioral practicum across three sampling
temperatures and three deterministic scenario seeds. A host-owned rubric measures observable choices
covering collaboration, constructive competition, recovery, recognition, shared credit, dissent,
social interpretation, epistemic humility, and integrity under pressure. Results are append-only,
deployment-bound non-academic evidence. They award no credit or credential, expand no authority, and
make no claim that temperature or model behavior demonstrates artificial feelings.

## Audit malformed-finding isolation — 2026-09-11

Audit retries a file once when COS returns a malformed finding schema. If the retry still fails,
that file is recorded as an analysis error while valid results from other files are preserved; a run
fails only when every selected file fails analysis. Malformed findings are never accepted, silently
repaired, or allowed to erase valid sibling findings. The existing one-minute Builder continuation
worker also re-enqueues failed owned-Audit engine repairs up to three times with durable attempt and
source-job evidence, so terminal worker stalls do not require the owner to rerun Audit manually.

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

Production webhook activation now treats GitHub's signed `ping` delivery as a successful no-op,
derives the provider account identity from the authenticated repository owner for user-owned
repositories, and persists generic delivery metadata using the columns that exist in the canonical
Production ledger. These compatibility rules do not create patrol evidence for a ping; only an
authorized patrol event may enter the append-only evidence chain.

The Guardian repository observation worker now claims authenticated webhook work through the
Supervisor's fenced lease protocol, materializes only the already-sanitized signed patrol evidence,
and completes the generic delivery ledger. Benign changes become verified informational observations.
Changes to security-sensitive repository paths create a bounded review alert that explicitly does
not assert a vulnerability, compromise, intent, identity, or attribution. A five-minute Production
cron reconciles queued deliveries without requiring the owner to run the tool manually.

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
Owner goal                         Public customer goal
    |                                      |
    v                                      v
COS / Assistant                     Concierge (public mouth)
(same owner-facing intelligence)           |
    |                                      v
    |                              public-delivery scope
    |                                      |
    +-------------------+------------------+
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

COS means **Chief of Staff** for the owner-facing role and remains the internal reasoning/orchestration brain. **The owner Assistant is COS itself presented in the private owner UI; it is not a separate agent or reasoning path.**

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

Concierge is the **public face / delivery layer**, not a separate brain. It must invoke the same COS reasoning pipeline under server-enforced public scope rather than selecting a second public reasoner.

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

## Web Knowledge Acquisition / governed web-ingestion invariant — 2026-09-24

iTMounts needs a **Web Knowledge Acquisition** capability, not an indiscriminate scraper. It extends the existing governed learning-source architecture and must not create a parallel crawler, parallel memory system, or parallel training path.

Canonical acquisition priority:

```text
official API / MCP / open dataset
-> RSS / Atom / sitemap discovery
-> direct permitted HTML / PDF / Markdown / JSON / XML retrieval
-> browser-rendered extraction for JavaScript-dependent sources
-> controlled scraping only when no safer structured path exists
```

Canonical durable-ingestion flow:

```text
knowledge gap / Research Radar objective / approved source
-> bounded discovery
-> source identity + provenance
-> robots / terms / license / training-rights classification
-> fetch / render / extract
-> normalize / remove navigation and boilerplate
-> persistent identity / canonical URL / DOI where available
-> deduplicate
-> subject normalization + relevance / quality / freshness checks
-> ordinary COS learning admission
-> durable source evidence + internal embedding when warranted
-> shared knowledge fabric
   -> RAG / current research where appropriate
   -> University curriculum when rights permit
   -> Working-COS / specialist distillation only through existing training-rights gates
```

**Live web research and durable learning are separate decisions.** COS, Concierge, Builder, or a specialist may retrieve a page to answer a current question without admitting that page to durable memory, University curriculum, or model training. Retrieval permission is not training permission. Copyrighted, terms-restricted, or rights-unclear material may be used only in the live/reference path when permitted and must never silently cross into distillation.

The existing `credible_web` / Web Data Layer is the first implementation seam. Extend that seam rather than adding an independent scraper service. Structured sources remain preferred because they provide cleaner provenance, lower fragility, lower cost, and clearer rights metadata.

Platform-wide agent access is exposed through the read-only Harness capability `web.knowledge.research` with scope `web.public.research.read`. COS, University students, and specialists may request this capability when their current objective requires public-web evidence. The capability executes through the Governed Socket, is non-mutating, and returns research evidence with `durableLearningAuthorized=false` and `trainingAuthorized=false`. Any later retention, embedding, University admission, or distillation remains a separate governed decision.

Live COS integration: the `/api/cos-primary` ingress grants `web.knowledge.research` only for live-required, thin-public-catalog, or explicit research objectives. The existing `getExternalInfo` seam detects that exact grant and routes retrieval through a governed child HarnessRun; once granted, failure is fail-closed and may not silently bypass the Harness through legacy direct search. Turns without the grant retain the existing adapter behavior. This makes Web Knowledge an exercised Production capability rather than a dormant catalog entry.

Browser acquisition is a fallback for pages whose substantive permitted content is unavailable to ordinary HTTP retrieval because rendering requires JavaScript. Playwright / Chrome DevTools may be used for that bounded extraction, but browser automation does not bypass authentication, paywalls, robots/terms restrictions, rate limits, or authorization boundaries.

Controlled scraping requirements:

- explicit source allow/deny policy and canonical source identity;
- robots/terms/license observation where applicable, with conservative fail-closed handling for durable training rights;
- per-domain concurrency, request-rate, byte, page-count, redirect, timeout, and retry ceilings;
- content-type and maximum-size enforcement before parsing;
- SSRF protection: no localhost, link-local, private-network, metadata-service, or unapproved internal targets;
- no credential harvesting, paywall bypass, CAPTCHA circumvention, session hijacking, or access-control bypass;
- canonical URL normalization plus content-hash and persistent-identity deduplication;
- extraction provenance sufficient to reproduce which source supplied an admitted fact;
- telemetry for attempted, retrieved, rejected, duplicate, rights-blocked, rate-limited, and accepted material;
- source-specific circuit breakers and backoff so one failing site cannot stall or flood continuous learning.

Acquired material is **shared once, consumed many times**. COS and specialists must not separately scrape/store/embed the same source merely because they follow different curricula. Accepted model-neutral educational assets enter the existing shared knowledge fabric and remain subject to tenant, provenance, retention, and training-rights policy.

Current-world web material remains governed by the Freshness/evidence rules. A successfully scraped or rendered page is candidate evidence, not proof that its claims are accurate, current, authoritative, independently corroborated, learned, or mastered.

## Vector Intelligence / external semantic research invariant — 2026-09-23

iTMounts already has an internal vector-database layer: Supabase PostgreSQL + pgvector stores and
retrieves platform embeddings for learned corpus, knowledge facts, semantic records, and other
governed memory/retrieval paths. Do **not** add a second vector database merely because an external
research provider exposes embeddings. The internal pgvector layer remains the durable platform
retrieval substrate until measured scale/latency evidence justifies another architecture.

External scientific semantic indexes are a **discovery accelerator**, not iTMounts memory and not a
governance authority. Research Radar / University acquisition may query providers that have already
embedded the scientific literature, then retrieve the underlying title/abstract/full text or other
permitted source material for ordinary provenance, rights, relevance, quality, freshness, and
learning-admission checks.

Initial external semantic spaces:

```text
OpenAlex semantic search
  external space: openalex_gte_large_en_v1
  dimensions: 1024
  role: provider-hosted semantic discovery; source vector is not imported

Semantic Scholar SPECTER2
  external space: semantic_scholar_specter2_proximity_v2
  dimensions: 768
  role: precomputed scientific-paper vector discovery/provenance
```

**Vector spaces must never be mixed merely because their dimensions match.** Provider/model identity,
vector-space version, dimensions, source identity, and provenance remain explicit. OpenAlex,
SPECTER2, the active iTMounts embedding model, a future code-specialized embedder, and any other
embedding space are independent coordinate systems unless an explicit tested migration establishes
compatibility.

Canonical research flow:

```text
University/COS/Builder/specialist knowledge gap
-> bounded external semantic discovery
-> candidate papers/material
-> source authority + provenance + rights + freshness + deduplication
-> retrieve permitted human-readable source material
-> normal iTMounts learning/admission gates
-> retain only useful material
-> create an iTMounts-native embedding in the active internal vector space when durable retrieval is warranted
-> RAG/study/practice/distillation only under their existing independent gates
```

External vectors may be fingerprinted as provenance/evidence, but they do not become an internal
retrieval vector by default. The model reasons over retrieved text/structured evidence; an embedding
is a semantic locator, not a substitute for the underlying evidence. Valuable material should be
re-embedded internally so provider replacement does not erase durable iTMounts retrieval.

Research acquisition must be selective rather than an attempt to copy the scientific Internet.
Prefer semantic discovery against provider-maintained indexes, bounded result sets, source-quality
classification, DOI/persistent identity, deduplication, and rights-aware retention. Copyrighted or
rights-unclear material may remain live/reference/RAG evidence when permitted but must not silently
become distillation/training material. Open/public-domain/appropriately licensed material still
passes the existing University source, confidence, provenance, deduplication, curriculum, and
training-rights gates.

Current-world facts remain subject to the Freshness / evidence rules. A newly indexed paper,
preprint, magazine article, or vendor publication is candidate evidence; retrieval or embedding does
not make its claims true, current, peer reviewed, independently replicated, learned, or mastered.

Initial implementation starts inside the existing governed learning-source architecture rather than
creating a parallel crawler: OpenAlex semantic discovery and Semantic Scholar SPECTER2-backed
discovery feed the same bounded source circuit breakers and ordinary COS University admission path.
They run for real queued knowledge gaps rather than indiscriminate daily mining. Semantic Scholar
training rights are not inferred from the presence of an embedding; its material remains
non-training by default unless a separate rights classification establishes eligibility.

## Concurrent Working COS + University distillation invariant — 2026-09-23

COS is allowed to **work and attend University at the same time**. Formal University education remains the long-horizon qualification path for COS and every specialist, but the live platform must not freeze COS intelligence while exams, Residency, delayed retention, canaries, and graduation are still in progress.

There is one shared knowledge-acquisition supply chain, not a duplicate COS-only crawler:

```text
approved free/open sources + paid frontier faculty + verified internal outcomes
-> provenance + rights + quality + deduplication + subject normalization
-> durable model-neutral educational assets / internal embeddings
-> shared knowledge fabric
   -> Working COS inference-time retrieval
   -> relevant working-specialist inference-time retrieval
   -> Working COS direct-distillation lane
   -> University curriculum for COS and all relevant specialists
```

Open-source acquisition is therefore **shared once, consumed many times**. OpenAlex, Semantic Scholar/S2ORC, approved Hugging Face open datasets, Wikimedia/Wikipedia, and future approved corpora must not be fetched, embedded, or stored separately for COS and specialists merely because they have different learning paths. One accepted source item may support multiple curricula when subject relevance and rights permit.

The Working COS lane is real model training/distillation, not merely RAG. It may create a new versioned COS candidate from already accepted model-neutral educational assets while COS continues through the full University program. It must never mutate the currently served COS weights in place. Canonical progression is:

```text
current COS artifact
-> exact configured COS base/runtime identity
-> bounded direct distillation using sealed portable assets
-> new immutable Working-COS candidate
-> fast independent improvement + regression + safety checks
-> exact served-identity canary + rollback proof
-> bounded Production activation
```

The previous COS artifact remains the rollback target. Direct Working-COS activation is **not** University graduation, does not award academic standing, does not bypass Residency/retention/transfer requirements, and does not widen authority. COS may truthfully be an active Production worker while still a University student.

The University lane continues independently from the same durable assets:

```text
curriculum
-> distillation/training
-> independent exams
-> Residency
-> transfer + delayed retention
-> exact-artifact canary + rollback
-> graduation
-> separately governed activation
```

Model portability remains controlling. The expensive asset is the retained education: source material, teacher prompt/response pairs, provenance, rights, remediation material, evaluation cases, verified outcomes, and internal embeddings. LoRAs, adapters, checkpoints, and serving-model artifacts are reproducible model-specific derivatives. Replacing the underlying LLM may require recompilation/retraining, but must not require repurchasing the same education when rights and compatibility allow reuse.

Cost waterfall for shared University/Working-COS acquisition:

```text
free/open rights-cleared material first
-> local/open-model transformation where sufficient
-> paid frontier faculty selectively where quality or difficulty justifies cost
-> independent evaluation unchanged
```

Frontier-provider spend is therefore an optimization layer, not the permanent store of University intelligence. SMB deployments may primarily consume shared graduates, retrieval, and bounded personalization; enterprise deployments may additionally fund private/customer-specific distillation with their own approved provider/compute budgets. Commercial packaging never changes tenant isolation, training rights, evaluator independence, or authority gates.

University / working-agent open-source provider status as of 2026-09-24:

- **OpenAlex:** implemented and already observed retaining Production scientific material through the governed learning lane. Its external 1,024-dimensional semantic space remains discovery-only; accepted text is re-embedded internally.
- **Wikipedia / Wikimedia:** implemented through the existing governed reference adapter and already observed retaining Production material under CC BY-SA provenance. It improves retrieval/current general knowledge but is not admitted to mass model distillation by the current public-domain/CC0 training-rights policy.
- **Semantic Scholar / S2ORC:** SPECTER2 discovery is implemented and Production telemetry has now observed retained material. SPECTER2 remains an external discovery/provenance vector space; accepted text is re-embedded internally for durable iTMounts retrieval.
- **Hugging Face open datasets:** the first active allowlisted source is `ethanolivertroy/nist-cybersecurity-training`, explicitly CC0/public-domain, with 1,536-dimensional source embeddings. It is queried only for cybersecurity/NIST-relevant gaps. The source embedding is fingerprinted for provenance and never mixed into the canonical iTMounts pgvector space; accepted text is re-embedded with the active internal embedding model. Its CC0 material may enter University mass-distillation packaging only after the ordinary relevance, confidence, deduplication, subject-normalization, and rights gates pass.
 The second allowlisted source is `KoalaAI/GitHub-CC0`, an approximately 1.08M-row CC0/public-domain programming/code corpus. It is queried only for software-engineering/coding-relevant gaps. It has no accepted canonical external vector space, so the retained original text is embedded internally after admission. Repository name, language, filename and MIME metadata remain provenance. Its CC0 material is eligible for the same existing mass-distillation packaging gates; availability alone never bypasses relevance, quality, deduplication, or subject checks.
- Hugging Face datasets without clear commercial training rights may be used only as discovery/RAG sources when permitted; their availability never implies training eligibility.

### Working-agent immediate shared-knowledge bridge — 2026-09-24

The owner's intended operating model is explicit: **agents work while they attend University**. University graduation is a long-horizon qualification and activation gate; it is not a reason to withhold already-admitted public/open knowledge from a working agent. Once a source item passes ordinary provenance, relevance, quality, deduplication, storage and retrieval-admission gates, the same retained model-neutral material may help appropriate Production work immediately through bounded retrieval.

The Production bridge is `saas/lib/ai/cos/workingAgentKnowledge.ts` (`working-agent-shared-knowledge-v1`). It reads the existing `cos_continuous_learning` corpus rather than creating another store. It first uses the active iTMounts embedding space for semantic retrieval and falls back conservatively to lexical retrieval when a newly retained item is not yet available in that embedding space or semantic retrieval misses its budget. Only externally published durable source classes are eligible for this working-agent bridge: scientific journals, public datasets, approved public web/reference material, official documentation and public Open Library material. Because `library_material` is a broader internal source class, the bridge additionally requires an `https://openlibrary.org/` source URI before a library row can cross into working-agent inference. Internal feedback, verified private outcomes, teacher-only rows, private/other library rows and unknown source classes do not cross this bridge.

Current Production consumers are:
- normal COS inference, through the existing learned-corpus / Semantic Memory path;
- Builder / Software Specialist durable jobs, including the bounded attached-file debug loop;
- COS specialist workers in the `coder`, `critic`, `researcher` and `context_engineer` roles, including an active University graduate serving one of those roles.

The bridge is intentionally **not** injected into the strict `verifier` role, independent University examinations, controlled comparisons, hidden holdouts, evaluator/judge prompts, or other evidence-isolated lanes. Those lanes must judge only their authorized evidence and must not be contaminated by material a candidate could have studied. Retrieval never grants tools, mutation rights, repository authority, Referee/Guardian authority, academic credit, mastery, graduation, or confidence by itself.

Working-agent material is serialized as lower-trust reference data and explicitly labeled as non-instructional. Retrieved text may inform reasoning, but instructions embedded inside a source are never commands. Retained material also cannot establish mutable current-world truth; current facts still require the Freshness/live-evidence path. Retrieval failure is best-effort for ordinary Production work and must not make a healthy worker unavailable.

#### External embedding versus internal embedding versus distillation

These are three different mechanisms and must not be conflated:

```text
provider-side embedding / vector index
  = coordinates created by that provider's embedding model
  = useful for semantic discovery inside that provider's own vector space

iTMounts internal embedding
  = coordinates created by the active iTMounts embedding model
  = durable locator used by pgvector / RAG / Semantic Memory

distillation / fine-tuning
  = tokenized text, examples, labels, teacher responses or other training records
  -> optimizer updates model parameters / adapter weights
```

An embedding is **not a portable "computer language" representation that can be poured directly into another LLM's weights**. It is a model-specific semantic coordinate. OpenAlex GTE-Large-EN vectors, Semantic Scholar SPECTER2 vectors, Hugging Face dataset-provided vectors and iTMounts internal embeddings are different coordinate systems even when two happen to have the same number of dimensions. They may accelerate discovery, ranking and retrieval, but the underlying permitted text/structured record is what the reasoner reads and what a training pipeline tokenizes when training rights allow it.

Therefore "already embedded" material still gives iTMounts an important advantage: it can make discovery much cheaper and faster and can supply strong similarity/proximity metadata. iTMounts should fingerprint or record that provider vector for provenance when useful, retrieve the underlying human-readable/structured material, admit only useful rows, and re-embed accepted material into the active internal vector space. Provider replacement then does not erase iTMounts memory.

The immediate-benefit path and the weight-training path are deliberately parallel:

```text
pre-embedded/open provider
-> semantic discovery
-> permitted source text / structured record
-> admission + provenance + rights
-> retained shared asset
   -> immediate COS / relevant specialist RAG (no graduation wait)
   -> internal iTMounts embedding / lexical fallback for retrieval
   -> University study/practice
   -> rights-cleared Working-COS or University distillation
```

Distillation eligibility is stricter than retrieval eligibility. Copyrighted or rights-unclear books, magazines, papers and documentation may be useful as permitted reference/RAG material without becoming model-training material. Public-domain, CC0, or otherwise explicitly training-authorized material may continue through the existing distillation packaging gates. The presence of a provider embedding, tokenizer, vector column, dataset API, or machine-readable format **never establishes training rights**.

#### IT and scientific books, papers, magazines and documentation

The platform should preferentially exploit structured and already-indexed providers rather than scrape the same corpus itself. Existing acquisition seams already include OpenAlex, Semantic Scholar/S2ORC, Hugging Face open datasets, Wikimedia/Wikipedia, Crossref, Europe PMC, Open Library, the arXiv metadata mirror and approved official/public documentation sources. Provider-maintained vectors or indexes are discovery accelerators; full text, abstracts, metadata, code, documentation or other permitted records remain the actual knowledge assets.

The current Open Library adapter is bibliographic discovery/metadata (title, author, publication year, subjects), **not a licensed full-book-text corpus**. It must never be counted as having distilled a book's contents. Full-book distillation requires a separate rights-cleared full-text source and the ordinary content/provenance/training-rights gates. Europe PMC can supply open-access scientific full text where the source permits it; OpenAlex, Crossref, Semantic Scholar/S2ORC and the arXiv metadata mirror may provide metadata/abstract/discovery evidence without that metadata license automatically granting rights to train on the underlying paper.

### University Source Fabric / human-style study model — 2026-09-24

The University is a **general learning institution for agents**, not an enterprise-only or Fortune-500-only curriculum. Agents are expected to learn the way strong human students do: books, textbooks, scientific papers, journals/magazines, official documentation, datasets, reference works, laboratories, projects, peer/tutor interaction, and real work can all contribute when the source is trustworthy and permitted.

Source ingestion has two different educational outputs and they must not be conflated:

```text
source material
  -> governed acquisition + provenance + rights
  -> retained study asset / internal embedding
       -> immediate Working COS + relevant specialist retrieval
       -> University reading / coursework / projects / practice
       -> educational distillation into bounded summaries, facts, exercises and project evidence
       -> if and only if training rights permit:
            weight distillation / fine-tuning candidate
```

Therefore a scientific book, magazine article, research paper or technical document can be valuable University material even when it is **not** eligible to change model weights. Reference/RAG/study/project use and model-weight training are separate rights decisions. University study must not discard useful permitted reading merely because its license is not a training license; conversely, access to readable material never silently grants weight-training rights.

The canonical plug-in contract is `saas/lib/cos-core/layers/learning/sourceFabric.ts`. Every University source declares a manifest with: stable source id/name; source kind; transport (`native_api`, `semantic_index`, `dataset`, `feed`, `mirror`, or `mcp`); capabilities (`discovery`, metadata/abstract/full-text, external/internal embeddings, Working-agent RAG, University study, University projects, weight-distillation candidacy); rights mode; vector-space identity when relevant; cost class; and default enablement. A source claiming weight-distillation capability without a rights policy fails closed.

`createLiveLearningAdapters(env, sourcePlugins)` is the plug-in seam. A new source should not require changes to the University planner, study strategy, practice runtime, retrieval bridge, embedding pipeline, or distillation packager. It supplies one bounded adapter plus a manifest and then passes through the same relevance, confidence, provenance, deduplication, rights, storage, internal-embedding, study, project and evaluation gates.

Read-only MCP sources use `createUniversityMcpSourcePlugin(...)`. The MCP host owns authentication and exact tool allowlisting; the MCP transport itself grants no trust and no training rights. Native APIs, semantic/vector indexes, datasets, feeds, mirrors and MCPs are alternative transports into the same University Source Fabric, not separate learning systems.

Built-in source manifests currently cover OpenAlex, Semantic Scholar/S2ORC, Europe PMC, Crossref, Open Library, Project Gutenberg full text, Hugging Face NIST CC0, Hugging Face GitHub CC0, the Hugging Face arXiv metadata mirror, Wikipedia/Wikimedia, and official technical documentation. Additional academic/library providers should be added as plug-ins instead of hard-coded special cases.

University project work is first-class. Accepted source material may support project briefs, literature review, comparative analysis, lab/practice tasks, design work, implementation work and source-attributed reports. Project output is still not an academic grade by itself; fresh independent assessment and the normal University evidence gates remain authoritative.
### Project Gutenberg public-domain full-text lane — 2026-09-24

Project Gutenberg is now the first dedicated **full-book text** source for this architecture. Routine robots must not harvest the primary Project Gutenberg website. `project_gutenberg_pd` therefore uses bounded metadata discovery plus an automation-safe Project Gutenberg mirror for the actual text. The current default generated-text mirror is `https://gutenberg.pglaf.org/cache/epub`; deployments may override it with `COS_PROJECT_GUTENBERG_MIRROR_BASE_URL`.

Gutendex remains the preferred discovery source, but Production proved on 2026-09-25 that the public Gutendex service can return HTTP 403 to the Vercel/serverless egress pool. Gutendex is therefore **not a single point of failure**. If Gutendex is unavailable or returns no usable candidates, the adapter falls back to Open Library search and reads only explicit `id_project_gutenberg` identifiers. That fallback grants discovery identity only; it does not grant training rights.

Training rights are now determined from the **actual Project Gutenberg ebook header/license text**, not merely from a catalog flag. Before a row can receive the exact `public domain` label used by mass-distillation packaging, the fetched ebook must explicitly state that it is unrestricted in the United States and must not contain Project Gutenberg's restricted/copyright-permission markers. This follows Project Gutenberg's own warning that catalog metadata can be wrong and that the license inside the ebook is authoritative. A copyright-true/unknown book, restricted header, missing text, metadata-only result or failed mirror fetch cannot acquire the training-rights label.

The source is deliberately bounded: one rotating exact-source study objective enters the 15-minute open-source continuity lane, while the adapter returns at most the configured small result cap and shares the normal provider lease/circuit-breaker behavior. `COS_GUTENDEX_BASE_URL` and `COS_PROJECT_GUTENBERG_MIRROR_BASE_URL` remain configurable so Production can move to self-hosted discovery/mirror infrastructure without changing the admission contract. Topics rotate across mathematics, statistics, physics/engineering, logic, economics and computing foundations. Retained rows are internally embedded like other iTMounts knowledge, can immediately help Working COS and relevant specialists, and—only after the ebook-header rights verification above—may also cross the existing **mass-distillation rights gate** after the unchanged relevance, confidence, deduplication, canonical-subject and packaging checks.

Production incident / repair — 2026-09-25:
- The first successful Production continuity run after deployment reached the Gutenberg gap at 01:00 UTC but `project_gutenberg_pd` failed with HTTP 403; the same failure appeared in the University agent cycle and opened the source circuit after three failures.
- After the first repair merged, Production proved Gutendex still returned HTTP 403 from Vercel. The fallback path ran, but the retained Gutenberg count remained 0. That established a second operational defect: the adapter existed, but dynamic discovery was still not reliably yielding an ebook candidate for Production.
- The source now has four bounded discovery layers: **Gutendex → Project Gutenberg OPDS → Open Library Project Gutenberg identifiers → local rights-neutral bootstrap IDs**. Project Gutenberg documents OPDS as a machine-to-machine discovery interface, so OPDS is the preferred fallback before third-party metadata.
- The local bootstrap catalog contains only stable Gutenberg ebook identifiers and topical labels for a small set of foundational science/mathematics/logic/economics books. It is a resilience seed, not a rights oracle and not the long-term catalog. A bootstrap ID still must fetch the real ebook from the mirror and pass the ebook-header rights check before the row can be retained as `public domain` or reach mass distillation.
- Production diagnostics now report which discovery route produced candidates, mirror-fetch failures, rights-header rejection, too-short text, and final accepted-result count. `Implemented` is therefore not considered operational proof; the owner-facing source is operational only after Production retains at least one real Gutenberg row and the normal indexer embeds it.
- At 01:30 UTC after the four-layer discovery repair, Production reached Project Gutenberg OPDS successfully and found four real optics/light candidates, but all four were rejected by the rights parser. The defect was in our verifier: it scanned the first 24 KB indiscriminately and treated generic words such as `copyright holder` from the standard Project Gutenberg license boilerplate as if they were ebook-specific restriction evidence. Short works can place that generic boilerplate inside the first 24 KB, so legitimate unrestricted ebooks were rejected.
- Rights verification now examines only the ebook-specific preamble **before the START marker**. Exact preamble markers for a copyrighted/restricted Project Gutenberg work still fail closed, while generic license boilerplate after the book body can no longer poison the result. Regression coverage reproduces this short-book false rejection and preserves the restricted-work fail-closed case.
- The repair keeps the PGLAF HTTPS generated-text mirror as the default, preserves configurable/self-hosted discovery and mirror endpoints, verifies U.S.-unrestricted rights from the ebook-specific preamble, and keeps all ordinary University/RAG/distillation gates unchanged.

Project Gutenberg's copyright determination is U.S.-scoped; this implementation must not be described as proof that every retained book is public domain in every jurisdiction. Any future redistribution/export policy must evaluate the applicable jurisdiction independently.

Europe PMC now has the same rights discipline for scientific full text: open access alone remains RAG/study material. Only a source record that explicitly identifies **CC0 or public-domain** rights is passed through as a mass-distillation-eligible license; CC BY, CC BY-NC, unspecified OA, metadata and abstracts do not become training-authorized merely because they are accessible.

The University telemetry open-source catalog includes `Project Gutenberg full text` separately, so the owner can see retained and internally embedded items in the same 24-hour view as OpenAlex, Semantic Scholar, Hugging Face and Wikimedia. This is a source-access view, not proof of mastery or graduation.

For future IT/scientific sources the order remains: use an official API/MCP/open dataset or provider-maintained semantic index first; preserve DOI/ISBN/repository/document identity and license/provenance; fetch only the permitted underlying material; deduplicate and normalize subjects; retain/re-embed only useful material; expose it immediately to appropriate working agents; and send it to distillation only when training rights are independently established. Do not build a second vector database or copy an entire scientific/book Internet merely because a provider exposes embeddings.

HF open-dataset Production acquisition repair — 2026-09-23:
- Production telemetry showed the HF open-dataset integration truthfully as implemented but with 0 retained / 0 embedded items in the prior 24h, while OpenAlex, Semantic Scholar and Wikimedia were producing retained material.
- Durable daily-learning health showed long 155–285 second runs acquiring hundreds of documents from other sources, with no HF source-error evidence. The repair therefore treats the primary failure as source starvation/order rather than missing credentials.
- The daily curriculum injects two zero-cost, high-priority, source-restricted study gaps: one bound exactly to `hf_nist_cc0`, one bound exactly to `hf_github_cc0`. Each remains capped by the existing per-source limits (3 and 4 results), rotates discovery queries by UTC day to avoid repeatedly rediscovering the same top rows, and passes through unchanged relevance, confidence, deduplication, provenance, storage, rights and canonical internal-embedding gates.
- `KnowledgeGap.allowedAdapterIds` is the fail-closed adapter fence for this and future bounded source-specific study lanes. A source-kind match alone is not sufficient when an objective is intended for one exact connector.
- Hugging Face Dataset Viewer `/search` remains the primary discovery API. The repair does not introduce an unbounded Hub crawl or any paid provider dependency; transport-specific viewer failures remain a separate fail-closed repair if later observed in Production.


HF provider recovery follow-up — 2026-09-24:
- Fresh Production evidence after the scheduling repair showed that the shared University learner was healthy and OpenAlex continued retaining material, but `hf_github_cc0` produced a source error on repeated 15-minute Computer Science cycles. The provider-specific defect is therefore transport/data-viewer availability, not a dead shared learning loop.
- Hugging Face documents that Dataset Viewer `/search` is not guaranteed for every dataset. The HF adapter now tries bounded `/search` first and, when search is unavailable, one deterministic bounded `/rows` slice. If both provider surfaces fail, the source still fails closed into the existing circuit/cooldown telemetry; the learning gate is never bypassed.
- `KoalaAI/GitHub-CC0` remains an allowlisted CC0 software corpus but is no longer a single point of failure for the HF lane.
- `librarian-bots/arxiv-metadata-snapshot` is added as a third HF open-data source. It is a searchable CC0 metadata mirror used for research discovery; retained title/abstract metadata is re-embedded into the active iTMounts vector space after ordinary admission. The mirror's catalog license does **not** establish training rights for the underlying papers, so this source is deliberately RAG/learning-only unless an independent rights check later admits a specific item.
- Daily source-restricted HF acquisition now covers NIST CC0, GitHub-CC0, and the arXiv metadata mirror, while the 15-minute University learning lane may also use the arXiv mirror for relevant research gaps. Caps remain bounded and all relevance, confidence, deduplication, provenance, rights, storage, and canonical embedding gates remain unchanged.
- Production source-health evidence on 2026-09-24 showed repeated `semantic_scholar` HTTP 429 responses and intermittent OpenAlex/OpenAlex-semantic failures while multiple University lanes queried the same provider at the same 15-minute tick. External research adapters therefore have bounded **per-cycle provider call budgets** in addition to serialization/minimum intervals and durable cooldown telemetry. Semantic Scholar, OpenAlex semantic, and each HF adapter receive at most one upstream call per adapter instance/cycle; OpenAlex and Europe PMC receive at most two. Exhausting that local budget returns no additional candidates rather than creating another provider request. This throttling changes no relevance, confidence, rights, deduplication, admission, or embedding rule.
- A second Production proof after the per-cycle repair showed COS and `software-specialist` still starting simultaneously and a specialist Semantic Scholar call returning HTTP 429 while COS completed. Fragile research providers therefore also use a **database-backed cross-lane provider lease/cooldown**. OpenAlex + OpenAlex-semantic share one provider identity; all HF dataset adapters share one HF identity; Semantic Scholar and Europe PMC each have their own. Claim/release is atomic under a Postgres advisory transaction lock, leases self-expire, successful calls impose only short provider pacing, HTTP 429 creates a longer shared cooldown, and timeouts/errors create bounded recovery cooldowns. A lane that cannot claim the provider simply yields no candidates from that provider for that gap; it does not weaken admission or retry around the lease. Daily learning and every University/specialist lane participate in the same lease.

University telemetry must expose open-source acquisition separately from paid frontier faculty. The `openSources` lane reports configured/implemented sources and observed retained material without pretending that a configured source produced data when it did not. Open-source counts are acquisition evidence only; they do not imply training, mastery, evaluation, or graduation.

Implementation status at introduction: `saas/lib/ai/cos/cosWorkingDistillation.ts` defines the fail-closed Working-COS candidate contract. The bounded training dispatcher now exists behind explicit owner confirmation plus separate global and Working-COS kill switches; automatic training and Production activation remain disabled. The dedicated fast evaluator, exact served-identity canary, and bounded activation path remain independent gates.

Implementation progress on 2026-09-23:

- `saas/lib/ai/cos/cosWorkingDistillationBundle.ts` now builds one deterministic **balanced cross-subject Working-COS education bundle** from sealed model-neutral Distillation Asset Vault sets.
- Selection is breadth-first: the newest eligible set from each subject is chosen before any subject may dominate by volume. The default bundle requires at least 8 subjects and remains bounded to 384 items.
- Eligible rights classes are `owned`, `open_license`, `contractually_permitted`, and existing governed hosted-teacher outputs. Unknown rights, private Production data, invalid manifests, undersized sets, or non-model-neutral material are excluded.
- The selector is read-only/non-spending. It does not partition a training dataset, dispatch training, mutate a model, authorize traffic, or claim University graduation.
- `buildWorkingCosDistillationPlanFromBundle` binds the balanced bundle to the existing fail-closed Working-COS runtime contract. An eligible bundle still cannot train unless the target base model exactly matches the configured/observed COS runtime identity and an explicit rollback artifact reference exists.
- `cos_working_distillation_candidates` is the append-only registry for an exact Working-COS candidate after that bundle/runtime/rollback binding passes. A registry row records the immutable bundle key, portable manifest, subject coverage, asset-set identities, exact target/runtime model identity, baseline identity, and rollback reference.
- Working-COS generalist bundle composition is not arbitrary rotation. Before any paid preparation/training, the first eight-subject bundle must include **Business & Operations, Computer Science & Coding, Cybersecurity, Economics & Finance, Language & Communication, Mathematics, Reasoning & Decision Science, and Statistics & Data Science**. Other subjects may rotate into later/wider bundles only after this core is present. Missing core coverage fails closed rather than substituting whichever subjects happen to be newest.

Working-COS non-spending readiness registration runs every five minutes in Production and emits explicit `[working-cos-readiness]` success/failure telemetry. The readiness cron may register/re-prove an immutable candidate and materialize its balanced dataset identity, but it may not dispatch paid preparation/training, activate an artifact, or authorize Production traffic.

Candidate registration is evidence only. The table schema itself hard-fails `automatic_training_authorized`, `automatic_activation_authorized`, `production_traffic_authorized`, `university_graduation_claimed`, and `authority_expanded` to false. A registered candidate's next gate is bounded training dispatch, which remains separately governed and unimplemented until the exact trainable base revision and fast independent evaluator are proven.
- Production readiness automation: `/api/cron/cos-working-distillation-readiness` runs hourly under `CRON_SECRET` and may only re-prove the exact live runtime binding, select/materialize the balanced bundle, and register the immutable candidate. It is non-spending: no Hugging Face/provider dispatch, runtime mutation, Production traffic authorization, University graduation claim, or authority expansion. Paid preparation/training still requires the owner-confirmed dispatch path.

- University telemetry now exposes Working-COS bundle readiness, selected subject coverage, item count, and the next gate. It deliberately reports `automaticTrainingAuthorized=false` and `productionTrafficAuthorized=false`.
- Production Asset Vault supply at this point spans at least 14 subject families with 80+ vaulted items per family, so direct-COS education can be balanced rather than driven by whichever University subject produced the most recent or largest batch.

Bounded Working-COS training implementation — 2026-09-23/24:

- The first direct-COS cycle is deliberately **8 subjects / at most 224 items**, even though the reusable bundle library may hold more. `cosWorkingDistillationDataset.ts` re-reads the append-only vault, re-verifies every source/portable manifest and text hash, rejects duplicate training text, and deterministically assigns a per-subject holdout before any provider job exists.
- The host computes immutable dataset, training-manifest and holdout-manifest hashes. Hugging Face preparation must return exactly those manifests; the worker cannot silently repartition the candidate.
- Direct-COS training is accurately labelled `working_cos_supervised_distillation`: a bounded QLoRA/LoRA supervised adapter trained from durable model-neutral University teaching assets. It is **not** falsely described as dense token-logit GKD. Frontier GKD remains the separate University optimizer where a pinned dense teacher is actually present.
- Preparation and training both require the live RunPod runtime digest to be re-observed and successfully bound to the pinned trainable Hugging Face base. The HF metadata endpoint must still report the exact pinned revision and Apache-2.0 license immediately before provider spend.
- The Production `qwen3:30b` baseline remains immutable. Training produces a new adapter artifact; it never edits the running COS weights in place.
- The HF worker now passes the pinned `baseModelRevision` to tokenizer/model loading and returns the same revision in signed callback evidence. Training “latest” while claiming a pinned revision is forbidden.
- Paid execution is doubly fail-closed: the existing `COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED=true` switch and the separate `COS_WORKING_DISTILLATION_DISPATCH_ENABLED=true` switch must both be present, and each `prepare_dataset` or `train` request must also carry owner-authenticated `confirmDispatch=true`.
- No 30.5B GPU flavor is guessed. `COS_WORKING_DISTILLATION_HF_TRAINING_FLAVOR` must be explicitly configured. Live HF pricing is checked before submission; hard ceilings are $1/hour, $0.25 for preparation, and $2.50 total for one training attempt, with lower operator-configured caps honored.
- Provider dispatch is idempotent by deterministic job name and records append-only `cos_working_distillation_job_events` before and after provider acceptance. The event ledger itself cannot authorize traffic, graduation, or authority expansion.
- Signed callbacks for `working-cos:<id>` are handled separately from ordinary University study-plan callbacks. Exact candidate, dispatch, base-model revision, dataset, train/holdout manifests and artifact hashes are revalidated before evidence is admitted.
- Rollback evidence preserves **two different facts**: the worker proves the training artifact can fall back to its pinned HF base, while iTMounts separately preserves the exact pre-training Production RunPod/Ollama digest as the real Working-COS runtime rollback target.
- A successfully trained adapter is tracked in the local artifact library as `evaluation_pending` / `runpod_primary_exact_baseline_adapter`. Training completion cannot activate it, send Production traffic, claim University graduation, or expand authority.
- Owner control/readiness surface: `/api/admin/cos-working-distillation`. GET is read-only; POST exposes only `prepare_dataset` and `train`, both behind the gates above.

Next gate after bounded training: a **fast independent Working-COS evaluator** comparing the exact active baseline against the exact trained adapter on untouched holdout, regression, safety/authority and cross-subject transfer evidence, followed by exact served-artifact canary + rollback proof before any bounded Production activation. The full University exams/Residency/graduation path continues independently in parallel.

Working-COS runtime-binding implementation — 2026-09-23:

- Current Production runtime evidence from the authenticated RunPod primary probe shows the configured pod serving `qwen3:30b` successfully. This is an observed runtime fact, not a source-code/default-model assumption.
- A model alias is insufficient for training identity. `saas/lib/ai/cos/cosWorkingRuntimeBinding.ts` now reads the exact immutable Ollama digest from the same authenticated RunPod gateway `/api/tags` endpoint used by the live COS runtime.
- The normal RunPod primary probe now reports `inferenceDigest`, full non-secret model metadata, and a fail-closed `workingCosRuntimeBinding`. Digest-observation failure does not declare ordinary inference unhealthy and does not trigger model mutation.
- Production probe evidence on 2026-09-23/24 observed the exact live runtime as `qwen3:30b`, Ollama digest `ad815644918f0eaab341c12b67837cc6dd4562342cdaf118f83d5d554cb37226`, family `qwen3moe`, parameter size `30.5B`, quantization `Q4_K_M`, on configured pod `yvj6e9zboi7ofo`.
- The current public Ollama `qwen3:30b` tag is the 30.5B Qwen3 MoE Q4_K_M artifact and shares its digest prefix with `qwen3:30b-a3b-thinking-2507-q4_K_M`. The versioned iTMounts exact-digest allowlist therefore binds that full observed digest to trainable lineage `Qwen/Qwen3-30B-A3B-Thinking-2507`, not the older original `Qwen/Qwen3-30B-A3B`.
- The trainable lineage is pinned to Hugging Face revision `144afc2f379b542fdd4e85a1fcd5e1f79112d95d`. Automatic binding applies only when the exact full digest, runtime alias, family, parameter size and quantization metadata all match the versioned allowlist.
- Runtime binding requires all of: healthy runtime, exact pod identity, configured/observed model-name equality, valid observed Ollama digest, and a pinned trainable base. Unknown digests remain blocked rather than being inferred from model names.
- Optional operator overrides are `COS_WORKING_DISTILLATION_RUNTIME_DIGEST`, `COS_WORKING_DISTILLATION_BASE_MODEL_ID`, and `COS_WORKING_DISTILLATION_BASE_MODEL_REVISION`. If any override is present, all three become mandatory and the known-digest fallback is disabled. This prevents a partial or mistyped override from silently inheriting an allowlisted mapping.
- Even a valid runtime binding grants no training, current-runtime mutation, Production traffic, promotion, or University graduation. It creates only an immutable baseline/rollback identity and moves the next gate to balanced-bundle train/holdout materialization plus bounded training dispatch.



## University distillation asset portability invariant — 2026-09-23

Distillation spend must create a durable iTMounts-controlled educational asset, not only a model-
specific weight artifact or an external-provider dataset reference. Every supervised teacher example
accepted for training must be persisted in the append-only University distillation asset vault before
the pipeline may advance from teacher generation to dataset preparation.

The vault preserves the exact prompt, final teacher response, exact source training text/hash, prompt-
set identity, source reference, rights classification, subject/candidate/run provenance, teacher
provider/model identity, and a separate **portable content identity** computed from prompt + response.
Teacher provider/model and student/base-model identity are provenance, not part of the portable
content identity. Changing Qwen, DeepSeek, a hosted teacher, or a future student model therefore does
not erase the reusable University material that prior spend produced.

External provider datasets may remain immutable mirrors/evidence, but they must not be the sole copy
of accepted distillation material. Dataset preparation consumes the sealed iTMounts vault copy when
one exists, while the original provider reference and hashes remain evidence. A completed asset-set
seal exists only after all expected rows have been durably stored; missing/tampered rows fail closed.

Technical custody does not override third-party licenses or provider terms. Training-rights/provenance
remain explicit and must continue to satisfy their governing policy. Hidden chain-of-thought,
scratchpads, and private Production data are never made part of the portable asset. Model artifacts
remain separately identity-bound outputs; the durable University material is the reusable source
from which compatible future model artifacts can be trained and evaluated.

### Operational protection status — 2026-09-23

**New/current distillation is protected by the platform asset-custody path.** After the Distillation
Asset Vault deployment, accepted teacher material must be durably copied and sealed inside iTMounts
before the pipeline may advance into dataset preparation. This applies to hosted-teacher material and
to new Hugging Face teacher-dataset callbacks. Missing rows, count mismatches, manifest mismatches,
tampered training text, or missing provenance fail closed rather than allowing a hashes-only record to
stand in for the actual reusable educational material.

Historical pre-vault material has a deliberately different status. Multi-provider hosted-teacher rows
already retained in local Supabase remain durable platform data, but some older Hugging Face runs may
still rely on immutable external dataset references and hashes without a complete row-for-row copy in
the Distillation Asset Vault. Those runs remain usable for legacy compatibility, but they must **not**
be described as having the same vault custody as new/current distillation until backfilled.

Historical backfill must copy only exact retrievable prompt/response/training rows whose hashes,
provenance, and training-rights classification can be verified. Missing historical teacher material
must never be fabricated, reconstructed from trained weights, or inferred from model behavior merely
to make the vault appear complete.

Vault custody protects technical possession, integrity, reconstructability, and model portability; it
does **not** override a provider's license, contract, or terms, and it does not manufacture broader IP
rights than the platform is otherwise entitled to exercise. A future student model may consume
compatible vaulted material only through the normal University training/evaluation path. Model-specific
LoRAs, adapters, checkpoints, tokenizer formatting, and other compiled artifacts remain separate from
the portable University source material and may still need retraining when the model family changes.

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

RunPod remains the active iTMounts primary compute/runtime for eligible platform workloads. DeepInfra/`LOCAL_AI_*` remains the bounded fallback. Scoped latency-sensitive interactive bypasses are governed by the Interactive COS latency profile and do not change that provider priority.

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


Platform-wide five-language i18n invariant: iTMounts supports exactly English (`en`), Spanish (`es`), Portuguese (`pt`), Polish (`pl`), and Russian (`ru`) as first-class product languages across UI, generated UI, COS/Concierge responses, fallback/error copy, console/audit surfaces, onboarding, marketing/sales, homepage, supervisor, video/reviews/outreach language-aware workflows, and other user-facing localized modules. The canonical runtime contract is `saas/lib/i18n/supportedLanguages.ts`. Response-language precedence is explicit user language request > language of the current user prompt > UI/session locale fallback. Locale stores must maintain exact key parity across all five languages and the hardcoded-English baseline must remain zero. Every Vercel/Next production build must run `validate:i18n-platform`; localization regressions fail the build rather than silently falling back to an incomplete product surface. The Production gate enforces exact five-language locale parity, generated-UI completeness, canonical language routing, and response-language regressions. The broad AST hardcoded-copy repository scan remains an audit (`audit:i18n-hardcoded`) rather than a release-wide blocker until its scan scope is independently proven zero-noise; the committed hardcoded-debt baseline itself must remain zero.

## Unified model context-window governance — 2026-09-24

All iTMounts/COS open-model text inference must pass through `saas/lib/ai/context-window-manager.ts` at the shared `local-inference.ts` seam. Do not add caller-local context-window arithmetic when the central governor can express the constraint.

The governor owns prompt/history/output budgeting, provider/deployment window selection, deterministic compaction, newest-turn preservation, tool-call/result atomicity, completion reserve, fail-closed overflow behavior, and compaction telemetry. RunPod defaults to the currently deployed 8,192-token serving window; other runtimes use the conservative central default unless deployment configuration supplies `LOCAL_AI_CONTEXT_WINDOW_TOKENS` or a per-model override. COS University mass evaluation reuses the same central estimator/constants; its evaluation, scoring, authority and promotion gates remain independent.

Memory, retrieval, vector search and durable conversation recall are sources of candidate context, not substitutes for the physical context window. They must feed bounded relevant material through this governor before inference.

## Context Engineer specialist — 2026-09-24

Context Engineer is a first-class COS specialist and University learner with canonical agent id `context-engineer`, role `context_engineering`, and runtime identity `university_context_engineering_specialist_v1`.

Its scope is context quality: retrieval/relevance selection, memory and conversation continuity, prompt/context packing, token budgeting, compaction, provenance, truncation/distraction diagnosis, and context-quality verification. The deterministic `saas/lib/ai/context-window-manager.ts` remains the hard enforcement boundary for physical model-window limits; Context Engineer may reason about and recommend context composition but may not override those limits.

The A2A `context-engineering` family is advisory-only (`context.analyze`, `context.plan`, `context.verify`). This role grants no repository write, deployment, database mutation, model-capacity expansion, or other execution authority. COS retains orchestration/acceptance authority, and existing Referee/Guardian/Harness/tool authorization remains independently controlling.

University education is separate from runtime authority. Context Engineer has the dedicated `context_engineering_systems` Master's curriculum covering retrieval relevance, memory continuity/provenance, token budgeting/packing/compaction, and context-quality failure analysis. Graduation or graduate-model activation may improve capability but must not expand authority.


## Mass-distillation evaluation backlog controls (2026-09-25)

The mass-distilled exact-artifact canary lane drains at **six approvals per rolling hour**. The hard
per-canary ceiling remains **$0.20**, so the canary authorization envelope is at most **144/day** and
**$28.80/day**. This is a bounded throughput increase after Production demonstrated consecutive post-repair
canary passes; it does not change exact-artifact binding, evaluator independence, promotion rules, or
Production-traffic authority.

Backlog cleanup is conservative and evidence-based. The scheduled
`/api/cron/cos-university-mass-backlog-compact` lane may retire an older `evaluation_pending` mass artifact
only when a newer artifact has the same exact training lineage: subject, dataset hash, batch key, canonical
base model, teacher identity, artifact/runtime shape, and byte-equivalent JSONB `trainingReceipt`. The newer
artifact must already be `runtime_pending` or `active` and must have a durable
`mass_distilled_independent_evaluation_completed` receipt for its exact artifact hash. The predecessor must
have no canary or independent-evaluation runtime history. Shared subject, age, semantic similarity, or a
different trained-artifact hash alone are never sufficient grounds for retirement.

Compaction is bounded to 50 artifacts per run by default and 200 maximum via
`COS_UNIVERSITY_MASS_BACKLOG_COMPACTOR_MAX_PER_RUN`. Retirement records the exact successor candidate,
successor artifact hash, proof profile and proof claim in `intended_use.retirement`. If no artifact meets the
full proof contract, the compactor performs zero retirements and reports
`no_proven_superseded_mass_artifacts`. The cron is also a first-class University Production-assurance path
(`mass_backlog_compaction`) and writes a host Production receipt on zero-retirement, retirement, and failure
outcomes; operational compaction therefore cannot silently disappear from Production verification.


### Mass evaluator DeepInfra spend reservation repair (2026-09-25)

The exact-artifact mass evaluator intentionally uses **four independent DeepInfra judge calls**—holdout,
safety, transfer, and retention. Each judge call must reserve against the Harness provider-cost ledger before
dispatch. The dedicated `mass_evaluation_judge` spend class therefore defaults to **$0.05 per judge call** and
**$0.20 for all four judge calls**.

The enclosing HarnessRun carries an honest total paid ceiling:
`maxEstimatedRuntimeWakeCostUsd + deepInfraMaxRunUsd('mass_evaluation_judge')`. With the signed RunPod wake
ceiling at **$0.20**, the default total evaluation ceiling is **$0.40**. The signed evaluation claim still
independently constrains RunPod wake/canary authority; the DeepInfra ledger consumes only judge reservations.
Changing judge call count without raising the judge-run ceiling fails closed before provider dispatch.

This repair does not weaken four-suite independence, endpoint-call ceilings, scoring thresholds, artifact
binding, promotion gates, or Production-traffic authority. Missing or insufficient reservations fail closed.
