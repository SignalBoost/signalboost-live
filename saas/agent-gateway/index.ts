// saas/agent-gateway/index.ts
//
// The governed socket: bring-your-own agent / protocol / model / tool, made portable and
// safe. Register N protocol adapters (MCP + A2A + MAVLink + ROS 2 + OPC UA + MQTT shipped;
// more are plugins), normalize every request into one internal shape, and run it through one
// governance core — the safety envelope (categorical human-approval for money/safety/data,
// a closed allowlist for reversible actions, default-halt) with every decision audited to the
// buyer's SIEM.
// Physical and industrial adapters remain supervisory: real-time stabilization, collision
// avoidance, PLC scan cycles, interlocks, emergency stops, and deterministic safety stay on
// the robot, autopilot, PLC, or certified safety controller while COS governs authorization,
// approval, execution, and evidence.
export * from './types.ts'
export * from './registry.ts'
export * from './governance.ts'
export * from './continuity.ts'
export * from './journal.ts'
export * from './replica-health.ts'
export * from './takeover-orchestrator.ts'
export * from './runtime-recovery-coordinator.ts'
export * from './cluster-coordinator.ts'
export * from './cluster-state-transition.ts'
export * from './cluster-diagnostics.ts'
export * from './cluster-runtime-adapter.ts'
export * from './cluster-runtime-receipts.ts'
export * from './cluster-runtime-reconciliation.ts'
export * from './cluster-instruction-ack.ts'
export * from './cluster-delivery-diagnostics.ts'
export * from './cluster-delivery-alerts.ts'
export * from './cluster-alert-lifecycle.ts'
export * from './cluster-alert-diagnostics.ts'
export * from './cluster-alert-escalation.ts'
export * from './cluster-escalation-lifecycle.ts'
export * from './cluster-escalation-diagnostics.ts'
export * from './cluster-escalation-trends.ts'
export * from './cluster-escalation-forecast.ts'
export * from './cluster-runtime-health.ts'
export * from './cluster-runtime-health-timeline.ts'
export * from './cluster-runtime-health-trends.ts'
export * from './cluster-runtime-health-forecast.ts'
export * from './cluster-runtime-health-recommendations.ts'
export * from './cluster-runtime-health-dashboard.ts'
export * from './cluster-runtime-health-export.ts'
export * from './cluster-runtime-health-evidence-manifest.ts'
export * from './cluster-runtime-health-audit-index.ts'
export * from './cluster-runtime-health-governance-ledger.ts'
export * from './cluster-runtime-health-governance-chain.ts'
export * from './cluster-runtime-health-governance-snapshot.ts'
export * from './cluster-runtime-health-governance-archive.ts'
export * from './cluster-runtime-health-governance-catalog.ts'
export * from './cluster-runtime-health-governance-registry.ts'
export * from './cluster-runtime-health-governance-registry-manifest.ts'
export * from './cluster-runtime-health-governance-evidence-bundle.ts'
export * from './cluster-runtime-health-governance-evidence-index.ts'
export * from './cluster-runtime-health-governance-evidence-index-query.ts'
export * from './cluster-runtime-health-governance-evidence-directory.ts'
export * from './circuit-breaker.ts'
export * from './adapters/protocols.ts'
export * from './adapters/robotics.ts'
export * from './adapters/industrial.ts'
export * from './classifier.ts'
export * from './mcp-server.ts'
