'use client'

import { useEffect, useState } from 'react'

// Truthful live status for the audit remediation lifecycle. The stage bar is
// determinate; the moving light appears only while the dashboard is receiving
// fresh server heartbeats. A stale heartbeat stops the animation and says so.

export type RemediationLifecycleState = {
  lifecycleStatus?: 'preparing' | 'checks_pending' | 'checks_failed' | 'repairing' | 'auto_merge_queued' | 'partial' | 'merged' | 'failed' | string
  merged?: boolean
  findingsTotal?: number
  findingsApplied?: number
  findingsAlreadyResolved?: number
  filesChanged?: number
  localizationFilesChanged?: number
  skipped?: Array<{ file?: string; findingCount?: number; reason?: string }>
  autoMergeError?: string
  activityCheckedAt?: string
  lifecycleUpdatedAt?: string
  checkState?: 'unknown' | 'pending' | 'failed' | 'success'
  failedChecks?: string[]
  pendingChecks?: string[]
  repairMessage?: string
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
  workerActive: string
  checksMonitored: string
  mergeMonitored: string
  checkingActivity: string
  heartbeatDelayed: string
  heartbeatStale: string
  checksFailedActivity: string
  repairingActivity: string
  stalledActivity: string
  failedChecksLabel: string
  activityComplete: string
  activityStopped: string
  lastChecked: string
  lastChanged: string
  stage: string
  of: string
}

