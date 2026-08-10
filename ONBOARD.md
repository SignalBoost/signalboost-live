# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.2
**COS Independence / Autonomous-Intelligence Phase:** COMPLETE — 2026-08-09

---

# Mission

SignalBoost is not a collection of AI applications.

SignalBoost is a Cognitive Operating System (COS) that powers specialized software modules called **Portables**.

Portables perform business functions.

COS provides the intelligence.

External AI providers are replaceable compute engines and escalation resources, not the owner of SignalBoost intelligence.

The intelligence belongs to SignalBoost.

---

# Vision

Build software that becomes smarter, faster, cheaper, and more valuable every time it is used.

Every improvement made to COS should automatically improve every Portable.

Every dollar saved by COS benefits every customer.

Every piece of verified knowledge discovered should become a permanent corporate asset.

The target operating loop is:

```
Observe → Remember → Learn → Reason → Act → Verify → Improve
```

---

# 2026-08-09 COS Independence Completion

The COS independence/autonomous-intelligence engineering phase is complete.

This milestone changed COS from an architecture that could use memory and external models into an autonomous operating layer that owns reusable intelligence, planning, learning, execution policy, cost governance and provider selection.

The completed system includes:

- persistent memory and durable knowledge
- semantic and exact caching
- knowledge graph components
- autonomous knowledge-gap detection
- daily and live-source learning paths
- provenance, confidence and freshness controls
- deterministic/business-rule reasoning before AI
- local context compaction and automatic summaries
- prompt/context reduction
- in-flight request deduplication
- durable response and reasoning reuse
- learning-quality measurement
- AI ROI and avoided-cost telemetry
- autonomous missions
- safety and execution gates
- private/local AI endpoint support
- local-primary/cloud-fallback routing
- zero-cloud / zero-provider readiness assessment
- provider-boundary enforcement
- reusable skill registry
- goal engine and goal-to-skill planning
- AI role orchestration
- cross-hub orchestration
- autonomous decision integration
- enterprise-memory persistence
- revenue/outcome feedback signals
- runtime independence evidence and regression validation

The independence milestone means COS architecture no longer treats OpenAI or Anthropic as the system's brain. Provider calls are optional compute/escalation paths selected by COS when local, deterministic, cached, learned or reusable intelligence is insufficient.

This phase is closed. Do not reopen or redesign it without a demonstrated regression or a new architectural requirement.

---

# Completed Enterprise AI OS Layer

COS now includes an Enterprise AI OS layer for turning business objectives into governed execution.

Core flow:

```
Business Goal
    ↓
Goal Engine
    ↓
Planning / AI Roles
    ↓
Reusable Skill Registry
    ↓
Cross-Hub Orchestration
    ↓
COS Execution Governor
    ↓
Deterministic / Local / Provider Compute
    ↓
Verification
    ↓
Enterprise Memory + Outcome Signals
    ↓
Future Improvement
```

This creates a reusable execution system rather than independent prompt chains inside individual Portables.

---

# Five-Layer COS Execution Model

The completed master execution path is organized around five practical intelligence layers.

## Layer 1 — Deterministic / Business Rules

Programmatic logic executes first.

Formatting, validation, routing, permissions, calculations, known workflows and other deterministic work must not consume AI tokens.

## Layer 2 — Knowledge and Reuse

COS searches known information and reusable work before generating anything new.

This includes exact cache, semantic cache, durable response reuse and known procedures.

## Layer 3 — Memory and Context

COS reconstructs only the context needed for the current task.

Long histories are compacted into reusable summaries so the complete conversation or workflow does not have to be repeatedly sent to a model.

## Layer 4 — COS Reasoning and Skills

Goals, learned procedures, reusable skills, autonomous decisions and local reasoning are attempted before cloud escalation.

## Layer 5 — Replaceable Compute

When additional model reasoning is justified, COS routes to the cheapest acceptable available compute resource, including private/local models or external providers.

Completed results return to memory, knowledge, learning and telemetry so future executions can avoid repeating the same work.

---

# Core Principles

## COS is the Brain

Every Portable uses COS.

No exceptions.

---

## AI is the Last Resort

Never call an external AI model if the answer or procedure already exists or COS can complete the work locally/deterministically.

COS should always attempt existing intelligence first.

---

## Local First

For work requiring model reasoning, COS supports private/local AI as the primary reasoning path.

Cloud models are fallback/escalation compute when policy, capability and economics justify them.

COS must remain architecturally capable of operating with OpenAI and Anthropic credentials disabled.

---

## Never Pay Twice

If COS already knows something, reuse it.

Never regenerate existing knowledge.

Never rediscover the same buyer.

Never rewrite identical content.

Never repeat expensive searches.

