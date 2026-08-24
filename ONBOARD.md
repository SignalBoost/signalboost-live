# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.23  
**Updated:** 2026-08-24 UTC  
**Canonical scope:** current engineering / operations handoff; verify live state before acting  
**Baseline `main`:** `43061d553533b49ab562e547b7219a599f092aab`  
**Baseline Production deployment:** `dpl_58XyagLUyewQXbcnzPjmtTAzeTfF` — READY, `saas.signalboostapp.com` attached  
**COS primary reasoner:** DeepInfra managed open-model runtime → `Qwen/Qwen3.6-35B-A3B`  
**COS embedding model:** DeepInfra → `BAAI/bge-base-en-v1.5` → 768 dimensions  
**RunPod lifecycle:** detached while the active reasoner points outside RunPod  
**COS learning:** COS-owned memory, knowledge, skills, telemetry and verified outcomes; not provider-weight fine-tuning  
**Procedural-learning state:** autonomous certification architecture is Production; individual skills still earn lifecycle status from evidence  
**Next learning priority:** observe real certification progression, then Retrieval Self-Reflection and calibration / strategy-selection learning  
**Owner knowledge intake:** Feed COS directed study is LIVE at `https://saas.signalboostapp.com/dashboard/cos-directed-study` (navbar: Admin ▸ 📚 entry, owner-only)  
**Concierge/COS public-assistant state:** public/private execution boundary and five-language text transformation are Production; additional semantic-edit + conversation-handoff hardening is Preview READY on `fix/cos-semantic-edit-and-conversation-handoff-20260824` and is **not yet Production**  
**New product workstream:** `SignalBoost Data Center Operations Intelligence` — Phase 1 architecture starts as a read-only/advisory vertical extension of Self-Healing Supervisor + COS + Integrations Hub; branch `feat/datacenter-operations-intelligence-20260824`

> This file records current operational truth and acceptance evidence. Historical detail remains in Git history and dated files under `docs/`. Always re-query GitHub, Vercel and Supabase before acting because concurrent work lands frequently.

**Candidate Lab:** isolated baseline/candidate evaluation on fixed cohorts; it fails closed on regression or no measured improvement and can only recommend human review. It has no repository-write, merge, deployment, or automatic-promotion authority.

---

# Mandatory first-read rule

Every developer, AI coding agent, reviewer, operator, contractor, or infrastructure assistant working on this repository must:

1. Read this `ONBOARD.md` first.
2. Read `docs/HANDOFF-COS-DEEPINFRA-2026-08-20.md` for provider migration / rollback history when relevant.
3. Query current `main`, open PRs, exact Vercel Production state and current Supabase migrations before changing anything.
4. Read the exact files related to the task.
5. Verify implementation and runtime behavior from code plus live evidence before diagnosing or reporting status.
6. Never report current behavior from memory alone.

A branch is not Production. A green build is not capability acceptance. A provider health response is not held-out mastery. An encountered skill candidate is not learned behavior.

---

# Finish-to-completion rule — MANDATORY

COS learning work must be finished end-to-end rather than left as disconnected mechanisms.

```text
architecture / contract
→ implementation
→ deterministic regression coverage
→ schema migration if required
→ exact Preview compile + TypeScript + build
→ merge to current main
→ exact Production deployment READY
→ live Production runtime / database evidence
→ outcome / telemetry proof when the feature requires it
→ ONBOARD.md updated
```

If GitHub Actions fail before step 1 with `steps:null` / no logs, record that as Actions infrastructure state; do not pretend tests executed. The Vercel deployment gate is an independent executable gate and runs the critical COS regression suite before Next.js build.

Never weaken evidence gates, private holdouts, authorization, tenant isolation or lifecycle rules merely to make a dashboard green.

---

# Current Production architecture

```text
Request / goal
→ deterministic policy / business rules
→ classify current-world vs historical / conceptual / internal state
→ current-world fact: live no-cache evidence path
→ local/internal/timeless reasoning: COS-owned memory + validated evidence / skills
→ provider-neutral reasoning control plane / specialist worker selection
→ confidence / grounding / freshness checks
→ governed external teacher/fallback only when policy permits
→ answer-side self-reflection / repair
→ exact turn outcome correlation
→ failure autopsy / retrieval / strategy learning inputs
→ retain / strengthen / weaken / quarantine
```

Primary reasoner transport:

```text
COS
→ provider-neutral LOCAL_AI_* seam
→ OpenAI-compatible transport protocol
→ DeepInfra
→ Qwen/Qwen3.6-35B-A3B
```

Embedding path:

```text
COS semantic retrieval
→ DeepInfra
→ BAAI/bge-base-en-v1.5
→ 768 dimensions
→ model-aware pgvector stores
```

The `/v1/openai` path is protocol compatibility only. OpenAI is not the provider for this reasoner path.

---

# Production environment contract

Expected Production settings:

```dotenv
LOCAL_AI_BASE_URL=https://api.deepinfra.com/v1/openai
LOCAL_AI_ALLOWED_HOSTS=api.deepinfra.com
LOCAL_AI_MODEL=Qwen/Qwen3.6-35B-A3B
LOCAL_AI_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
LOCAL_AI_REASONING_EFFORT=none
LOCAL_AI_MANAGED_PROVIDER=deepinfra
LOCAL_AI_API_KEY=<server-side secret>
```

Never commit, print or expose provider secrets.

---

# Provider / embedding migration — COMPLETE

DeepInfra production cutover and model-space repair are complete.

Accepted facts:

- DeepInfra/Qwen reasoner health and real completions passed.
- BGE embeddings return exactly 768 dimensions.
- embedding model identity is part of the semantic schema; equal dimensions do not imply compatible vector spaces.
- historical incompatible vector space was not reused merely because dimensions matched.
- retained learned knowledge is continuously indexed/re-indexed into the active model space.
- rejected/quarantined corpus rows remain excluded from governed retrieval.
- RunPod lifecycle is detached while the active reasoner URL is outside RunPod.

---

# SignalBoost Data Center Operations Intelligence — PROJECT CHARTER / PHASE 1 STARTED

## Product goal

The goal is **not to build data centers, choose construction sites, sell physical infrastructure, or replace existing DCIM/BMS/monitoring systems**. The goal is to build software that is useful to operators of existing and future data centers.

