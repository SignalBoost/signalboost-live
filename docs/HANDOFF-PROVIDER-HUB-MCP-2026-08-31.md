# Provider Hub MCP Compatibility Workstream — 2026-08-31

## Status

**ACTIVE IMPLEMENTATION — NOT PRODUCTION-ACCEPTED**

Owner direction: keep SignalBoost's existing governance/Provider Hub infrastructure authoritative and expand the existing MCP implementation as a compatibility layer for COS and all explicitly authorized portables/software. Do not replace the current architecture with MCP and do not build a second independent MCP stack.

## Existing foundation discovered before implementation

SignalBoost already contains:

- `saas/agent-gateway/mcp-server.ts` — portable JSON-RPC/MCP message handler that routes tool calls through Agent Gateway governance;
- `saas/lib/google-workspace/mcp.ts` — Google Workspace MCP tool projection;
- Provider Hub portable capability discovery and exact deny-by-default cross-portable grants;
- product-specific approval, spend, publishing, audit, tenant and execution boundaries that remain authoritative.

Therefore this workstream is a **generalization and compatibility project**, not a greenfield MCP replacement.

## Target architecture

```text
COS / authorized portable / external MCP client
→ authenticated buyer/platform edge
→ SignalBoost MCP compatibility layer
→ Provider Hub capability discovery
→ exact tenant/environment/portable grant
→ Agent Gateway governance
→ existing native adapter / existing product execution boundary
```

MCP is a transport/interface. It is never authorization, approval, tenant identity, credential storage, execution policy, or factual authority.

## Phase 1 boundary

Phase 1 will:

1. project already-authorized Provider Hub **read-only** capabilities into an MCP tool catalog;
2. bind the catalog to exact tenant, environment and portable identity;
3. require verified caller/actor identity before MCP execution;
4. route every tool call through the existing Agent Gateway governance path;
5. fail closed for unavailable, ungranted, unknown, write, consequential or destructive capability classes;
6. add deterministic regression coverage for grant isolation, tenant isolation and mutation exclusion.

Phase 1 will **not** move social publishing, advertising spend, financial mutation, destructive actions, security-sensitive actions, or other consequential writes into a generic MCP execution path. Existing product-specific execution/approval semantics remain authoritative until invocation-bound approval, idempotency/cancellation and post-execution audit behavior are independently hardened and accepted.

## Portable/software rule

The compatibility layer is shared infrastructure. A portable does not implement its own MCP server. It receives only the capabilities Provider Hub resolves for that exact portable and scope. No capability is inherited merely because another SignalBoost product has the adapter or credentials.

## Future phases

After Phase 1 is accepted:

- broaden native connector projection beyond Google Workspace and Marketing + Sales reads;
- add outbound MCP client support so Provider Hub can consume approved third-party MCP servers as another connector type;
- add optional hosted/buyer-mounted transport adapters around the existing pure MCP message handler;
- separately harden and certify governed mutation execution before any write capability is exposed generically;
- expose selected SignalBoost capabilities to external MCP clients only through explicit host-side grants and authenticated edge policy.

## Acceptance rule

A branch, catalog, MCP handshake or successful read test is not Production acceptance. Completion requires deterministic regressions, exact Preview build/typecheck, merge to current main, Production READY, and a real authorized runtime observation without bypassing existing governance.