Never execute duplicate simultaneous work when callers can share one result.

---

## Providers are Replaceable

OpenAI

Anthropic

Gemini

Mistral

DeepSeek

Qwen

Local Models

Future Providers

All are interchangeable compute providers.

No Portable should depend directly on any provider.

---

## Intelligence Belongs to COS

Providers may perform requested computation.

COS owns:

- Knowledge
- Memory
- Learning
- Planning
- Skills
- Business Rules
- Cost Governance
- Telemetry
- Decision Making
- Provider Selection
- Verification
- Outcome Feedback

---

# Architecture

```
                 User / Event / Goal
                         │
                         ▼
                     Portable
                         │
                         ▼
                        COS
                         │
       ┌─────────────────────────────────┐
       │ Goal / Planning / Skills        │
       │ Knowledge / Memory / Learning   │
       │ Execution Governor              │
       │ Verification / Telemetry        │
       └─────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    Deterministic     Local AI      Cloud Compute
       Logic          / Private       Fallback
                        Model
```

---

# COS Execution Order

Every request MUST follow this order.

```
Request / Goal

↓

Business Rules

↓

Knowledge

↓

Learning

↓

Memory

↓

Exact Cache

↓

Semantic Cache

↓

Durable Reuse / Existing Running Request

↓

Context Compaction

↓

Budget Governor

↓

Goal / Skill / Reasoning Planner

↓

Local / Private Reasoning

↓ when justified

External Compute Escalation

↓

Validation / Verification

↓

Knowledge + Learning Update

↓

Outcome / Revenue Signals

↓

Telemetry / ROI

↓

Response / Action
```

Nothing intentionally bypasses this sequence.

---

# Business Rules

Business rules always execute before AI.

Examples

- formatting
- calculations
- regex
- validation
- routing
- permissions
- workflows
- approvals

Never use AI for deterministic logic.

---

# Knowledge

Knowledge contains reusable facts and verified procedures.

Examples

- companies
- buyers
- journalists
- products
- industries
- competitors
- contacts
- previous research
- verified engineering solutions
- successful workflows

Knowledge is reusable.

Knowledge should never be unnecessarily regenerated.

---

# Memory

Memory stores task, workflow, user and enterprise context.

COS supports durable enterprise memory while still distinguishing temporary working context from long-lived knowledge.

Examples

- current conversation
- current workflow
- current task
- active user session
- reusable enterprise context
- prior outcomes

Temporary memory may expire or compact.

Verified durable knowledge persists.

---

# Learning

Learning changes future behavior.

COS learning is useful only when it improves later execution.

Learning therefore requires measurement rather than merely accumulating information.

Example

COS discovers and verifies:

Company X never buys products under 500 employees.

COS remembers this.

Future searches automatically improve.

Learning reduces future AI calls and unnecessary work.

---

# Exact Cache

If an identical request already exists and remains valid:

Return it immediately.

No AI.

No search.

No cost.

---

# Semantic Cache

If a sufficiently similar reusable request already exists:

Reuse the previous knowledge/reasoning when valid.

Example

"Find MSPs in Brazil"

and

"Find Brazilian Managed Service Providers"

should be candidates for shared knowledge rather than independent expensive discovery.

---

# Durable Reuse

COS persists reusable results and procedures beyond a single process/request lifecycle.

Reuse must survive normal execution boundaries so restarting or scaling the application does not force COS to relearn work it already completed.

---

# Existing Running Request

If two Portables request the same work simultaneously:

Execute only once when safe.

Every caller can wait for the same result.

Never pay twice.

---

# Context Compaction

COS does not repeatedly send unlimited historical context to a model.

It creates bounded, reusable context summaries and retrieves only the information relevant to the current task.

Context compaction is a cost-control and reasoning-quality mechanism.

---

# Execution Governor

Every governed AI request passes through the Governor.

Responsibilities

- Routing
- Budget enforcement
- Retry limits
- Loop detection
- Exact cache
- Semantic cache
- Durable reuse
- Prompt/context reduction
- Cost tracking
- ROI telemetry
- Provider selection
- Provider translation
- Local-primary routing
- Cloud fallback policy
- Runtime evidence

Nothing intentionally bypasses the Governor.

---

# Budget Governance

Every request has limits.

Examples

Maximum

- cost
- turns
- retries
- tokens
- execution time

If exceeded:

Execution stops or follows the applicable governed escalation/approval path.

---

# Loop Detection

Infinite reasoning loops are forbidden.

COS must detect

- repeated prompts
- repeated retries
- recursive reasoning
- duplicate searches
- repeated remediation attempts

Stop or escalate according to policy.

---

# Model Routing

Always choose the cheapest acceptable execution path.

Preferred order:

