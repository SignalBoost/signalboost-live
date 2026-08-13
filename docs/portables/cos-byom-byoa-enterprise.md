# COS Enterprise AI Portability — BYOM / BYOA

**Status:** canonical enterprise product requirement  
**Date:** 2026-08-12

## Product boundary

SignalBoost sells the Portable and COS cognitive runtime. A buyer does **not** have to receive, install, authorize, or use Qwen or RunPod.

Qwen and RunPod are current SignalBoost development/runtime choices for the seller environment. They are replaceable components, not the identity of COS and not mandatory dependencies of an enterprise buyer deployment.

Canonical product statement:

> SignalBoost COS is a model- and agent-neutral cognitive runtime. The buyer selects and controls the models, agents, hosting, credentials, and infrastructure permissions allowed in its environment.

## Bring Your Own Model (BYOM)

A buyer may supply any approved model through the COS model/reasoning port, including an enterprise vendor service, a private model gateway, or a self-hosted model. The buyer model can change without replacing COS memory, knowledge, skills, governance, provenance, tools, or learning state.

The portable contract is `CosAiPort` in `saas/lib/cos/aiPort.ts`. SignalBoost's own provider router and local inference configuration are host adapters, not requirements of the portable core.

Examples of acceptable buyer compositions include:

```text
COS -> buyer Azure/OpenAI deployment
COS -> buyer Anthropic deployment
COS -> buyer Gemini deployment
COS -> buyer Bedrock/private gateway
COS -> buyer OpenAI-compatible self-hosted model
COS -> buyer-selected future provider
```

Qwen is one optional model choice only when the buyer explicitly selects it.

## Bring Your Own Agent (BYOA)

A buyer may already operate a corporate agent. COS must be able to collaborate with that agent instead of forcing replacement.

The governed Agent Gateway normalizes buyer agents/protocols into the COS governance boundary. The external agent remains an intelligence resource; it does not receive authority to bypass COS approval, capability, audit, verification, or tenant controls.

Canonical composition:

```text
Buyer agent / model
        <->
       COS
        <->
Enterprise Memory / Knowledge Graph / validated skills
        <->
Permissioned Connector Runtime
        <->
Buyer infrastructure and SaaS systems
```

## Trust boundary

A model or agent may reason, recommend, critique, generate, or participate in a COS Council. It is not the infrastructure authority.

Execution remains governed by COS and the Portable runtime:

```text
reason / propose
-> capability check
-> tenant/scope policy
-> consequence classification
-> approval when required
-> permissioned execution
-> verification
-> audit
-> learning
```

No model should receive unrestricted production credentials merely because it is the selected reasoner.

## Development stack versus buyer stack

SignalBoost may use inexpensive or convenient models and hosting while developing and testing the product. That development choice does not become a buyer dependency unless it is actually shipped or used in the buyer runtime.

Seller development example:

```text
COS -> Qwen -> RunPod
```

Possible buyer example:

```text
COS -> buyer-approved agent/model -> buyer-approved hosting
```

A buyer-facing dependency inventory, security questionnaire, model inventory, SBOM or similar disclosure must truthfully describe what is actually shipped, installed, invoked, or processes buyer data. Internal development tooling should not be represented as a buyer runtime dependency when it is not one.

## Enterprise acceptance gate

The release profile is `saas/lib/release-candidate/cos-enterprise-ai.ts`.

A COS enterprise deployment is not accepted until evidence shows all of the following:

1. BYOM works through an injected model/reasoning port without editing the COS engine.
2. BYOA works through the governed Agent Gateway.
3. Qwen is optional and can be completely absent from the buyer deployment.
4. RunPod is optional and can be completely absent from the buyer deployment.
5. Credentials and infrastructure authorization are buyer-owned and scoped.
6. Models/agents cannot bypass COS governance and approval boundaries.
7. COS memory, knowledge, skills, provenance, and learning survive a supported provider/model replacement.
8. Backup COS accepts a buyer-approved reasoner.
9. Buyer documentation names the actual runtime dependencies rather than seller development choices.

Missing evidence is `not_run`, never pass.

## Existing implementation evidence

Current repository architecture already supports the direction:

- `saas/lib/cos/aiPort.ts` defines injected model access for COS generators.
- `saas/agent-gateway/types.ts` and `saas/agent-gateway/index.ts` define the governed bring-your-own agent/model/tool socket.
- `saas/cos-backup-core/ports.ts` defines a zero-import buyer-supplied backup reasoner contract.
- `docs/portables/cos-host-integration-guide.md` documents buyer-supplied model/data/tool adapters.

The new enterprise release gate makes this product boundary measurable instead of merely architectural intent.
