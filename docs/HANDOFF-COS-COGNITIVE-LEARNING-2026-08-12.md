# COS Cognitive Learning Handoff — 2026-08-12

## Why this exists

This document captures the current COS north star and implementation direction so another engineering agent can continue without reconstructing the design conversation.

The user is **not** trying to build a perfect model and does not expect any single agent, local model, or frontier model to be perfect. The objective is to build a system whose **combined intelligence, tools, memory, practice, validation, and accumulated experience** make it progressively more capable and less dependent on external frontier models.

## Primary objective

COS should become a continuously learning digital agent that independently completes most of the workload that would otherwise require a frontier assistant.

Use measurable workload-relative goals, not claims about "all intelligence":

- mature well-trained COS: target roughly **85% independent pass rate** on the defined SignalBoost workload;
- longer-term super-agent ambition: roughly **92–95%** on a validated workload if empirical evidence supports it;
- external frontier models should handle the difficult/novel/disputed/high-consequence tail, not act as the permanent brain.

These are **capability targets**, not confidence targets. Never manipulate COS confidence merely to make the percentages look better.

## Defined workload

The benchmark should represent work COS is actually expected to perform, including:

- enterprise SaaS architecture and multi-tenancy;
- software engineering and debugging;
- cloud, databases, networking and SRE/operations;
- cybersecurity and governance;
- business analysis;
- sales, marketing and revenue operations;
- SignalBoost-specific operational/product knowledge;
- tool use and connector operation;
- governed agent actions and Self-Healing decisions.

The principal KPI is **independent pass rate versus a strong reference/evaluator on held-out cases**, not a raw self-reported confidence threshold.

## Human-inspired learning doctrine

The user explicitly wants COS learning to resemble how humans learn rather than "crawl → embed → retrieve".

Canonical cognitive loop:

```text
PERCEIVE
→ RECALL
→ THINK
→ INVESTIGATE / USE TOOLS
→ TEST
→ ANSWER / ACT
→ RECEIVE FEEDBACK
→ REFLECT
→ LEARN
→ PRACTICE ON UNSEEN VARIANTS
→ CONSOLIDATE
→ FORGET / WEAKEN / QUARANTINE BAD ASSOCIATIONS
```

A durable item must move through explicit learning states. A useful lifecycle is:

```text
Encountered / Captured
→ Studying / Evaluated
→ Understood
→ Practiced
→ Validated
→ Learned
→ Mastered
```

A source document, teacher answer, or one successful retry is **not** automatically learned knowledge.

### Human-like memory types COS should emulate

1. **Episodic memory** — important experiences: problem, attempted reasoning, evidence, result, correction, agent/teacher disagreement and outcome.
2. **Semantic memory** — generalized concepts and durable facts extracted from validated experiences and primary sources.
3. **Procedural memory / skills** — reusable procedures such as `diagnose_multitenant_latency`, including prerequisites, tools, discriminating observables, falsifiers, known failure modes and measured success.
4. **Metacognition** — explicit representation of what COS knows, what it has only encountered, what remains weak, what has repeatedly failed, and when a specialist/teacher is justified.
5. **Consolidation** — periodic bounded review that clusters experiences, resolves contradictions, strengthens successful knowledge/skills, schedules practice and weakens noise.
6. **Forgetting/reconsolidation** — knowledge can decay, be superseded, quarantined or revised. More stored data is not automatically more intelligence.

## External AI role: teacher and difficult-tail escalation

External providers such as OpenAI, Anthropic or Gemini are **not factual authorities merely because they are frontier models**.

Correct escalation-learning loop:

```text
COS attempts independently
→ local/internal specialist tools and agents investigate
→ if still unresolved, external teacher/specialist may be invoked
→ capture local attempt + teacher answer + disagreement + evidence
→ evaluate teacher lesson
→ extract reusable principle/skill candidate
→ test candidate on unseen variants
→ promote only after validation
→ measure whether similar future external calls decline
```

If the same problem class repeatedly requires an external model, the learning system is failing even if the user eventually receives a good answer.

## Multi-agent / council direction

The user likes the idea of multiple agents collaborating like humans. A future COS Council should use **independent first opinions before agents see one another's conclusions** to reduce groupthink.

Preferred protocol:

```text
independent specialist proposals
→ reveal proposals
→ structured challenge
→ rebuttal/revision
→ evidence gathering
→ COS synthesis/judgment
→ validated learning extraction
```

Agents should exchange structured artifacts, not hidden chain-of-thought:

```text
claim
rationale summary
assumptions
evidence
falsifier
confidence
```

Do not use naive majority voting. Weight arguments by evidence and empirically measured domain-specific agent reliability.

## Tool-learning doctrine

COS should learn to use tools, not merely facts. Tool competence should include:

- capability discovery;
- permissions/scopes and approval policy;
- safe read-only diagnostics;
- sandbox experimentation where available;
- result interpretation;
- failure recovery;
- provenance/audit;
- successful tool sequences promoted into reusable procedures.

