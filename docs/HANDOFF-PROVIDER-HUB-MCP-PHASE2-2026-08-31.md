# Provider Hub MCP Compatibility — Phase 2 Outbound Client

Date: 2026-08-31
Status: implementation active; not Production-accepted

Phase 1 (PR #1722) added a governed inbound MCP compatibility surface for exact-scope, read-only Provider Hub capabilities. Phase 2 adds the inverse direction: SignalBoost COS and authorized portables may consume explicitly configured external MCP servers through Provider Hub without replacing SignalBoost governance.

## Architectural rule

```text
COS / portable
→ Portable Connector Runtime
→ Provider Hub MCP outbound adapter
→ host-owned authenticated MCP transport
→ external MCP server
```

MCP is a compatibility protocol, never SignalBoost's authorization authority. Tenant/environment/portable scope, capability grants, risk classification, approval requirements, audit, timeout policy, and execution-result validation remain owned by SignalBoost and the buyer host.

## Phase 2 scope

- host-neutral MCP client for `initialize`, `tools/list`, and `tools/call`;
- no SDK dependency and no embedded credential store;
- caller/transport authentication remains host-owned;
- bounded response validation, request correlation, protocol-version checking, tool-count limits, and fail-closed malformed-response handling;
- Provider Hub discovery adapter that converts only explicitly mapped remote MCP tools into portable capability descriptors;
- remote tools are invisible unless the host mapping supplies exact capability ID, provider/connection identity, tenant/environment scope, risk, approval rule, scopes, and JSON input schema;
- Provider Hub execution adapter invokes only the exact descriptor selected by Portable Connector Runtime;
- remote MCP errors remain errors; no fake-success wrapping;
- Phase 2 does not automatically authorize writes. Write or consequential MCP tools remain governed by the existing Portable Connector Runtime approval/audit requirements and must be explicitly classified/mapped by the host.

## Non-goals

- no automatic discovery of arbitrary internet MCP servers;
- no public hosted MCP directory;
- no credential persistence in MCP core;
- no bypass of Provider Hub grants, Agent Gateway, tenant isolation, approval, spend, publishing, or safety controls;
- no conversion of an MCP server's self-description into trusted risk/authorization metadata.

## Acceptance

Before merge: deterministic regressions must prove request correlation, malformed-response rejection, tool-map deny-by-default behavior, exact tenant/environment/portable isolation, remote error propagation, and execution through Portable Connector Runtime. Full SaaS CI, TypeScript, production build, repository gates, and Vercel Preview must be green.

A merged implementation is still not proof of a real external MCP connection. Runtime acceptance requires a separately authorized live MCP server observation with no weakened governance boundary.