Working customer-facing direction:

**SignalBoost Data Center Operations Intelligence**

Initial packaging direction:

**Self-Healing Supervisor — Data Center Operations Pack**

Do not add a new standalone portable-product ID merely because this vertical has a name. The canonical portable scan on 2026-08-24 found that the reusable foundation already exists across Self-Healing Supervisor, COS, Integrations Hub, Agent Operations Platform, and Control Center. A separate catalog product should be created only if implementation and commercial packaging later prove that it is genuinely distinct.

## Existing SignalBoost foundation to reuse

Do not rebuild these capabilities:

- **Self-Healing Supervisor** already accepts normalized incidents, diagnoses failures from evidence, applies policy/approval boundaries, verifies remediation, records audit evidence, and supports provider/API/browser/operator execution paths.
- **Self-Healing incident intake** already has a generic signed webhook and vendor-adapter contract. Existing customer monitoring systems such as Datadog, CloudWatch, Alertmanager, PagerDuty, Splunk, or another monitor should feed SignalBoost rather than be replaced.
- **Native proactive monitoring** already demonstrates historical metric samples, threshold/trend detection and conversion of observations into canonical Supervisor incidents; current probes are software-infrastructure focused and must not be misrepresented as physical-facility monitoring.
- **Integrations Hub** already supplies the provider-neutral configuration/integration layer.
- **Agent Operations Platform** already supplies durable workflows, recovery, auditability and provider-neutral coordination.
- **Control Center** already supplies operational/audit visibility and governed controls.
- **COS** supplies reasoning, knowledge retrieval, provenance, learning, feedback, failure autopsy and evidence-gated capability improvement.

The new workstream therefore adds a **data-center domain layer**, not another orchestration platform.

## Phase 1 safety boundary — READ ONLY / ADVISORY

Phase 1 may ingest, normalize, correlate, analyze and explain data-center operational evidence. It may recommend what an operator should inspect next.

Phase 1 must **not** automatically:

- open/close breakers;
- switch UPS or ATS states;
- start/stop generators;
- alter chiller, CRAC/CRAH, CDU, pump, fan or valve settings;
- write BACnet/Modbus/BMS/DCIM control points;
- change rack/server power caps;
- execute any other physical-facility control action.

Read-only adapters and simulated data are acceptable. Any future write/control capability requires a separate explicit governance design, buyer authorization model, fail-safe/rollback analysis, independent acceptance evidence and a new approval decision.

## Phase 1 operator problems

The initial software should focus on five useful operator outcomes:

1. **Incident correlation and probable root cause** — combine many alarms/events into a smaller number of explainable incident clusters and identify the most likely causal chain without pretending correlation proves causation.
2. **Operations knowledge copilot** — answer questions from buyer-provided manuals, SOPs, MOPs, EOPs, runbooks, vendor bulletins and prior incident reports, with provenance to the exact supporting material.
3. **Power/cooling/reliability risk intelligence** — identify abnormal or worsening patterns across UPS/PDU/environmental/cooling evidence and explain the operational risk.
4. **Capacity/efficiency advisory** — surface potential stranded electrical/thermal capacity, abnormal consumption or sustained constraint patterns when the supplied telemetry supports that conclusion.
5. **Predictive-maintenance candidates** — only after sufficient historical evidence exists, identify degradation patterns for operator review; do not claim predictive maintenance from a few synthetic examples.

## Initial integration priorities

Build against existing standards/interfaces before vendor-specific expansion:

```text
generic signed Supervisor incident webhook
→ syslog / SNMP event ingestion
→ Redfish read-only hardware telemetry
→ Prometheus / Alertmanager
→ Datadog / Splunk / PagerDuty / ServiceNow-style adapters
→ DCIM read-only APIs
→ BMS gateways read-only only after the security boundary is designed
```

BACnet/Modbus support, if explored later, should initially be through a hardened **read-only gateway/adapter** rather than exposing COS directly to an OT network.

## Canonical data-center observation/event model

The new layer should normalize evidence before COS sees it. Minimum concepts should include:

- site / facility / hall / room / row / rack identity;
- source system and vendor;
- asset class and asset ID;
- asset classes such as UPS, PDU, ATS, generator, battery, chiller, CDU, CRAC/CRAH, pump, rack, server, switch, sensor;
- metric/event name, value, unit and observed timestamp;
- source severity/status and normalized severity separately;
- threshold/baseline metadata when known;
- evidence/reference to the source record;
- dedupe/correlation identifiers;
- tags such as environment, zone, power path or cooling loop;
- explicit missing/unknown fields rather than invented values.

The normalized layer must preserve raw-source evidence separately from COS inference.

## MVP: simulator before real-facility integration

The first executable MVP should use synthetic/simulated data rather than a live facility.

Suggested simulated estate:

```text
2 UPS systems
4 PDUs
2 chillers
2 CDUs
50 racks
environmental temperature/humidity sensors
selected network/power/cooling status events
```

Initial scenario families:

- cooling pump/CDU degradation;
- rising rack inlet temperature with stable workload;
- overloaded or imbalanced PDU;
- UPS battery degradation;
- coolant-flow/pressure anomaly;
- generator availability failure;
- network-switch/fiber failure;
- abnormal energy-consumption trend;
- multiple unrelated alerts that must NOT be incorrectly collapsed into one incident.

The simulator exists to prove the software contract, correlation logic and COS diagnostic quality. Synthetic cases are **practice/engineering fixtures**, not independent proof that the product works in a real data center.

## COS data-center knowledge curriculum

The existing `dataCenterEnergyLearning.ts` proof of concept is useful background but currently emphasizes site/grid intelligence, regulatory compliance, power markets, hardware lifecycle, fiber planning and construction/permitting topics. Keep useful background knowledge, but the product curriculum must move toward operations.

Priority learning tracks:

1. electrical reliability — UPS, PDU, ATS, batteries, generators and power-quality failure modes;
2. cooling/thermal operations — chillers, CDU/liquid cooling, CRAC/CRAH, pumps, flow/pressure, thermal containment and environmental sensors;
3. data-center incident response and root-cause methods;
4. DCIM/BMS/telemetry semantics and common event models;
5. hardware/platform reliability — Redfish, server health, network/fiber redundancy and component degradation;
6. SOP/MOP/EOP/runbook interpretation with strict source grounding;
7. maintenance and reliability engineering;
8. energy/capacity efficiency as an advisory layer.

