# SignalBoost A2A Agent Fabric — Phase 8

Date: 2026-08-31
Status: implementation active; not buyer-accepted

## Objective

Prove the real HTTPS A2A path before a buyer exists by operating a SignalBoost-owned, read-only reference specialist. This is not a placeholder and is not evidence of buyer integration.

## Reference specialist

The first reference specialist is a Self-Healing Diagnostic agent exposing the canonical advisory skill `self-healing.diagnose`.

It performs bounded deterministic incident classification from supplied incident text and returns an A2A completed task with diagnostic class, matched evidence signals, confidence, and recommended next checks. It does not mutate infrastructure, use credentials, invoke MCP tools, spend money, or claim root cause without evidence.

## Runtime path

```text
SignalBoost acceptance probe
→ Phase 7 HTTPS A2A transport
→ real deployed reference A2A endpoint
→ message/send
→ deterministic diagnostic specialist
→ completed A2A task
→ Phase 6 runtime observation
→ metadata-only acceptance record
```

## Hard requirements

1. No TODO/stub/placeholder behavior in the reference agent.
2. Agent Card and `message/send` are protocol-valid A2A 0.3 JSON-RPC surfaces.
3. Only `self-healing.diagnose` is advertised and accepted.
4. The agent is advisory/read-only and cannot gain MCP/tool authority.
5. The public reference endpoint must not expose secrets, internal prompts, credentials, system configuration, or private telemetry.
6. The acceptance probe records only safe metadata and must never relabel SignalBoost reference acceptance as buyer acceptance.
7. Buyer endpoints/auth/runtimes remain injected through the existing A2A host contracts; this reference agent does not become a required dependency.
8. Production acceptance for a buyer still requires a separate authorized external buyer endpoint.

## Acceptance labels

- `deterministic-ci`: protocol and behavior covered by tests.
- `signalboost-reference-live`: real deployed HTTPS round-trip to the SignalBoost reference specialist.
- `buyer-live`: reserved for a future authorized buyer-owned specialist endpoint.

Only the third label constitutes buyer integration evidence.
