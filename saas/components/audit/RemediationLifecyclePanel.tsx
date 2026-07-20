'use client'

// Read-only status for the autonomous audit remediation lifecycle. After the
// owner's single approval, SignalBoost AI prepares, validates, merges, verifies,
// and records the result. This component intentionally exposes no GitHub link or
// additional human action.

export type RemediationLifecycleState = {
  lifecycleStatus?: 'preparing' | 'checks_pending' | 'auto_merge_queued' | 'partial' | 'merged' | 'failed' | string
  merged?: boolean
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
  fixed: string
  approved: string
  skipped: string
  pipelineLabel: string
  stepApproval: string
  stepPrepare: string
  stepChecks: string
  stepMerge: string
  stepVerified: string
}

const COPY: Record<string, Copy> = {
  en: {
    preparing: 'SignalBoost AI is preparing the approved fixes', checksPending: 'SignalBoost AI is validating the fixes', autoMergeQueued: 'Automatic merge is queued', partial: 'Safe fixes completed with exceptions', merged: 'Approved fixes completed', failed: 'Automated remediation needs attention',
    detailPreparing: 'No further action is required. The AI is creating the protected remediation branch and internal pull request.', detailChecks: 'The AI is waiting for every protected repository check to pass.', detailQueued: 'The AI will merge automatically after every protected requirement passes.', detailPartial: 'The AI completed every supported safe fix. Unsupported findings remain visible and were not forced.', detailMerged: 'The AI merged the verified changes to main and marked findings fixed only after GitHub confirmed the merge.', detailFailed: 'Your approval remains recorded. The recovery worker retries temporary failures automatically; permanent errors remain visible.',
    fixed: 'fixed', approved: 'approved', skipped: 'skipped', pipelineLabel: 'Autonomous audit remediation pipeline',
    stepApproval: 'Approval recorded', stepPrepare: 'AI prepares fixes', stepChecks: 'AI validates', stepMerge: 'AI merges', stepVerified: 'AI verifies',
  },
  es: {
    preparing: 'SignalBoost AI está preparando las correcciones aprobadas', checksPending: 'SignalBoost AI está validando las correcciones', autoMergeQueued: 'La fusión automática está en cola', partial: 'Correcciones seguras completadas con excepciones', merged: 'Correcciones aprobadas completadas', failed: 'La corrección automática necesita atención',
    detailPreparing: 'No se requiere ninguna otra acción. La IA está creando la rama protegida y la solicitud interna de cambios.', detailChecks: 'La IA espera que se aprueben todas las verificaciones protegidas del repositorio.', detailQueued: 'La IA fusionará automáticamente después de que se cumplan todos los requisitos protegidos.', detailPartial: 'La IA completó todas las correcciones seguras compatibles. Los hallazgos no compatibles siguen visibles y no se forzaron.', detailMerged: 'La IA fusionó los cambios verificados en main y marcó los hallazgos como corregidos solo después de la confirmación de GitHub.', detailFailed: 'Tu aprobación sigue registrada. El proceso de recuperación reintenta automáticamente los fallos temporales; los errores permanentes siguen visibles.',
    fixed: 'corregidos', approved: 'aprobados', skipped: 'omitidos', pipelineLabel: 'Flujo autónomo de corrección de auditoría',
    stepApproval: 'Aprobación registrada', stepPrepare: 'La IA prepara', stepChecks: 'La IA valida', stepMerge: 'La IA fusiona', stepVerified: 'La IA verifica',
  },
  pt: {
    preparing: 'A SignalBoost AI está preparando as correções aprovadas', checksPending: 'A SignalBoost AI está validando as correções', autoMergeQueued: 'A fusão automática está na fila', partial: 'Correções seguras concluídas com exceções', merged: 'Correções aprovadas concluídas', failed: 'A correção automática precisa de atenção',
    detailPreparing: 'Nenhuma outra ação é necessária. A IA está criando a ramificação protegida e o pull request interno.', detailChecks: 'A IA está aguardando todas as verificações protegidas do repositório passarem.', detailQueued: 'A IA fará a fusão automaticamente depois que todos os requisitos protegidos forem aprovados.', detailPartial: 'A IA concluiu todas as correções seguras compatíveis. Os achados incompatíveis permanecem visíveis e não foram forçados.', detailMerged: 'A IA mesclou as mudanças verificadas na main e marcou os achados como corrigidos somente após a confirmação do GitHub.', detailFailed: 'Sua aprovação continua registrada. O processo de recuperação repete automaticamente falhas temporárias; erros permanentes permanecem visíveis.',
    fixed: 'corrigidos', approved: 'aprovados', skipped: 'ignorados', pipelineLabel: 'Fluxo autônomo de correção da auditoria',
    stepApproval: 'Aprovação registrada', stepPrepare: 'A IA prepara', stepChecks: 'A IA valida', stepMerge: 'A IA mescla', stepVerified: 'A IA verifica',
  },
  pl: {
    preparing: 'SignalBoost AI przygotowuje zatwierdzone poprawki', checksPending: 'SignalBoost AI sprawdza poprawki', autoMergeQueued: 'Automatyczne scalanie oczekuje', partial: 'Bezpieczne poprawki ukończono z wyjątkami', merged: 'Zatwierdzone poprawki ukończono', failed: 'Automatyczna naprawa wymaga uwagi',
    detailPreparing: 'Nie jest wymagane żadne dalsze działanie. AI tworzy chronioną gałąź naprawczą i wewnętrzny pull request.', detailChecks: 'AI czeka na przejście wszystkich chronionych kontroli repozytorium.', detailQueued: 'AI scali zmiany automatycznie po spełnieniu wszystkich chronionych wymagań.', detailPartial: 'AI ukończyła wszystkie obsługiwane bezpieczne poprawki. Nieobsługiwane wyniki pozostają widoczne i nie zostały wymuszone.', detailMerged: 'AI scaliła zweryfikowane zmiany do main i oznaczyła wyniki jako naprawione dopiero po potwierdzeniu GitHub.', detailFailed: 'Twoja zgoda pozostaje zapisana. Proces odzyskiwania automatycznie ponawia błędy przejściowe; błędy trwałe pozostają widoczne.',
    fixed: 'naprawiono', approved: 'zatwierdzono', skipped: 'pominięto', pipelineLabel: 'Autonomiczny proces naprawczy audytu',
    stepApproval: 'Zapisano zgodę', stepPrepare: 'AI przygotowuje', stepChecks: 'AI sprawdza', stepMerge: 'AI scala', stepVerified: 'AI weryfikuje',
  },
  ru: {
    preparing: 'SignalBoost AI подготавливает одобренные исправления', checksPending: 'SignalBoost AI проверяет исправления', autoMergeQueued: 'Автоматическое слияние поставлено в очередь', partial: 'Безопасные исправления завершены с исключениями', merged: 'Одобренные исправления завершены', failed: 'Автоматическое исправление требует внимания',
    detailPreparing: 'Дополнительные действия не требуются. ИИ создаёт защищённую ветку исправлений и внутренний pull request.', detailChecks: 'ИИ ожидает успешного прохождения всех защищённых проверок репозитория.', detailQueued: 'ИИ выполнит слияние автоматически после прохождения всех защищённых требований.', detailPartial: 'ИИ завершил все поддерживаемые безопасные исправления. Неподдерживаемые находки остаются видимыми и не применяются принудительно.', detailMerged: 'ИИ объединил проверенные изменения с main и отметил находки исправленными только после подтверждения GitHub.', detailFailed: 'Ваше одобрение сохранено. Процесс восстановления автоматически повторяет временные сбои; постоянные ошибки остаются видимыми.',
    fixed: 'исправлено', approved: 'одобрено', skipped: 'пропущено', pipelineLabel: 'Автономный процесс исправления аудита',
    stepApproval: 'Одобрение записано', stepPrepare: 'ИИ готовит', stepChecks: 'ИИ проверяет', stepMerge: 'ИИ объединяет', stepVerified: 'ИИ подтверждает',
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

function activeStage(status: string, state: RemediationLifecycleState): number {
  if (status === 'merged' || state.merged) return 4
  if (status === 'auto_merge_queued') return 3
  if (status === 'checks_pending' || status === 'partial') return 2
  return 1
}

function stageTone(index: number, current: number, status: string): 'done' | 'active' | 'warning' | 'failed' | 'pending' {
  if (status === 'merged' || index < current) return 'done'
  if (index > current) return 'pending'
  if (status === 'failed') return 'failed'
  if (status === 'partial') return 'warning'
  return 'active'
}

function circleClass(tone: ReturnType<typeof stageTone>): string {
  if (tone === 'done') return 'border-[#34d399] bg-[#34d399] text-bg'
  if (tone === 'failed') return 'border-danger bg-danger text-bg'
  if (tone === 'warning') return 'border-accent bg-accent text-bg'
  if (tone === 'active') return 'border-[#1af0ff] bg-bg text-[#67e8f9] ring-2 ring-[#1af0ff]/20'
  return 'border-border bg-bg text-text-muted/60'
}

function connectorClass(done: boolean): string {
  return done ? 'bg-[#34d399]/70' : 'bg-border'
}

export default function RemediationLifecyclePanel({ state, lang, findingsApproved }: {
  state: RemediationLifecycleState | null
  lang: string
  findingsApproved: number
}) {
  if (!state) return null
  const copy = COPY[lang] || COPY.en
  const status = String(state.lifecycleStatus || (state.merged ? 'merged' : 'preparing'))
  const visual = stateCopy(copy, status)
  const current = activeStage(status, state)
  const fixed = status === 'merged' ? Number(state.findingsApplied || 0) : 0
  const skipped = (state.skipped || []).reduce((sum, item) => sum + Math.max(0, Number(item.findingCount || 0)), 0)
  const stages = [copy.stepApproval, copy.stepPrepare, copy.stepChecks, copy.stepMerge, copy.stepVerified]

  return (
    <div className={`mt-3 rounded-md border bg-bg p-3 ${visual.tone}`} aria-live="polite">
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

      <ol className="mt-4 grid gap-3 sm:grid-cols-5" aria-label={copy.pipelineLabel}>
        {stages.map((label, index) => {
          const tone = stageTone(index, current, status)
          const done = tone === 'done'
          return (
            <li key={label} className="min-w-0">
              <div className="flex items-center">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${circleClass(tone)}`}>
                  {done ? '✓' : index + 1}
                </span>
                {index < stages.length - 1 && <span className={`mx-2 hidden h-px flex-1 sm:block ${connectorClass(index < current || status === 'merged')}`} />}
              </div>
              <div className={`mt-1.5 text-[10.5px] font-semibold leading-snug ${tone === 'pending' ? 'text-text-muted/60' : tone === 'failed' ? 'text-danger' : tone === 'warning' ? 'text-accent' : 'text-text'}`}>
                {label}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
