export type StoredAssistantMessage = {
  role?: unknown
  content?: unknown
  created_at?: unknown
  provenance?: unknown
}

export const ASSISTANT_TRANSPORT_TIMEOUT_COPY = {
  en: 'The page stopped waiting before it received the COS response. It could not confirm whether the server completed the request. Check History before retrying an action to avoid duplicates.',
  es: 'La página dejó de esperar antes de recibir la respuesta de COS. No pudo confirmar si el servidor completó la solicitud. Revisa el Historial antes de repetir una acción para evitar duplicados.',
  pt: 'A página parou de aguardar antes de receber a resposta do COS. Não foi possível confirmar se o servidor concluiu a solicitação. Verifique o Histórico antes de repetir uma ação para evitar duplicações.',
  pl: 'Strona przestała czekać, zanim otrzymała odpowiedź COS. Nie można potwierdzić, czy serwer zakończył żądanie. Przed ponowieniem działania sprawdź Historię, aby uniknąć duplikatów.',
  ru: 'Страница прекратила ожидание до получения ответа COS. Нельзя подтвердить, завершил ли сервер запрос. Перед повтором действия проверьте Историю, чтобы избежать дублирования.',
  de: 'Die Seite hat aufgehört zu warten, bevor sie die COS-Antwort erhielt. Es konnte nicht bestätigt werden, ob der Server die Anfrage abgeschlossen hat. Prüfen Sie den Verlauf, bevor Sie eine Aktion wiederholen, um Duplikate zu vermeiden.',
  fr: 'La page a cessé d\'attendre avant de recevoir la réponse de COS. Impossible de confirmer si le serveur a terminé la requête. Consultez l\'Historique avant de relancer une action afin d\'éviter les doublons.',
  it: 'La pagina ha smesso di attendere prima di ricevere la risposta di COS. Non è stato possibile confermare se il server ha completato la richiesta. Controlla la Cronologia prima di ripetere un\'azione per evitare duplicati.',
  ja: 'COS の応答を受信する前にページの待機が終了しました。サーバーがリクエストを完了したかどうかを確認できませんでした。重複を避けるため、操作を再試行する前に履歴を確認してください。',
  ko: 'COS 응답을 받기 전에 페이지 대기가 중단되었습니다. 서버가 요청을 완료했는지 확인할 수 없습니다. 중복을 방지하려면 작업을 다시 시도하기 전에 기록을 확인하세요.',
  ar: 'توقفت الصفحة عن الانتظار قبل استلام رد COS. تعذّر التأكد مما إذا كان الخادم قد أكمل الطلب. راجع السجل قبل إعادة محاولة أي إجراء لتجنّب التكرار.',
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
      const candidateProvenance = provenanceRecord(candidate.provenance)
      if (candidateProvenance?.schema === 'signalboost-cos-turn-v1' && candidateProvenance?.status === 'running') continue
      const reply = String(candidate.content ?? '').trim()
      if (reply) return reply
    }
  }

  return null
}


function provenanceRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function findDurableCosTurnReply(
  messages: StoredAssistantMessage[],
  turnId: string,
): { content: string; status: 'succeeded' | 'failed' } | null {
  if (!turnId || !Array.isArray(messages)) return null
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const provenance = provenanceRecord(message.provenance)
    if (provenance?.schema !== 'signalboost-cos-turn-v1' || provenance?.turnId !== turnId) continue
    const status = provenance.status
    if (status !== 'succeeded' && status !== 'failed') return null
    const content = String(message.content ?? '').trim()
    return content ? { content, status } : null
  }
  return null
}
