import { sendEmail } from '@/lib/email'
import { listRecentGmailMessages } from '@/lib/google-workspace/gmail'
import { getAdminSupabase } from '@/utils/supabase/server'
import { classifyOwnerEmail, type OwnerBriefingItem as BriefingItem } from './ownerExecutiveBriefingPolicy.ts'

function ownerEmail(): string {
  return String(process.env.COS_OWNER_BRIEFING_EMAIL || process.env.OWNER_EMAIL || process.env.SIGNALBOOST_OWNER_EMAIL || 'cadomos@gmail.com')
    .split(',')[0].trim().toLowerCase()
}

async function ownerUserId(email: string): Promise<string | null> {
  const db = getAdminSupabase()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`owner_user_lookup_failed:${error.message}`)
    const users = ((data as any)?.users || []) as Array<{ id: string; email?: string | null }>
    const found = users.find(user => String(user.email || '').toLowerCase() === email)
    if (found) return found.id
    if (users.length < 100) break
  }
  return null
}

async function supervisorItems(): Promise<BriefingItem[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getAdminSupabase().from('self_healing_native_probe_samples')
    .select('id,probe_id,target,observed_at,status,details')
    .in('status', ['warning', 'critical', 'error'])
    .gte('observed_at', since).order('observed_at', { ascending: false }).limit(50)
  if (error) throw new Error(`supervisor_briefing_read_failed:${error.message}`)
  return (data || []).map((row: any) => ({
    sourceType: 'supervisor' as const,
    // Collapse repeated samples for the same unresolved probe state into one incident.
    // A state change receives a new key and can alert independently.
    sourceId: `${row.probe_id}:${row.target}:${row.status}`,
    severity: row.status === 'critical' || row.status === 'error' ? 'urgent' as const : 'important' as const,
    title: `${row.probe_id} · ${row.target} · ${row.status}`.slice(0, 500),
    detail: JSON.stringify(row.details || {}).slice(0, 900),
    observedAt: row.observed_at,
  }))
}

function html(items: BriefingItem[], title: string): string {
  const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c))
  const rows = items.length ? items.map(item => `<li><strong>${esc(item.title)}</strong><br/>${esc(item.detail)}</li>`).join('') : '<li>No new important items were detected.</li>'
  return `<div style="font-family:system-ui,sans-serif"><h2>${esc(title)}</h2><ul>${rows}</ul><p style="color:#666;font-size:12px">COS read Gmail metadata/previews and verified Supervisor state. It did not modify the mailbox.</p></div>`
}

async function persist(items: BriefingItem[]) {
  if (!items.length) return
  const now = new Date().toISOString()
  const rows = items.map(item => ({
    owner_email: ownerEmail(), source_type: item.sourceType, source_id: item.sourceId,
    severity: item.severity, title: item.title, detail: item.detail, observed_at: item.observedAt, last_seen_at: now,
  }))
  const { error } = await getAdminSupabase().from('cos_owner_briefing_items').upsert(rows, { onConflict: 'owner_email,source_type,source_id' })
  if (error) throw new Error(`owner_briefing_persist_failed:${error.message}`)
}

export async function runOwnerExecutiveBriefing(now = new Date()) {
  const email = ownerEmail()
  const userId = await ownerUserId(email)
  if (!userId) return { ok: false as const, reason: 'owner_user_not_found' }
  // Read and unread mail are both considered: an already-opened message can still contain a
  // commitment or deadline the owner has not acted on.
  const gmail = await listRecentGmailMessages(userId, { query: 'newer_than:2d', limit: 40 })
  if ('reason' in gmail) return { ok: false as const, reason: gmail.reason }
  const items = [...gmail.messages.map(classifyOwnerEmail), ...await supervisorItems()]
  await persist(items)

  const db = getAdminSupabase()
  const { data: unsent, error: unsentError } = await db.from('cos_owner_briefing_items').select('*')
    .eq('owner_email', email).eq('severity', 'urgent').is('notified_at', null)
    .order('observed_at', { ascending: false }).limit(20)
  if (unsentError) throw new Error(`owner_briefing_unsent_read_failed:${unsentError.message}`)
  let urgentSent = 0
  if (unsent?.length) {
    const result = await sendEmail({ from: 'saasSupport', to: email, subject: `COS urgent brief: ${unsent.length} item${unsent.length === 1 ? '' : 's'} need attention`, html: html(unsent.map((row: any) => ({ sourceType:row.source_type,sourceId:row.source_id,severity:row.severity,title:row.title,detail:row.detail,observedAt:row.observed_at })), 'COS — immediate attention') })
    if (result.ok) {
      urgentSent = unsent.length
      await db.from('cos_owner_briefing_items').update({ notified_at: now.toISOString() }).in('id', unsent.map((row: any) => row.id))
    }
  }

  const day = now.toISOString().slice(0, 10)
  const hour = Math.max(0, Math.min(23, Number(process.env.COS_OWNER_DAILY_BRIEF_HOUR_UTC || 11)))
  let dailySent = false
  if (now.getUTCHours() >= hour) {
    const { data: prior } = await db.from('cos_owner_briefing_runs').select('id').eq('owner_email', email).eq('report_date', day).eq('kind', 'daily').maybeSingle()
    if (!prior) {
      const { data: dailyRows, error } = await db.from('cos_owner_briefing_items').select('*').eq('owner_email', email)
        .in('severity', ['urgent','important']).gte('observed_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        .order('observed_at', { ascending: false }).limit(30)
      if (error) throw new Error(`owner_daily_brief_read_failed:${error.message}`)
      const result = await sendEmail({ from: 'saasSupport', to: email, subject: `COS daily executive brief — ${day}`, html: html((dailyRows || []).map((row: any) => ({ sourceType:row.source_type,sourceId:row.source_id,severity:row.severity,title:row.title,detail:row.detail,observedAt:row.observed_at })), 'COS daily executive brief') })
      if (result.ok) {
        dailySent = true
        await db.from('cos_owner_briefing_runs').insert({ owner_email: email, report_date: day, kind: 'daily', item_count: dailyRows?.length || 0, delivered_at: now.toISOString() })
      }
    }
  }
  return { ok: true as const, gmailScanned: gmail.messages.length, itemsObserved: items.length, urgentSent, dailySent }
}