The Portable Connector Runtime is the right substrate for buyer-owned tools and permissions. Consequential actions remain governed even when a skill is mastered.

## Current implementation state at handoff

Before starting this cognitive-lifecycle branch, latest scanned `main` was:

`abe0fded45300c20d45604a33390f520d80c3af4`

Important newly merged work already present on that main:

- PR #1152 / merge `b1badd70875ba2a5df7bee1709ca31634090068d` added Gemini to the real external fallback chain, a durable teacher-lesson queue, successful-escalation capture, and made `qwen3:30b` the durable local reasoner default.
- `saas/supabase/migrations/20260813_cos_teacher_lessons.sql` creates `cos_teacher_lessons` with `captured/evaluated/promoted/rejected` states.
- `saas/lib/ai/cos/teacherLearning.ts` records successful external escalations as **teacher examples only** and intentionally does not put teacher text directly into the Knowledge Graph or Continuous Learning corpus.
- `saas/app/api/cos-primary/route.ts` records successful external fallback results as teacher signals.
- Previous credibility work created empirical measurement/calibration infrastructure; smoke calibration must not alter live confidence without independent holdout validation.
- Previous retrieval remediation quarantined cross-domain Kubernetes KG contamination and added a conservative structured-KG semantic floor. Do not undo this by broadening retrieval merely to raise confidence.

## Critical benchmark incident that motivated this work

The recurring multi-tenant SaaS latency benchmark exposed two separate contamination/quality failures:

1. Kubernetes CVE facts were semantically injected into an unrelated SaaS diagnosis. Those structured facts were removed/quarantined and the KG semantic floor was raised.
2. A learned YouTube item labeled `Multi-tenant SaaS performance isolation` contained generic networking material and was injected because the subject label made it look relevant. That production row was removed. This demonstrates why curriculum labels and acquisition metadata cannot substitute for substantive evidence relevance.

The local reasoner then still produced a generic answer (`resource contention`, configuration/data characteristics, neighbor shifts, cache inefficiency) and was correctly capped at COS confidence 0.55 because it named no concrete causal mechanisms. Runtime telemetry showed the local Qwen repair pass ran twice but the second draft was not measurably better.

A subsequent repair change on main forces the diagnostic repair pass to solve the original asymmetries again rather than simply echo/rewrite its failed first framing. Do not raise confidence caps to hide reasoning failures.

A credible answer to that benchmark should reason about mechanisms such as tenant-tier pool/head-of-line saturation, tenant-data-dependent query-plan/cardinality changes, cache working-set threshold crossing, shard/routing placement and tier-specific quota/downstream throttling, with read-only observables and falsifiers.

## Cognitive learning implementation started in this branch

Branch:

`feat/cos-cognitive-learning-lifecycle-20260812`

The intended first production-safe increment is:

1. preserve external responses as teacher signals, never trusted truth by default;
2. add explicit learning/skill lifecycle state beyond document ingestion;
3. record practice attempts and outcomes separately from source confidence;
4. require held-out/unseen validation before `learned`/`mastered` promotion;
5. track reuse/success/failure/last-validation timestamps;
6. add weakening/quarantine semantics for knowledge/skills that fail or become stale;
7. add bounded consolidation logic that proposes/persists state transitions without changing live COS confidence;
8. expose enough telemetry for an operator to see what COS has encountered, validated, learned and mastered.

Do **not** implement automatic confidence bonuses from lifecycle status. Capability mastery and answer confidence are related evidence streams but not the same quantity.

## Measurement

Track at least:

- independent completion/pass rate;
- external escalation rate by domain/problem class;
- external teacher reuse avoidance over time;
- validation pass rate on unseen variants;
- retention after time delay;
- paraphrase/robustness generalization;
- calibration (Brier, log loss, ECE/MCE, signed bias);
- provenance truthfulness;
- appropriate abstention;
- tool/action correctness;
- skill success/failure and decay/revalidation history.

A learning feature counts as successful only when held-out behavior improves.

## Non-negotiable guardrails

- Never fabricate a 5,000-company business corpus or any other synthetic corpus merely to make COS appear knowledgeable.
- Never treat retrieval count as learning.
- Never treat an external model answer as verified factual knowledge merely because of provider/model prestige.
- Never raise confidence to satisfy the independence goal.
- Never weaken tenant isolation, authorization, approval or audit requirements in the name of autonomy.
- Preserve exact provenance: retrieved → relevant → selected → injected → cited/used.
- Re-scan current `main` before every material change because multiple agents are working concurrently.

## North star

The valuable asset is not Qwen, GPT, Claude, Gemini or any single model. Models are replaceable.

The asset is a **COS cognitive system that accumulates validated experience, skills, memory, corrections, tool competence and institutional knowledge, and can transfer that accumulated capability to better underlying local models over time.**
