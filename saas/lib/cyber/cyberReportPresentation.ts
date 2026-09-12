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

// Exact runtime identifiers observed in the current repository source inventory.
// These are evidence values (User-Agents, schema names and runtime IDs), not product
// adjectives. Keep this list reconciled when implementation identifiers are added.
const LEGACY_TECHNICAL_IDENTIFIERS = new Set([
  'signalboost-api', 'signalboost-worker', 'signalboost-live', 'signalboost-clean',
  'signalboost-assistant', 'signalboost-cos', 'signalboost-cos-builder',
  'signalboost-cos-business-intelligence-corpus', 'signalboost-cos-platform-engineer',
  'signalboost-locale-completion', 'signalboost-provider-version', 'signalboost-request-id',
  'signalboost-url-intelligence', 'signalboost-universalprovider',
  'signalboost-verified-person-visual', 'signalboost-verified-visual',
  'signalboost-host', 'signalboost-anon', 'signalboost-assistant-transport',
  'signalboost-audio', 'signalboost-audit', 'signalboost-aws-access-key',
  'signalboost-aws-secret-key', 'signalboost-backup-cos-v1',
  'signalboost-base-v2-clean-background', 'signalboost-base-v3-fast-720p',
  'signalboost-base-v4-clean-full-screen', 'signalboost-brand-banner-v2-prominent-full-width',
  'signalboost-builder-job-v1', 'signalboost-campaign-copy-v2-clean',
  'signalboost-captions-v2-solid-panel', 'signalboost-captions-v3-solid-panel',
  'signalboost-captions-v4-solid-panel', 'signalboost-chief-of-staff', 'signalboost-cloud',
  'signalboost-concierge-panel', 'signalboost-copy-v3-customer-only',
  'signalboost-copy-v4-customer-only', 'signalboost-cos-blueprint',
  'signalboost-cos-blueprint-v1', 'signalboost-cos-brain-v1',
  'signalboost-cos-continuity-v1', 'signalboost-cos-engineering',
  'signalboost-cos-integrity-v3', 'signalboost-cos-verify',
  'signalboost-data-center-diagnostic-error-v1', 'signalboost-data-center-diagnostic-v1',
  'signalboost-dc-simulator', 'signalboost-demo', 'signalboost-demo-drill',
  'signalboost-external-ai', 'signalboost-host-context', 'signalboost-i18n-sweep',
  'signalboost-identity', 'signalboost-language-purity-v1', 'signalboost-learning-admission',
  'signalboost-memory-vs-cache', 'signalboost-operator', 'signalboost-platform',
  'signalboost-reference', 'signalboost-reference-acceptance',
  'signalboost-reference-diagnostic-assignment', 'signalboost-reference-live',
  'signalboost-reference-self-healing-diagnostic-http', 'signalboost-repair',
  'signalboost-saas-api', 'signalboost-self-healing-supervisor',
  'signalboost-supervisor-signature', 'signalboost-surface', 'signalboost-vector-space',
  // Additional portable/host modules from the full source inventory.
  "signalboost-a2a-agent-registry-v1",
  "signalboost-a2a-availability-v1",
  "signalboost-a2a-buyer-manifest-v1",
  "signalboost-a2a-buyer-onboarding-v1",
  "signalboost-a2a-client-v1",
  "signalboost-a2a-delegation-runtime-v1",
  "signalboost-a2a-host-activation-v1",
  "signalboost-a2a-http-jsonrpc-v1",
  "signalboost-a2a-live-acceptance-v1",
  "signalboost-a2a-runtime-observation-v1",
  "signalboost-android-build-evidence-manifest-v1",
  "signalboost-android-build-evidence-v1",
  "signalboost-android-build-plan-v1",
  "signalboost-android-buyer-handoff-manifest-v1",
  "signalboost-android-packaging-evidence-chain-v1",
  "signalboost-android-packaging-v1",
  "signalboost-android-play-console-release-evidence-v1",
  "signalboost-android-production-publication-evidence-v1",
  "signalboost-android-publication-evidence-v1",
  "signalboost-android-publication-readiness-v1",
  "signalboost-android-scaffold-review-bundle-v1",
  "signalboost-android-scaffold-v1",
  "signalboost-android-signed-bundle-evidence-v1",
  "signalboost-brand-overlay-v4",
  "signalboost-cos-a2a-runtime-host-v1",
  "signalboost-cos-specialist-orchestrator-v1",
  "signalboost-cos-specialist-planner-v1",
  "signalboost-google-play-readiness-v1",
  "signalboost-host-adapter-factory",
  "signalboost-internal",
  "signalboost-platform-health",
  "signalboost-portable-a2a-host-v1",
  "signalboost-provider-config-adapter",
  "signalboost-provider-hub",
  "signalboost-provider-hub-",
  "signalboost-provider-hub-build-readiness-v1",
  "signalboost-provider-hub-dependency-review-v1",
  "signalboost-provider-hub-host-factory-v1",
  "signalboost-provider-hub-runtime-assembly-v1",
  "signalboost-provider-hub-runtime-registry-v1",
  "signalboost-provider-hub-unsigned-build-evidence-bundle-v1",
  "signalboost-provider-hub-unsigned-build-provenance-v1",
  "signalboost-provider-hub-v1",
  "signalboost-readonly-host-ports",
  "signalboost-readonly-host-ports-v1",
  "signalboost-reference-cos-a2a-host-v1",
  "signalboost-reference-https-jsonrpc",
  "signalboost-reference-self-healing-diagnostic",
  "signalboost-runtime-assembly",
  "signalboost-self-healing-native-probe",
  "signalboost-self-healing-website-optimizer",
  "signalboost-staging-live-data-read-host-v1",
  "signalboost-supervisor",
  "signalboost-supervisor-connectors",
  "signalboost-v1",
  "signalboost-vercel",
])
// Runtime-generated names append IDs/version labels to these observed prefixes.
const LEGACY_TECHNICAL_PREFIXES = [
  'signalboost-live-', 'signalboost-api-', 'signalboost-worker-',
  'signalboost-console-', 'signalboost-vault-rotated-', 'signalboost-banner-upgrade-',
  'signalboost-base-video-', 'signalboost-creative-', 'signalboost-deck-',
  'signalboost-fast-final-', 'signalboost-self-healing-supervisor-',
  'signalboost-video-', 'signalboost-voice-', 'signalboost-provider-hub-',
]

