# Enterprise Release Candidate Acceptance

SignalBoost is Release Candidate only when required evidence exists and every required gate passes. A green deployment is necessary but not sufficient.

Required gates:

- Production deployment builds and starts successfully.
- Cross-tenant probes are blocked with zero leaked fields.
- Dependency audit, secret scan, authorization regression, tenant isolation, and penetration testing pass with zero open critical/high findings.
- Backup, restore, and failover are verified within declared RPO/RTO.
- Sustained load/soak evidence meets tenant, latency, error-rate, and duration thresholds.
- Telemetry, alerts, traces, operational dashboards, and audit sink meet the declared coverage threshold.
- End-to-end enterprise flows are verified across COS/EAE, Prospect, Communication, CRM, Revenue, Enterprise Memory, and Universal Adapter boundaries where configured.
- Operator/deployment/runbook documentation is current.

The `saas/lib/release-candidate/` evaluators provide deterministic acceptance gates for recorded evidence. They do not fabricate operational evidence and must never convert a not-run security, recovery, load, or integration exercise into a pass.

Release policy:

1. Record evidence from the real environment.
2. Evaluate evidence through the RC gates.
3. Resolve every failed required check.
4. Repeat the affected exercise after remediation.
5. Mark Release Candidate only when `releaseCandidate === true`.

This preserves the repository rule that production claims must be based on verified outcomes rather than assumptions.
