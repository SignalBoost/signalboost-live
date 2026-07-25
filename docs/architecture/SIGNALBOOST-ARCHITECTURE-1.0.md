# SignalBoost Architecture 1.0

Status: Canonical architecture baseline

## 1. Purpose

SignalBoost is a governed enterprise operations platform. It connects people, AI agents, software tools, providers, robots, drones, industrial systems, documents, sensors, and external APIs through one governed architecture.

This document defines the stable platform layers, trust boundaries, extension rules, and non-negotiable safety principles. New capabilities must fit an existing layer. A new layer is justified only when it benefits the platform as a whole rather than one feature or provider.

## 2. Core doctrine

> AI builds. Humans stay in control.

The platform may observe, reason, recommend, prepare, stage, and execute only within explicit policy and approval boundaries.

The architecture must remain:

- provider-neutral;
- protocol-neutral;
- portable across hosts;
- tenant-scoped;
- fail-closed;
- auditable;
- human-governed for consequential actions;
- independent of any single browser, provider, robot, autopilot, PLC, or model vendor.

## 3. Stable layer model

```text
People / Applications / Devices / Agents
                  │
                  ▼
1. Experience Layer
                  │
                  ▼
2. Universal Agent Gateway
                  │
                  ▼
3. Enterprise Knowledge Layer
                  │
                  ▼
4. Enterprise Autonomy Engine
                  │
                  ▼
5. COS Governance
                  │
                  ▼
6. Execution Layer
                  │
                  ▼
7. External World
```

### 3.1 Experience Layer

Responsibilities:

- web and mobile interfaces;
- operator dashboards;
- public and authenticated APIs;
- human requests and approvals;
- evidence and audit presentation;
- accessibility and localization.

The Experience Layer does not bypass governance. UI controls are not authorization boundaries.

### 3.2 Universal Agent Gateway

Responsibilities:

- accept external protocol messages;
- authenticate and identify the requesting actor or agent;
- normalize requests into the canonical `AgentRequest` contract;
- attach protocol and provenance metadata;
- return protocol-native result envelopes;
- reject malformed, unsupported, or ambiguous requests.

Current protocol families include:

- MCP;
- A2A;
- MAVLink;
- ROS 2;
- OPC UA;
- MQTT.

Future protocols are added through adapters, not through COS changes.

The gateway is supervisory. It does not own real-time stabilization, collision avoidance, PLC scan cycles, deterministic fieldbus timing, emergency stops, certified safety logic, actuator timing, or other hard real-time control loops.

### 3.3 Enterprise Knowledge Layer

Responsibilities:

- tenant-scoped organizational memory;
- documents, policies, SOPs, and standards;
- provider and capability metadata;
- equipment and asset records;
- organizational relationships;
- historical decisions and evidence;
- knowledge graph and retrieval contracts;
- digital-twin state and relationships.

The knowledge layer supplies context. It does not authorize or execute actions.

### 3.4 Enterprise Autonomy Engine

Responsibilities:

- observe and interpret state;
- identify goals, constraints, and anomalies;
- generate candidate plans;
- estimate consequences and risk;
- compare alternatives;
- predict likely outcomes;
- recommend governed decisions.

The Enterprise Autonomy Engine does not execute. It produces bounded, explainable proposals for COS.

### 3.5 COS Governance

Responsibilities:

- policy evaluation;
- consequence classification;
- tenant and environment checks;
- allowlist enforcement;
- approval requirements;
- execution authorization;
- audit and evidence requirements;
- default-halt behavior;
- revocation and invalidation.

COS is the policy and control boundary. No protocol, model, UI, adapter, provider, or execution mechanism may bypass it.

### 3.6 Execution Layer

Every governed action resolves through one of four established paths:

1. Direct API
2. COSA PR
3. Browser Agent
4. Manual

Provider templates preserve this four-path philosophy. The Agent Gateway does not redefine provider execution behavior.

Execution implementations must:

- receive an authorized, exact action scope;
- fail closed on missing or stale authorization;
- preserve approval boundaries;
- emit sanitized evidence;
- avoid credentials, secrets, raw authorization headers, cookies, and unsafe provider responses in audit output;
- never claim success without verified evidence.

### 3.7 External World

This layer includes:

- SaaS providers;
- cloud platforms;
- databases;
- robots and drones;
- PLCs and industrial equipment;
- vehicles;
- sensors;
- people and manual operators;
- external APIs and systems.

