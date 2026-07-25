// saas/agent-gateway-host/index.ts
//
// SignalBoost's HOST ADAPTER for the governed socket — the reference answer to "what
// happens after the gate". The portable half lives in saas/agent-gateway/ and stays free of
// this file's assumptions; everything here is SignalBoost infrastructure:
//
//   ApprovalPort   → a halted action becomes an OPEN Infrastructure PR in the cockpit;
//                    approving it executes through the existing merge machinery.
//   ExecutionPort  → an authorized action runs through the EXECUTOR CHAIN: provider API
//                    first, browser agent where no API exists, a person only when neither
//                    machine can act. Automation first; human as the backstop, not the default.
//
// signalboost-host.ts is the only file here that imports the real systems, and is therefore
// the only one excluded from node tests. A buyer replaces this whole directory with their
// own change-management and execution systems; the governance core, the classifier, the
// protocol adapters, and the MCP server are untouched by that swap.

export * from './infra-pr-approvals.ts'
export * from './pr-engine-approvals.ts'
export * from './universal-execution.ts'
export * from './execution-chain.ts'