```
Deterministic / Existing Knowledge
        ↓
Cache / Durable Reuse
        ↓
Reusable Skill / Learned Procedure
        ↓
Private / Local Model
        ↓
Approved Cloud Compute
```

Never default to the most expensive model.

---

# Provider Independence

Portables never need to know whether execution uses:

- OpenAI
- Anthropic
- Gemini
- Mistral
- a private model
- another future provider

Portables call COS.

COS decides:

- deterministic execution
- skill reuse
- provider
- model
- caching
- context
- budget
- retries
- fallback
- validation

Provider-boundary enforcement exists specifically to prevent provider-specific intelligence from leaking back into Portable architecture.

---

# Zero-Cloud Independence

COS includes explicit zero-cloud readiness/independence assessment.

The purpose is to prove that normal COS intelligence can execute without OpenAI or Anthropic being architectural requirements.

The validation model covers:

- local model configuration and health
- local-primary execution
- actual cloud fallback accounting
- successful runtime samples
- durable reuse
- learning effectiveness
- runtime evidence
- ROI/cost avoidance
- regression protection

External provider availability may improve capability or quality for selected tasks, but it must not define ownership of the intelligence system.

---

# Canonical Tool Schema

All tools should be defined once.

COS translates canonical capabilities into provider/runtime-specific representations.

Portables should not duplicate provider-specific tool definitions.

---

# Goal Engine

COS can accept a business objective rather than requiring every operation to begin as a manually constructed prompt chain.

The Goal Engine converts objectives into governed plans that can be mapped to reusable skills, AI roles, hubs and execution capabilities.

---

# Reusable Skill Registry

Repeatable procedures belong in a reusable skill registry.

A skill represents a known way to perform a class of work.

Skills reduce repeated model reasoning and allow COS to become more capable as verified procedures accumulate.

Skills should be:

- discoverable
- scoped
- governed
- testable
- reusable across Portables where appropriate
- connected to outcome evidence

---

# AI Roles and Cross-Hub Orchestration

COS supports specialized AI roles and coordination across SignalBoost hubs.

Roles are execution responsibilities, not separate intelligence silos.

They share COS memory, knowledge, governance, skills and outcome signals.

This allows a business objective to coordinate research, outreach, revenue operations, support and other capabilities without rebuilding the reasoning stack for every module.

---

# Autonomous Decisions

Autonomous decisions are governed decisions.

Autonomy does not mean bypassing permissions, budgets, approvals, security controls or verification.

COS should autonomously perform work that policy allows and halt/escalate consequential actions according to the applicable control boundary.

---

# Cost Optimization

COS reduces costs using

- deterministic code
- business rules
- exact cache
- semantic cache
- durable reuse
- prompt/context compaction
- rolling summaries
- model cascading
- local-primary reasoning
- batch processing
- budget governance
- retry limits
- loop detection
- in-flight request deduplication
- reusable skills
- learned procedures

Every optimization should reduce future cost without silently reducing required correctness or safety.

---

# AI ROI Metrics

Cost optimization must be measurable.

COS tracks evidence such as:

- provider calls avoided
- tokens avoided
- cache hits
- semantic hits
- knowledge hits
- durable-reuse hits
- local executions
- cloud fallbacks
- estimated/actual provider cost
- avoided external cost
- latency
- learning reuse
- successful runtime outcomes

The purpose is to prove whether COS intelligence is reducing dependence and operating cost rather than merely claiming that it should.

---

# Knowledge First

Before calling AI, COS asks:

Do I already know this?

Can I retrieve it?

Can I reuse a verified procedure?

Can deterministic code solve it?

If yes, do not buy reasoning unnecessarily.

---

# Learning First

Every completed task should have the opportunity to improve COS.

Examples

Research

↓

Knowledge

Sales

↓

Buyer intelligence

Press

↓

Journalist intelligence

Supervisor

↓

Incident intelligence

Engineering

↓

Verified solution patterns

Revenue outcomes

↓

Strategy improvement

Everything verified and reusable can become shared COS intelligence.

---

# Continuous Learning

COS MUST learn proactively as well as reactively.

It should not wait for a Portable to ask the same expensive question repeatedly before improving itself.

COS has three learning channels.

## Work Experience

Every completed Portable task can teach COS.

Outcomes, successful strategies, failures, buyer responses, campaign performance, incident patterns and reusable decisions should improve future behavior.

## Engineering Experience

COS should learn from SignalBoost's own engineering history.

Examples

- successful fixes
- failed builds
- before-and-after code
- verified commits
- incident diagnoses
- regression tests
- architecture patterns

A verified solution should become reusable engineering intelligence rather than being rediscovered later.

## Independent Study

COS may periodically study approved high-quality sources when doing so closes a real knowledge gap or is expected to reduce future external-AI cost.

