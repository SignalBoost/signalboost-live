'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import ExecutiveOperationsDashboard from './ExecutiveOperationsDashboard'
import type { OperationsIntelligenceSnapshot } from '@/lib/enterprise/operations/operationsIntelligence'

type Props = Readonly<{ organizationId: string }>

type ApiResponse = Readonly<{
  schemaVersion: 'operations-intelligence-response-v1'
  snapshot?: OperationsIntelligenceSnapshot
  error?: string
}>

const stateCopy = {
  en: { loading: 'Loading operations intelligence…', missingId: 'An organizationId query parameter is required.', unavailable: 'Unable to load operations intelligence.', empty: 'No operations snapshot is available.' },
  es: { loading: 'Cargando inteligencia de operaciones…', missingId: 'Se requiere el parámetro organizationId.', unavailable: 'No se pudo cargar la inteligencia de operaciones.', empty: 'No hay una instantánea de operaciones disponible.' },
  pt: { loading: 'Carregando inteligência de operações…', missingId: 'O parâmetro organizationId é obrigatório.', unavailable: 'Não foi possível carregar a inteligência de operações.', empty: 'Nenhum retrato de operações está disponível.' },
  pl: { loading: 'Ładowanie inteligencji operacyjnej…', missingId: 'Wymagany jest parametr organizationId.', unavailable: 'Nie udało się załadować inteligencji operacyjnej.', empty: 'Brak dostępnej migawki operacyjnej.' },
  ru: { loading: 'Загрузка операционной аналитики…', missingId: 'Требуется параметр organizationId.', unavailable: 'Не удалось загрузить операционную аналитику.', empty: 'Снимок операционных данных недоступен.' },
} as const

export default function ExecutiveOperationsDashboardLoader({ organizationId }: Props) {
  const { lang } = useI18n()
  const copy = stateCopy[(lang in stateCopy ? lang : 'en') as keyof typeof stateCopy]
  const [snapshot, setSnapshot] = useState<OperationsIntelligenceSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(organizationId))

  useEffect(() => {
    if (!organizationId) {
      setLoading(false)
      setError(copy.missingId)
      return
    }

    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/internal/enterprise/operations?organizationId=${encodeURIComponent(organizationId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = await response.json() as ApiResponse
        if (!response.ok || !body.snapshot) throw new Error(body.error || copy.unavailable)
        setSnapshot(body.snapshot)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : copy.unavailable)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [copy.missingId, copy.unavailable, organizationId])

  if (loading) return <main style={{ minHeight: '100vh', background: '#030611', color: '#fff', padding: 40 }}>{copy.loading}</main>
  if (error || !snapshot) return <main style={{ minHeight: '100vh', background: '#030611', color: '#fff', padding: 40 }}><p role="alert">{error || copy.empty}</p></main>
  return <ExecutiveOperationsDashboard snapshot={snapshot} />
}