const COPY: Record<string, Copy> = {
  en: {
    preparing: 'SignalBoost AI is preparing the approved fixes', checksPending: 'SignalBoost AI is validating the fixes', autoMergeQueued: 'Automatic merge is queued', partial: 'Safe fixes completed with exceptions', merged: 'Approved fixes completed', failed: 'Automated remediation needs attention',
    detailPreparing: 'The AI is creating the protected remediation branch and internal pull request.', detailChecks: 'The AI is waiting for every protected repository check to pass.', detailQueued: 'The AI will merge automatically after every protected requirement passes.', detailPartial: 'The AI completed every supported safe fix. Unsupported findings remain visible and were not forced.', detailMerged: 'The AI merged the verified changes to main and marked findings fixed only after GitHub confirmed the merge.', detailFailed: 'The recovery worker retries temporary failures automatically; permanent errors remain visible.',
    fixed: 'fixed', approved: 'approved', skipped: 'skipped', pipelineLabel: 'Audit remediation progress',
    stepApproval: 'Approval recorded', stepPrepare: 'AI prepares fixes', stepChecks: 'AI validates', stepMerge: 'AI merges', stepVerified: 'AI verifies',
    workerActive: 'AI worker active', checksMonitored: 'Live monitor: waiting for GitHub checks', mergeMonitored: 'Live monitor: waiting for automatic merge', checkingActivity: 'Checking system activity', heartbeatDelayed: 'Activity update delayed', heartbeatStale: 'No recent system heartbeat', checksFailedActivity: 'GitHub checks failed — AI repair required', repairingActivity: 'AI is repairing the remediation branch', stalledActivity: 'No forward progress — recovery required', failedChecksLabel: 'Failed checks', activityComplete: 'Workflow completed', activityStopped: 'Workflow stopped', lastChecked: 'Last checked', lastChanged: 'Stage changed', stage: 'Stage', of: 'of',
  },
  es: {
    preparing: 'SignalBoost AI está preparando las correcciones aprobadas', checksPending: 'SignalBoost AI está validando las correcciones', autoMergeQueued: 'La fusión automática está en cola', partial: 'Correcciones seguras completadas con excepciones', merged: 'Correcciones aprobadas completadas', failed: 'La corrección automática necesita atención',
    detailPreparing: 'La IA está creando la rama protegida y la solicitud interna de cambios.', detailChecks: 'La IA espera que se aprueben todas las verificaciones protegidas del repositorio.', detailQueued: 'La IA fusionará automáticamente después de que se cumplan todos los requisitos protegidos.', detailPartial: 'La IA completó todas las correcciones seguras compatibles. Los hallazgos no compatibles siguen visibles y no se forzaron.', detailMerged: 'La IA fusionó los cambios verificados en main y marcó los hallazgos como corregidos solo después de la confirmación de GitHub.', detailFailed: 'El proceso de recuperación reintenta automáticamente los fallos temporales; los errores permanentes siguen visibles.',
    fixed: 'corregidos', approved: 'aprobados', skipped: 'omitidos', pipelineLabel: 'Progreso de corrección de auditoría',
    stepApproval: 'Aprobación registrada', stepPrepare: 'La IA prepara', stepChecks: 'La IA valida', stepMerge: 'La IA fusiona', stepVerified: 'La IA verifica',
    workerActive: 'Proceso de IA activo', checksMonitored: 'Monitor activo: esperando verificaciones de GitHub', mergeMonitored: 'Monitor activo: esperando la fusión automática', checkingActivity: 'Comprobando la actividad del sistema', heartbeatDelayed: 'Actualización de actividad retrasada', heartbeatStale: 'Sin señal reciente del sistema', checksFailedActivity: 'Fallaron las verificaciones de GitHub — la IA debe reparar', repairingActivity: 'La IA está reparando la rama de corrección', stalledActivity: 'Sin progreso — se requiere recuperación', failedChecksLabel: 'Verificaciones fallidas', activityComplete: 'Flujo completado', activityStopped: 'Flujo detenido', lastChecked: 'Última comprobación', lastChanged: 'Cambio de etapa', stage: 'Etapa', of: 'de',
  },
  pt: {
    preparing: 'A SignalBoost AI está preparando as correções aprovadas', checksPending: 'A SignalBoost AI está validando as correções', autoMergeQueued: 'A fusão automática está na fila', partial: 'Correções seguras concluídas com exceções', merged: 'Correções aprovadas concluídas', failed: 'A correção automática precisa de atenção',
    detailPreparing: 'A IA está criando a ramificação protegida e o pull request interno.', detailChecks: 'A IA está aguardando todas as verificações protegidas do repositório passarem.', detailQueued: 'A IA fará a fusão automaticamente depois que todos os requisitos protegidos forem aprovados.', detailPartial: 'A IA concluiu todas as correções seguras compatíveis. Os achados incompatíveis permanecem visíveis e não foram forçados.', detailMerged: 'A IA mesclou as mudanças verificadas na main e marcou os achados como corrigidos somente após a confirmação do GitHub.', detailFailed: 'O processo de recuperação repete automaticamente falhas temporárias; erros permanentes permanecem visíveis.',
    fixed: 'corrigidos', approved: 'aprovados', skipped: 'ignorados', pipelineLabel: 'Progresso da correção da auditoria',
    stepApproval: 'Aprovação registrada', stepPrepare: 'A IA prepara', stepChecks: 'A IA valida', stepMerge: 'A IA mescla', stepVerified: 'A IA verifica',
    workerActive: 'Processo de IA ativo', checksMonitored: 'Monitor ativo: aguardando verificações do GitHub', mergeMonitored: 'Monitor ativo: aguardando a fusão automática', checkingActivity: 'Verificando a atividade do sistema', heartbeatDelayed: 'Atualização de atividade atrasada', heartbeatStale: 'Sem sinal recente do sistema', checksFailedActivity: 'As verificações do GitHub falharam — a IA precisa reparar', repairingActivity: 'A IA está reparando a ramificação de correção', stalledActivity: 'Sem progresso — recuperação necessária', failedChecksLabel: 'Verificações com falha', activityComplete: 'Fluxo concluído', activityStopped: 'Fluxo interrompido', lastChecked: 'Última verificação', lastChanged: 'Mudança de etapa', stage: 'Etapa', of: 'de',
  },
  pl: {
    preparing: 'SignalBoost AI przygotowuje zatwierdzone poprawki', checksPending: 'SignalBoost AI sprawdza poprawki', autoMergeQueued: 'Automatyczne scalanie oczekuje', partial: 'Bezpieczne poprawki ukończono z wyjątkami', merged: 'Zatwierdzone poprawki ukończono', failed: 'Automatyczna naprawa wymaga uwagi',
    detailPreparing: 'AI tworzy chronioną gałąź naprawczą i wewnętrzny pull request.', detailChecks: 'AI czeka na przejście wszystkich chronionych kontroli repozytorium.', detailQueued: 'AI scali zmiany automatycznie po spełnieniu wszystkich chronionych wymagań.', detailPartial: 'AI ukończyła wszystkie obsługiwane bezpieczne poprawki. Nieobsługiwane wyniki pozostają widoczne i nie zostały wymuszone.', detailMerged: 'AI scaliła zweryfikowane zmiany do main i oznaczyła wyniki jako naprawione dopiero po potwierdzeniu GitHub.', detailFailed: 'Proces odzyskiwania automatycznie ponawia błędy przejściowe; błędy trwałe pozostają widoczne.',
    fixed: 'naprawiono', approved: 'zatwierdzono', skipped: 'pominięto', pipelineLabel: 'Postęp naprawy audytu',
    stepApproval: 'Zapisano zgodę', stepPrepare: 'AI przygotowuje', stepChecks: 'AI sprawdza', stepMerge: 'AI scala', stepVerified: 'AI weryfikuje',
    workerActive: 'Proces AI jest aktywny', checksMonitored: 'Aktywny monitoring: oczekiwanie na kontrole GitHub', mergeMonitored: 'Aktywny monitoring: oczekiwanie na automatyczne scalenie', checkingActivity: 'Sprawdzanie aktywności systemu', heartbeatDelayed: 'Aktualizacja aktywności jest opóźniona', heartbeatStale: 'Brak ostatniego sygnału systemu', checksFailedActivity: 'Kontrole GitHub nie powiodły się — AI musi naprawić', repairingActivity: 'AI naprawia gałąź poprawek', stalledActivity: 'Brak postępu — wymagane odzyskiwanie', failedChecksLabel: 'Nieudane kontrole', activityComplete: 'Proces ukończony', activityStopped: 'Proces zatrzymany', lastChecked: 'Ostatnie sprawdzenie', lastChanged: 'Zmiana etapu', stage: 'Etap', of: 'z',
  },
  ru: {
    preparing: 'SignalBoost AI подготавливает одобренные исправления', checksPending: 'SignalBoost AI проверяет исправления', autoMergeQueued: 'Автоматическое слияние поставлено в очередь', partial: 'Безопасные исправления завершены с исключениями', merged: 'Одобренные исправления завершены', failed: 'Автоматическое исправление требует внимания',
    detailPreparing: 'ИИ создаёт защищённую ветку исправлений и внутренний pull request.', detailChecks: 'ИИ ожидает успешного прохождения всех защищённых проверок репозитория.', detailQueued: 'ИИ выполнит слияние автоматически после прохождения всех защищённых требований.', detailPartial: 'ИИ завершил все поддерживаемые безопасные исправления. Неподдерживаемые находки остаются видимыми и не применяются принудительно.', detailMerged: 'ИИ объединил проверенные изменения с main и отметил находки исправленными только после подтверждения GitHub.', detailFailed: 'Процесс восстановления автоматически повторяет временные сбои; постоянные ошибки остаются видимыми.',
    fixed: 'исправлено', approved: 'одобрено', skipped: 'пропущено', pipelineLabel: 'Ход исправления аудита',
    stepApproval: 'Одобрение записано', stepPrepare: 'ИИ готовит', stepChecks: 'ИИ проверяет', stepMerge: 'ИИ объединяет', stepVerified: 'ИИ подтверждает',
    workerActive: 'Процесс ИИ активен', checksMonitored: 'Активный мониторинг: ожидание проверок GitHub', mergeMonitored: 'Активный мониторинг: ожидание автоматического слияния', checkingActivity: 'Проверка активности системы', heartbeatDelayed: 'Обновление активности задерживается', heartbeatStale: 'Нет недавнего сигнала системы', checksFailedActivity: 'Проверки GitHub не пройдены — ИИ должен исправить', repairingActivity: 'ИИ исправляет ветку изменений', stalledActivity: 'Нет прогресса — требуется восстановление', failedChecksLabel: 'Неудачные проверки', activityComplete: 'Процесс завершён', activityStopped: 'Процесс остановлен', lastChecked: 'Последняя проверка', lastChanged: 'Изменение этапа', stage: 'Этап', of: 'из',
  },
}

