import type { PortableBrowserAgentLoopPort } from '../browser-agent-loop-port.ts'; import type { PortableBrowserDecision } from '../browser-runtime-types.ts'
export class ScriptedBrowserAgentLoop implements PortableBrowserAgentLoopPort { constructor(private readonly decision:PortableBrowserDecision={action:{kind:'complete'}}){} async decide(){return this.decision} }
