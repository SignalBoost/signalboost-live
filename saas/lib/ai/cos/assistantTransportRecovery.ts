export type StoredAssistantMessage = {
  role?: unknown
  content?: unknown
  created_at?: unknown
}

export const ASSISTANT_TRANSPORT_TIMEOUT_COPY = {
  en: 'COS did not finish this turn before the page deadline, and no completed reply was found in History. If this was only a question, you can retry it safely. If it requested an external action, check History before retrying.',
  es: 'COS no terminó este turno antes del límite de espera de la página y no se encontró una respuesta completada en el Historial. Si solo era una pregunta, puedes repetirla con seguridad. Si solicitaba una acción externa, revisa el Historial antes de repetirla.',
  pt: 'O COS não concluiu este turno antes do limite de espera da página e nenhuma resposta concluída foi encontrada no Histórico. Se era apenas uma pergunta, você pode repeti-la com segurança. Se solicitava uma ação externa, verifique o Histórico antes de repeti-la.',
  pl: 'COS nie zakończył tej odpowiedzi przed limitem oczekiwania strony, a w Historii nie znaleziono ukończonej odpowiedzi. Jeśli było to tylko pytanie, można je bezpiecznie ponowić. Jeśli żądano działania zewnętrznego, przed ponowieniem sprawdź Historię.',
  ru: 'COS не завершил этот ответ до истечения времени ожидания страницы, и в Истории не найден завершённый ответ. Если это был только вопрос, его можно безопасно повторить. Если запрашивалось внешнее действие, перед повтором проверьте Историю.',
} as const

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Return the assistant reply belonging to this exact client send when the POST response
 * was lost after the server persisted the turn. Repeated identical prompts are common in
 * COS benchmarks, so content equality alone is not enough: the matching user message must
 * also have been created at or after this send (with a small clock-skew allowance).
 */
export function findRecoveredAssistantReply(
  messages: StoredAssistantMessage[],
  expectedUserContent: string,
  sentAtMs: number,
  clockSkewAllowanceMs = 10_000,
): string | null {
  const expected = normalize(expectedUserContent)
  if (!expected || !Array.isArray(messages) || !messages.length) return null
  const earliestAllowed = sentAtMs - Math.max(0, clockSkewAllowanceMs)

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const current = messages[i]
    if (current?.role !== 'user' || normalize(current.content) !== expected) continue

    const createdAt = Date.parse(String(current.created_at ?? ''))
    if (!Number.isFinite(createdAt) || createdAt < earliestAllowed) continue

    for (let j = i + 1; j < messages.length; j += 1) {
      const candidate = messages[j]
      if (candidate?.role === 'user') break
      if (candidate?.role !== 'assistant') continue
      const reply = String(candidate.content ?? '').trim()
      if (reply) return reply
    }
  }

  return null
}
