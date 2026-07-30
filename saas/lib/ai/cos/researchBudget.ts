// saas/lib/ai/cos/researchBudget.ts

export type VerifiedResearchResult = {
  title: string
  url: string
  snippet: string
}

export type ResearchTaskPlan = {
  requestedTotal: number
  researchQuery: string
  hasDraftDeliverable: boolean
}

export type BoundedResearchPartial = {
  reply: string
  completed: number
  total: number
  remaining: number
  continuationAvailable: boolean
  continuationPrompt: string | null
  researchState: 'partial' | 'complete'
  draftState: 'pending' | null
  executionAllowed: false
  externalActionTaken: false
}

const RESEARCH_TARGET_PATTERN = /\b(?:find|identify|research|discover|locate|list)\b[\s\S]{0,120}\b(?:buyers?|companies|businesses|prospects?|design partners?|customers?|vendors?)\b/i
const DRAFT_DELIVERABLE_PATTERN = /\b(?:draft|write|prepare|compose|create)\b[\s\S]{0,100}\b(?:outreach|e-?mail|message|letter)\b/i
const REQUESTED_TOTAL_PATTERN = /\b(\d{1,3})\s+(?:(?:strong|qualified|potential|prospective|target|new|additional)\s+)*(?:buyers?|companies|businesses|prospects?|design partners?|customers?|vendors?)\b/i

function cleanResearchQuery(input: string): string {
  const draftStart = input.search(DRAFT_DELIVERABLE_PATTERN)
  const researchOnly = draftStart > 0 ? input.slice(0, draftStart) : input
  return researchOnly.replace(/\b(?:and\s+then|then)\s*$/i, '').trim().slice(0, 400)
}

export function planResearchTask(input: string): ResearchTaskPlan | null {
  const objective = String(input || '').trim()
  if (!objective || !RESEARCH_TARGET_PATTERN.test(objective)) return null

  const totalMatch = objective.match(REQUESTED_TOTAL_PATTERN)
  if (!totalMatch) return null

  const requestedTotal = Math.max(1, Math.min(Number(totalMatch[1]) || 1, 999))
  const researchQuery = cleanResearchQuery(objective)
  if (!researchQuery) return null

  return {
    requestedTotal,
    researchQuery,
    hasDraftDeliverable: DRAFT_DELIVERABLE_PATTERN.test(objective),
  }
}

