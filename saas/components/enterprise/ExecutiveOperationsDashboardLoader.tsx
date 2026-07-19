'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import ExecutiveOperationsDashboard from './ExecutiveOperationsDashboard'
import type { OperationsIntelligenceSnapshot } from '@/lib/enterprise/operations/operationsIntelligence'
import { parseOperationsDashboardApiResponse } from '@/lib/enterprise/operations/operationsDashboardResponse'
import { getOperationsDashboardStateCopy } from '@/lib/i18n/operationsDashboardStateCopy'

type Props = Readonly<{ organizationId: string }>

export default function ExecutiveOperationsDashboardLoader({ organizationId }: Props) {
  const { lang } = useI18n()
  const copy = getOperationsDashboardStateCopy(lang)
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
      setSnapshot(null)
      try {
        const response = await fetch(`/api/internal/enterprise/operations?organizationId=${encodeURIComponent(organizationId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = parseOperationsDashboardApiResponse(await response.json())
        if (!response.ok || !body.snapshot) throw new Error(body.error || copy.unavailable)
        if (body.snapshot.organizationId !== organizationId) throw new Error(copy.unavailable)
        setSnapshot(body.snapshot)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error && cause.message ? cause.message : copy.unavailable)
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
