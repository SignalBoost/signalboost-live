# Self-Healing Supervisor safe acceptance trace

This acceptance trace is deliberately non-destructive. It validates the boundary between native monitoring, COS incident normalization, and governance without creating a provider mutation.

The regression test `saas/tests/nativeSelfHealingAcceptance.node.test.ts` constructs a synthetic native API-latency anomaly, converts it through the same `nativeIncidentToNormalized(...)` function used by the production native autonomous loop, verifies bounded connector evidence is present in the COS input, and then verifies governance classification separately.

Acceptance expectations:

- synthetic native anomaly becomes a `NATIVE_HEALTH` COS diagnostic incident;
- native probe identity and evidence survive normalization;
- a low-risk read action remains eligible for automatic confirmation for the AI operator role;
- a destructive deployment action remains high risk and approval-required;
- the test performs no provider API mutation and creates no production outage.

This is regression evidence, not a substitute for the still-required controlled live anomaly trace described in `self-healing-monitoring-current-state-20260813.md`.