/** Display product prose only; never pass the result to persistence or authorization. */
export function cyberProductText(value: string | null | undefined): string {
  if (!value) return ''
  // Preserve matching code delimiters of any length, not just one-backtick spans.
  const code = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/
  // Punctuation is legal URL/IRI path or query data, not a reliable prose boundary.
  // Preserve hierarchical and opaque scheme: URI tokens byte-for-byte.
  // Ambiguous adjacent text stays technical; clearly separated prose is normalized.
  const url = /(?:[a-z][a-z0-9+.-]*:|git@)[^\s<>"`]+/
  // This is token shielding, not address validation. A DNS name/domain literal ends
  // before sentence punctuation; it must not swallow adjacent product prose.
  const email = /(?:mailto:)?(?:"(?:[^"\\\r\n]|\\.)*"|[\p{L}\p{N}\p{M}!#$%&'*+\/=?^_`{|}~.-]+)@(?:\[[^\]\r\n]+\]|[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?)*)/u
  const protectedTokens = new RegExp(`${code.source}|${url.source}|${email.source}`, 'giu')
  const prose = (text: string) => text.replace(
    /(?<![\p{L}\p{N}_./\\@-])(SignalBoost(?:Ai|\s+AI)?)(-[\p{L}][\p{L}\p{N}-]*)?(?![\p{L}\p{N}_/\\@-]|\.[\p{L}\p{N}])/giu,
    (token: string, brand: string, suffix: string | undefined) => {
      const identity = token.toLowerCase()
      if (LEGACY_TECHNICAL_IDENTIFIERS.has(identity)
        || LEGACY_TECHNICAL_PREFIXES.some(prefix => identity.startsWith(prefix))) return token
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
