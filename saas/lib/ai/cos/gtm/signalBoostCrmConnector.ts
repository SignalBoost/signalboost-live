import { createClient } from '@supabase/supabase-js'
import { normalizeAddress, productKeyOf } from '@/lib/outreach/recipientHistory'
import type {
  CrmProspectRecord,
  CrmProductTouch,
  CrmStage,
  CrmSyncResult,
  CrmUpsertInput,
  ICosCrmConnector,
} from './crmConnector'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function stageFromStatus(status: string | null | undefined, sent: boolean): CrmStage {
  if (sent || status === 'sent') return 'SENT'
  if (status === 'approved') return 'APPROVED'
  if (status === 'pending') return 'PENDING_APPROVAL'
  if (status === 'rejected' || status === 'archived') return 'LOST'
  return 'DISCOVERED'
}

/**
 * First-party CRM adapter backed by SignalBoost's existing outreach queue/history.
 *
 * This deliberately does not create a second CRM database. outreach_queue and
 * outreach_sends remain the source of truth, including the existing product_key
 * duplicate protection. External CRM adapters can implement the same contract later.
 */
export class SignalBoostCrmConnector implements ICosCrmConnector {
  readonly provider = 'signalboost'

  isConfigured(): boolean {
    return Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY)
  }

  async getProspectByEmail(email: string): Promise<CrmProspectRecord | null> {
    const db = admin()
    const address = normalizeAddress(email)
    if (!db || !address) return null

    const { data: rows, error } = await db
      .from('outreach_queue')
      .select('id,business_name,website_url,contact_name,contact_email,product_key,status,created_at,updated_at,sent_at')
      .ilike('contact_email', address)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error || !rows?.length) return null

    const ids = rows.map((row: any) => row.id).filter(Boolean)
    const { data: sends } = ids.length
      ? await db.from('outreach_sends').select('outreach_id,sent_at').in('outreach_id', ids)
      : { data: [] as any[] }
    const sendById = new Map((sends || []).map((send: any) => [String(send.outreach_id), send]))

    const touchesByProduct = new Map<string, CrmProductTouch>()
    for (const row of rows as any[]) {
      const productKey = productKeyOf(row.product_key) || 'unlabelled'
      const send = sendById.get(String(row.id))
      const firstTouchedAt = row.created_at || null
      const lastTouchedAt = send?.sent_at || row.sent_at || row.updated_at || row.created_at || null
      const stage = stageFromStatus(row.status, Boolean(send))
      const current = touchesByProduct.get(productKey)
      if (!current) {
        touchesByProduct.set(productKey, {
          productKey,
          stage,
          firstTouchedAt,
          lastTouchedAt,
          sourceId: row.id,
        })
        continue
      }
      if ((lastTouchedAt || '') >= (current.lastTouchedAt || '')) {
        touchesByProduct.set(productKey, { ...current, stage, lastTouchedAt, sourceId: row.id })
      }
    }

    const latest = rows[rows.length - 1] as any
    let companyDomain: string | null = null
    try { companyDomain = latest.website_url ? new URL(latest.website_url).hostname.replace(/^www\./i, '') : null } catch {}

    return {
      provider: this.provider,
      prospectId: latest.id || null,
      externalId: latest.id || null,
      companyName: latest.business_name || companyDomain || address,
      companyDomain,
      contactName: latest.contact_name || null,
      email: address,
      touches: [...touchesByProduct.values()],
      updatedAt: latest.updated_at || latest.created_at || new Date().toISOString(),
    }
  }

  async upsertProspect(input: CrmUpsertInput): Promise<CrmSyncResult> {
    // SignalBoost's canonical prospect record is created by the outreach drafting
    // pipeline, where compliance and address provenance are enforced. The CRM adapter
    // therefore records stages only for existing queue rows and never fabricates a lead.
    return this.markProductStage(input)
  }

  async markProductStage(input: CrmUpsertInput): Promise<CrmSyncResult> {
    const db = admin()
    if (!db) return { ok: false, provider: this.provider, error: 'Supabase service role is not configured.' }

    const address = normalizeAddress(input.email)
    const productKey = productKeyOf(input.productKey)
    if (!address || !productKey) return { ok: false, provider: this.provider, error: 'email and productKey are required.' }

    const { data: rows, error } = await db
      .from('outreach_queue')
      .select('id,product_key,status')
      .ilike('contact_email', address)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return { ok: false, provider: this.provider, error: error.message }

    const match = (rows || []).find((row: any) => productKeyOf(row.product_key) === productKey)
    if (!match) {
      return {
        ok: false,
        provider: this.provider,
        error: 'No existing SignalBoost outreach record matches this email and product. Prospect creation must go through the governed outreach pipeline.',
      }
    }

    // Only stages that map safely onto the existing queue state are written here.
    const status = input.stage === 'APPROVED'
      ? 'approved'
      : input.stage === 'SENT'
        ? 'sent'
        : input.stage === 'PENDING_APPROVAL' || input.stage === 'DRAFTED'
          ? 'pending'
          : null

    if (!status) return { ok: true, provider: this.provider, externalId: match.id }

    const { error: updateError } = await db
      .from('outreach_queue')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', match.id)

    return updateError
      ? { ok: false, provider: this.provider, externalId: match.id, error: updateError.message }
      : { ok: true, provider: this.provider, externalId: match.id }
  }
}
