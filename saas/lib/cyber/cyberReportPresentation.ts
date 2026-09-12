import { publicBrandText } from '../public-brand.ts'

// Read-only presentation helpers. Never mutate a saved request or its approval fields.
const COPY = {
  en: {
    brandDisplayNotice: "Product names are displayed as iTMounts. Stored records and approval history are unchanged.",
    savedPlanNotice: 'Saved dependency plan. Its original wording and approval history are retained below. Reassess current dependencies before preparing new work; this does not approve or change the saved request.',
    savedPlanArchive: 'Original saved plan and policy wording (historical)',
    recordedApproval: 'Recorded plan approval', reassess: 'Reassess current dependencies',
    unknownSeverity: 'Unclassified severity',
    severityWarning: 'Some advisories have unclassified severity. Zero critical/high counts do not mean these findings are harmless. Review the source details before remediation.',
    unavailable: 'Unavailable',
    monitorSeverityNotice: 'Critical/high counts exclude unclassified findings. Run a fresh scan to see the full severity breakdown.',
  },
  es: {
    brandDisplayNotice: "Los nombres del producto se muestran como iTMounts. Los registros guardados y el historial de aprobación no cambian.",
    savedPlanNotice: 'Plan de dependencias guardado. El texto original y el historial de aprobación se conservan abajo. Vuelve a analizar las dependencias antes de preparar trabajo nuevo; esto no aprueba ni cambia la solicitud guardada.',
    savedPlanArchive: 'Plan guardado y política originales (históricos)',
    recordedApproval: 'Aprobación del plan registrada', reassess: 'Volver a analizar las dependencias',
    unknownSeverity: 'Severidad sin clasificar',
    severityWarning: 'Algunos avisos tienen severidad sin clasificar. Cero hallazgos críticos/altos no significa que sean inofensivos. Revisa los detalles de la fuente antes de remediar.',
    unavailable: 'No disponible',
    monitorSeverityNotice: 'Los recuentos críticos/altos excluyen hallazgos sin clasificar. Ejecuta un nuevo análisis para ver todas las severidades.',
  },
  pt: {
    brandDisplayNotice: "O nome do produto é exibido como iTMounts. Os registros salvos e o histórico de aprovação permanecem inalterados.",
    savedPlanNotice: 'Plano de dependências salvo. O texto original e o histórico de aprovação estão preservados abaixo. Reavalie as dependências antes de preparar novo trabalho; isso não aprova nem altera a solicitação salva.',
    savedPlanArchive: 'Plano salvo e política originais (históricos)',
    recordedApproval: 'Aprovação do plano registrada', reassess: 'Reavaliar as dependências atuais',
    unknownSeverity: 'Severidade não classificada',
    severityWarning: 'Alguns avisos têm severidade não classificada. Zero achados críticos/altos não significa que sejam inofensivos. Revise os detalhes da fonte antes da correção.',
    unavailable: 'Indisponível',
    monitorSeverityNotice: 'As contagens críticas/altas excluem achados não classificados. Execute uma nova análise para ver todas as severidades.',
  },
  pl: {
    brandDisplayNotice: "Nazwa produktu jest wyświetlana jako iTMounts. Zapisane rekordy i historia akceptacji pozostają bez zmian.",
    savedPlanNotice: 'Zapisany plan zależności. Oryginalna treść i historia akceptacji są zachowane poniżej. Przed nową pracą ponownie sprawdź zależności; nie zatwierdza to ani nie zmienia zapisanego wniosku.',
    savedPlanArchive: 'Oryginalny zapisany plan i zasady (historyczne)',
    recordedApproval: 'Zapisana akceptacja planu', reassess: 'Sprawdź aktualne zależności',
    unknownSeverity: 'Nieokreślona istotność',
    severityWarning: 'Część ostrzeżeń ma nieokreśloną istotność. Brak krytycznych/poważnych wyników nie oznacza, że są nieszkodliwe. Przed naprawą sprawdź dane źródłowe.',
    unavailable: 'Niedostępne',
    monitorSeverityNotice: 'Liczby krytycznych/poważnych wyników pomijają nieokreślone ostrzeżenia. Uruchom nowy skan, aby zobaczyć pełny podział.',
  },
  ru: {
    brandDisplayNotice: "Название продукта отображается как iTMounts. Сохранённые записи и история одобрений не изменены.",
    savedPlanNotice: 'Сохранённый план зависимостей. Исходный текст и история одобрений сохранены ниже. Перед новой работой повторно проверьте зависимости; это не одобряет и не изменяет сохранённый запрос.',
    savedPlanArchive: 'Исходный сохранённый план и правила (история)',
    recordedApproval: 'Записанное одобрение плана', reassess: 'Проверить текущие зависимости',
    unknownSeverity: 'Тяжесть не определена',
    severityWarning: 'Тяжесть некоторых предупреждений не определена. Нулевые критические/высокие значения не означают отсутствие риска. Перед исправлением проверьте исходные данные.',
    unavailable: 'Недоступно',
    monitorSeverityNotice: 'Критические/высокие значения не включают неклассифицированные предупреждения. Выполните новый анализ для полного распределения.',
  },
}
export function cyberReportPresentationCopy(lang: string) { return COPY[lang as keyof typeof COPY] || COPY.en }
export function unclassifiedAdvisoryCount(advisories: Array<{ severity?: string }>): number {
  return advisories.filter(a => !['critical', 'high', 'medium', 'low'].includes(a.severity || '')).length
}
export function dependencyRescanUrl(row: { source_area?: string; source_type?: string; repo?: string | null; target?: string | null }): string | null {
  if (row.source_area !== 'cybersecurity' || row.source_type !== 'dependency_scan'
    || typeof row.repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.repo)
    || row.repo.split('/').some(part => part === '.' || part === '..')) return null
  const fallback = `https://github.com/${row.repo}`
  if (row.target === undefined || row.target === null || row.target === '') return fallback
  if (typeof row.target !== 'string') return null
  const target = row.target.trim()
  if (!target) return fallback
  if (target.toLowerCase() === row.repo.toLowerCase()) return fallback
  // Validate the raw path before URL parsing can normalize traversal away.
  // An explicit invalid/unsupported target must never widen to the whole repo.
  const match = target.length <= 4096 && target.match(/^https:\/\/github\.com\/(.+)$/i)
  if (!match) return null
  const parts = match[1].replace(/\/$/, '').split('/')
  if (parts.some(part => !/^[A-Za-z0-9_.@+-]+$/.test(part) || part === '.' || part === '..')) return null
  const repo = parts.slice(0, 2).join('/').replace(/\.git$/, '')
  if (repo.toLowerCase() !== row.repo.toLowerCase()) return null
  if (parts.length !== 2 && (parts.length < 4 || !['tree', 'blob'].includes(parts[2]))) return null
  return `https://github.com/${parts.join('/')}`
}

