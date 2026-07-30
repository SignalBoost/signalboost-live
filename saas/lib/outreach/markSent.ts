// saas/lib/outreach/markSent.ts
//
// Production has previously drifted from the repository migration: some deployments
// had outreach_queue.status but not outreach_queue.sent_at. A single update that
// writes both columns therefore sent the real Resend email and inserted outreach_sends,
// then silently failed to move the queue row from approved to sent.
//
// Always try the complete update first. If the live table lacks sent_at (or any other
// column-level drift blocks that write), retry the authoritative lifecycle update with
// status only. The outreach_sends row remains the durable timestamp/audit record.

export type MarkOutreachSentResult = {
  ok: boolean
  usedStatusOnlyFallback: boolean
  firstError: string | null
  error: string | null
  row: { id?: string; status?: string; sent_at?: string | null } | null
}

export async function markOutreachSent(
  admin: any,
  outreachId: string,
  sentAt: string,
): Promise<MarkOutreachSentResult> {
  const first = await admin
    .from('outreach_queue')
    .update({ status: 'sent', sent_at: sentAt })
    .eq('id', outreachId)
    .select('id,status,sent_at')
    .maybeSingle()

  if (!first.error && first.data?.status === 'sent') {
    return {
      ok: true,
      usedStatusOnlyFallback: false,
      firstError: null,
      error: null,
      row: first.data,
    }
  }

  const fallback = await admin
    .from('outreach_queue')
    .update({ status: 'sent' })
    .eq('id', outreachId)
    .select('id,status')
    .maybeSingle()

  return {
    ok: !fallback.error && fallback.data?.status === 'sent',
    usedStatusOnlyFallback: true,
    firstError: first.error?.message || (first.data?.status !== 'sent' ? 'Complete sent-state update was not confirmed.' : null),
    error: fallback.error?.message || (fallback.data?.status !== 'sent' ? 'Status-only sent reconciliation was not confirmed.' : null),
    row: fallback.data || first.data || null,
  }
}
