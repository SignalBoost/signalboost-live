import type { IntegrationContext, IntegrationProvider, IntegrationResult } from './types.ts'
import { bearer, integrationBad as bad, integrationJson, integrationOk as ok } from './http.ts'

function required(value: unknown, name: string): string {
  const s = String(value || '').trim()
  if (!s) throw new Error(`${name} is required`)
  return s
}

function sfBase(ctx: IntegrationContext): string {
  return required(ctx.metadata?.instanceUrl || ctx.accountRef, 'Salesforce instance URL').replace(/\/$/, '')
}

export const productionCrmAdapters: Record<string, Partial<IntegrationProvider>> = {
  salesforce: {
    async upsertContact(ctx, c): Promise<IntegrationResult> {
      const base = sfBase(ctx)
      const email = required(c.email, 'email')
      const body = { FirstName: c.firstName || c.firstname || undefined, LastName: c.lastName || c.lastname || email, Email: email, Phone: c.phone, Title: c.title }
      const r = await integrationJson(fetch, `${base}/services/data/v61.0/sobjects/Contact/Email/${encodeURIComponent(email)}`, { method: 'PATCH', headers: bearer(ctx.accessToken), body: JSON.stringify(body) })
      if (!r.ok && r.status !== 204) return bad('salesforce_contact_failed', r.data?.[0]?.message || String(r.status))
      return ok({ email, upserted: true }, 'salesforce_contact_upserted')
    },
    async upsertDeal(ctx, d): Promise<IntegrationResult> {
      const base = sfBase(ctx)
      const body = { Name: required(d.name, 'name'), Amount: d.amount, StageName: d.stage || 'Prospecting', CloseDate: d.closeDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }
      const r = await integrationJson(fetch, `${base}/services/data/v61.0/sobjects/Opportunity`, { method: 'POST', headers: bearer(ctx.accessToken), body: JSON.stringify(body) })
      if (!r.ok || !r.data?.id) return bad('salesforce_deal_failed', r.data?.[0]?.message || String(r.status))
      return ok({ id: r.data.id }, 'salesforce_deal_created')
    },
    async logActivity(ctx, a): Promise<IntegrationResult> {
      const base = sfBase(ctx)
      const r = await integrationJson(fetch, `${base}/services/data/v61.0/sobjects/Task`, { method: 'POST', headers: bearer(ctx.accessToken), body: JSON.stringify({ Subject: a.subject || 'SignalBoost activity', Description: a.note || a.body || '', WhoId: a.contactId, WhatId: a.recordId, Status: 'Completed', Priority: 'Normal' }) })
      if (!r.ok || !r.data?.id) return bad('salesforce_activity_failed', r.data?.[0]?.message || String(r.status))
      return ok({ id: r.data.id }, 'salesforce_activity_logged')
    },
  },
  pipedrive: {
    async upsertContact(ctx, c): Promise<IntegrationResult> {
      const email = required(c.email, 'email')
      const headers = bearer(ctx.accessToken)
      const search = await integrationJson(fetch, `https://api.pipedrive.com/v1/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true`, { headers })
      const id = search.data?.data?.items?.[0]?.item?.id
      const body = { name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || email, email: [{ value: email, primary: true }], phone: c.phone ? [{ value: c.phone, primary: true }] : undefined }
      const r = await integrationJson(fetch, id ? `https://api.pipedrive.com/v1/persons/${id}` : 'https://api.pipedrive.com/v1/persons', { method: id ? 'PUT' : 'POST', headers, body: JSON.stringify(body) })
      if (!r.ok || !r.data?.success) return bad('pipedrive_contact_failed', r.data?.error || String(r.status))
      return ok({ id: r.data.data?.id, updated: Boolean(id) }, 'pipedrive_contact_upserted')
    },
    async upsertDeal(ctx, d): Promise<IntegrationResult> {
      const r = await integrationJson(fetch, 'https://api.pipedrive.com/v1/deals', { method: 'POST', headers: bearer(ctx.accessToken), body: JSON.stringify({ title: required(d.name, 'name'), value: d.amount, currency: d.currency || 'USD', person_id: d.contactId, org_id: d.organizationId, status: d.status || 'open' }) })
      if (!r.ok || !r.data?.success) return bad('pipedrive_deal_failed', r.data?.error || String(r.status))
      return ok({ id: r.data.data?.id }, 'pipedrive_deal_created')
    },
    async logActivity(ctx, a): Promise<IntegrationResult> {
      const r = await integrationJson(fetch, 'https://api.pipedrive.com/v1/activities', { method: 'POST', headers: bearer(ctx.accessToken), body: JSON.stringify({ subject: a.subject || 'SignalBoost activity', note: a.note || a.body || '', type: a.type || 'task', person_id: a.contactId, deal_id: a.dealId, done: 1 }) })
      if (!r.ok || !r.data?.success) return bad('pipedrive_activity_failed', r.data?.error || String(r.status))
      return ok({ id: r.data.data?.id }, 'pipedrive_activity_logged')
    },
  },
  zoho_crm: {
    async upsertContact(ctx, c): Promise<IntegrationResult> {
      const email = required(c.email, 'email')
      const headers = bearer(ctx.accessToken)
      const body = { data: [{ First_Name: c.firstName || c.firstname, Last_Name: c.lastName || c.lastname || email, Email: email, Phone: c.phone, Account_Name: c.company ? { name: c.company } : undefined }], duplicate_check_fields: ['Email'], trigger: [] }
      const r = await integrationJson(fetch, 'https://www.zohoapis.com/crm/v6/Contacts/upsert', { method: 'POST', headers, body: JSON.stringify(body) })
      const item = r.data?.data?.[0]
      if (!r.ok || item?.status !== 'success') return bad('zoho_contact_failed', item?.message || String(r.status))
      return ok({ id: item?.details?.id }, 'zoho_contact_upserted')
    },
    async upsertDeal(ctx, d): Promise<IntegrationResult> {
      const r = await integrationJson(fetch, 'https://www.zohoapis.com/crm/v6/Deals', { method: 'POST', headers: bearer(ctx.accessToken), body: JSON.stringify({ data: [{ Deal_Name: required(d.name, 'name'), Amount: d.amount, Stage: d.stage || 'Qualification', Closing_Date: d.closeDate }] }) })
      const item = r.data?.data?.[0]
      if (!r.ok || item?.status !== 'success') return bad('zoho_deal_failed', item?.message || String(r.status))
      return ok({ id: item?.details?.id }, 'zoho_deal_created')
    },
    async logActivity(ctx, a): Promise<IntegrationResult> {
      const r = await integrationJson(fetch, 'https://www.zohoapis.com/crm/v6/Notes', { method: 'POST', headers: bearer(ctx.accessToken), body: JSON.stringify({ data: [{ Note_Title: a.subject || 'SignalBoost activity', Note_Content: a.note || a.body || '', Parent_Id: a.recordId, se_module: a.module || 'Contacts' }] }) })
      const item = r.data?.data?.[0]
      if (!r.ok || item?.status !== 'success') return bad('zoho_activity_failed', item?.message || String(r.status))
      return ok({ id: item?.details?.id }, 'zoho_activity_logged')
    },
  },
}

export function applyProductionCrmAdapter(provider: IntegrationProvider): IntegrationProvider {
  const implementation = productionCrmAdapters[provider.id]
  return implementation ? { ...provider, ...implementation } : provider
}