/** Display product prose only; never pass the result to persistence or authorization. */
export function cyberProductText(value: string | null | undefined): string {
  if (!value) return ''
  // Preserve matching code delimiters of any length, not just one-backtick spans.
  const code = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/
  // Mailto headers are part of the URI, not prose after an email address.
  const url = /(?:[a-z][a-z0-9+.-]*:\/\/|git@)[^\s<>"`]+|mailto:[^\s<>"`?]*\?(?=[^\s<>"`&=]+=)[^\s<>"`]*/
  // This is token shielding, not address validation. A DNS name/domain literal ends
  // before sentence punctuation; it must not swallow adjacent product prose.
  const email = /(?:mailto:)?(?:"(?:[^"\\\r\n]|\\.)*"|[\p{L}\p{N}\p{M}!#$%&'*+\/=?^_`{|}~.-]+)@(?:\[[^\]\r\n]+\]|[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?)*)/u
  const protectedTokens = new RegExp(`${code.source}|${url.source}|${email.source}`, 'giu')
  const prose = (text: string) => text.replace(
    /(?<![\p{L}\p{N}_./\\@-])(SignalBoost(?:Ai|\s+AI)?)(-[\p{L}][\p{L}\p{N}-]*)?(?![\p{L}\p{N}_/\\@-]|\.[\p{L}\p{N}])/giu,
    (token: string, brand: string, suffix: string | undefined) => {
      // Known bare implementation identifiers remain exact. All other descriptive
      // compounds use the current brand, without maintaining an adjective allowlist.
      // Paths, filenames, URLs, email and code have separate structural protection.
      if (/^SignalBoost-(?:live|api|worker)(?:-|$)/i.test(token)) return token
      return publicBrandText(brand) + (suffix || '')
    },
  )
  let rendered = ''
  let cursor = 0
  for (const match of value.matchAll(protectedTokens)) {
    rendered += prose(value.slice(cursor, match.index)) + match[0]
    cursor = match.index + match[0].length
  }
  return rendered + prose(value.slice(cursor))
}
