// saas/lib/ai/cos/honestRefusalReply.ts
//
// WHAT COS SAYS WHEN IT RELEASES NOTHING.
//
// The person gets one honest sentence in their language: COS did not finish a reliable answer, it is not handing
// over a guessed one, and sending the request again starts the work over. It never invents a cause, a number, or a
// list of inputs the person supposedly left out.
//
// Production 2026-10-26: this reply used to be assembled from keywords in the request. "cost" or "price" added
// "the unit price that applies", "bandwidth" added network bandwidth, "fail" or "incident" added a paragraph about
// readings and baselines. The owner received "I need the total power draw, the network bandwidth, the data volume
// and the unit price" for a request that needed none of them, and it read as COS refusing to work. Nothing the
// person typed decides this reply any more; only their language does.
//
// No internal vocabulary: this text ships to public visitors.

export type RefusalLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const NO_ANSWER: Record<RefusalLanguage, string> = {
  en: 'I could not finish a reliable answer to this request just now, so I am not giving you a guessed one. Send it again and I will work through the whole request from the start.',
  es: 'No pude terminar una respuesta fiable a esta solicitud en este momento, así que no te doy una respuesta adivinada. Envíala de nuevo y trabajaré la solicitud completa desde el principio.',
  pt: 'Não consegui concluir uma resposta confiável para este pedido agora, por isso não vou te dar uma resposta adivinhada. Envie-o novamente e vou trabalhar o pedido completo desde o início.',
  pl: 'Nie udało mi się teraz przygotować rzetelnej odpowiedzi na tę prośbę, więc nie podam odpowiedzi zgadywanej. Wyślij ją ponownie, a opracuję całą prośbę od początku.',
  ru: 'Сейчас мне не удалось подготовить надёжный ответ на этот запрос, поэтому я не даю ответ наугад. Отправьте его ещё раз, и я проработаю весь запрос с самого начала.',
  de: 'Ich konnte gerade keine verlässliche Antwort auf diese Anfrage fertigstellen, deshalb gebe ich Ihnen keine geratene. Senden Sie sie erneut, dann bearbeite ich die gesamte Anfrage von vorn.',
  fr: 'Je n’ai pas pu terminer une réponse fiable à cette demande pour le moment, donc je ne vous donne pas une réponse devinée. Renvoyez-la et je traiterai toute la demande depuis le début.',
  it: 'Non sono riuscito a completare ora una risposta affidabile a questa richiesta, quindi non ti do una risposta tirata a indovinare. Inviala di nuovo e lavorerò sull’intera richiesta dall’inizio.',
  ja: '現時点ではこのリクエストに対する信頼できる回答を完成できなかったため、推測による回答はお渡ししません。もう一度送信していただければ、リクエスト全体を最初から処理します。',
  ko: '지금은 이 요청에 대해 신뢰할 수 있는 답변을 완성하지 못해 추측한 답변을 드리지 않습니다. 다시 보내 주시면 요청 전체를 처음부터 처리하겠습니다.',
  ar: 'لم أتمكن الآن من إكمال إجابة موثوقة على هذا الطلب، لذلك لن أقدّم لك إجابة مخمَّنة. أرسل الطلب مرة أخرى وسأعالج الطلب كاملًا من البداية.',
}

function normalizeLanguage(language: string | null | undefined): RefusalLanguage {
  const code = String(language ?? 'en').trim().slice(0, 2).toLowerCase()
  return code in NO_ANSWER ? code as RefusalLanguage : 'en'
}

/** The reply when COS released no answer. The request's wording never changes it; only the language does. */
export function buildHonestRefusalReply(args: { prompt: string; language?: string | null }): string {
  return NO_ANSWER[normalizeLanguage(args.language)]
}