Owner-directed study is appropriate for authoritative manuals/standards when licensing permits. Owner direction establishes relevance, but grounding, source quality, scope, contradiction checks and learning/certification gates still apply.

## First acceptance benchmark

Create the benchmark **before** claiming capability. Initial private/curated cases should test:

- correct incident grouping vs false grouping;
- likely root-cause ranking from supplied evidence;
- recognition of insufficient evidence;
- correct identification of the next operator checks;
- correct use of manuals/runbooks when supplied;
- no invented sensor values, equipment state or causal certainty;
- no physical-control action in advisory mode;
- provenance back to telemetry/events/documents used;
- transfer to materially different incident variants.

A passing synthetic benchmark proves only the bounded MVP behavior. It does not prove production effectiveness at a real facility.

## Phase 1 engineering sequence

```text
1. data-center observation/event contract
2. deterministic normalization + validation
3. simulator + diverse incident fixtures
4. map normalized evidence into Supervisor incident intake/runtime
5. COS diagnostic/correlation layer with evidence boundaries
6. buyer-document/runbook retrieval path
7. operator-facing incident explanation + recommended checks
8. private benchmark and regression gate
9. Preview deployment/demo
10. only then evaluate read-only integration with a real monitoring/DCIM source
```

Commercial claim boundary: until real operator evidence exists, describe this as a development/preview data-center operations capability. Do not claim proven predictive maintenance, MTTR reduction, energy savings, uptime improvement or facility-control capability without measured evidence.

---

# Public Concierge / COS general-assistant boundary and text transformation — IMPLEMENTED; HARDENING BRANCH PENDING MERGE

Architectural role is explicit:

- **COS is the engine / brain.**
- **Concierge is the public face / delivery layer.**
- Public Concierge may use COS reasoning and general-assistant capabilities, but it must never inherit or disclose private SignalBoost owner/admin/company context merely because the browser session belongs to the owner.

Actual browser ingress matters. The stable public path is:

```text
browser POST /api/concierge
→ proxy
→ /api/cos-browser
→ /api/cos-primary
→ COS
```

The public scope is therefore enforced at the real browser ingress, not only in a homepage route or prompt. Production rules include:

- public Concierge execution is downgraded to public/guest AI context even when the signed-in user is the owner;
- no Enterprise Memory, learned internal corpus, private Knowledge Graph, user memory, private business metrics, repository/admin tools, internal strategy, provider configuration or secrets may be exposed to the public face;
- public SignalBoost product answers must come from the canonical public-visible product/catalog surface plus allowed verified public evidence;
- public failure must fail safe instead of invoking an internal Backup COS brain that can load private operational material;
- this boundary is server-enforced, not merely a system-prompt request.

General-assistant transformation capability is Production:

- edit, rewrite, proofread, polish, rephrase, shorten/tighten, summarize and translate requests are recognized as transformation work before public freshness/web-search classification;
- the actual `/api/cos-browser` → `/api/cos-primary` ingress is covered, so transformation requests cannot silently fall through to external current-fact search;
- English, Brazilian Portuguese, Spanish, Polish and Russian are supported, including Unicode-safe Polish/Cyrillic intent recognition;
- editing preserves the source language unless a target language is requested; translation uses the requested target language, or the UI locale when the target is omitted;
- pure user-supplied text transformation does not browse, verify or add outside facts;
- the public homepage has a permanent COS response card and uses the rich `AssistantMessage` renderer instead of a disappearing/plain-text result slot;
- quoted/forwarded mail is separated into **EDITABLE SOURCE** and **read-only REFERENCE CONTEXT**; the old thread may inform referents and reply intent but must never be echoed into the finished edit unless explicitly requested;
- professional correspondence defaults to natural, concise, businesslike human writing rather than literal grammar cleanup;
- five-language executive communication modules plus a silent reasoning/quality discipline are wired into the direct transformation path;
- a second local COS copy-editing pass reviews the first candidate for semantic drift, vague referents, stiffness, missing direct answers, awkward literal translations and unnecessary formality before release;
- the public/private governance boundary is not weakened by the executive-writing layer.

Relevant merged sequence on 2026-08-24:

- **#1472** — homepage rich response rendering + direct text-transformation lane;
- **#1473** — server-enforced public/guest Concierge isolation and fail-safe behavior;
- **#1474** — permanent homepage response card and broader edit-request recognition;
- **#1475** — real browser-ingress routing fix so text transformations run before freshness and public scope begins at `/api/cos-browser`;
- **#1476** — businesslike editing, quoted-thread exclusion, five-locale transformation contract;
- **#1478** — executive communication framework across EN/PT-BR/ES/PL/RU;
- **#1479** — quoted email retained as read-only context, second-pass professional copy editing, and initial composer-reset work.

Historical Production baseline immediately after #1479 plus the first deterministic contextual guard was `main` `3a3dc7a8c0d246f5b6b884b820ddab89e3811947`, deployment `dpl_7RMTmwRwCrSjPkyhVY8F8cpbiYrX` — READY. Always use the current top-of-file baseline for present Production state.

## Known Production defect discovered after #1479

Two issues remained observable after the first Production fixes:

1. A malformed draft phrase such as `person post` could still drift through model editing as `personal post`, even though the quoted email makes the intended meaning `one-person post`. The same class of problem can leave vague phrases such as `cancelling this` instead of binding them to `the outbound shipment`, or fail to answer the sender's direct question explicitly.
2. The homepage **Continue with COS** link still reinjects the entire previous request as `/dashboard/assistant?prompt=<old request>`. The assistant page then intentionally hydrates `?prompt=` into the composer. This is why the large old request can remain at the bottom even after reset logic appears correct. It is a handoff-design issue, not merely a textarea reset issue.

Do not report those two items as fully fixed in Production until current `main` is re-inspected and the exact Production behavior is verified; concurrent commits after #1479 may have advanced this state.

## Historical hardening branch evidence

Branch:

`fix/cos-semantic-edit-and-conversation-handoff-20260824`

