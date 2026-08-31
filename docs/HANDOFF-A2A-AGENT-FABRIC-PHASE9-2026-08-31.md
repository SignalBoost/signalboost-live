# A2A Agent Fabric — Phase 9: COS Reference Runtime Routing

## Goal

Make the already-real SignalBoost reference Self-Healing Diagnostic specialist usable through the normal governed COS specialist path, without making it a dependency and without weakening buyer pluggability.

## Invariants

- Buyer-installed A2A runtime hosts always take precedence.
- Reference fallback is allowed only for canonical `self-healing-diagnostic` / `self-healing.diagnose` advisory delegation.
- Hosted COS still requires owner/admin privilege and exact tenant/environment/portable scope.
- The reference registry grant is constructed for that exact scope only; no wildcard scope.
- The reference endpoint is resolved from server-owned deployment configuration and called through the existing HTTPS JSON-RPC A2A transport.
- No endpoint, credential, prompt, response, or authorization secret is persisted in registry metadata or observability.
- Reference fallback never grants MCP/Provider Hub/tool authority and can never execute writes or consequential actions.
- `signalboost-reference-live` remains distinct from future `buyer-live` acceptance.

## Acceptance

Phase 9 is accepted only when deterministic regressions prove buyer-host precedence, exact-scope reference composition, non-reference fallback denial, and actual COS orchestration through the reference host; full repository gates and Preview must also pass.
