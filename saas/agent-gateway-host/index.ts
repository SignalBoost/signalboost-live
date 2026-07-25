// saas/agent-gateway-host/index.ts
//
// SignalBoost's HOST ADAPTER for the governed socket — the reference answer to "what
// happens after the gate". The portable half lives in saas/agent-gateway/ and stays free of
// this file's assumptions; everything here is SignalBoost infrastructure:
//
//   ApprovalPort   → a halted action becomes an OPEN Infrastructure PR the owner approves
//                    in the cockpit (ONBOARD-full §12).
//   ExecutionPort  → an authorized action runs through the EXECUTOR CHAIN: provider API
//                    first, browser agent where no API exists, a person only when neither
//                    machine can act. Automation first; human as the backstop, not the default.
//
// A buyer replaces this whole directory with their own change-management and execution
// systems. The governance core, the classifier, the protocol adapters, and the MCP server
// are untouched by that swap — which is the entire point of the socket.

export * from './infra-pr-approvals.ts'
export * from './universal-execution.ts'
export * from './execution-chain.ts'
