'use client'

import { useState } from 'react'
import OperatorInput from '@/components/operator/OperatorInput'
import OperatorPlan, { type OperatorPlanView } from '@/components/operator/OperatorPlan'
import OperatorApproval from '@/components/operator/OperatorApproval'
import OperatorStatus, { type OperatorJobView } from '@/components/operator/OperatorStatus'
import OperatorRollback from '@/components/operator/OperatorRollback'

type Plan = OperatorPlanView & { request: string; fileTargets: string[]; requiresApproval: boolean }
type Job = OperatorJobView & { id: string; rollbackAvailable: boolean }

export default function OperatorPage() {
  const [request, setRequest] = useState('Make my restaurant website look more elegant and add a reservation button')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function createPlan() {
    setLoading(true)
    setMessage('')
    const res = await fetch('/api/operator/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request }) })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMessage(data.error || 'Could not create plan.')
    setPlan(data.plan)
  }

  async function approveAndPublish() {
    if (!plan) return
    setLoading(true)
    const res = await fetch('/api/operator/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.id, approved: true }) })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMessage(data.error || 'Could not apply.')
    setJob(data.job)
    setMessage(data.userMessage || '')
  }

  async function rollback() {
    if (!job) return
    setLoading(true)
    const res = await fetch('/api/operator/rollback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id }) })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setMessage(data.error || 'Could not rollback.')
    setJob(data.job)
    setMessage(data.userMessage || '')
  }

  return (
    <main className="sb-page" style={{ maxWidth: 980 }}>
      <OperatorInput value={request} onChange={setRequest} onPlan={createPlan} loading={loading} />

      {plan && (
        <>
          <div style={{ marginTop: 12 }}>
            <OperatorApproval loading={loading} onApprove={approveAndPublish} />
            {job?.rollbackAvailable && <OperatorRollback loading={loading} onRollback={rollback} />}
          </div>
          <OperatorPlan plan={plan} />
        </>
      )}

      {job && <OperatorStatus job={job} />}
      {message && <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>{message}</p>}
    </main>
  )
}