function stateCopy(copy: Copy, status: string) {
  if (status === 'merged') return { title: copy.merged, detail: copy.detailMerged, tone: 'border-[#34d399]/40 text-[#86efac]' }
  if (status === 'failed' || status === 'checks_failed') return { title: copy.failed, detail: copy.detailFailed, tone: 'border-danger/50 text-danger' }
  if (status === 'repairing') return { title: copy.checksPending, detail: copy.detailChecks, tone: 'border-accent/50 text-accent' }
  if (status === 'partial') return { title: copy.partial, detail: copy.detailPartial, tone: 'border-accent/50 text-accent' }
  if (status === 'auto_merge_queued') return { title: copy.autoMergeQueued, detail: copy.detailQueued, tone: 'border-[#1af0ff]/40 text-[#67e8f9]' }
  if (status === 'checks_pending') return { title: copy.checksPending, detail: copy.detailChecks, tone: 'border-[#1af0ff]/40 text-[#67e8f9]' }
  return { title: copy.preparing, detail: copy.detailPreparing, tone: 'border-accent/40 text-accent' }
}

function activeStage(status: string, state: RemediationLifecycleState): number {
  if (status === 'merged' || state.merged) return 4
  if (status === 'auto_merge_queued') return 3
  if (status === 'checks_pending' || status === 'checks_failed' || status === 'repairing' || status === 'partial') return 2
  return 1
}

