# A2A Agent Fabric — Phase 12 Buyer Onboarding Manifest

Status: active workstream; buyer-live acceptance still pending.

## Goal

Make Phase 11 buyer onboarding operational through a portable, declarative manifest that can be validated and dry-run before any buyer A2A host is activated.

## Hard requirements

- COS remains the generalist brain and SignalBoost governance remains authoritative.
- Buyer Agent Cards are discovery metadata only; they never assign scope, risk, or authority.
- The manifest contains logical identifiers and governance declarations only. It must not contain endpoint URLs, credentials, tokens, passwords, API keys, authorization headers, private keys, client secrets, or raw buyer configuration secrets.
- Exact tenant/environment/portable scope is mandatory; wildcard scope is rejected.
- Dry-run validation performs no registry install, no host activation, no transport creation, and no delegation.
- Approved skills and risk classifications are explicit governance input and must match advertised/healthy skills.
- Buyer endpoints/auth remain runtime-owned by the buyer host and are referenced only by logical `transportRef`.
- `buyer-ready`, `signalboost-reference-live`, and `buyer-live` remain distinct labels.
- No placeholders, fake endpoints, fake credentials, or simulated buyer-live evidence.

## Phase 12 implementation

1. Define a versioned buyer A2A onboarding manifest schema.
2. Reject secret-like fields recursively and reject unknown top-level fields.
3. Validate exact scope, logical transport reference, explicit approved skill/risk mappings, and Agent Card.
4. Compile the manifest through the existing Phase 11 buyer onboarding compiler in dry-run mode.
5. Produce safe install-plan evidence containing only normalized registry records and health metadata.
6. Add deterministic regressions for valid manifests, wildcard scope, secret leakage, unknown fields, and zero-side-effect dry runs.
7. Enforce Phase 12 in the required A2A workflow.

## Acceptance

Phase 12 may merge only after the dedicated A2A regressions/typecheck, normal repository gates, and exact Vercel Preview are green.