Known green head:

`22ac1d453da641ba3df405cb9eb69c90f00b9a3a`

Exact Vercel Preview:

`dpl_9b6p2pgimgZHViyrnTSMEozoP4ui` — READY

The branch added deterministic controls around the model rather than relying on prompt tuning alone:

```text
raw user draft + quoted reply context
→ deterministic semantic preparation / anchors
→ first COS writing pass
→ second COS professional editorial pass
→ deterministic final semantic-drift repair
→ release
```

For the observed Dwight-style email case, the branch protected the following grounded meanings:

- `person post` means **one-person post**, never `personal post`;
- `cancelling it/this` is bound to **the outbound shipment** when the quoted message identifies that referent;
- the sender asks whether the user will support the outbound flight, and the rough draft indicates **yes**, so the final response must state that answer explicitly rather than leave it implied.

The branch also replaced the stale-prompt handoff design:

- homepage creates/passes a conversation ID with the COS request;
- after an answer, **Continue with COS** uses `?conversation=<id>` instead of `?prompt=<entire old request>`;
- the full assistant loads that persisted conversation with an empty composer;
- legacy `?prompt=` no longer repopulates the composer unless an explicit draft mode opts into it;
- Send/New Chat reset is owned by the assistant's React state and textarea ref rather than an external DOM click guard;
- the obsolete DOM-level `AssistantComposerResetGuard` workaround is removed.

Exact branch acceptance on `22ac1d45…`:

- Vercel Preview READY;
- enforced COS gate: **178/178 tests passed, 0 failed**;
- exact regressions pass for React-owned composer reset, persisted conversation handoff, legacy prompt suppression, the live Dwight edit shape, semantic `one-person post` normalization and final vague-cancellation repair;
- route-config guard passed;
- strip-safety guard passed;
- i18n copy/locale checks passed across EN/ES/PT/PL/RU;
- optimized Next.js compile, TypeScript, page generation and deployment completed successfully.

Before doing more work on that prior workstream, inspect current `main` because later commits may already include or supersede these changes.

---

# Capability / evidence benchmarks

Private capability acceptance and controlled evidence-utilization are separate cohorts. Do not mix benchmark fixture classes merely to improve a headline pass rate.

Recent accepted architecture includes:

- private capability rotation protected from controlled-comparison fixtures;
- controlled evidence-utilization suite across multiple domains;
- exact `turn_id` outcome correlation;
- adaptive retrieval shadow validation;
- reasoning-worker controlled comparison and outcome learning.

Always query current tables/dashboard before quoting the latest pass rate.

---

# Freshness / current-world knowledge — IMPLEMENTED AND LIVE

The stale-world fix is general, not person-specific.

Current contract:

- ordinary external factual lookups are live-verified by default even when the user does not say `current`, `latest` or `today`;
- historical and conceptual questions retain local/timeless reasoning paths;
- private SignalBoost/system-of-record questions stay internal;
- high-frequency values such as weather, finance and sports prefer structured real-time providers;
- present life/death, office-holder, law/rule, security/CVE, release/version and similar mutable claims use fresh evidence;
- contextual follow-ups resolve the referent from user conversation context before retrieval;
- answer-side freshness self-reflection removes or verifies mutable claims introduced inside otherwise timeless answers;
- current-world background learning refreshes broad governed reference/news/official material and continuously indexes eligible learned corpus;
- answer-time live verification remains the correctness boundary for mutable public facts.

A model-memory assertion is never sufficient merely because the model sounds confident.


**Governed guidance verification — IMPLEMENTED:** Legal, administrative, health, financial and similarly high-consequence public-process questions are routed to the live-evidence path even when phrased conversationally or in a supported non-English language. COS may answer only when the live authority/grounding contract accepts the evidence; otherwise it must state that verification was insufficient. Final answers must show the sources actually used and must never claim a lack of live access when live evidence was used.

**Regulated-claims generation guard — IMPLEMENTED:** A request to generate marketing or other persuasive content is not a factual lookup. For unsupported medical efficacy claims, COS preserves the useful writing task but omits the claim, provides an evidence-bounded compliant template, and names the clinical, labeling, jurisdictional, and regulatory-review evidence required before publication. It must not be diverted into live-search failure solely because the content mentions a medical topic.

**Video-provider execution routing — IMPLEMENTED:** Imperative video render and provider-failover requests are governed external actions, never corpus questions. COS routes them to the execution path, which must check configured providers, authorization, and recorded performance evidence before rendering or selecting an alternative.

For any owner-authoritative topic, secondary web results alone are not sufficient evidence. COS must retrieve at least one first-party or institutional source, or fail closed. This applies to legal and regulatory guidance, medical guidance, standards, and product documentation.

