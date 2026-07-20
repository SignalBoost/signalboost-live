// Durable liveness signal for the approved audit-remediation worker.
// A dashboard read is not a heartbeat. This record is written only after the
// governed worker/reconciliation path has actually completed an iteration.

const HEARTBEAT_INTERVAL_MS = 20_000
const HEARTBEAT_KIND = 'audit_remediation_heartbeat'

export async function recordApprovedRemediationHeartbeat(params: {
  admin: any
  runId: string
  actorUserId: string
  lifecycleStatus: string
}): Promise<string> {
  const now = new Date()
  const nowIso = now.toISOString()

  try {
    const latest = await params.admin
      .from('audit_logs')
      .select('created_at,payload')
      .eq('run_id', params.runId)
      .eq('payload->>kind', HEARTBEAT_KIND)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestAt = typeof latest.data?.created_at === 'string' ? latest.data.created_at : ''
    const latestStatus = String(latest.data?.payload?.lifecycleStatus || '')
    const latestMs = latestAt ? Date.parse(latestAt) : Number.NaN

    if (
      Number.isFinite(latestMs) &&
      latestStatus === params.lifecycleStatus &&
      now.getTime() - latestMs < HEARTBEAT_INTERVAL_MS
    ) {
      return latestAt
    }

    const inserted = await params.admin
      .from('audit_logs')
      .insert({
        run_id: params.runId,
        user_id: params.actorUserId,
        payload: {
          kind: HEARTBEAT_KIND,
          runId: params.runId,
          lifecycleStatus: params.lifecycleStatus,
          source: 'approved_remediation_worker',
          timestamp: nowIso,
        },
      })
      .select('created_at')
      .single()

    if (inserted.error) return ''
    return String(inserted.data?.created_at || nowIso)
  } catch {
    // Liveness display fails closed. Remediation itself must not fail because a
    // heartbeat could not be recorded.
    return ''
  }
}
