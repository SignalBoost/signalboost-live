// saas/agent-gateway/index.ts
//
// The governed socket: bring-your-own agent / protocol / model / tool, made portable and
// safe. Register N protocol adapters (MCP + A2A shipped; more are plugins), normalize
// every request into one internal shape, and run it through one governance core — the
// safety envelope (categorical human-approval for money/safety/data, a closed allowlist
// for reversible actions, default-halt) with every decision audited to the buyer's SIEM.
export * from './types.ts'
export * from './registry.ts'
export * from './governance.ts'
export * from './adapters/protocols.ts'
export * from './adapters/robotics.ts'
export * from './classifier.ts'
export * from './mcp-server.ts'
