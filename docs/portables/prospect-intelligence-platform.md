<!-- docs/portables/prospect-intelligence-platform.md -->

# Prospect Intelligence Platform — future portable project

**Status:** approved for staged implementation

## Mission

Build a buyer-hosted, AI-native Prospect Intelligence Platform that discovers, imports,
normalizes, deduplicates, researches, qualifies, scores, and maintains prospect records while
keeping every consequential external action under explicit customer policy and human control.

The portable must remain isolated from the existing SignalBoost outreach workflow until its
contracts, tests, data boundaries, and rollback path have been proven.

## Product identity

This is not a conventional CRM with an AI chat feature. It is a bounded AI sales-operations
workforce composed of explainable agents, including a data steward, research analyst,
qualification analyst, campaign matcher, personalization writer, reply analyst, and performance
analyst.

The agents may inspect, normalize, score, recommend, and draft. Version 1 must not send external
messages automatically.

## Universal Provider Hub

The portable must use the SignalBoost Universal Provider Hub rather than depend directly on one
vendor. Provider credentials remain in the buyer's environment and are supplied through the
buyer's approved secret-management path.

### Staged built-in provider families

Ship disabled, configuration-ready adapters for commonly used enterprise provider categories,
including:

- contact intelligence and enrichment;
- company identity, firmographics, and registries;
- email verification;
- technology intelligence;
- public-company research and approved news/search sources;
- CRM and marketing systems;
- customer-owned databases and internal APIs;
- AI model providers.

Initial named adapter targets should include, subject to current API availability, licensing,
and implementation review:

- ZoomInfo;
- Cognism;
- Apollo.io;
- Clay;
- Dun & Bradstreet;
- Moody's Orbis;
- S&P Capital IQ;
- PitchBook;
- Crunchbase;
- Salesforce;
- HubSpot;
- Microsoft Dynamics;
- Pipedrive;
- Zoho CRM;
- OpenAI;
- Anthropic;
- Google AI and Vertex AI;
- Azure OpenAI;
- buyer-hosted or local model endpoints.

A staged adapter means the connector contract, configuration surface, capability declaration,
health model, and tests exist. It does not mean SignalBoost bundles data access, credentials,
licenses, or contractual rights to use the provider.

### Bring Your Own Provider

The portable must also support plug-and-play Bring Your Own Provider integration for customer
APIs, proprietary databases, regional registries, licensed data sources, and internal services.

Every adapter must implement a shared capability contract rather than expose provider-specific
behavior directly to AI agents. At minimum, the contract must cover:

- authentication and secret references;
- connection testing;
- capability discovery;
- health and quota reporting;
- bounded execution;
- normalized results;
- provenance and retrieval timestamps;
- cost or credit reporting where available;
- safe disconnection.

The provider router may choose among approved adapters by capability, region, data quality,
health, quota, cost, and customer policy. Every routing decision and resulting field must remain
explainable and auditable.

## Internationalization-first requirement

Internationalization is part of the architecture from the first commit. It is not a cleanup
phase.

The initial supported language contract is:

- English (`en`);
- Spanish (`es`);
- Portuguese (`pt`), including normalization from `pt-BR`;
- Polish (`pl`);
- Russian (`ru`).

All user-facing copy must originate in locale dictionaries or typed five-language catalogues.
This includes configuration screens, provider descriptions, connection states, validation
messages, errors, empty states, accessibility labels, AI recommendations, approval requests,
reports, drafts, exports, and documentation-facing runtime messages.

Do not translate stable machine contracts such as provider IDs, capability IDs, audit event
names, schema versions, error codes, record IDs, country codes, or customer-supplied data.

No feature is complete when it contains hardcoded user-facing English or lacks parity across the
five supported languages.

## First implementation task — contracts before features

The first task is a bounded foundation sprint. Do not build enrichment workflows, outbound email,
production provider calls, or the customer-facing dashboard before this task is complete.

### Required deliverables

1. Create the isolated module boundary for Prospect Intelligence without importing it into the
   existing outreach, Campaign Studio, AI Chief of Staff, or Supervisor runtime paths.
2. Define one shared supported-language and locale-normalization contract using `en`, `es`, `pt`,
   `pl`, and `ru`.
3. Create a typed Prospect Intelligence copy catalogue with complete five-language parity for the
   first configuration, provider-health, validation, and empty-state messages.
4. Define the provider-adapter interface, capability identifiers, health states, normalized
   response envelope, provenance fields, quota/cost metadata, and secret-reference boundary.
5. Define the Bring Your Own Provider manifest schema and validation rules.
6. Define feature flags with all execution capabilities disabled by default, including automatic
   discovery, automatic enrichment, external message sending, reply automation, and scheduled
   synchronization.
7. Add tests proving locale parity, region-tag normalization, stable machine identifiers,
   provider-result normalization, secret non-disclosure, disabled-by-default execution, and
   isolation from the existing outreach workflow.
8. Document rollback and integration boundaries. Disabling or removing the new module must leave
   the current SignalBoost workflow unchanged.
9. Run the existing localization, typecheck, prebuild, build, portable-boundary, and relevant
   repository regression checks before the task can be declared complete.

### Explicitly excluded from the first task

- automatic email sending;
- Gmail or calendar integration;
- scheduled background enrichment;
- live paid-provider API calls;
- provider credentials;
- automatic contact scraping;
- changes to existing outreach behavior;
- changes to existing prospect or campaign tables;
- production AI execution against prospect data;
- customer-facing claims of global coverage.

## First-task acceptance criteria

The foundation task is complete only when:

1. the module is isolated and disabled by default;
2. all first-task user-facing copy exists in all five supported languages;
3. localization guards report no new hardcoded-copy violations;
4. adapter and BYOP schemas are typed, documented, and tested;
5. secrets cannot appear in normalized records, logs, audit events, or browser payloads;
6. machine identifiers remain language-neutral and stable;
7. no provider call or external message can occur from the foundation implementation;
8. the existing outreach workflow behaves exactly as it did before the change;
9. focused tests, typecheck, prebuild, build, and required CI checks are green;
10. documentation clearly distinguishes staged connectors from licensed, configured, and proven
    live integrations.

## Future implementation sequence

After the foundation task is accepted, proceed in bounded stages:

1. prospect storage, import, export, search, and deduplication;
2. read-only provider configuration and connection testing;
3. fixture-backed enrichment and normalization;
4. explainable qualification and evidence-backed knowledge cards;
5. draft generation only;
6. manual activity recording and analytics;
7. controlled integration with the existing workflow behind feature flags;
8. separately approved live-provider and outbound-action capabilities.

Each stage must preserve the buyer-hosted, provider-neutral, internationalization-first,
human-governed, explainable, and auditable product boundaries.
