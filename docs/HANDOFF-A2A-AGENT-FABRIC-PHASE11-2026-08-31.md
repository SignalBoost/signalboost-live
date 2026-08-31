# A2A Agent Fabric — Phase 11 Buyer Specialist Onboarding

Status: active workstream; buyer-live acceptance still pending until a real buyer-owned endpoint is connected.

## Goal

Add a reusable buyer onboarding compiler that turns a validated A2A Agent Card plus an explicitly approved skill/risk mapping and exact tenant/environment/portable scope into SignalBoost A2A registry entries. The compiler must not store credentials, auth headers, endpoint secrets, prompts, or responses.

## Invariants

- COS remains the generalist brain.
- Buyer-installed A2A hosts remain first priority over SignalBoost reference hosts.
- Buyer Agent Cards are discovery metadata only; they never self-authorize access.
- Every buyer assignment requires exact tenantId, environmentId, portableId, agentId, and explicitly approved skills.
- Approved skills must be advertised by the validated Agent Card.
- Risk is assigned by SignalBoost/buyer governance, never inferred from the remote Agent Card.
- Health/availability proof is required before an onboarding result can be marked ready for activation.
- Credentials, tokens, secrets, auth headers, prompts, responses, and buyer endpoint secrets remain outside registry metadata.
- No wildcard scope and no implicit MCP/tool authority.
- `buyer-ready` means configuration has passed validation/health; `buyer-live` still requires a real buyer-owned endpoint and observed governed delegation.

## Phase 11 implementation

1. Add a buyer onboarding compiler accepting validated Agent Card, logical transportRef, exact scope, and explicit skill/risk approvals.
2. Validate health for every approved skill before producing enabled registry entries.
3. Produce normalized `RegisteredA2AAgent` + `A2AAgentAssignment` records consumable by the existing registry/runtime.
4. Expose no buyer credentials or endpoint secrets in compiled metadata.
5. Add deterministic regressions for advertised-skill enforcement, exact scope, risk assignment, unhealthy-agent rejection, and secret-free output.
6. Enforce the new tests in the A2A workflow.

## Acceptance

Merge only after the dedicated A2A gate, full SaaS CI/build/typecheck, Playwright, diagnostics, repo targeting, onboarding, and exact Vercel Preview are green.