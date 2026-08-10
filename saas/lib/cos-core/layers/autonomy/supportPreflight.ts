import type { BusinessRuleResult } from '../../cos-kernel'

export type SupportLocalPreflightInput = {
  prompt: string
  localReply: string
  isPrivileged: boolean
  requiresLiveData?: boolean
  requiresTool?: boolean
  executeMode?: boolean
}

const SIMPLE_NAV_OR_HELP = [
  /^(hi|hello|hey|thanks|thank you|help|what can you do|where (is|are)|how do i (find|open|go to)|show me (the )?(pricing|dashboard|outreach|campaigns|studio|security|help))\b/i,
  /^(oi|olá|ola|obrigad[oa]|ajuda|o que você pode fazer|o que voce pode fazer|onde (fica|está|esta)|como (eu )?(abro|encontro|vou para)|mostre(-me)? (os? )?(preços|precos|painel|outreach|campanhas|estúdio|estudio|segurança|seguranca|ajuda))\b/i,
  /^(hola|gracias|ayuda|qué puedes hacer|que puedes hacer|dónde (está|esta)|donde (está|esta)|cómo (abro|encuentro|voy a)|como (abro|encuentro|voy a)|muéstrame|muestrame)\b/i,
  /^(cześć|czesc|dzień dobry|dzien dobry|dziękuję|dziekuje|pomoc|co potrafisz|gdzie (jest|są|sa)|jak (otworzyć|otworzyc|znaleźć|znalezc|przejść|przejsc)|pokaż|pokaz)\b/i,
  /^(привет|здравствуйте|спасибо|помощь|что ты умеешь|где|как (открыть|найти|перейти)|покажи)\b/i,
]

const ESCALATION_SIGNAL = /\b(today|current|currently|latest|price|pricing|cost|count|total|metrics?|mrr|arr|revenue|sales|status|send|create|generate|publish|delete|change|update|fix|repair|deploy|run|execute|campaign|email|code|audit|research|search|find companies|analy[sz]e)\b/i

/**
 * Conservative zero-provider support gate.
 *
 * It accepts the deterministic concierge result only for clearly conversational or
 * navigation help. Any privileged, live-data, tool, execution, or action-shaped request
 * fails closed and continues to normal COS/provider reasoning.
 */
export function decideSupportLocalPreflight(input: SupportLocalPreflightInput): BusinessRuleResult {
  const prompt = input.prompt.trim()
  const reply = input.localReply.trim()

  if (!prompt || !reply) return { handled: false }
  if (input.isPrivileged || input.executeMode || input.requiresLiveData || input.requiresTool) return { handled: false }
  if (ESCALATION_SIGNAL.test(prompt)) return { handled: false }
  if (!SIMPLE_NAV_OR_HELP.some(pattern => pattern.test(prompt))) return { handled: false }

  return {
    handled: true,
    output: {
      reply,
      source: 'cos-local-preflight',
      providerCalls: 0,
    },
  }
}
