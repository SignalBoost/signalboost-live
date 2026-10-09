import { publicBrandText } from '../public-brand.ts'

// Read-only presentation helpers. Never mutate a saved request or its approval fields.
const COPY = {
  en: {
    brandDisplayNotice: "Product names are displayed as iTMounts. Stored records and approval history are unchanged.",
    savedPlanNotice: 'Saved dependency plan. Product names in this view are displayed as iTMounts; the stored source record and approval history are unchanged. Reassess current dependencies before preparing new work; this does not approve or change the saved request.',
    savedPlanArchive: 'Saved plan and policy context (historical display)',
    recordedApproval: 'Recorded plan approval', reassess: 'Reassess current dependencies',
    unknownSeverity: 'Unclassified severity',
    severityWarning: 'Some advisories have unclassified severity. Zero critical/high counts do not mean these findings are harmless. Review the source details before remediation.',
    unavailable: 'Unavailable',
    monitorSeverityNotice: 'Critical/high counts exclude unclassified findings. Run a fresh scan to see the full severity breakdown.',
  },
  es: {
    brandDisplayNotice: "Los nombres del producto se muestran como iTMounts. Los registros guardados y el historial de aprobación no cambian.",
    savedPlanNotice: 'Plan de dependencias guardado. Los nombres del producto en esta vista se muestran como iTMounts; el registro fuente guardado y el historial de aprobación no cambian. Vuelve a analizar las dependencias antes de preparar trabajo nuevo; esto no aprueba ni cambia la solicitud guardada.',
    savedPlanArchive: 'Plan y contexto de política guardados (vista histórica)',
    recordedApproval: 'Aprobación del plan registrada', reassess: 'Volver a analizar las dependencias',
    unknownSeverity: 'Severidad sin clasificar',
    severityWarning: 'Algunos avisos tienen severidad sin clasificar. Cero hallazgos críticos/altos no significa que sean inofensivos. Revisa los detalles de la fuente antes de remediar.',
    unavailable: 'No disponible',
    monitorSeverityNotice: 'Los recuentos críticos/altos excluyen hallazgos sin clasificar. Ejecuta un nuevo análisis para ver todas las severidades.',
  },
  pt: {
    brandDisplayNotice: "O nome do produto é exibido como iTMounts. Os registros salvos e o histórico de aprovação permanecem inalterados.",
    savedPlanNotice: 'Plano de dependências salvo. Os nomes do produto nesta visualização são exibidos como iTMounts; o registro-fonte salvo e o histórico de aprovação permanecem inalterados. Reavalie as dependências antes de preparar novo trabalho; isso não aprova nem altera a solicitação salva.',
    savedPlanArchive: 'Plano salvo e contexto de política (visualização histórica)',
    recordedApproval: 'Aprovação do plano registrada', reassess: 'Reavaliar as dependências atuais',
    unknownSeverity: 'Severidade não classificada',
    severityWarning: 'Alguns avisos têm severidade não classificada. Zero achados críticos/altos não significa que sejam inofensivos. Revise os detalhes da fonte antes da correção.',
    unavailable: 'Indisponível',
    monitorSeverityNotice: 'As contagens críticas/altas excluem achados não classificados. Execute uma nova análise para ver todas as severidades.',
  },
  pl: {
    brandDisplayNotice: "Nazwa produktu jest wyświetlana jako iTMounts. Zapisane rekordy i historia akceptacji pozostają bez zmian.",
    savedPlanNotice: 'Zapisany plan zależności. Nazwy produktu w tym widoku są wyświetlane jako iTMounts; zapisany rekord źródłowy i historia akceptacji pozostają bez zmian. Przed nową pracą ponownie sprawdź zależności; nie zatwierdza to ani nie zmienia zapisanego wniosku.',
    savedPlanArchive: 'Zapisany plan i kontekst zasad (widok historyczny)',
    recordedApproval: 'Zapisana akceptacja planu', reassess: 'Sprawdź aktualne zależności',
    unknownSeverity: 'Nieokreślona istotność',
    severityWarning: 'Część ostrzeżeń ma nieokreśloną istotność. Brak krytycznych/poważnych wyników nie oznacza, że są nieszkodliwe. Przed naprawą sprawdź dane źródłowe.',
    unavailable: 'Niedostępne',
    monitorSeverityNotice: 'Liczby krytycznych/poważnych wyników pomijają nieokreślone ostrzeżenia. Uruchom nowy skan, aby zobaczyć pełny podział.',
  },
  ru: {
    brandDisplayNotice: "Название продукта отображается как iTMounts. Сохранённые записи и история одобрений не изменены.",
    savedPlanNotice: 'Сохранённый план зависимостей. Названия продукта в этом представлении отображаются как iTMounts; сохранённая исходная запись и история одобрений не изменены. Перед новой работой повторно проверьте зависимости; это не одобряет и не изменяет сохранённый запрос.',
    savedPlanArchive: 'Сохранённый план и контекст правил (историческое представление)',
    recordedApproval: 'Записанное одобрение плана', reassess: 'Проверить текущие зависимости',
    unknownSeverity: 'Тяжесть не определена',
    severityWarning: 'Тяжесть некоторых предупреждений не определена. Нулевые критические/высокие значения не означают отсутствие риска. Перед исправлением проверьте исходные данные.',
    unavailable: 'Недоступно',
    monitorSeverityNotice: 'Критические/высокие значения не включают неклассифицированные предупреждения. Выполните новый анализ для полного распределения.',
  },
  de: {
    brandDisplayNotice: "Produktnamen werden als iTMounts angezeigt. Gespeicherte Datensätze und der Genehmigungsverlauf bleiben unverändert.",
    savedPlanNotice: 'Gespeicherter Abhängigkeitsplan. Produktnamen werden in dieser Ansicht als iTMounts angezeigt; der gespeicherte Quelldatensatz und der Genehmigungsverlauf bleiben unverändert. Bewerten Sie die aktuellen Abhängigkeiten neu, bevor Sie neue Arbeit vorbereiten; dies genehmigt oder ändert die gespeicherte Anfrage nicht.',
    savedPlanArchive: 'Gespeicherter Plan und Richtlinienkontext (historische Ansicht)',
    recordedApproval: 'Erfasste Plangenehmigung', reassess: 'Aktuelle Abhängigkeiten neu bewerten',
    unknownSeverity: 'Nicht klassifizierter Schweregrad',
    severityWarning: 'Einige Hinweise haben einen nicht klassifizierten Schweregrad. Null kritische/hohe Befunde bedeuten nicht, dass diese Befunde harmlos sind. Prüfen Sie die Quelldetails vor der Behebung.',
    unavailable: 'Nicht verfügbar',
    monitorSeverityNotice: 'Die Anzahl kritischer/hoher Befunde schließt nicht klassifizierte Befunde aus. Führen Sie einen neuen Scan aus, um die vollständige Aufschlüsselung nach Schweregrad zu sehen.',
  },
  fr: {
    brandDisplayNotice: "Les noms de produit s'affichent sous la forme iTMounts. Les enregistrements stockés et l'historique d'approbation restent inchangés.",
    savedPlanNotice: 'Plan de dépendances enregistré. Dans cette vue, les noms de produit s\'affichent sous la forme iTMounts ; l\'enregistrement source stocké et l\'historique d\'approbation restent inchangés. Réévaluez les dépendances actuelles avant de préparer de nouveaux travaux ; cela n\'approuve ni ne modifie la demande enregistrée.',
    savedPlanArchive: 'Plan et contexte de politique enregistrés (affichage historique)',
    recordedApproval: 'Approbation du plan enregistrée', reassess: 'Réévaluer les dépendances actuelles',
    unknownSeverity: 'Gravité non classée',
    severityWarning: 'Certains avis ont une gravité non classée. Zéro résultat critique/élevé ne signifie pas que ces résultats sont inoffensifs. Examinez les détails de la source avant la correction.',
    unavailable: 'Indisponible',
    monitorSeverityNotice: 'Les décomptes critiques/élevés excluent les résultats non classés. Lancez une nouvelle analyse pour voir la répartition complète par gravité.',
  },
  it: {
    brandDisplayNotice: "I nomi dei prodotti sono visualizzati come iTMounts. I record salvati e la cronologia delle approvazioni restano invariati.",
    savedPlanNotice: 'Piano delle dipendenze salvato. In questa vista i nomi dei prodotti sono visualizzati come iTMounts; il record sorgente salvato e la cronologia delle approvazioni restano invariati. Rivaluta le dipendenze attuali prima di preparare nuovo lavoro; questo non approva né modifica la richiesta salvata.',
    savedPlanArchive: 'Piano e contesto di policy salvati (vista storica)',
    recordedApproval: 'Approvazione del piano registrata', reassess: 'Rivaluta le dipendenze attuali',
    unknownSeverity: 'Gravità non classificata',
    severityWarning: 'Alcuni avvisi hanno una gravità non classificata. Zero rilevamenti critici/alti non significa che questi rilevamenti siano innocui. Esamina i dettagli della fonte prima della correzione.',
    unavailable: 'Non disponibile',
    monitorSeverityNotice: 'I conteggi critici/alti escludono i rilevamenti non classificati. Esegui una nuova scansione per vedere la ripartizione completa per gravità.',
  },
  ja: {
    brandDisplayNotice: "製品名は iTMounts として表示されます。保存済みのレコードと承認履歴は変更されません。",
    savedPlanNotice: '保存済みの依存関係プランです。このビューでは製品名が iTMounts として表示されます。保存されたソースレコードと承認履歴は変更されません。新しい作業を準備する前に現在の依存関係を再評価してください。これは保存済みのリクエストを承認または変更するものではありません。',
    savedPlanArchive: '保存済みのプランとポリシーのコンテキスト（履歴表示）',
    recordedApproval: '記録済みのプラン承認', reassess: '現在の依存関係を再評価',
    unknownSeverity: '未分類の重大度',
    severityWarning: '一部のアドバイザリは重大度が未分類です。重大/高の件数がゼロでも、これらの検出結果が無害であるとは限りません。修正の前にソースの詳細を確認してください。',
    unavailable: '利用不可',
    monitorSeverityNotice: '重大/高の件数には未分類の検出結果は含まれません。重大度の完全な内訳を確認するには、新しいスキャンを実行してください。',
  },
  ko: {
    brandDisplayNotice: "제품 이름은 iTMounts로 표시됩니다. 저장된 레코드와 승인 기록은 변경되지 않습니다.",
    savedPlanNotice: '저장된 종속성 계획입니다. 이 보기에서 제품 이름은 iTMounts로 표시되며, 저장된 소스 레코드와 승인 기록은 변경되지 않습니다. 새 작업을 준비하기 전에 현재 종속성을 다시 평가하세요. 이 작업은 저장된 요청을 승인하거나 변경하지 않습니다.',
    savedPlanArchive: '저장된 계획 및 정책 컨텍스트(기록 보기)',
    recordedApproval: '기록된 계획 승인', reassess: '현재 종속성 재평가',
    unknownSeverity: '분류되지 않은 심각도',
    severityWarning: '일부 권고의 심각도가 분류되지 않았습니다. 심각/높음 건수가 0이라고 해서 이 발견 사항이 무해하다는 의미는 아닙니다. 조치하기 전에 소스 세부 정보를 검토하세요.',
    unavailable: '사용 불가',
    monitorSeverityNotice: '심각/높음 건수에는 분류되지 않은 발견 사항이 포함되지 않습니다. 전체 심각도 분류를 보려면 새 스캔을 실행하세요.',
  },
  ar: {
    brandDisplayNotice: "تُعرض أسماء المنتجات باسم iTMounts. تبقى السجلات المحفوظة وسجل الموافقات دون تغيير.",
    savedPlanNotice: 'خطة تبعيات محفوظة. تُعرض أسماء المنتجات في هذا العرض باسم iTMounts؛ ويبقى السجل المصدر المحفوظ وسجل الموافقات دون تغيير. أعد تقييم التبعيات الحالية قبل إعداد عمل جديد؛ فهذا لا يوافق على الطلب المحفوظ ولا يغيّره.',
    savedPlanArchive: 'الخطة وسياق السياسة المحفوظان (عرض تاريخي)',
    recordedApproval: 'موافقة الخطة المسجّلة', reassess: 'إعادة تقييم التبعيات الحالية',
    unknownSeverity: 'خطورة غير مصنّفة',
    severityWarning: 'بعض التنبيهات ذات خطورة غير مصنّفة. لا يعني عدم وجود نتائج حرجة/عالية أن هذه النتائج غير ضارة. راجع تفاصيل المصدر قبل المعالجة.',
    unavailable: 'غير متاح',
    monitorSeverityNotice: 'تستثني أعداد النتائج الحرجة/العالية النتائج غير المصنّفة. شغّل فحصًا جديدًا لعرض التوزيع الكامل حسب الخطورة.',
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
  const match = target.length <= 4096 && target.match(/^https:\/\/github\.com\/(.+)$/i)
  if (!match) return null
  const parts = match[1].replace(/\/$/, '').split('/')
  if (parts.some(part => !/^[A-Za-z0-9_.@+-]+$/.test(part) || part === '.' || part === '..')) return null
  const repo = parts.slice(0, 2).join('/').replace(/\.git$/, '')
  if (repo.toLowerCase() !== row.repo.toLowerCase()) return null
  if (parts.length !== 2 && (parts.length < 4 || !['tree', 'blob'].includes(parts[2]))) return null
  return `https://github.com/${parts.join('/')}`
}

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
  'signalboost-a2a-agent-registry-v1', 'signalboost-a2a-availability-v1',
  'signalboost-a2a-buyer-manifest-v1', 'signalboost-a2a-buyer-onboarding-v1',
  'signalboost-a2a-client-v1', 'signalboost-a2a-delegation-runtime-v1',
  'signalboost-a2a-host-activation-v1', 'signalboost-a2a-http-jsonrpc-v1',
  'signalboost-a2a-live-acceptance-v1', 'signalboost-a2a-runtime-observation-v1',
  'signalboost-a2a-runtime-observation-v2',
  'signalboost-android-build-evidence-manifest-v1', 'signalboost-android-build-evidence-v1',
  'signalboost-android-build-plan-v1', 'signalboost-android-buyer-handoff-manifest-v1',
  'signalboost-android-packaging-evidence-chain-v1', 'signalboost-android-packaging-v1',
  'signalboost-android-play-console-release-evidence-v1', 'signalboost-android-production-publication-evidence-v1',
  'signalboost-android-publication-evidence-v1', 'signalboost-android-publication-readiness-v1',
  'signalboost-android-scaffold-review-bundle-v1', 'signalboost-android-scaffold-v1',
  'signalboost-android-signed-bundle-evidence-v1', 'signalboost-brand-overlay-v4',
  'signalboost-cos-a2a-runtime-host-v1', 'signalboost-cos-specialist-orchestrator-v1',
  'signalboost-cos-specialist-planner-v1', 'signalboost-google-play-readiness-v1',
  'signalboost-host-adapter-factory', 'signalboost-internal', 'signalboost-platform-health',
  'signalboost-portable-a2a-host-v1', 'signalboost-provider-config-adapter',
  'signalboost-provider-hub', 'signalboost-provider-hub-',
  'signalboost-provider-hub-build-readiness-v1', 'signalboost-provider-hub-dependency-review-v1',
  'signalboost-provider-hub-host-factory-v1', 'signalboost-provider-hub-runtime-assembly-v1',
  'signalboost-provider-hub-runtime-registry-v1', 'signalboost-provider-hub-unsigned-build-evidence-bundle-v1',
  'signalboost-provider-hub-unsigned-build-provenance-v1', 'signalboost-provider-hub-v1',
  'signalboost-readonly-host-ports', 'signalboost-readonly-host-ports-v1',
  'signalboost-reference-cos-a2a-host-v1', 'signalboost-reference-https-jsonrpc',
  'signalboost-reference-self-healing-diagnostic', 'signalboost-runtime-assembly',
  'signalboost-self-healing-native-probe', 'signalboost-self-healing-website-optimizer',
  'signalboost-staging-live-data-read-host-v1', 'signalboost-supervisor',
  'signalboost-supervisor-connectors', 'signalboost-v1', 'signalboost-vercel',
])
const LEGACY_TECHNICAL_PREFIXES = [
  'signalboost-live-', 'signalboost-api-', 'signalboost-worker-',
  'signalboost-console-', 'signalboost-vault-rotated-', 'signalboost-banner-upgrade-',
  'signalboost-base-video-', 'signalboost-creative-', 'signalboost-deck-',
  'signalboost-fast-final-', 'signalboost-self-healing-supervisor-',
  'signalboost-video-', 'signalboost-voice-', 'signalboost-provider-hub-',
]

