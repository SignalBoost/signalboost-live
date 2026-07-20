'use client'

export type RemediationLifecycleState = {
  lifecycleStatus?: 'preparing' | 'checks_pending' | 'auto_merge_queued' | 'partial' | 'merged' | 'failed' | string
  merged?: boolean
  prUrl?: string
  prNumber?: number
  findingsTotal?: number
  findingsApplied?: number
  findingsAlreadyResolved?: number
  filesChanged?: number
  localizationFilesChanged?: number
  skipped?: Array<{ file?: string; findingCount?: number; reason?: string }>
  autoMergeError?: string
}

type Copy = {
  preparing: string
  checksPending: string
  autoMergeQueued: string
  partial: string
  merged: string
  failed: string
  detailPreparing: string
  detailChecks: string
  detailQueued: string
  detailPartial: string
  detailMerged: string
  detailFailed: string
  openPr: string
  fixed: string
  approved: string
  skipped: string
}

const COPY: Record<string, Copy> = {
  en: {
    preparing: 'Preparing approved fixes', checksPending: 'GitHub checks are running', autoMergeQueued: 'Merge queued after checks', partial: 'Safe fixes prepared with exceptions', merged: 'Approved fixes merged', failed: 'Automated remediation needs attention',
    detailPreparing: 'The system is creating the protected remediation branch and pull request.', detailChecks: 'The pull request exists. Required repository checks must pass before merge.', detailQueued: 'GitHub will merge the pull request automatically after every protected requirement passes.', detailPartial: 'Safe supported fixes were prepared. Unsupported findings remain visible and were not forced.', detailMerged: 'The code reached main. Findings were marked fixed only after GitHub confirmed the merge.', detailFailed: 'Approval remains recorded. The recovery worker will retry transient failures; permanent errors remain visible.',
    openPr: 'Open remediation PR', fixed: 'fixed', approved: 'approved', skipped: 'skipped',
  },
  es: {
    preparing: 'Preparando correcciones aprobadas', checksPending: 'Las verificaciones de GitHub están en curso', autoMergeQueued: 'Fusión en cola después de las verificaciones', partial: 'Correcciones seguras preparadas con excepciones', merged: 'Correcciones aprobadas fusionadas', failed: 'La corrección automática necesita atención',
    detailPreparing: 'El sistema está creando la rama protegida y la solicitud de incorporación de cambios.', detailChecks: 'La solicitud existe. Las verificaciones obligatorias deben aprobarse antes de fusionar.', detailQueued: 'GitHub fusionará automáticamente cuando se cumplan todos los requisitos protegidos.', detailPartial: 'Se prepararon las correcciones seguras compatibles. Los hallazgos no compatibles siguen visibles y no se forzaron.', detailMerged: 'El código llegó a main. Los hallazgos se marcaron como corregidos solo después de que GitHub confirmó la fusión.', detailFailed: 'La aprobación sigue registrada. El proceso de recuperación reintentará los fallos temporales; los errores permanentes siguen visibles.',
    openPr: 'Abrir PR de corrección', fixed: 'corregidos', approved: 'aprobados', skipped: 'omitidos',
  },
  pt: {
    preparing: 'Preparando correções aprovadas', checksPending: 'As verificações do GitHub estão em execução', autoMergeQueued: 'Fusão na fila após as verificações', partial: 'Correções seguras preparadas com exceções', merged: 'Correções aprovadas mescladas', failed: 'A correção automática precisa de atenção',
    detailPreparing: 'O sistema está criando a ramificação protegida e o pull request de correção.', detailChecks: 'O pull request existe. As verificações obrigatórias devem passar antes da fusão.', detailQueued: 'O GitHub fará a fusão automaticamente depois que todos os requisitos protegidos forem aprovados.', detailPartial: 'As correções seguras compatíveis foram preparadas. Os achados incompatíveis permanecem visíveis e não foram forçados.', detailMerged: 'O código chegou à main. Os achados só foram marcados como corrigidos depois que o GitHub confirmou a fusão.', detailFailed: 'A aprovação continua registrada. O processo de recuperação tentará novamente falhas temporárias; erros permanentes permanecem visíveis.',
    openPr: 'Abrir PR de correção', fixed: 'corrigidos', approved: 'aprovados', skipped: 'ignorados',
  },
  pl: {
    preparing: 'Przygotowywanie zatwierdzonych poprawek', checksPending: 'Trwają kontrole GitHub', autoMergeQueued: 'Scalanie oczekuje na zakończenie kontroli', partial: 'Bezpieczne poprawki przygotowane z wyjątkami', merged: 'Zatwierdzone poprawki scalono', failed: 'Automatyczna naprawa wymaga uwagi',
    detailPreparing: 'System tworzy chronioną gałąź naprawczą i pull request.', detailChecks: 'Pull request istnieje. Wymagane kontrole repozytorium muszą przejść przed scaleniem.', detailQueued: 'GitHub scali pull request automatycznie po spełnieniu wszystkich chronionych wymagań.', detailPartial: 'Obsługiwane bezpieczne poprawki zostały przygotowane. Nieobsługiwane wyniki pozostają widoczne i nie zostały wymuszone.', detailMerged: 'Kod trafił do main. Wyniki oznaczono jako naprawione dopiero po potwierdzeniu scalenia przez GitHub.', detailFailed: 'Zatwierdzenie pozostaje zapisane. Proces odzyskiwania ponowi błędy przejściowe; błędy trwałe pozostają widoczne.',
    openPr: 'Otwórz PR naprawczy', fixed: 'naprawiono', approved: 'zatwierdzono', skipped: 'pominięto',
  },
  ru: {
    preparing: 'Подготовка одобренных исправлений', checksPending: 'Выполняются проверки GitHub', autoMergeQueued: 'Слияние поставлено в очередь после проверок', partial: 'Безопасные исправления подготовлены с исключениями', merged: 'Одобренные исправления объединены', failed: 'Автоматическое исправление требует внимания',
    detailPreparing: 'Система создаёт защищённую ветку исправлений и pull request.', detailChecks: 'Pull request создан. Перед слиянием должны пройти обязательные проверки репозитория.', detailQueued: 'GitHub автоматически выполнит слияние после прохождения всех защищённых требований.', detailPartial: 'Поддерживаемые безопасные исправления подготовлены. Неподдерживаемые находки остаются видимыми и не применяются принудительно.', detailMerged: 'Код попал в main. Находки отмечены исправленными только после подтверждения слияния GitHub.', detailFailed: 'Одобрение сохранено. Процесс восстановления повторит временные сбои; постоянные ошибки остаются видимыми.',
    openPr: 'Открыть PR исправлений', fixed: 'исправлено', approved: 'одобрено', skipped: 'пропущено',
  },
}

