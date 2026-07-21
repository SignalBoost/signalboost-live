'use client'

import { useEffect, useMemo, useState } from 'react'

export type CyberActivityStatus = 'running' | 'completed' | 'failed'

export type CyberActivityState = {
  operation: 'dependency_scan' | 'monitor' | 'fix_plan' | 'approval' | 'github_pr'
  status: CyberActivityStatus
  stage: string
  progress: number
  message?: string
  startedAt: string
  updatedAt: string
  stageChangedAt: string
  done?: number
  total?: number
  error?: string
}

type Copy = {
  title: string
  active: string
  delayed: string
  stale: string
  stalled: string
  completed: string
  failed: string
  lastActivity: string
  stageChanged: string
  elapsed: string
  progress: string
  stages: Record<string, string>
}

const COPY: Record<string, Copy> = {
  en: {
    title: 'Live cybersecurity activity', active: 'System activity detected', delayed: 'Activity update delayed', stale: 'No recent system activity', stalled: 'No forward progress — recovery may be required', completed: 'Operation completed', failed: 'Operation failed', lastActivity: 'Last activity', stageChanged: 'Stage changed', elapsed: 'Elapsed', progress: 'Progress',
    stages: { starting: 'Starting cybersecurity operation', repository: 'Connecting to GitHub', manifests: 'Reading package manifests', packages: 'Building dependency inventory', advisories: 'Checking vulnerability advisories', saving: 'Saving scan results', alerts: 'Updating alert inbox', complete: 'Completed', monitor: 'Saving repository monitor', plan: 'Preparing remediation plan', approval: 'Recording approval', github_pr: 'Preparing protected GitHub proposal', failed: 'Stopped' },
  },
  es: {
    title: 'Actividad de ciberseguridad en vivo', active: 'Actividad del sistema detectada', delayed: 'La actualización de actividad está retrasada', stale: 'No hay actividad reciente del sistema', stalled: 'No hay progreso — puede ser necesaria la recuperación', completed: 'Operación completada', failed: 'La operación falló', lastActivity: 'Última actividad', stageChanged: 'Cambio de etapa', elapsed: 'Transcurrido', progress: 'Progreso',
    stages: { starting: 'Iniciando operación de ciberseguridad', repository: 'Conectando con GitHub', manifests: 'Leyendo manifiestos de paquetes', packages: 'Creando inventario de dependencias', advisories: 'Consultando avisos de vulnerabilidad', saving: 'Guardando resultados', alerts: 'Actualizando alertas', complete: 'Completado', monitor: 'Guardando monitor del repositorio', plan: 'Preparando plan de remediación', approval: 'Registrando aprobación', github_pr: 'Preparando propuesta protegida en GitHub', failed: 'Detenido' },
  },
  pt: {
    title: 'Atividade de cibersegurança ao vivo', active: 'Atividade do sistema detectada', delayed: 'Atualização de atividade atrasada', stale: 'Nenhuma atividade recente do sistema', stalled: 'Sem progresso — a recuperação pode ser necessária', completed: 'Operação concluída', failed: 'A operação falhou', lastActivity: 'Última atividade', stageChanged: 'Mudança de etapa', elapsed: 'Decorrido', progress: 'Progresso',
    stages: { starting: 'Iniciando operação de cibersegurança', repository: 'Conectando ao GitHub', manifests: 'Lendo manifestos de pacotes', packages: 'Criando inventário de dependências', advisories: 'Consultando avisos de vulnerabilidade', saving: 'Salvando resultados', alerts: 'Atualizando alertas', complete: 'Concluído', monitor: 'Salvando monitor do repositório', plan: 'Preparando plano de correção', approval: 'Registrando aprovação', github_pr: 'Preparando proposta protegida no GitHub', failed: 'Interrompido' },
  },
  pl: {
    title: 'Aktywność cyberbezpieczeństwa na żywo', active: 'Wykryto aktywność systemu', delayed: 'Aktualizacja aktywności jest opóźniona', stale: 'Brak ostatniej aktywności systemu', stalled: 'Brak postępu — może być wymagane odzyskiwanie', completed: 'Operacja zakończona', failed: 'Operacja nie powiodła się', lastActivity: 'Ostatnia aktywność', stageChanged: 'Zmiana etapu', elapsed: 'Czas', progress: 'Postęp',
    stages: { starting: 'Uruchamianie operacji cyberbezpieczeństwa', repository: 'Łączenie z GitHub', manifests: 'Odczytywanie manifestów pakietów', packages: 'Tworzenie spisu zależności', advisories: 'Sprawdzanie ostrzeżeń o podatnościach', saving: 'Zapisywanie wyników', alerts: 'Aktualizowanie alertów', complete: 'Zakończono', monitor: 'Zapisywanie monitora repozytorium', plan: 'Przygotowywanie planu naprawczego', approval: 'Zapisywanie zgody', github_pr: 'Przygotowywanie chronionej propozycji GitHub', failed: 'Zatrzymano' },
  },
  ru: {
    title: 'Активность кибербезопасности в реальном времени', active: 'Обнаружена активность системы', delayed: 'Обновление активности задерживается', stale: 'Нет недавней активности системы', stalled: 'Нет прогресса — может потребоваться восстановление', completed: 'Операция завершена', failed: 'Операция завершилась ошибкой', lastActivity: 'Последняя активность', stageChanged: 'Смена этапа', elapsed: 'Прошло', progress: 'Прогресс',
    stages: { starting: 'Запуск операции кибербезопасности', repository: 'Подключение к GitHub', manifests: 'Чтение манифестов пакетов', packages: 'Формирование списка зависимостей', advisories: 'Проверка предупреждений об уязвимостях', saving: 'Сохранение результатов', alerts: 'Обновление предупреждений', complete: 'Завершено', monitor: 'Сохранение мониторинга репозитория', plan: 'Подготовка плана исправления', approval: 'Регистрация одобрения', github_pr: 'Подготовка защищённого предложения GitHub', failed: 'Остановлено' },
  },
}

