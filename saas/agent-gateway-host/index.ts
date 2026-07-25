// saas/agent-gateway-host/index.ts
//
// SignalBoost's HOST ADAPTER for the governed socket — the reference answer to "what
// happens after the gate". The portable half lives in saas/agent-gateway/ and stays free of
// this file's assumptions; everything here is SignalBoost infrastructure:
//
//   ApprovalPort  → a halted action becomes an OPEN Infrastructure PR the owner approves
//                   in the cockpit (ONBOARD-full §12).
//   ExecutionPort → an allowlisted reversible action runs through universalRunner, and only
//                   if it was explicitly registered in a closed action map.
//
// A buyer replaces this whole directory with their own change-management and execution
// systems. The governance core, the classifier, the protocol adapters, and the MCP server
// are untouched by that swap — which is the entire point of the socket.

export * from './infra-pr-approvals.ts'
export * from './universal-execution.ts'