function stateCopy(copy: Copy, status: string) {
  if (status === 'merged') return { title: copy.merged, detail: copy.detailMerged, tone: 'border-[#34d399]/40 text-[#86efac]' }
  if (status === 'failed') return { title: copy.failed, detail: copy.detailFailed, tone: 'border-danger/50 text-danger' }
  if (status === 'partial') return { title: copy.partial, detail: copy.detailPartial, tone: 'border-accent/50 text-accent' }
  if (status === 'auto_merge_queued') return { title: copy.autoMergeQueued, detail: copy.detailQueued, tone: 'border-[#1af0ff]/40 text-[#67e8f9]' }
  if (status === 'checks_pending') return { title: copy.checksPending, detail: copy.detailChecks, tone: 'border-[#1af0ff]/40 text-[#67e8f9]' }
  return { title: copy.preparing, detail: copy.detailPreparing, tone: 'border-accent/40 text-accent' }
}

export default function RemediationLifecyclePanel({ state, lang, findingsApproved }: {
  state: RemediationLifecycleState | null
  lang: string
  findingsApproved: number
}) {
  if (!state) return null
  const copy = COPY[lang] || COPY.en
  const status = state.merged ? 'merged' : String(state.lifecycleStatus || 'preparing')
  const visual = stateCopy(copy, status)
  const fixed = state.merged ? Number(state.findingsApplied || 0) : 0
  const skipped = (state.skipped || []).reduce((sum, item) => sum + Math.max(0, Number(item.findingCount || 0)), 0)

  return (
    <div className={`mt-3 rounded-md border bg-bg p-3 ${visual.tone}`} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`inline-block h-2 w-2 rounded-full ${status === 'merged' ? 'bg-[#34d399]' : status === 'failed' ? 'bg-danger' : 'animate-pulse bg-accent'}`} />
            {visual.title}
          </div>
          <p className="mt-1 max-w-[720px] text-[12px] leading-relaxed text-text-muted">{visual.detail}</p>
          <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10.5px] text-text-muted">
            <span>{findingsApproved} {copy.approved}</span>
            <span>{fixed} {copy.fixed}</span>
            {skipped > 0 && <span>{skipped} {copy.skipped}</span>}
          </div>
          {state.autoMergeError && status === 'failed' && (
            <p className="mt-2 max-w-[720px] text-[11px] leading-relaxed text-danger">{state.autoMergeError}</p>
          )}
        </div>
        {state.prUrl && (
          <a href={state.prUrl} target="_blank" rel="noreferrer" className="rounded-md border border-current px-3 py-2 text-xs font-semibold transition-fast hover:bg-surface">
            {copy.openPr}{state.prNumber ? ` #${state.prNumber}` : ''}
          </a>
        )}
      </div>
    </div>
  )
}
