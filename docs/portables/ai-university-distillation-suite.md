# AI University + AI Distillation Engine portable product boundary

## Commercial product split

The platform exposes two separate portable products that can also be sold together as an **AI Learning Suite**:

1. **AI University Software** — curriculum, learning, exams, retention, graduation evidence, and student/specialist development.
2. **AI Distillation Engine Software** — governed training-data preparation, distillation/training, exact-artifact evaluation, baseline comparison, deployment evidence, and rollback proof.

The products are deliberately separable. AI University can use a buyer-supplied distillation/training implementation. AI Distillation Engine can consume a buyer-supplied curriculum snapshot without requiring AI University.

## Human-university curriculum model

The portable curriculum follows a human-university pattern.

### Years 1–2: mandatory common core

Every student receives the same foundation. The shared core is not silently removable from an ordinary curriculum profile. Buyers may add required foundational courses, but a profile that omits the platform core is invalid.

The default shared foundation covers:

- reasoning and evidence
- mathematics, statistics, and quantitative literacy
- research methods and reproducibility
- communication and human-machine interaction
- computing and systems foundations
- data literacy and information management
- security, governance, and operational boundaries
- ethics, human control, and responsible AI
- systems thinking, reliability, and failure analysis
- learning, exams, retention, transfer, and self-evaluation

### Years 3+: major and electives

A student then follows a major and may add electives. The buyer or student policy can select these without modifying application source code.

The initial portable major catalog includes:

- Software Engineering
- Cyber Defense
- Agent Systems
- ML and Data Engineering
- Enterprise Commercial
- Enterprise Governance
- Robotics and Edge AI

The elective catalog is separately selectable and can grow without changing the mandatory core.

### Organization-specific curriculum

A buyer can add organization courses for its own policies, products, procedures, internal systems, regulated workflows, or domain knowledge. Organization courses stay separate from the shared core so a buyer-specific rule never silently becomes a universal academic requirement.

## Curriculum-to-distillation contract

Distillation receives a resolved, versioned curriculum snapshot. The snapshot identifies the profile, major, and exact included courses. The distillation engine does not decide what a student should study and does not rewrite the curriculum.

The University owns curriculum selection and academic evidence. The Distillation Engine owns training execution and model-artifact evidence.

## Current commercial status

Both products are registered as public **preview** portables. They are not marked licensable yet because buyer-neutral packaging, clean-environment installation evidence, licensing enforcement, and buyer acceptance still need commercial closure. Internal production operation is not treated as proof that a buyer can install and operate the portable independently.


## Provider-neutral plug-and-play model providers

Neither portable is tied to OpenAI, Anthropic, xAI, Hugging Face, or any other single vendor.

The University/Distillation host resolves teacher providers through a provider definition plus a transport adapter. Built-in providers are reference configurations. Buyers can add another provider through configuration when it supports an existing protocol, or supply a host adapter for a different protocol.

Provider credentials remain buyer-owned. A provider must be explicitly enabled, adapter-ready, credential-ready, model-ready, and endpoint-ready before it can be selected. Provider failures do not silently widen authority or switch to an unapproved vendor.

This makes provider choice a buyer configuration decision instead of a fork of the University or Distillation Engine.


## Dynamic work-driven distillation topology

Distillation is work-driven rather than tied to one fixed pipeline. When eligible curriculum arrives, the control loop fills available campaign capacity and dispatches each stage to any compatible available lane.

A stalled provider or campaign does not globally block unrelated prepared work. Hosted teacher prompts may reroute to another explicitly enabled compatible provider when the originally selected provider fails. Hugging Face preparation/training jobs remain fenced to their own run and campaign.

Current Production policy admits up to four independent campaigns concurrently, while keeping one batch per campaign and the existing per-campaign/per-stage hard cost ceilings. The concurrency value is stored in the durable rolling policy and constrained to 1–8 so buyers can tune capacity without redesigning the scheduler.

Dynamic routing does not authorize silent vendor fallback, automatic model promotion, Production traffic, RunPod mutation, use of material without training rights, or authority expansion.
