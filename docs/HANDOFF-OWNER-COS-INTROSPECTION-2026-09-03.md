# Owner COS introspection boundary repair — 2026-09-03

## Problem

Authenticated owner COS requests entered `cos-primary` while still wrapped in `withPublicDeliveryScope()`. That public-scope context is intentionally restrictive for Concierge/guest traffic, but it also caused owner self-knowledge questions such as `what is your model` to return the public implementation-disclosure response. The same browser ingress also previously intercepted owner provenance questions before the privileged `cos-primary` provenance branch.

## Repair

- Owner provenance introspection is not intercepted by the public browser provenance branch.
- Authenticated owner Assistant requests now execute outside `withPublicDeliveryScope()`.
- Public/guest Concierge traffic remains inside `withPublicAuditIdentity(...)` + `withPublicDeliveryScope(...)`.
- The existing deterministic owner platform-stack response in `cosFirstAnswer.ts` is therefore reachable and reports the server-configured COS reasoner rather than asking the model to describe itself.
- No Builder, repository, deployment, secret, approval, or customer authority is expanded.

## Required behavior

Owner COS:
- `Where did that answer come from?` -> authoritative recorded provenance when available.
- `What is your model?` -> deterministic Production configuration response.

Public Concierge:
- continues to receive restricted implementation disclosure and public recorded provenance only.

## Acceptance

- owner/public boundary regression green;
- existing SaaS/Builder/security regressions green;
- Preview build READY;
- Production deployment READY after merge;
- fresh signed-in owner checks for provenance and model identity return privileged deterministic responses.