export function normalizeVerifiedResearchResults(
  results: readonly VerifiedResearchResult[],
  requestedTotal: number,
): VerifiedResearchResult[] {
  const seen = new Set<string>()
  const normalized: VerifiedResearchResult[] = []

  for (const result of results) {
    const title = String(result?.title || '').trim().slice(0, 240)
    const url = String(result?.url || '').trim().slice(0, 1_000)
    const snippet = String(result?.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    if (!title || !/^https?:\/\//i.test(url)) continue

    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push({ title, url, snippet })
    if (normalized.length >= requestedTotal) break
  }

  return normalized
}

const COPY = {
  en: {
    title: 'Research stopped cleanly at the bounded processing limit.',
    research: (completed: number, total: number, remaining: number) => `Sub-task 1 — Research: ${completed} of ${total} completed; ${remaining} remain.`,
    results: 'Verified completed results:',
    none: 'No source-verified result was available to return before the stop.',
    draft: 'Sub-task 2 — Outreach draft: not started. It remains the next sequential deliverable after the research list is complete.',
    safety: 'No one was contacted. No email was sent. No form was submitted, and no external action was taken.',
    continue: 'Reply “continue this task” to use the generated continuation below without reconstructing the original request.',
    prompt: 'Continuation prompt:',
  },
  es: {
    title: 'La investigación se detuvo de forma segura al alcanzar el límite de procesamiento.',
    research: (completed: number, total: number, remaining: number) => `Subtarea 1 — Investigación: ${completed} de ${total} completadas; faltan ${remaining}.`,
    results: 'Resultados verificados completados:',
    none: 'No hubo resultados verificados disponibles para devolver antes de detenerse.',
    draft: 'Subtarea 2 — Borrador de alcance: no iniciado. Sigue como el siguiente entregable después de completar la investigación.',
    safety: 'No se contactó a nadie. No se envió ningún correo ni formulario y no se realizó ninguna acción externa.',
    continue: 'Responda “continuar esta tarea” para usar la continuación generada sin reconstruir la solicitud original.',
    prompt: 'Solicitud de continuación:',
  },
  pt: {
    title: 'A pesquisa foi interrompida com segurança ao atingir o limite de processamento.',
    research: (completed: number, total: number, remaining: number) => `Subtarefa 1 — Pesquisa: ${completed} de ${total} concluídas; restam ${remaining}.`,
    results: 'Resultados verificados concluídos:',
    none: 'Nenhum resultado verificado estava disponível para retornar antes da interrupção.',
    draft: 'Subtarefa 2 — Rascunho de contato: não iniciado. Continua como a próxima entrega depois que a pesquisa for concluída.',
    safety: 'Ninguém foi contatado. Nenhum e-mail ou formulário foi enviado e nenhuma ação externa foi realizada.',
    continue: 'Responda “continuar esta tarefa” para usar a continuação gerada sem reconstruir o pedido original.',
    prompt: 'Prompt de continuação:',
  },
  pl: {
    title: 'Badanie zostało bezpiecznie zatrzymane po osiągnięciu limitu przetwarzania.',
    research: (completed: number, total: number, remaining: number) => `Podzadanie 1 — Badanie: ukończono ${completed} z ${total}; pozostało ${remaining}.`,
    results: 'Ukończone, zweryfikowane wyniki:',
    none: 'Przed zatrzymaniem nie było dostępnego zweryfikowanego wyniku do zwrócenia.',
    draft: 'Podzadanie 2 — Szkic wiadomości: nie rozpoczęto. Pozostaje kolejnym zadaniem po ukończeniu badania.',
    safety: 'Z nikim się nie skontaktowano. Nie wysłano e-maila ani formularza i nie wykonano żadnej czynności zewnętrznej.',
    continue: 'Odpowiedz „kontynuuj to zadanie”, aby użyć wygenerowanej kontynuacji bez odtwarzania pierwotnej prośby.',
    prompt: 'Polecenie kontynuacji:',
  },
  ru: {
    title: 'Исследование было безопасно остановлено при достижении лимита обработки.',
    research: (completed: number, total: number, remaining: number) => `Подзадача 1 — Исследование: завершено ${completed} из ${total}; осталось ${remaining}.`,
    results: 'Завершенные проверенные результаты:',
    none: 'До остановки не было проверенного результата, который можно было бы вернуть.',
    draft: 'Подзадача 2 — Черновик обращения: не начат. Он остается следующим этапом после завершения исследования.',
    safety: 'Ни с кем не связывались. Письма и формы не отправлялись, внешние действия не выполнялись.',
    continue: 'Ответьте «продолжить эту задачу», чтобы использовать созданное продолжение без повторного составления исходного запроса.',
    prompt: 'Запрос для продолжения:',
  },
} as const

function continuationPrompt(plan: ResearchTaskPlan, completed: number, remaining: number): string | null {
  if (remaining > 0) {
    const draft = plan.hasDraftDeliverable
      ? ' After the research list reaches the requested total, draft the requested outreach email as a separate second sub-task.'
      : ''
    return `Continue the previous research task. Preserve the ${completed} verified results already returned and research ${remaining} additional companies to reach ${plan.requestedTotal}.${draft} Do not contact anyone, send email, submit forms, or take any external action.`
  }

  if (plan.hasDraftDeliverable) {
    return `Continue the previous task with the second sub-task: draft the requested outreach email using the ${completed} verified research results already returned. Do not contact anyone, send email, submit forms, or take any external action.`
  }

  return null
}

export function buildBoundedResearchPartial(
  plan: ResearchTaskPlan,
  rawResults: readonly VerifiedResearchResult[],
  languageCode = 'en',
): BoundedResearchPartial {
  const results = normalizeVerifiedResearchResults(rawResults, plan.requestedTotal)
  const completed = results.length
  const total = plan.requestedTotal
  const remaining = Math.max(0, total - completed)
  const researchState = remaining === 0 ? 'complete' : 'partial'
  const draftState = plan.hasDraftDeliverable ? 'pending' : null
  const prompt = continuationPrompt(plan, completed, remaining)
  const copy = COPY[languageCode as keyof typeof COPY] || COPY.en

  const resultLines = results.length
    ? results.map((result, index) => {
        const snippet = result.snippet ? `\n   ${result.snippet}` : ''
        return `${index + 1}. ${result.title}\n   ${result.url}${snippet}`
      }).join('\n\n')
    : copy.none

  const sections = [
    copy.title,
    '',
    copy.research(completed, total, remaining),
    '',
    copy.results,
    resultLines,
  ]

  if (plan.hasDraftDeliverable) sections.push('', copy.draft)
  sections.push('', copy.safety)
  if (prompt) sections.push('', copy.continue, '', copy.prompt, `> ${prompt}`)

  return {
    reply: sections.join('\n'),
    completed,
    total,
    remaining,
    continuationAvailable: Boolean(prompt),
    continuationPrompt: prompt,
    researchState,
    draftState,
    executionAllowed: false,
    externalActionTaken: false,
  }
}
