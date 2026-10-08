# Lab Phases 1–5: Self-Healing Supervisor observability bridge

The host supplies a tenant-local durable observation reader and an authorized Supervisor intake callback. Pass same-revision observations through `dispatchLabHealthAlerts` to translate unknown, stale, and blocked evidence into bounded, allowlisted alerts.

All five phases and 15 signals are covered. Synthetic CI events cannot suppress missing-live alerts. Alert delivery failures propagate. The returned health snapshot does **not** certify or authorize a Lab phase.

This bridge **does not autonomously repair**: the existing Self-Healing Supervisor must independently verify incident provenance, exact scope, approved runbook, write permission, and outcome. Unknown/stale evidence should trigger observation/reconciliation, not unapproved execution.

Production work remaining: wire actual tenant-authorized runtime evidence producers, durable tenant-local storage, recurring checks, governed incident intake, and an owner-only read view. No real environment has been connected in this change.
