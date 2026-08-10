'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type CorpusStatus = {
  ok?: boolean
  target?: number
  count?: number
  remaining?: number
  completion?: number
  ready?: boolean
  error?: string
}

type SeedResult = {
  ok?: boolean
  scanned?: number
  candidates?: number
  uniqueCompanies?: number
  inserted?: number
  updated?: number
  failed?: number
  error?: string
}

type Copy = {
  eyebrow: string
  title: string
  description: string
  companies: string
  target: string
  complete: string
  importing: string
  importHistory: string
  ownerOnly: string
  importFailed: string
}

const COPY: Record<string, Copy> = {
  en: {
    eyebrow: 'Business Intelligence Corpus',
    title: 'Internal company intelligence',
    description: 'Reuse company intelligence SignalBoost already discovered before spending money on external AI or data providers.',
    companies: 'Companies',
    target: 'Target',
    complete: 'Complete',
    importing: 'Importing existing outreach history…',
    importHistory: 'Import existing outreach history',
    ownerOnly: 'Owner-only. Uses existing outreach history and does not call paid AI or prospect-data providers.',
    importFailed: 'Import failed',
  },
  es: {
    eyebrow: 'Corpus de inteligencia empresarial',
    title: 'Inteligencia interna de empresas',
    description: 'Reutiliza la inteligencia empresarial que SignalBoost ya descubrió antes de gastar dinero en IA externa o proveedores de datos.',
    companies: 'Empresas',
    target: 'Objetivo',
    complete: 'Completado',
    importing: 'Importando el historial de alcance existente…',
    importHistory: 'Importar historial de alcance existente',
    ownerOnly: 'Solo propietario. Usa el historial de alcance existente y no llama a proveedores de IA o datos de prospectos de pago.',
    importFailed: 'Error de importación',
  },
  pt: {
    eyebrow: 'Corpus de inteligência empresarial',
    title: 'Inteligência interna de empresas',
    description: 'Reutilize a inteligência empresarial que a SignalBoost já descobriu antes de gastar dinheiro com IA externa ou provedores de dados.',
    companies: 'Empresas',
    target: 'Meta',
    complete: 'Concluído',
    importing: 'Importando o histórico de prospecção existente…',
    importHistory: 'Importar histórico de prospecção existente',
    ownerOnly: 'Somente proprietário. Usa o histórico de prospecção existente e não chama provedores pagos de IA ou dados de prospecção.',
    importFailed: 'Falha na importação',
  },
  pl: {
    eyebrow: 'Korpus analityki biznesowej',
    title: 'Wewnętrzna wiedza o firmach',
    description: 'Wykorzystuj ponownie wiedzę o firmach już zdobytą przez SignalBoost, zanim wydasz pieniądze na zewnętrzną AI lub dostawców danych.',
    companies: 'Firmy',
    target: 'Cel',
    complete: 'Ukończono',
    importing: 'Importowanie istniejącej historii działań…',
    importHistory: 'Importuj istniejącą historię działań',
    ownerOnly: 'Tylko właściciel. Korzysta z istniejącej historii działań i nie wywołuje płatnych dostawców AI ani danych prospectingowych.',
    importFailed: 'Import nie powiódł się',
  },
  ru: {
    eyebrow: 'Корпус бизнес-аналитики',
    title: 'Внутренняя информация о компаниях',
    description: 'Повторно используйте сведения о компаниях, уже найденные SignalBoost, прежде чем тратить деньги на внешние ИИ-сервисы или поставщиков данных.',
    companies: 'Компании',
    target: 'Цель',
    complete: 'Готово',
    importing: 'Импорт существующей истории охвата…',
    importHistory: 'Импортировать существующую историю охвата',
    ownerOnly: 'Только для владельца. Использует существующую историю охвата и не обращается к платным ИИ-сервисам или поставщикам данных о потенциальных клиентах.',
    importFailed: 'Ошибка импорта',
  },
}

export default function BusinessIntelligenceCorpusPage() {
  const { language } = useI18n()
  const copy = COPY[language] || COPY.en
  const [status, setStatus] = useState<CorpusStatus | null>(null)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/business-intelligence-corpus/status', { cache: 'no-store' })
      setStatus(await response.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function seedHistory() {
    if (running) return
    setRunning(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin/business-intelligence-corpus/seed-outreach-history', { method: 'POST' })
      const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      setResult(body)
      await refresh()
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : copy.importFailed })
    } finally {
      setRunning(false)
    }
  }

  const count = status?.count ?? 0
  const target = status?.target ?? 5000
  const completion = status?.completion ?? 0

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', color: '#fff' }}>
      <p style={{ color: '#ffc300', fontWeight: 800, letterSpacing: 1 }}>{copy.eyebrow}</p>
      <h1 style={{ fontSize: 34, margin: '8px 0' }}>{copy.title}</h1>
      <p style={{ opacity: .72, lineHeight: 1.6 }}>{copy.description}</p>

      <section style={{ marginTop: 28, padding: 24, border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, background: 'rgba(255,255,255,.03)' }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div><strong style={{ fontSize: 28 }}>{loading ? '…' : count}</strong><div style={{ opacity: .6 }}>{copy.companies}</div></div>
          <div><strong style={{ fontSize: 28 }}>{target}</strong><div style={{ opacity: .6 }}>{copy.target}</div></div>
          <div><strong style={{ fontSize: 28 }}>{completion}%</strong><div style={{ opacity: .6 }}>{copy.complete}</div></div>
        </div>

        <button
          type="button"
          onClick={seedHistory}
          disabled={running}
          style={{ marginTop: 28, padding: '13px 20px', borderRadius: 10, border: 0, cursor: running ? 'wait' : 'pointer', fontWeight: 800 }}
        >
          {running ? copy.importing : copy.importHistory}
        </button>
        <p style={{ marginTop: 10, opacity: .6, fontSize: 13 }}>{copy.ownerOnly}</p>

        {result && (
          <pre style={{ marginTop: 20, padding: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,.35)', borderRadius: 10 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {status?.error && <p style={{ color: '#ff7777' }}>{status.error}</p>}
      </section>
    </main>
  )
}
