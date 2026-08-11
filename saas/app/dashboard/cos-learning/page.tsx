'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

type Readiness = {
  ok?: boolean
  enabled?: boolean
  questions?: number
  sourceAdapters?: string[]
  error?: string
}

type LearningResult = {
  ok?: boolean
  curriculumQuestions?: number
  sourceAdapters?: string[]
  result?: {
    gapsConsidered?: number
    documentsAcquired?: number
    accepted?: number
    rejected?: Record<string, number>
    externalCostUsd?: number
  }
  error?: string
}

const COPY = {
  en: {
    title: 'COS Foundational Learning',
    subtitle: 'Populate COS with governed, provenance-bearing knowledge from approved live sources.',
    enabled: 'Live learning enabled', disabled: 'Live learning disabled', questions: 'Study questions', sources: 'Source adapters',
    run: 'Run Foundational Learning', running: 'Learning in progress…', refresh: 'Refresh status',
    acquired: 'Documents acquired', accepted: 'Knowledge accepted', gaps: 'Questions processed', cost: 'External cost', rejected: 'Rejected',
    noResult: 'No learning run has been completed on this page yet.', failed: 'Learning request failed.',
  },
  es: {
    title: 'Aprendizaje Fundacional de COS', subtitle: 'Llena COS con conocimiento gobernado y con procedencia desde fuentes aprobadas.',
    enabled: 'Aprendizaje en vivo habilitado', disabled: 'Aprendizaje en vivo deshabilitado', questions: 'Preguntas de estudio', sources: 'Adaptadores de fuentes',
    run: 'Ejecutar aprendizaje fundacional', running: 'Aprendizaje en curso…', refresh: 'Actualizar estado', acquired: 'Documentos adquiridos', accepted: 'Conocimiento aceptado', gaps: 'Preguntas procesadas', cost: 'Costo externo', rejected: 'Rechazados', noResult: 'Todavía no se completó una ejecución en esta página.', failed: 'Falló la solicitud de aprendizaje.',
  },
  pt: {
    title: 'Aprendizado Fundamental do COS', subtitle: 'Preencha o COS com conhecimento governado e com proveniência a partir de fontes aprovadas.',
    enabled: 'Aprendizado ao vivo ativado', disabled: 'Aprendizado ao vivo desativado', questions: 'Perguntas de estudo', sources: 'Adaptadores de fontes',
    run: 'Executar aprendizado fundamental', running: 'Aprendizado em andamento…', refresh: 'Atualizar status', acquired: 'Documentos adquiridos', accepted: 'Conhecimento aceito', gaps: 'Perguntas processadas', cost: 'Custo externo', rejected: 'Rejeitados', noResult: 'Nenhuma execução foi concluída nesta página ainda.', failed: 'Falha na solicitação de aprendizado.',
  },
  pl: {
    title: 'Podstawowe Uczenie COS', subtitle: 'Wypełnij COS wiedzą z zatwierdzonych źródeł, z kontrolą pochodzenia i zasad.',
    enabled: 'Uczenie na żywo włączone', disabled: 'Uczenie na żywo wyłączone', questions: 'Pytania badawcze', sources: 'Adaptery źródeł',
    run: 'Uruchom podstawowe uczenie', running: 'Uczenie w toku…', refresh: 'Odśwież status', acquired: 'Pozyskane dokumenty', accepted: 'Przyjęta wiedza', gaps: 'Przetworzone pytania', cost: 'Koszt zewnętrzny', rejected: 'Odrzucone', noResult: 'Na tej stronie nie zakończono jeszcze żadnego przebiegu.', failed: 'Żądanie uczenia nie powiodło się.',
  },
  ru: {
    title: 'Базовое обучение COS', subtitle: 'Наполните COS управляемыми знаниями с подтверждённым происхождением из одобренных источников.',
    enabled: 'Онлайн-обучение включено', disabled: 'Онлайн-обучение выключено', questions: 'Учебные вопросы', sources: 'Адаптеры источников',
    run: 'Запустить базовое обучение', running: 'Обучение выполняется…', refresh: 'Обновить статус', acquired: 'Получено документов', accepted: 'Принято знаний', gaps: 'Обработано вопросов', cost: 'Внешняя стоимость', rejected: 'Отклонено', noResult: 'На этой странице ещё не завершён ни один запуск.', failed: 'Запрос обучения завершился ошибкой.',
  },
} as const

export default function CosLearningPage() {
  const { lang } = useTranslation()
  const t = COPY[(lang in COPY ? lang : 'en') as keyof typeof COPY]
  const [status, setStatus] = useState<Readiness | null>(null)
  const [result, setResult] = useState<LearningResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const response = await fetch('/api/admin/cos-learning/foundational', { cache: 'no-store' })
      const body = await response.json()
      setStatus(body)
      if (!response.ok) setError(body?.error || t.failed)
    } catch {
      setError(t.failed)
    }
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/cos-learning/foundational', { method: 'POST' })
      const body = await response.json()
      setResult(body)
      if (!response.ok) setError(body?.error || t.failed)
      await load()
    } catch {
      setError(t.failed)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void load() }, [])

  const r = result?.result
  return (
    <div className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 text-text">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-text-muted">{t.subtitle}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card label={status?.enabled ? t.enabled : t.disabled} value={status?.enabled ? '✓' : '—'} />
          <Card label={t.questions} value={String(status?.questions ?? '—')} />
          <Card label={t.sources} value={String(status?.sourceAdapters?.length ?? '—')} />
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={run} disabled={busy || !status?.enabled} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
            {busy ? t.running : t.run}
          </button>
          <button onClick={load} disabled={busy} className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold">
            {t.refresh}
          </button>
        </div>

        {error && <div className="rounded-md border border-danger/40 bg-surface p-4 text-sm text-danger">{error}</div>}

        <section className="rounded-md border border-border bg-surface p-4">
          {r ? (
            <div className="grid gap-3 md:grid-cols-4">
              <Card label={t.gaps} value={String(r.gapsConsidered ?? 0)} />
              <Card label={t.acquired} value={String(r.documentsAcquired ?? 0)} />
              <Card label={t.accepted} value={String(r.accepted ?? 0)} />
              <Card label={t.cost} value={`$${Number(r.externalCostUsd ?? 0).toFixed(4)}`} />
              {r.rejected && Object.keys(r.rejected).length > 0 && (
                <div className="md:col-span-4 text-xs text-text-muted">{t.rejected}: {Object.entries(r.rejected).map(([k,v]) => `${k}: ${v}`).join(' · ')}</div>
              )}
            </div>
          ) : <p className="text-sm text-text-muted">{t.noResult}</p>}
        </section>
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border bg-surface p-4"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div>
}