External systems retain their own local safety, identity, and operational controls. SignalBoost governs supervisory decisions and execution authorization; it does not replace certified local safety systems.

## 4. Canonical flow

```text
External protocol or human request
              │
              ▼
Universal Agent Gateway
              │
      normalize to AgentRequest
              │
              ▼
Enterprise Knowledge Layer context
              │
              ▼
Enterprise Autonomy Engine analysis
              │
              ▼
COS policy, approval, and audit
              │
              ▼
Direct API | COSA PR | Browser Agent | Manual
              │
              ▼
Verified outcome and evidence
```

## 5. Trust boundaries

The platform recognizes the following boundaries:

1. External input boundary — all incoming requests are untrusted.
2. Tenant boundary — data, policy, evidence, and memory must remain tenant-scoped.
3. Protocol boundary — protocol payloads are transport-specific and must be normalized before governance.
4. Reasoning boundary — model output is advisory and untrusted until validated.
5. Governance boundary — COS authorization is mandatory before consequential execution.
6. Credential boundary — secrets remain in approved secret stores and are resolved only at the narrowest execution point.
7. Execution boundary — executors receive exact approved scope and cannot broaden it.
8. Physical-safety boundary — real-time and certified safety controls stay on local controllers.
9. Evidence boundary — audit records are sanitized, bounded, serializable, and verifiable.

## 6. Consequence and approval principles

The architecture distinguishes at minimum:

- read-only or observational actions;
- reversible internal actions;
- external mutations;
- financial actions;
- data-sensitive actions;
- security-sensitive actions;
- physical or safety-relevant actions;
- unknown or unclassified actions.

Unknown, malformed, unsupported, or unclassified actions halt by default.

Allowlisting never overrides categorical safety, financial, security, data, or other mandatory approval gates.

## 7. Adapter contract

A protocol adapter must:

- declare a unique protocol identifier;
- normalize raw input into `AgentRequest`;
- preserve actor, tenant, request, and provenance information;
- expose only supervisory intent;
- produce a protocol-native result envelope;
- map denied and approval-pending outcomes accurately;
- reject malformed or unsupported operations;
- avoid embedding protocol-specific governance logic that belongs in COS;
- remain testable without live external systems.

A future adapter may also declare capability metadata such as:

- protocol version;
- supported operations;
- read-only versus mutating operations;
- consequence-class hints;
- evidence requirements;
- approval requirements;
- safety-boundary notes.

These declarations are hints and metadata. COS remains authoritative.

## 8. Portability rules

Portable modules must separate:

- core logic;
- host adapters;
- provider adapters;
- persistence adapters;
- UI surfaces;
- secrets and environment configuration.

A portable core must not require:

- SignalBoost-specific UI components;
- a specific Supabase project;
- buyer credentials;
- Vercel-specific runtime behavior;
- a specific provider SDK;
- production browser access;
- hidden environment assumptions.

## 9. Design rules for future work

Every proposed capability must answer:

1. Which existing layer owns it?
2. What canonical contract does it use?
3. What trust boundary does it cross?
4. What consequence class can it create?
5. What approval and evidence are required?
6. How does it fail closed?
7. How is tenant isolation preserved?
8. How can it be tested without production credentials or real-world mutation?
9. Does it preserve the four execution paths?
10. Does it leave local real-time safety where it belongs?

A feature that cannot answer these questions is not ready for implementation.

## 10. Explicit non-goals

Architecture 1.0 does not authorize:

- autonomous production repair;
- unrestricted browser execution;
- production provider mutation without governed approval;
- real-time robot or drone control loops;
- replacement of PLC or certified safety systems;
- cross-tenant knowledge or memory;
- model-generated authorization;
- silent expansion of approved action scope;
- claims of successful execution without verified evidence.

## 11. Extension path

The platform expands horizontally through:

- new protocol adapters;
- new provider adapters;
- new knowledge models;
- new policy packs;
- new evidence profiles;
- new domain-specific EAE reasoning modules;
- new experience surfaces.

The stable layers and COS execution philosophy remain unchanged unless a future architecture version explicitly supersedes this document.

## 12. Architecture versioning

This document is the Architecture 1.0 baseline.

Changes that alter layer ownership, trust boundaries, COS authority, the four execution paths, tenant isolation, portability doctrine, or physical-safety boundaries require an explicit architecture version update and dedicated review.

Feature additions that fit the existing contracts do not require a new architecture version.