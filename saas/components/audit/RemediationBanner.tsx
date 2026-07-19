'use client'

// saas/components/audit/RemediationBanner.tsx
// One final approval for a completed repository audit. The server groups every
// actionable finding by file, validates the generated edits, creates one branch
// and one pull request, then requests automatic merge after required checks.

import { useEffect, useState } from 'react'

export type AuditRemediationResult = {
  kind: 'audit_batch_remediation'
  ok: true
  approval: 'final'
  runId: string
  status: 'auto_merge_queued' | 'pr_ready'
  branch: string
  prUrl: string
  prNumber: number
  autoMergeQueued: boolean
  autoMergeError?: string
  filesChanged: number
  findingsApplied: number
  skipped: { file: string; findingCount: number; reason: string }[]
  approvedAt: string
}

type Copy = {
  question: string
  body: string
  approve: string
  decline: string
  running: string
  runningBody: string
  done: string
  queued: string
  prReady: string
  files: string
  findings: string
  skipped: string
  openPr: string
  retry: string
  error: string
  noRun: string
  viewPlans: string
}

const COPY: Record<string, Copy> = {
  en: {
    question: 'Approve SignalBoost AI to fix all {count} findings?',
    body: 'This is the only approval required. AI will group the findings by file, validate every change, create one branch and one pull request, and queue automatic merge after checks pass. No finding-by-finding approvals.',
    approve: 'Approve all fixes', decline: 'Not now',
    running: 'AI remediation is running…',
    runningBody: 'Generating, validating, and consolidating all approved fixes into one pull request. Keep this tab open while the batch is prepared.',
    done: 'Final approval recorded',
    queued: 'All accepted fixes are in one pull request and automatic merge is queued after repository checks pass.',
    prReady: 'All accepted fixes are in one pull request. Automatic merge was unavailable, so this single PR is the only remaining review point.',
    files: 'Files changed', findings: 'Findings applied', skipped: 'Skipped by safety checks',
    openPr: 'Open the single pull request', retry: 'Try again', error: 'Remediation failed',
    noRun: 'A completed audit run is required before fixes can be approved.', viewPlans: 'View plans',
  },
  es: {
    question: '¿Aprobar a SignalBoost AI para corregir los {count} hallazgos?',
    body: 'Esta es la única aprobación necesaria. La IA agrupará los hallazgos por archivo, validará cada cambio, creará una sola rama y un solo pull request, y programará la fusión automática cuando pasen las verificaciones. No habrá aprobaciones una por una.',
    approve: 'Aprobar todas las correcciones', decline: 'Ahora no',
    running: 'La remediación con IA está en curso…',
    runningBody: 'Generando, validando y consolidando todas las correcciones aprobadas en un solo pull request. Mantén esta pestaña abierta.',
    done: 'Aprobación final registrada',
    queued: 'Todas las correcciones aceptadas están en un solo pull request y la fusión automática quedó programada después de las verificaciones.',
    prReady: 'Todas las correcciones aceptadas están en un solo pull request. La fusión automática no estuvo disponible; este único PR es el único punto de revisión restante.',
    files: 'Archivos modificados', findings: 'Hallazgos aplicados', skipped: 'Omitidos por controles de seguridad',
    openPr: 'Abrir el único pull request', retry: 'Reintentar', error: 'Falló la remediación',
    noRun: 'Se necesita una auditoría completada antes de aprobar correcciones.', viewPlans: 'Ver planes',
  },
  pt: {
    question: 'Aprovar a SignalBoost AI para corrigir todas as {count} constatações?',
    body: 'Esta é a única aprovação necessária. A IA agrupará as constatações por arquivo, validará cada alteração, criará um único branch e um único pull request e solicitará merge automático após as verificações. Não haverá aprovações item por item.',
    approve: 'Aprovar todas as correções', decline: 'Agora não',
    running: 'A remediação por IA está em execução…',
    runningBody: 'Gerando, validando e consolidando todas as correções aprovadas em um único pull request. Mantenha esta aba aberta.',
    done: 'Aprovação final registrada',
    queued: 'Todas as correções aceitas estão em um único pull request e o merge automático foi programado após as verificações.',
    prReady: 'Todas as correções aceitas estão em um único pull request. O merge automático não estava disponível; este único PR é o único ponto de revisão restante.',
    files: 'Arquivos alterados', findings: 'Constatações aplicadas', skipped: 'Ignoradas pelas verificações de segurança',
    openPr: 'Abrir o único pull request', retry: 'Tentar novamente', error: 'Falha na remediação',
    noRun: 'É necessária uma auditoria concluída antes de aprovar correções.', viewPlans: 'Ver planos',
  },
  pl: {
    question: 'Zatwierdzić SignalBoost AI do naprawy wszystkich {count} ustaleń?',
    body: 'To jedyna wymagana zgoda. AI pogrupuje ustalenia według plików, zweryfikuje każdą zmianę, utworzy jedną gałąź i jeden pull request oraz włączy automatyczne scalenie po przejściu kontroli. Bez zatwierdzania każdego problemu osobno.',
    approve: 'Zatwierdź wszystkie poprawki', decline: 'Nie teraz',
    running: 'Trwa automatyczna naprawa…',
    runningBody: 'Generowanie, walidacja i łączenie wszystkich zatwierdzonych poprawek w jeden pull request. Pozostaw tę kartę otwartą.',
    done: 'Zapisano ostateczną zgodę',
    queued: 'Wszystkie zaakceptowane poprawki są w jednym pull requeście, a automatyczne scalenie czeka na przejście kontroli.',
    prReady: 'Wszystkie zaakceptowane poprawki są w jednym pull requeście. Automatyczne scalenie było niedostępne; ten jeden PR jest jedynym pozostałym punktem przeglądu.',
    files: 'Zmienione pliki', findings: 'Zastosowane ustalenia', skipped: 'Pominięte przez kontrole bezpieczeństwa',
    openPr: 'Otwórz jeden pull request', retry: 'Spróbuj ponownie', error: 'Naprawa nie powiodła się',
    noRun: 'Przed zatwierdzeniem poprawek wymagany jest zakończony audyt.', viewPlans: 'Zobacz plany',
  },
  ru: {
    question: 'Разрешить SignalBoost AI исправить все замечания: {count}?',
    body: 'Это единственное необходимое подтверждение. ИИ сгруппирует замечания по файлам, проверит каждое изменение, создаст одну ветку и один pull request и поставит автоматическое слияние в очередь после прохождения проверок. Отдельные подтверждения не нужны.',
    approve: 'Одобрить все исправления', decline: 'Не сейчас',
    running: 'ИИ выполняет исправления…',
    runningBody: 'Создание, проверка и объединение всех одобренных исправлений в один pull request. Не закрывайте вкладку.',
    done: 'Окончательное одобрение записано',
    queued: 'Все принятые исправления находятся в одном pull request; автоматическое слияние запланировано после прохождения проверок.',
    prReady: 'Все принятые исправления находятся в одном pull request. Автоматическое слияние недоступно; этот один PR — единственная оставшаяся точка проверки.',
    files: 'Изменено файлов', findings: 'Применено замечаний', skipped: 'Пропущено проверками безопасности',
    openPr: 'Открыть единый pull request', retry: 'Повторить', error: 'Исправление не выполнено',
    noRun: 'Для одобрения исправлений нужен завершённый аудит.', viewPlans: 'Посмотреть планы',
  },
}