function secondsSince(value: string | undefined, now: number): number | null {
  if (!value || !now) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor((now - parsed) / 1000))
}

function ageLabel(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export default function CyberActivityPanel({ activity, lang }: { activity: CyberActivityState | null; lang: string }) {
  const [now, setNow] = useState(0)

  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const copy = COPY[lang] || COPY.en
  const heartbeatAge = secondsSince(activity?.updatedAt, now)
  const stageAge = secondsSince(activity?.stageChangedAt, now)
  const elapsed = secondsSince(activity?.startedAt, now)

  const state = useMemo(() => {
    if (!activity) return null
    if (activity.status === 'completed') return { label: copy.completed, live: false, color: '#34d399' }
    if (activity.status === 'failed') return { label: copy.failed, live: false, color: '#fca5a5' }
    if (stageAge !== null && stageAge > 900) return { label: copy.stalled, live: false, color: '#fca5a5' }
    if (heartbeatAge !== null && heartbeatAge > 45) return { label: copy.stale, live: false, color: '#fca5a5' }
    if (heartbeatAge !== null && heartbeatAge > 25) return { label: copy.delayed, live: false, color: '#ffc300' }
    return { label: copy.active, live: true, color: '#1af0ff' }
  }, [activity, copy, heartbeatAge, stageAge])

  if (!activity || !state) return null

  const progress = Math.max(0, Math.min(100, Math.round(Number(activity.progress || 0))))
  const stageLabel = copy.stages[activity.stage] || activity.message || activity.stage
  const tone = activity.status === 'failed' || !state.live && progress < 100 ? 'border-danger/45' : activity.status === 'completed' ? 'border-emerald-400/40' : 'border-cyan-400/40'

  return (
    <section className={`mt-4 rounded-md border bg-surface p-4 ${tone}`} aria-live="polite">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: state.color, boxShadow: state.live ? `0 0 14px ${state.color}` : 'none' }} />
            {copy.title}
          </div>
          <p className="mt-1 text-[12px] text-text-muted">{state.label}</p>
        </div>
        <div className="text-right font-mono text-[11px] text-text-muted">
          <div>{copy.progress}: {progress}%</div>
          {typeof activity.done === 'number' && typeof activity.total === 'number' && activity.total > 0 ? <div>{activity.done}/{activity.total}</div> : null}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="font-semibold text-text">{stageLabel}</span>
        <span className="font-mono text-text-muted">{progress}%</span>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full border border-border bg-bg" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={stageLabel}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, background: state.color }} />
        {state.live ? <div className="sb-cyber-progress-flow absolute inset-y-0 w-32 opacity-70" /> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10.5px] text-text-muted">
        <span>{copy.lastActivity}: {ageLabel(heartbeatAge)}</span>
        <span>{copy.stageChanged}: {ageLabel(stageAge)}</span>
        <span>{copy.elapsed}: {ageLabel(elapsed)}</span>
      </div>

      {activity.error ? <p className="mt-2 text-[12px] leading-relaxed text-danger">{activity.error}</p> : null}

      <style>{`
        @keyframes sbCyberProgressFlow { 0% { transform: translateX(-140%); } 100% { transform: translateX(900%); } }
        .sb-cyber-progress-flow { background: linear-gradient(90deg, transparent, rgba(255,255,255,.88), transparent); animation: sbCyberProgressFlow 1.35s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .sb-cyber-progress-flow { animation: none; opacity: 0; } }
      `}</style>
    </section>
  )
}