function bareSignalBoostIsTechnicalContext(source: string, offset: number, tokenLength: number): boolean {
  const before = source.slice(Math.max(0, offset - 96), offset)
  const after = source.slice(offset + tokenLength, offset + tokenLength + 96)
  const technicalKey = /(?:\bhost\s*id|\bhostId|\bprovider(?:[_\s-]+host)?(?:[_\s-]+id)?)["']?\s*[:=]\s*["']?$/i.test(before)
  if (!technicalKey) return false
  if (/^["']/.test(after)) return true
  return /^(?:\s*$|\s*[,;.!?)}\]\r\n]|\s+[A-Za-z_][A-Za-z0-9_.-]*\s*[:=])/.test(after)
}

/** Display product prose only; never pass the result to persistence or authorization. */
export function cyberProductText(value: string | null | undefined): string {
  if (!value) return ''
  const code = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/
  const url = /(?:[a-z][a-z0-9+.-]*:|git@)[^\s<>"`]+/
  const email = /(?:mailto:)?(?:"(?:[^"\\\r\n]|\\.)*"|[\p{L}\p{N}\p{M}!#$%&'*+\/=?^_`{|}~.-]+)@(?:\[[^\]\r\n]+\]|[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?)*)/u
  const protectedTokens = new RegExp(`${code.source}|${url.source}|${email.source}`, 'giu')
  const prose = (text: string) => text.replace(
    /(?<![\p{L}\p{N}_./\\@-])(SignalBoost(?:Ai|\s+AI)?)(-[\p{L}][\p{L}\p{N}-]*)?(?![\p{L}\p{N}_/\\@-]|\.[\p{L}\p{N}])/giu,
    (token: string, brand: string, suffix: string | undefined, offset: number, source: string) => {
      const identity = token.toLowerCase()
      if (LEGACY_TECHNICAL_IDENTIFIERS.has(identity)
        || LEGACY_TECHNICAL_PREFIXES.some(prefix => identity.startsWith(prefix))
        || (identity === 'signalboost' && bareSignalBoostIsTechnicalContext(source, offset, token.length))) return token
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