Approved source classes may include

- official documentation
- research papers
- public datasets
- approved public websites
- repositories with suitable access and licensing
- educational video transcripts
- regulatory publications

COS does NOT blindly ingest the internet.

---

# Continuous Learning Execution Order

Proactive learning follows this sequence.

```
Knowledge Gap

↓

Expected Reuse / ROI

↓

Source Policy

↓

Acquire

↓

Verify

↓

Deduplicate

↓

Confidence + Provenance

↓

Extract Reusable Facts / Procedures

↓

Knowledge Store

↓

Revalidation Schedule

↓

Learning Effectiveness Measurement

↓

Telemetry / ROI
```

A duplicate or already-known source stops before expensive processing.

A low-confidence discovery does not silently become trusted knowledge.

---

# Learning Quality Validation

Accumulation is not learning.

COS must measure whether learned information improves later execution.

Useful evidence includes:

- later reuse
- improved success/outcome rate
- fewer external model calls
- fewer retries
- reduced cost
- reduced latency
- better decision confidence where measurable
- successful application of a learned procedure

Learning observations must be bounded and evaluated from current/relevant evidence rather than allowing stale history to dominate the assessment.

---

# Continuous Learning Governance

Every learned item must retain

- source
- source type
- acquisition date
- content identity or hash
- confidence
- supporting evidence
- applicable scope
- freshness or revalidation requirements where relevant
- licensing or usage restrictions where relevant

Contradictory information must be preserved as a contradiction until it is resolved; COS must not overwrite a trusted fact merely because a newer source says something different.

Learning budgets are mandatory.

Continuous Learning MUST NOT become an uncontrolled background AI bill.

Before external acquisition COS asks

- Is this a real knowledge gap?
- Is the answer already in Knowledge, Memory or Cache?
- How many future tasks can reuse it?
- What external cost can it avoid?
- Is the source approved?
- Can deterministic extraction solve it without AI?

The default learning action is no action when expected reuse does not justify cost.

---

# Experiential Learning Loop

For executable engineering or operational knowledge, COS should prefer verified experience.

```
Observe

↓

Build / Plan

↓

Execute in Governed Environment

↓

Test

↓

Diagnose Failure

↓

Correct

↓

Verify

↓

Measure Outcome

↓

Remember Successful Pattern
```

Failed experiments are evidence, not reusable truth.

Only verified outcomes should graduate into trusted procedures.

---

# Telemetry

Every governed execution should record applicable evidence including

- portable
- task
- provider/path
- model
- tokens
- latency
- cost
- cache hit
- semantic hit
- knowledge hit
- durable reuse
- duplicate request
- retry count
- loop depth
- local execution
- cloud fallback
- success/failure outcome

Continuous Learning additionally records

- knowledge gap
- source type
- source identity
- acquisition cost
- duplicate rejection
- confidence
- knowledge accepted or rejected
- expected reuse
- actual reuse when known
- learning effectiveness
- avoided future cost when measurable

Nothing important to cost/governance should be invisible.

Everything should be measurable.

---

# Portable Rules

Every Portable

MUST

- use COS
- use the Governor for governed intelligence execution
- reuse shared knowledge and skills
- update knowledge/learning where applicable
- emit telemetry
- respect budgets
- respect caching
- respect provider boundaries

MUST NOT

- make provider-specific intelligence part of its architecture
- duplicate business rules unnecessarily
- duplicate knowledge
- bypass governance
- bypass approved execution controls

---

# Compute Layer

External AI providers are compute engines.

They are not the intelligence.

Private/local AI is also compute; COS remains the owner of memory, knowledge, policy, learning, planning and outcomes.

Compute executes reasoning only when COS determines it is necessary and permitted.

COS owns the intelligence.

---

# Operational Rule After Independence Completion

Do not create deployments merely to continue the completed COS-independence phase.

Future COS changes require a concrete reason such as:

- demonstrated regression
- measurable performance/cost improvement
- new business capability
- new security/governance requirement
- validated learning improvement
- required provider/runtime compatibility

The objective is now to use the completed architecture, collect operational evidence and improve it from measured outcomes rather than continuously rebuilding the independence foundation.

---

# Definition of Success

The best AI call

is the one that never happens.

The best Portable

is the one that continuously teaches COS.

The best improvement

is one that automatically benefits every Portable.

The best architecture

is one where providers can be replaced without changing application code.

The best learning cycle

is one that creates verified reusable knowledge for less than the future work it prevents.

The best autonomous system

is one that can observe, remember, learn, reason, act, verify and improve while remaining governed and measurable.

SignalBoost does not build AI applications.

SignalBoost builds intelligent software powered by one Cognitive Operating System.
