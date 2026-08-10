import type { BusinessRuleResult } from '../../cos-kernel'

export type SupportLocalPreflightInput = {
  prompt: string
  localReply: string
  isPrivileged: boolean
  requiresLiveData?: boolean
  requiresTool?: boolean
  executeMode?: boolean
}

const SIMPLE_NAV_OR_HELP = /^(hi|hello|hey|thanks|thank you|help|what can you do|where (is|are)|how do i (find|open|go to)|show me (the )?(pricing|dashboard|outreach|campaigns|studio|security|help))\b/i

/**
 * Conservative zero-provider support gate.
 *
 * It only accepts the deterministic concierge result when the request is clearly
 * conversational/navigation help and has no live-data, tool, execution, or
 * privileged reasoning requirement. Everything else escalates to normal COS/provider
 * reasoning, so this optimization cannot silently answer a current-fact or action
 * request from stale local text.
 */
export function decideSupportLocalPreflight(input: SupportLocalPreflightInput): BusinessRuleResult {
  const prompt = input.prompt.trim()
  const reply = input.localReply.trim()

  if (!prompt || !reply) return { handled: false }
  if (input.isPrivileged || input.executeMode || input.requiresLiveData || input.requiresTool) return { handled: false }
  if (!SIMPLE_NAV_OR_HELP.test(prompt)) return { handled: false }

  return {
    handled: true,
    output: {
      reply,
      source: 'cos-local-preflight',
      providerCalls: 0,
    },
  }
}