export default function RemediationBanner({
  count,
  runId = null,
  lang = 'en',
  initialResult = null,
  onComplete,
}: {
  count: number
  runId?: string | null
  lang?: string
  targetId?: string
  initialResult?: AuditRemediationResult | null
  onComplete?: (result: AuditRemediationResult) => void
}) {
  const copy = COPY[lang] || COPY.en
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<AuditRemediationResult | null>(initialResult)
  const [resolvedRunId, setResolvedRunId] = useState<string | null>(runId)
  const [error, setError] = useState('')
  const [upgrade, setUpgrade] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setResolvedRunId(runId)
    setResult(initialResult)
    setPhase(initialResult ? 'done' : 'idle')
    setError('')
    setUpgrade(false)
    setDismissed(false)
  }, [initialResult, runId])

  async function resolveLatestRun(): Promise<string | null> {
    try {
      const response = await fetch('/api/hub/operator/audit/runs', { credentials: 'include', cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok || !Array.isArray(data.runs)) return null
      const candidates = data.runs.filter((entry: any) => entry?.status === 'complete')
      const matched = candidates.find((entry: any) => Number(entry?.findings_count || 0) === count) || candidates[0]
      return typeof matched?.id === 'string' ? matched.id : null
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (runId || initialResult || count <= 0) return
    let alive = true
    void (async () => {
      const id = await resolveLatestRun()
      if (!alive || !id) return
      setResolvedRunId(id)
      try {
        const detail = await fetch(`/api/hub/operator/audit/runs?runId=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' })
        const data = await detail.json().catch(() => null)
        if (alive && detail.ok && data?.remediation?.kind === 'audit_batch_remediation') {
          setResult(data.remediation as AuditRemediationResult)
          setPhase('done')
        }
      } catch {
        // Resolving persisted approval is best-effort; the approval button remains available.
      }
    })()
    return () => { alive = false }
    // count identifies the completed scan shown by the existing dashboard page.
  }, [count, initialResult, runId])

  async function approveAll() {
    const targetRunId = resolvedRunId || runId || await resolveLatestRun()
    if (!targetRunId) {
      setError(copy.noRun)
      setPhase('error')
      return
    }
    setResolvedRunId(targetRunId)
    setPhase('running')
    setError('')
    setUpgrade(false)
    try {
      const response = await fetch('/api/hub/operator/audit/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ runId: targetRunId }),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 402 && data?.code === 'patch_not_in_plan') {
        setUpgrade(true)
        setError(data?.error || copy.error)
        setPhase('error')
        return
      }
      if (!response.ok || !data?.ok) {
        setError(data?.error || copy.error)
        setPhase('error')
        return
      }
      const completed = data as AuditRemediationResult
      setResult(completed)
      setPhase('done')
      onComplete?.(completed)
    } catch {
      setError(copy.error)
      setPhase('error')
    }
  }

  if (count <= 0 || dismissed) return null

  if (phase === 'running') {
    return (
      <section id="audit-batch-remediation" className="mt-4 rounded-md border border-accent/40 bg-surface p-4 ring-1 ring-accent/15">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
          {copy.running}
        </div>
        <p className="mt-2 max-w-[820px] text-[12.5px] leading-relaxed text-text-muted">{copy.runningBody}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg">
          <div className="h-full w-1/3 rounded-full bg-accent" style={{ animation: 'auditBatch 1.15s ease-in-out infinite' }} />
        </div>
        <style>{`@keyframes auditBatch{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}`}</style>
      </section>
    )
  }

  if (phase === 'done' && result) {
    return (
      <section id="audit-batch-remediation" className="mt-4 rounded-md border border-[#34d399]/45 bg-surface p-4 ring-1 ring-[#34d399]/15">
        <div className="text-sm font-semibold text-[#86efac]">✓ {copy.done}</div>
        <p className="mt-1.5 max-w-[820px] text-[12.5px] leading-relaxed text-text-muted">
          {result.autoMergeQueued ? copy.queued : copy.prReady}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] text-text-muted">
          <span className="rounded-full border border-border bg-bg px-2.5 py-1">{copy.files}: <strong className="text-text">{result.filesChanged}</strong></span>
          <span className="rounded-full border border-border bg-bg px-2.5 py-1">{copy.findings}: <strong className="text-text">{result.findingsApplied}</strong></span>
          <span className="rounded-full border border-border bg-bg px-2.5 py-1">{copy.skipped}: <strong className="text-text">{result.skipped.length}</strong></span>
        </div>
        <div className="mt-3 break-all font-mono text-[11px] text-text-muted">{result.branch}</div>
        <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-md border border-[#34d399]/45 bg-bg px-3.5 py-2 text-[12.5px] font-semibold text-[#86efac] hover:bg-surface">
          {copy.openPr} ↗
        </a>
      </section>
    )
  }

  if (phase === 'error') {
    return (
      <section id="audit-batch-remediation" className="mt-4 rounded-md border border-danger bg-surface p-4">
        <div className="text-sm font-semibold text-danger">{copy.error}</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-danger">{error}</p>
        {upgrade ? (
          <a href="/dashboard/audit/pricing" className="mt-3 inline-flex rounded-md border border-accent bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-bg">{copy.viewPlans}</a>
        ) : (
          <button type="button" onClick={approveAll} className="mt-3 rounded-md border border-border bg-bg px-3.5 py-2 text-[12.5px] font-semibold text-text-muted hover:border-accent hover:text-text">{copy.retry}</button>
        )}
      </section>
    )
  }

  return (
    <section id="audit-batch-remediation" className="mt-4 overflow-hidden rounded-md border border-accent/40 bg-surface/50 p-4 ring-1 ring-accent/15 backdrop-blur-sm" style={{ borderLeft: '3px solid var(--sb-accent, #ffc300)' }}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <h3 className="text-sm font-semibold tracking-tight text-text">{copy.question.replace('{count}', String(count))}</h3>
          </div>
          <p className="mt-1.5 max-w-[820px] text-[12.5px] leading-relaxed text-text-muted">{copy.body}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-center">
          <button type="button" onClick={approveAll} className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {copy.approve}
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="inline-flex items-center justify-center rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold text-text-muted transition-fast hover:border-accent hover:text-text">
            {copy.decline}
          </button>
        </div>
      </div>
    </section>
  )
}