function stageProgress(status: string, state: RemediationLifecycleState): number {
  if (status === 'merged' || state.merged || status === 'partial') return 100
  if (status === 'failed' || status === 'checks_failed') return Math.max(20, activeStage(status, state) * 20)
  if (status === 'auto_merge_queued') return 75
  if (status === 'checks_pending') return 55
  return 30
}

function stageTone(index: number, current: number, status: string): 'done' | 'active' | 'warning' | 'failed' | 'pending' {
  if (status === 'merged' || index < current) return 'done'
  if (index > current) return 'pending'
  if (status === 'failed' || status === 'checks_failed') return 'failed'
  if (status === 'partial' || status === 'repairing') return 'warning'
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

function secondsSince(value: string | undefined, now: number): number | null {
  if (!value || now <= 0) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((now - timestamp) / 1000))
}

function ageLabel(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

function activityState(copy: Copy, status: string, heartbeatAge: number | null, changedAge: number | null) {
  if (status === 'merged' || status === 'partial') return { label: copy.activityComplete, color: '#34d399', live: false }
  if (status === 'failed') return { label: copy.activityStopped, color: '#fca5a5', live: false }
  if (status === 'checks_failed') return { label: copy.checksFailedActivity, color: '#fca5a5', live: false }
  if (changedAge !== null && changedAge > 900) return { label: copy.stalledActivity, color: '#fca5a5', live: false }
  if (status === 'repairing') return { label: copy.repairingActivity, color: '#ffc300', live: heartbeatAge !== null && heartbeatAge <= 25 }
  if (heartbeatAge === null) return { label: copy.checkingActivity, color: '#ffc300', live: false }
  if (heartbeatAge > 45) return { label: copy.heartbeatStale, color: '#fca5a5', live: false }
  if (heartbeatAge > 25) return { label: copy.heartbeatDelayed, color: '#ffc300', live: false }
  if (status === 'checks_pending') return { label: copy.checksMonitored, color: '#1af0ff', live: true }
  if (status === 'auto_merge_queued') return { label: copy.mergeMonitored, color: '#1af0ff', live: true }
  return { label: copy.workerActive, color: '#34d399', live: true }
}

export default function RemediationLifecyclePanel({ state, lang, findingsApproved }: {
  state: RemediationLifecycleState | null
  lang: string
  findingsApproved: number
}) {
  const [now, setNow] = useState(0)

  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (!state) return null
  const copy = COPY[lang] || COPY.en
  const status = String(state.lifecycleStatus || (state.merged ? 'merged' : 'preparing'))
  const visual = stateCopy(copy, status)
  const current = activeStage(status, state)
  const progress = stageProgress(status, state)
  const fixed = status === 'merged' ? Number(state.findingsApplied || 0) : 0
  const skipped = (state.skipped || []).reduce((sum, item) => sum + Math.max(0, Number(item.findingCount || 0)), 0)
  const stages = [copy.stepApproval, copy.stepPrepare, copy.stepChecks, copy.stepMerge, copy.stepVerified]
  const heartbeatAge = secondsSince(state.activityCheckedAt, now)
  const changedAge = secondsSince(state.lifecycleUpdatedAt, now)
  const activity = activityState(copy, status, heartbeatAge, changedAge)
  const progressColor = status === 'failed' || status === 'checks_failed' ? '#fca5a5' : status === 'partial' ? '#ffc300' : status === 'merged' ? '#34d399' : '#1af0ff'

  return (
    <div className={`mt-3 rounded-md border bg-bg p-3 ${visual.tone}`} aria-live="polite">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={`inline-block h-2 w-2 rounded-full ${status === 'merged' ? 'bg-[#34d399]' : status === 'failed' || status === 'checks_failed' ? 'bg-danger' : 'animate-pulse bg-accent'}`} />
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
        {state.autoMergeError && status === 'checks_failed' && (
          <p className="mt-2 max-w-[720px] text-[11px] leading-relaxed text-danger">{state.autoMergeError}</p>
        )}
        {state.repairMessage && status === 'repairing' && (
          <p className="mt-2 max-w-[720px] text-[11px] leading-relaxed text-accent">{state.repairMessage}</p>
        )}
        {Array.isArray(state.failedChecks) && state.failedChecks.length > 0 && (
          <p className="mt-2 max-w-[720px] text-[11px] leading-relaxed text-danger">{copy.failedChecksLabel}: {state.failedChecks.join(', ')}</p>
        )}
      </div>

      <section className="mt-4 rounded-md border border-border bg-surface/50 p-3" aria-label={copy.pipelineLabel}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 font-semibold" style={{ color: activity.color }}>
            <span className={`h-2 w-2 rounded-full ${activity.live ? 'sb-audit-heartbeat' : ''}`} style={{ background: activity.color }} />
            {activity.label}
          </div>
          <div className="font-mono text-text-muted">
            {copy.stage} {current + 1} {copy.of} 5 · {progress}%
          </div>
        </div>

        <div
          className="relative mt-2 h-2.5 overflow-hidden rounded-full border border-border bg-bg"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${copy.stage} ${current + 1} ${copy.of} 5`}
        >
          <div className="relative h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${progress}%`, background: progressColor }}>
            {activity.live && <span className="sb-audit-progress-flow absolute inset-0" aria-hidden />}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-text-muted">
          <span>{copy.lastChecked}: {ageLabel(heartbeatAge)}</span>
          <span>{copy.lastChanged}: {ageLabel(changedAge)}</span>
        </div>
      </section>

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

      <style>{`
        @keyframes sbAuditProgressFlow {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        @keyframes sbAuditHeartbeat {
          0%, 100% { transform: scale(1); opacity: .65; }
          50% { transform: scale(1.55); opacity: 1; }
        }
        .sb-audit-progress-flow {
          width: 34%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.8), transparent);
          animation: sbAuditProgressFlow 1.45s linear infinite;
        }
        .sb-audit-heartbeat {
          animation: sbAuditHeartbeat 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sb-audit-progress-flow, .sb-audit-heartbeat { animation: none; }
        }
      `}</style>
    </div>
  )
}
