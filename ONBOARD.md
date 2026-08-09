# ONBOARD.md

# SignalBoost Engineering Blueprint
## Cognitive Operating System (COS)

**Version:** 1.1

---

# Mission

SignalBoost is not a collection of AI applications.

SignalBoost is a Cognitive Operating System (COS) that powers specialized software modules called **Portables**.

Portables perform business functions.

COS provides the intelligence.

External AI providers are only compute engines.

The intelligence belongs to SignalBoost.

---

# Vision

Build software that becomes smarter, faster, cheaper, and more valuable every time it is used.

Every improvement made to COS should automatically improve every Portable.

Every dollar saved by COS benefits every customer.

Every piece of knowledge discovered should become a permanent corporate asset.

---

# Core Principles

## COS is the Brain

Every Portable uses COS.

No exceptions.

---

## AI is the Last Resort

Never call an external AI model if the answer already exists.

COS should always attempt to solve problems using existing intelligence first.

---

## Never Pay Twice

If COS already knows something, reuse it.

Never regenerate existing knowledge.

Never rediscover the same buyer.

Never rewrite identical content.

Never repeat expensive searches.

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

The provider performs reasoning.

COS owns:

- Knowledge
- Memory
- Learning
- Planning
- Business Rules
- Cost Governance
- Telemetry
- Decision Making

---

# Architecture

```
                 User
                  │
                  ▼
             Portable
                  │
                  ▼
                 COS
                  │
      ┌──────────────────────────┐
      │ Execution Governor       │
      └──────────────────────────┘
                  │
                  ▼
        External Compute Layer
```

---

# COS Execution Order

Every request MUST follow this order.

```
Request

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

Existing Running Request

↓

Budget Governor

↓

Model Router

↓

External AI

↓

Validation

↓

Knowledge Update

↓

Telemetry

↓

Response
```

Nothing bypasses this sequence.

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

Knowledge contains permanent facts.

Examples

- companies
- buyers
- journalists
- products
- industries
- competitors
- contacts
- previous research

Knowledge is reusable.

Knowledge should never be regenerated.

---

# Memory

Memory stores temporary context.

Examples

- current conversation
- current workflow
- current task
- active user session

Memory expires.

Knowledge does not.

---

# Learning

Learning changes future behavior.

Example

COS discovers:

Company X never buys products under 500 employees.

COS remembers this.

Future searches automatically improve.

Learning reduces future AI calls.

---

# Exact Cache

If an identical request already exists

Return it immediately.

No AI.

No search.

No cost.

---

# Semantic Cache

If a similar request already exists

Reuse the previous reasoning.

Example

"Find MSPs in Brazil"

and

"Find Brazilian Managed Service Providers"

should reuse the same knowledge.

---

# Existing Running Request

If two Portables request the same work simultaneously

Execute only once.

Every caller waits for the same result.

Never pay twice.

---

# Execution Governor

Every AI request passes through the Governor.

Responsibilities

- Routing
- Budget enforcement
- Retry limits
- Loop detection
- Exact cache
- Semantic cache
- Prompt cache
- Cost tracking
- Telemetry
- Provider selection
- Provider translation

Nothing bypasses the Governor.

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

If exceeded

Execution stops.

Human approval may be required.

---

# Loop Detection

Infinite reasoning loops are forbidden.

COS must detect

- repeated prompts
- repeated retries
- recursive reasoning
- duplicate searches

Stop immediately.

---

# Model Routing

Always choose the cheapest acceptable model.

Examples

Simple

↓

Cheap model

Complex

↓

Advanced model

Never default to the most expensive model.

---

# Provider Independence

Portables never know

- OpenAI
- Anthropic
- Gemini
- Mistral

Portables call only

```
COS.execute(...)
```

COS decides

- provider
- model
- caching
- budget
- retries

---

# Canonical Tool Schema

All tools are defined once.

COS translates them into

- OpenAI Functions
- Anthropic Tools
- Gemini Tools
- Future Providers

Portables never contain provider-specific definitions.

---

# Cost Optimization

COS should reduce costs using

- deterministic code
- business rules
- exact cache
- semantic cache
- prompt cache
- rolling summaries
- model cascading
- batch processing
- budget governance
- retry limits
- loop detection
- in-flight request deduplication

Every optimization should reduce future costs.

---

# Knowledge First

Before calling AI

COS asks

Do I already know this?

If yes

Return the answer.

No AI.

---

# Learning First

Every completed task should improve COS.

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

Everything learned becomes reusable.

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

Telemetry
```

A duplicate or already-known source stops before expensive processing.

A low-confidence discovery does not silently become trusted knowledge.

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

Remember Successful Pattern
```

Failed experiments are evidence, not reusable truth.

Only verified outcomes should graduate into trusted procedures.

---

# Telemetry

Every execution records

- portable
- task
- provider
- model
- tokens
- latency
- cost
- cache hit
- semantic hit
- knowledge hit
- duplicate request
- retry count
- loop depth

Continuous Learning additionally records

- knowledge gap
- source type
- source identity
- acquisition cost
- duplicate rejection
- confidence
- knowledge accepted or rejected
- expected reuse
- avoided future cost when measurable

Nothing is anonymous.

Everything is measurable.

---

# Portable Rules

Every Portable

MUST

- use COS
- use the Governor
- update knowledge
- emit telemetry
- respect budgets
- respect caching

MUST NOT

- call providers directly
- duplicate business rules
- duplicate knowledge
- bypass governance

---

# Compute Layer

External AI providers are compute engines.

They are not the intelligence.

They execute reasoning only when COS determines they are necessary.

COS owns the intelligence.

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

SignalBoost does not build AI applications.

SignalBoost builds intelligent software powered by one Cognitive Operating System.
