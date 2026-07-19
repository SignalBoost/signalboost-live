'use client'

import { useEffect, useState } from 'react'
import ExecutiveOperationsDashboard from './ExecutiveOperationsDashboard'
import type { OperationsIntelligenceSnapshot } from '@/lib/enterprise/operations/operationsIntelligence'

type Props = Readonly<{ organizationId: string }>

type ApiResponse = Readonly<{
  schemaVersion: 'operations-intelligence-response-v1'
  snapshot?: OperationsIntelligenceSnapshot
  error?: string
}>

export default function ExecutiveOperationsDashboardLoader({ organizationId }: Props) {
  const [snapshot, setSnapshot] = useState<OperationsIntelligenceSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
        if (!response.ok || !body.snapshot) throw new Error(body.error || 'Unable to load operations intelligence.')
        setSnapshot(body.snapshot)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Unable to load operations intelligence.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [organizationId])

  if (loading) return <main style={{ minHeight: '100vh', background: '#030611', color: '#fff', padding: 40 }}>Loading operations intelligence…</main>
  if (error || !snapshot) return <main style={{ minHeight: '100vh', background: '#030611', color: '#fff', padding: 40 }}><h1>Operations Intelligence</h1><p role="alert">{error || 'No operations snapshot is available.'}</p></main>
  return <ExecutiveOperationsDashboard snapshot={snapshot} />
}
