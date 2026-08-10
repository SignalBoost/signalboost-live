import type {
  RevenueProviderAdapter,
  RevenueProviderCapability,
  RevenueProviderContext,
  RevenueProviderHealth,
  RevenueProviderResult,
} from '../contracts'
import { resolveRevenueSecrets } from '../secretResolver'

const PRODUCTION_BASE = 'https://quickbooks.api.intuit.com/v3/company'
const SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'

function now() { return new Date().toISOString() }

function requiredString(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`QUICKBOOKS_INPUT_REQUIRED:${field}`)
  return text
}

function escapeQuery(value: string) {
  return value.replace(/'/g, "\\'")
}

export class QuickBooksOnlineAdapter implements RevenueProviderAdapter {
  readonly providerId = 'quickbooks-online'
  readonly displayName = 'QuickBooks Online'
  readonly domain = 'accounting' as const
  readonly capabilities = [
    'customer_lookup','customer_upsert','quote_create','invoice_create','invoice_lookup','invoice_status','payment_status',
  ] as const satisfies readonly RevenueProviderCapability[]

  private connection(context: RevenueProviderContext) {
    const secrets = resolveRevenueSecrets(context)
    const accessToken = secrets.QBO_ACCESS_TOKEN
    const realmId = secrets.QBO_REALM_ID
    if (!accessToken || !realmId) throw new Error('QUICKBOOKS_CONNECTION_INCOMPLETE')
    const sandbox = (secrets.QBO_ENVIRONMENT || '').toLowerCase() === 'sandbox'
    return { accessToken, realmId, base: sandbox ? SANDBOX_BASE : PRODUCTION_BASE }
  }

  private async request(context: RevenueProviderContext, path: string, init?: RequestInit) {
    const { accessToken, realmId, base } = this.connection(context)
    const response = await fetch(`${base}/${encodeURIComponent(realmId)}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const fault = body?.Fault?.Error?.[0]?.Message || body?.Fault?.Error?.[0]?.Detail || `HTTP_${response.status}`
      throw new Error(`QUICKBOOKS_API_ERROR:${fault}`)
    }
    return body
  }

  async testConnection(context: RevenueProviderContext): Promise<RevenueProviderHealth> {
    try {
      const { realmId } = this.connection(context)
      await this.request(context, `/companyinfo/${encodeURIComponent(realmId)}`)
      return { state: 'healthy', checkedAt: now() }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      return {
        state: /MISSING|INCOMPLETE/.test(message) ? 'unconfigured' : /401|AUTH/i.test(message) ? 'authentication_failed' : 'offline',
        checkedAt: now(),
        messageKey: message,
      }
    }
  }

  async execute<TInput, TOutput>(capability: RevenueProviderCapability, input: TInput, context: RevenueProviderContext): Promise<RevenueProviderResult<TOutput>> {
    if (!this.capabilities.includes(capability as any)) {
      return { ok: false, errorCode: 'QUICKBOOKS_CAPABILITY_UNSUPPORTED', retrievedAt: now() }
    }
    try {
      const data = await this.executeInternal(capability, input as any, context)
      const providerRecordId = String(data?.Id || data?.Invoice?.Id || data?.Customer?.Id || data?.Estimate?.Id || '') || undefined
      return { ok: true, data: data as TOutput, providerRecordId, retrievedAt: now() }
    } catch (error) {
      return { ok: false, errorCode: error instanceof Error ? error.message : 'QUICKBOOKS_EXECUTION_FAILED', retrievedAt: now() }
    }
  }

  private async executeInternal(capability: RevenueProviderCapability, input: any, context: RevenueProviderContext) {
    if (capability === 'customer_lookup') {
      if (input?.id) return (await this.request(context, `/customer/${encodeURIComponent(String(input.id))}`)).Customer
      const name = requiredString(input?.displayName || input?.name || input?.email, 'displayName_or_email')
      const field = input?.email ? 'PrimaryEmailAddr' : 'DisplayName'
      const query = `select * from Customer where ${field} = '${escapeQuery(name)}' maxresults 20`
      return (await this.request(context, `/query?query=${encodeURIComponent(query)}`)).QueryResponse?.Customer || []
    }

    if (capability === 'customer_upsert') {
      const payload = input?.payload || input
      if (payload?.Id) return (await this.request(context, '/customer?operation=update', { method: 'POST', body: JSON.stringify(payload) })).Customer
      return (await this.request(context, '/customer', { method: 'POST', body: JSON.stringify(payload) })).Customer
    }

    if (capability === 'quote_create') {
      const payload = input?.payload || input
      return (await this.request(context, '/estimate', { method: 'POST', body: JSON.stringify(payload) })).Estimate
    }

    if (capability === 'invoice_create') {
      const payload = input?.payload || input
      return (await this.request(context, '/invoice', { method: 'POST', body: JSON.stringify(payload) })).Invoice
    }

    if (capability === 'invoice_lookup' || capability === 'invoice_status' || capability === 'payment_status') {
      const id = requiredString(input?.invoiceId || input?.id, 'invoiceId')
      const invoice = (await this.request(context, `/invoice/${encodeURIComponent(id)}`)).Invoice
      if (capability === 'invoice_lookup') return invoice
      const balance = Number(invoice?.Balance ?? 0)
      return {
        invoiceId: invoice?.Id || id,
        balance,
        totalAmount: Number(invoice?.TotalAmt ?? 0),
        paid: Number.isFinite(balance) && balance <= 0,
        dueDate: invoice?.DueDate || null,
        raw: invoice,
      }
    }

    throw new Error('QUICKBOOKS_CAPABILITY_UNSUPPORTED')
  }
}