**Owning-authority evidence policy — IMPLEMENTED:** For authority-owned questions (government procedure, product/API behavior, medical guidance, standards), live-search evidence is ranked and labelled by who owns the fact, recognized structurally with no country or vendor tables: **first-party** (the result's domain names the entity the query is about — `docs.stripe.com` for a Stripe question), **institutional** (state/IGO/standards/health domains by convention — one pattern covers `gov.pl`, `gob.mx`, `gouv.fr`, `who.int` identically), then **secondary** (demoted and labelled, never deleted; dated pages before undated). When an authority-owned question retrieves no first-party or institutional source, the evidence carries an explicit caveat instead of presenting secondary commentary as the rule. Implementation: `lib/ai/cos/officialSourceAuthority.ts` wired into `getExternalInfo`.

**Feedback freshness and evidence application — IMPLEMENTED:** Assistant-feedback matching normalizes server-stored and rendered reply text before correlation, so genuine feedback remains securely bound to the exact server-owned turn. COS-primary branches that bypass the ordinary reasoner mint/preserve the provenance `turnId` and synchronously create a minimal matching experience row before response, so feedback verification and calibration cover live-grounded answers and fail-closed abstains too. Plain-language source follow-ups (for example, “where did you get that answer?”) are prior-turn provenance requests, not fresh factual lookups; they bypass the live-evidence gate and return only recorded server telemetry. An explicit multilingual “outdated” correction files only a bounded, current-state study gap; ordinary disagreement does not become a freshness signal. When verified owning-authority evidence explicitly mentions adjacent obligations, COS may add a short cited “Also worth checking” note. It must omit that note when the retrieved sources do not support it and must never invent related procedures from model memory.

---

# Continuous knowledge acquisition / indexing — IMPLEMENTED AND LIVE

Current-world background learning and semantic indexing are separate but connected stages:

```text
acquire current evidence
→ validate/admit
→ durable retained knowledge
→ embed into active model space
→ retrieve in later COS reasoning
```

Normal accepted knowledge is indexed in the learning flow when possible. A recurring indexer drains missing/stale vectors as repair. Empty index cycles do not keep RunPod compute active. Vectors from an old embedding model are eligible for re-embedding.

Stored knowledge helps COS reason; it does not replace live verification for mutable external facts.

---

# Owner-directed study (Feed COS) — IMPLEMENTED AND LIVE

The owner can hand COS a specific piece of material — an article or documentation URL, a YouTube video, a pasted book chapter, notes, or an uploaded file — with a stated study intent, at:

- **Page:** `https://saas.signalboostapp.com/dashboard/cos-directed-study` (navbar: Admin ▸ 📚, owner-only, five-language UI)
- **API:** `POST /api/admin/cos-directed-study` (`?dry=1` assesses without storing; `GET` lists everything fed by hand)

Intake modes:

- **URL** — YouTube URLs resolve captions through the configured transcript runtime (they fail with an explicit message when that runtime is down — paste the transcript instead); other URLs go through the guarded document reader (https-only, public address space, byte-capped).
- **Pasted text** — chapters and notes; paragraph-aligned chunking, ~4k chars per chunk, max 20 chunks per submission, truncation reported rather than hidden.
- **File upload** — `.txt`/`.md` load client-side into the text box; `.pdf` is extracted server-side by a dependency-free extractor (Node zlib + PDF text operators; no package added because the owner workflow cannot regenerate the lockfile). Its limits are explicit: digitally-authored PDFs work; scanned/image PDFs (no text layer — no OCR is pretended), encrypted PDFs and undecodable subset-font PDFs are refused with the exact reason and the paste fallback. A refusal is always preferred over feeding garbage into admission scoring.

Contract, unchanged from autonomous acquisition: topic, study intent, material kind and a **license declaration** are required; every chunk is scored with the autonomous cycle's own grounding/admission gates and admitted or rejected individually with reasons; the channel is recorded in each record's evidence (`owner_directed_study`, operator, intent) and the material kind maps onto the existing source-kind taxonomy. Owner-directed material is authoritative for **relevance to the owner's stated study intent**, but it is never automatically authoritative for factual truth, grounding, recency, scope or contradiction resolution.

Anything admitted immediately feeds the applied-knowledge loops on the next daily cycle: it can reopen a retired study question and trigger an evidence-arrival benchmark retest — so material fed today is measured tomorrow. First live use (2026-08-22): a video-transcript chunk admitted at 0.88 confidence with license and source provenance recorded.

---

# Explicit feedback and reusable reasoning learning — IMPLEMENTED

Explicit positive/negative/correction feedback is securely correlated to server-owned COS turns. The client cannot invent a turn ID.

PR #1364 added the feedback-to-procedural-skill bridge:

```text
negative/correction feedback
→ episodic experience (signal, not truth)
→ local COS reflection
→ generalized procedural candidate
→ structural trigger metadata when applicable
→ local-generated practice only
→ independent certification lifecycle
→ validated / learned / mastered only after evidence
→ reusable future reasoning
```

Hard rules:

- a user correction is not automatically factual truth;
- one correction cannot auto-promote a skill;
- raw conversation text is not stored inside the reusable skill;
- generated practice cannot masquerade as independent holdout evidence;
- structural trigger matches affect procedural relevance, never factual confidence;
- live skill injection selects only `validated`, `learned` or `mastered` states.

Seeded candidate:

`reasoning.context_ambiguity_resolution.v1`

Its structural trigger family includes:

- `deictic_predicate_question`;
- `unresolved_referent_followup`;
- `underspecified_comparison`;
- `vague_temporal_reference`.

The candidate includes explicit observables and falsifiers. It is not promoted merely because the procedure looks sensible.

---

# Autonomous cognitive skill certification — IMPLEMENTED AND PRODUCTION

PR #1376 merged as:

`9bf0a5540c6cdbd409c52a20b9f4aa4587f31bd7`

Production deployment:

`dpl_483vcZK87vq9cB4ULw6pich3stua` — READY

Exact acceptance before merge:

- 10/10 GitHub workflows passed on the exact feature head;
- Vercel Preview READY on the same head;
- enforced COS deployment suite: 112/112 tests passed;
- route config, strip-safety and i18n guards passed;
- TypeScript and full Next.js build passed;
- all substantive Codex review findings were fixed and resolved.

Migration applied in Production:

`cos_cognitive_autonomous_certification`

Protected stores:

- `cos_cognitive_certification_cases` — RLS enabled, no browser policy;
- `cos_cognitive_certification_events` — RLS enabled, no browser policy.

Private profile currently available:

`context_ambiguity_v1`

Production private suite geometry:

```text
understanding: 1
practice:      2
holdout:       7
total:        10
```

The raw private prompts/rubrics are deliberately not committed to GitHub.

Certification contract:

```text
encountered candidate
→ deterministic profile admission
→ private independent understanding case
→ practice
→ independent private holdouts
→ deterministic lifecycle recomputation
→ validated
→ learned
→ production evidence + broader holdout evidence
→ mastered
```

Important safeguards:

- unsupported skill families fail closed until an independent certification profile/evaluator exists;
- the candidate-generating model cannot generate its own holdout evidence;
- `generation_source='local_generator'` can never count as holdout evidence;
- no recurring paid closed-model evaluator is automatically enabled;
- failed practice attempts do not satisfy the `practiced` stage;
- practice requires the configured success-rate gate (currently 0.80 minimum);
- certification uses fair candidate rotation so an older candidate cannot monopolize the daily slot;
- interrupted curated exercises are recovered from stale `running` state;
- exhausted private evidence can mark a candidate saturated instead of generating endless exercises;
- daily certification is progressive and allows at most one new model exercise per cycle;
- the mining route gives certification a shared 210-second deadline inside the 300-second function, reserving the remaining budget for later learning/cleanup stages;
- promotion remains deterministic from recorded evidence, never from a model saying it succeeded.

Promotion policy remains evidence-based:

```text
practiced:  >=2 practice attempts AND >=0.80 practice success rate
validated:  >=3 holdouts, >=3 distinct, >=0.80 holdout rate
learned:    >=5 holdouts, >=4 distinct, >=0.85 holdout rate, fresh validation
mastered:   >=20 holdouts, >=10 distinct, >=0.92 holdout rate,
            >=5 verified production outcomes, >=0.90 production success,
            fresh validation
```

Do not lower these thresholds merely to make a skill appear learned.

Current live candidate state immediately after schema/suite installation remains intentionally unforced:

```text
skill: reasoning.context_ambiguity_resolution.v1
status: encountered
evaluator_approved: false
understanding_approved: false
practice_attempts: 0
holdout_attempts: 0
production_attempts: 0
last_validated_at: null
```

That zero-evidence state is correct. The architecture is Production; the skill must earn its own status through actual certification cycles.

The daily `cos-mining` cron runs at `06:30 UTC`. Its endpoint remains `CRON_SECRET` protected. Do not weaken cron authentication or expose the secret merely to force a demo run.

---

# Cognitive lifecycle / retention / quarantine — IMPLEMENTED

Canonical lifecycle:

```text
experience
→ reflection
→ candidate skill
→ evaluation
→ understanding
→ practice
→ independent holdout
→ validated
→ learned
→ mastered
```

Evidence semantics:

- `encountered`: COS has seen/generalized the pattern;
- `evaluated`: candidate survived an independent admission review;
- `understood`: COS demonstrated the principle on a separate hidden case;
- `practiced`: sufficient successful training evidence exists;
- `validated`: minimum unseen holdout evidence passed;
- `learned`: broader/fresh held-out evidence passed;
- `mastered`: stronger holdout evidence plus verified production outcomes passed;
- `weakened`: retention/production evidence degraded and fresh revalidation is required;
- `quarantined`: explicit contradiction or governance evidence disables reuse.

Retention checks are separate from holdout breadth. Replaying an old holdout may test retention but cannot inflate independent validation breadth. Repeated retention failures can weaken a strong skill. Verified production contradictions can quarantine it.

Lifecycle status is capability evidence, not a factual-confidence bonus.

---

# Reasoning control plane / specialist workers — IMPLEMENTED

The provider model is replaceable compute; COS owns routing and learning policy.

Current roles include primary, coder, critic, verifier and researcher. Controlled comparison can collect outcome-gated routing evidence. Learned worker preferences require sufficient independently verified outcomes and cannot override explicit specialist selection or safety-pinned verification.

No hidden chain-of-thought is stored as a learning artifact. Learn only explicit strategy / worker / evidence / outcome telemetry.

---

# Adaptive Retrieval / Agentic RAG — SHADOW V1 VALIDATED; OVERALL LAYER PARTIAL

Adaptive retrieval shadow validation exists and has passed independent validation. Current live retrieval policy is not automatically replaced merely because a lower-context shadow candidate looked efficient.

Remaining work:

- similarity-threshold calibration;
- source-mix / reranking learning;
- explicit bounded live promotion/rollback policy;
- outcome-linked retrieval self-reflection.

A shadow recommendation is not a promoted Production policy.

---

# Failure autopsy — IMPLEMENTED / ACCEPTED

Verified poor outcomes can produce bounded corrective lessons:

```text
verified poor outcome
→ explicit causal-stage classification
→ shadow corrective guidance
→ different controlled retest
→ retain lesson only if retest passes
```

Do not rerun already accepted cases merely to increase counters. Additional later failures may create new pending autopsies; that does not invalidate the mechanism.

---

# Applied knowledge — IMPLEMENTED AND PRODUCTION; RUNTIME ACCEPTANCE PENDING

Newly retained evidence can reopen a question that COS previously retired as unacquirable, but only for a normal governed retest:

```text
new retained evidence
→ deterministic subject-anchored overlap check
→ evidence must postdate the original failure
→ source confidence and bounded reopen-limit checks
→ audit event
→ requeue as pending
→ normal governed study decides whether it can be resolved
```

The scan is model-free, bounded to three requeues per cycle, runs after daily acquisition/consolidation, and never answers a question, changes confidence, or promotes a skill. Malformed/unstudyable gaps remain terminal; prior evidence and low-confidence/incidental matches do not reopen anything. Owner route: `/api/admin/cos-knowledge-application` (`POST ?dry=1` is read-only).

Migration `cos_knowledge_application` is applied and the Production deployment is READY. Still required: a real post-acquisition requeue trace followed by a normal governed retest. Never manufacture a requeue merely to close this gate.

---

# Evidence-triggered answer retest — IMPLEMENTED AND PRODUCTION; RUNTIME ACCEPTANCE PENDING

New retained evidence may promote a previously failed answer prompt into one bounded active benchmark case, including a one-off failure. This is a measurement request, not a claim that COS can now answer it:

```text
new retained evidence after failed answer
→ deterministic track-anchored lexical gate
→ source-confidence and freshness checks
→ bounded, one-per-track benchmark promotion
→ existing budgeted benchmark runner measures pass/fail
```

The trigger is model-free and never answers, scores, resolves, or modifies confidence. Incidental overlap, stale evidence, low-confidence evidence and generic tracks are rejected. It has a separate candidate-keyed audit table; it never overloads the study-gap audit ledger. Migration `cos_evidence_triggered_retest` is applied and Production is READY. Still required: a real evidence-triggered case and its later budgeted benchmark result; never manufacture either.

---

# Local discovery — IMPLEMENTED AND LIVE

Real-world place queries use live discovery evidence rather than stale model memory. The route prefers deterministic grounded answers when evidence is sufficient, otherwise COS/Qwen evidence-only synthesis, with external fallback optional rather than required.

Conceptual questions must not be hijacked by local-place discovery.

---

# Preference / feedback learning — EXPLICIT STRONG; IMPLICIT PARTIAL

Already present:

- positive / negative / correction feedback;
- exact turn correlation;
- episodic evidence semantics;
- generalized procedural-candidate bridge for negative/correction feedback;
- autonomous certification for supported private profiles.

Still partial:

- carefully defined repeated/rephrased-question signals;
- verified downstream acceptance/use signals;
- abandonment only if there is a defensible event definition;
- no implicit signal may become factual truth or bypass skill validation.

---

# Retrieval Self-Reflection — IMPLEMENTED AND PRODUCTION; PREDICTIVE ACCEPTANCE PENDING

Already present:

- evidence funnel and citation-use telemetry;
- per-item similarity/source metadata;
- exact outcome correlation;
- adaptive shadow policy store and controlled validation.

Implemented: prompt-free deterministic post-turn assessments of explicit retrieval artifacts; exact-turn outcome reconciliation; owner-only read report; predictive gates (12 distinct outcomes, both labels, accuracy, Brier score and failure-risk separation). The reflection records a shadow-only recommendation and cannot change live retrieval policy.

Migration `cos_retrieval_self_reflection_20260822` is applied and Production is READY. Completion criterion: real verified outcomes must show sufficient predictive value before a separate controlled shadow-policy validation; no live policy change is permitted before then.

---

# Calibration Learning — PARTIAL / HIGH PRIORITY

Use exact `turn_id` outcomes to build calibration buckets by problem class, evidence regime and reasoner. Compare predicted confidence with empirical verified success, derive shadow calibration recommendations, and validate on a separate cohort before changing live confidence/escalation thresholds.

**Authoritative calibration correlation — IMPLEMENTED:** Calibration reads outcome truth from `cos_turn_outcomes`, not the best-effort `cos_turn_experience` mirror, so an outcome recorded before deferred experience insertion is retained in the report. Evidence regimes are classified from positive observed learned-corpus utilization plus route/response metadata, never merely because a JSON object contains an empty field. The report remains shadow-only; live thresholds cannot change without balanced, independently verified held-out evidence.

Do not conflate zero-grounding general reasoning with current-state factual claims.

An owner-only cohort report is being added over exact verified turn outcomes, grouped by problem class, reasoner and evidence regime. It is shadow-only and cannot modify live confidence or escalation policy.

---

# Strategy-selection learning — PARTIAL / HIGH PRIORITY

Outcome correlation, the control plane, specialist workers and controlled comparison harness exist.

Finish:

- measure quality/cost by explicit strategy and like-for-like problem cohort;
- derive shadow strategy recommendations;
- validate direct vs Council/challenge/repair/worker choices on held-out cases;
- promote only bounded rules with audit/rollback;
- never disable skepticism/verification globally merely for latency.

---

# Tool-use / procedural sequence learning — PARTIAL

Cognitive Skills already include prerequisites, procedure, tools, observables, falsifiers, common failure modes and prohibited actions.

Finish outcome-based problem-class → governed tool/skill sequence recommendations. Learned preferences must never widen authorization or bypass approvals.

---

# Episodic → semantic compression — PARTIAL

Repeated independently supported episodes may propose generalized facts/rules/skills, but require corroboration, contradiction checks, correct scope and independent validation before durable promotion. Contradicted generalized knowledge must be weakenable/quarantinable.

One episode remains insufficient for strong semantic promotion.

---

# Repository inspection authority — FIXED / LIVE

A signed-in owner request to scan, audit, inspect, review or analyze the configured SignalBoost repository is already authorization for **read-only** repository inspection.

The chat must not ask the owner to repeat the configured repository, reconfirm permission or paste files. Repository reads remain separate from write/deploy/secret authority.

---

# Governed remediation experience — IMPLEMENTED; runtime acceptance pending

COS now retains a bounded form of operational experience from objectively recorded Self-Healing repair outcomes.

```text
incident observed
→ COS diagnosis from current bounded evidence
→ optional prior repair suggestions only after repeated clean objective outcomes
→ existing Agent Gateway policy / approval evaluation
→ execution or staging / fail closed
→ objective outcome record
→ future diagnostic context
```

Rules:

- a prior repair is only a diagnostic suggestion, never execution authority;
- a remedy is suggested only after at least two objective successes, zero recorded failures, and an exact match on provider, environment and bounded incident class;
- any recorded failure disqualifies that action from the suggestion set;
- the context excludes raw prompts, credentials and hidden chain-of-thought;
- Agent Gateway registration, policy and approval requirements are unchanged;
- this is retained operational experience, not provider-weight self-training.

Files:

- `saas/self-healing-host/remediation-experience.ts`
- `saas/self-healing-host/native-autonomous-loop.ts`
- `saas/self-healing-host/council-outcome-bridge.ts`
- `saas/lib/autonomous-supervisor/diagnostic.ts`
- `saas/tests/remediationExperience.node.test.ts`

Still required before calling it production-runtime-proven: a safe controlled anomaly that produces repeated objective repair outcomes, then a later equivalent anomaly whose COS diagnosis shows the eligible prior-repair suggestion while governance remains intact.

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
- learned retrieval/worker/tool/skill preference cannot widen authorization;
- no hidden chain-of-thought persistence;
- private certification prompts must not be committed to GitHub or returned through public/admin APIs without an explicit protected diagnostic need;
- public Concierge must never inherit owner/admin/private-company context simply because the requesting browser is authenticated as owner;
- Data Center Operations Intelligence Phase 1 is advisory/read-only and may not issue facility-control writes.

---

**Turn-outcome chronology integrity — ACCEPTED:** PR #1387 added and deployed the service-role-only chronological merge. Production migration `cos_turn_outcome_chronology` is applied. In a rolled-back Production transaction, a newer verified-success event was retained and a later-delivered older failure was ignored; the test row was confirmed absent after rollback. Outcome data is safe from stale-event regression for calibration and strategy analysis.

# Recent merged sequence that matters

- #1328 — exact turn outcomes + controlled evidence-utilization benchmark.
- #1329 — benchmark reliability / latest-score cleanup.
- #1330 / #1332 — learning-gap + general failure autopsy.
- #1331 — Concierge explicit feedback controls / secure turn correlation.
- #1333 / #1334 — provider-neutral reasoning control plane and Production routing.
- #1337 — specialist reasoning workers.
- #1338 — reasoning outcome learning.
- #1339 — controlled reasoning comparison harness.
- #1341 — adaptive retrieval shadow validation.
- #1345 — private benchmark cohort protection + adaptive preflight.
- #1348 / #1349 onward — temporal/current-world freshness generalization.
- #1355 — general external factual lookups live-verify by default.
- #1360 / #1362 — local discovery grounded/local-first synthesis.
- #1363 — answer-side freshness self-reflection.
- #1364 — governed feedback → reusable procedural candidate learning + structural triggers.
- #1376 — autonomous evidence-gated cognitive skill certification with private profiles and bounded scheduling.
- #1384 — applied knowledge: deterministic requeue of dormant gaps only when newly retained evidence qualifies.
- #1472–#1476 — public Concierge general-assistant text transformation, rich/persistent homepage answer rendering, real browser-ingress routing and public/private isolation.
- #1478 — five-language executive communication framework wired into direct COS transformation.
- #1479 — context-aware quoted-mail editing, second-pass professional copy editing and first composer-reset implementation.
- `3a3dc7a8…` — first deterministic contextual edit quality guard landed on `main`; later commits may supersede this historical checkpoint.
- #1481 / `43061d55…` — owner-directed study relevance authority clarified and Production baseline advanced; owner direction controls relevance, not factual truth/grounding.
- Retrieval Self-Reflection — deterministic prompt-free retrieval assessment, exact-outcome correlation and shadow-only predictive gates.
- Evidence-triggered answer retest — bounded evidence-arrival promotion of failed prompts into budgeted benchmark cases.
- Owner-directed study (Feed COS) — gated owner intake page/API with URL, paste and `.txt`/`.md`/`.pdf` upload (dependency-free PDF extraction), same grounding/admission gates as autonomous acquisition.
- Cross-language freshness + owning-authority evidence — five-language live-verification triggering and first-party/institutional/secondary evidence ranking with an explicit no-authority caveat.
- Assistant-feedback repair — normalized reply correlation on both resolution paths (fixes the silent 404 that blocked all Concierge feedback), multilingual "outdated" corrections file bounded current-state study gaps, grounded "Also worth checking" adjacent-obligation notes.
- Answer evidence hygiene — COS retrieval labels such as `[CL1]` and `[LIVE2]` are internal prompt scaffolding. They are removed from user-facing replies unless a real source URL accompanies them; corpus-gap commentary is never presented as an answer.
- Provenance-intent routing — answer-origin follow-ups work with singular or plural references and do not require a second-person pronoun. Ordinary research/source questions remain content requests.
- Strategy-profile generation — current measured campaign outcomes are read on each strategy-profile request (semantic cache bypassed). Only evidence-qualified overrides may affect content; the reply must expose supporting campaign IDs, counts, and performance comparisons.

Always query current state; this sequence can advance after this document is merged.

---

# Immediate next engineering priorities

1. **Data Center Operations Intelligence Phase 1:** implement the normalized read-only observation/event contract and simulator on `feat/datacenter-operations-intelligence-20260824`; reuse Self-Healing Supervisor incident intake/runtime rather than creating a parallel orchestration stack.
2. **Data Center Operations private benchmark:** define diverse incident-correlation/root-cause/advisory cases before claiming capability; include false-correlation and insufficient-evidence cases.
3. **Re-inspect current Concierge semantic/handoff state** before continuing that older workstream because `main` has advanced beyond the historical green branch documented above.
4. **Observe the first real #1376 certification cycles** and verify the seeded ambiguity candidate progresses only when private understanding/practice/holdout evidence passes. Do not manually set lifecycle flags/counters.
5. **Retrieval Self-Reflection:** observe real verified outcomes and prove predictive value before a separate shadow-policy validation.
6. **Calibration Learning:** empirical confidence calibration by problem/evidence/reasoner cohort, shadow first.
7. **Strategy-selection learning:** validate worker/Council/challenge/repair choices on like-for-like held-out cohorts.
8. **Adaptive Retrieval v2:** similarity-threshold calibration, source mix/reranking and explicit bounded promotion/rollback.
9. **Add independent certification profiles only where justified** by a private/curated test family; unsupported procedural candidates must continue to fail closed.
10. **Retention continuity:** prove delayed refresh + weaken/quarantine paths under the current reasoner without inflating holdout breadth.
11. **Episodic → semantic compression:** multi-episode corroboration and reversible promotion.
12. **SFT/LoRA readiness only after** sufficient high-integrity outcome-labelled data, contamination controls and a separate held-out comparison exist.

---

# Status language

Use precise actual states.

A plan is not execution.  
A queue row is not a sent message.  
A branch is not Production.  
A green deployment is not Enterprise RC acceptance.  
An episodic encounter is not knowledge.  
An `encountered` skill is not validated learned behavior.  
A teacher/user correction is evidence, not automatic truth.  
Cache reuse is not new reasoning competence.  
Equal embedding dimensions are not equal embedding spaces.  
Current-fact retrieval is not timeless memory.  
Telemetry collection is not adaptive learning until a validated consumer can safely improve future behavior.  
A shadow recommendation is not a promoted Production policy.  
A self-generated practice pass is not independent validation.  
A private certification case is evidence only after it is actually executed and recorded.  
A current-world page retrieved now can itself contain stale content; source date and authority still matter.  
A Preview fix is not a Production fix, even when the exact Preview test gate is fully green.  
A synthetic data-center simulator pass is not real-facility proof.  
A correlated alarm cluster is not a proven physical root cause.  
An advisory recommendation is not authorization to control facility equipment.

---

# Definition of success

The model/provider is replaceable compute. **COS is the learner.**

Success means validated experience measurably improves held-out or verified Production performance, transfers to materially different variants, retains the improvement, lowers repeated teacher/fallback dependence, and preserves honest confidence, provenance, tenant scope and governance.

For metacognitive learning, COS must prove which retrieval policy, evidence class, procedural skill, tool sequence or explicit reasoning strategy improved outcomes for a problem class, detect when that lesson stops working, and safely weaken, quarantine or roll it back.

For Data Center Operations Intelligence, success means the software can ingest normalized read-only operational evidence, distinguish related from unrelated events, produce evidence-bounded probable-cause analysis and useful operator checks, recognize when evidence is insufficient, preserve provenance, and remain safely advisory until a separately governed control phase is explicitly approved.
