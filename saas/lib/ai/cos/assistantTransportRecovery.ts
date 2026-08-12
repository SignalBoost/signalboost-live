export type StoredAssistantMessage = {
  role?: unknown
  content?: unknown
  created_at?: unknown
}

export const ASSISTANT_TRANSPORT_TIMEOUT_COPY = {
  en: 'The page stopped waiting before it received the COS response. It could not confirm whether the server completed the request. Check History before retrying an action to avoid duplicates.',
  es: 'La página dejó de esperar antes de recibir la respuesta de COS. No pudo confirmar si el servidor completó la solicitud. Revisa el Historial antes de repetir una acción para evitar duplicados.',
  pt: 'A página parou de aguardar antes de receber a resposta do COS. Não foi possível confirmar se o servidor concluiu a solicitação. Verifique o Histórico antes de repetir uma ação para evitar duplicações.',
  pl: 'Strona przestała czekać, zanim otrzymała odpowiedź COS. Nie można potwierdzić, czy serwer zakończył żądanie. Przed ponowieniem działania sprawdź Historię, aby uniknąć duplikatów.',
  ru: 'Страница прекратила ожидание до получения ответа COS. Нельзя подтвердить, завершил ли сервер запрос. Перед повтором действия проверьте Историю, чтобы избежать дублирования.',
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
