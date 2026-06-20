// saas/lib/hub/audit-pricing-provision.ts
//
// One-shot provisioning for audit pricing. Fired by the hub template
// `audit.provision_pricing` (owner-approved via /hub/prs → /api/hub/action).
//
// It does the full four-step pipeline server-side, so the Stripe price ids it
// creates flow straight into Vercel and the Vault without any human relay:
//   1. Read the tiers + amounts + env-var names from lib/audit/pricingConfig.ts.
//   2. For each tier: create (or refresh) a Stripe product + recurring price.
//   3. Write that price id into the tier's NEXT_PUBLIC_* Vercel variable.
//   4. Record the key in the Vault (vault_items + vault_audit).
//
// Idempotent: a Stripe `lookup_key` per tier lets re-runs reuse the existing
// price; a new price is only created when the configured amount changed.

import { createClient } from '@supabase/supabase-js'
import { vaultEncrypt } from '@/lib/vault/crypto'
import { AUDIT_PRICING_CONFIG } from '@/lib/audit/pricingConfig'

const STRIPE = 'https://api.stripe.com'
const VERCEL = 'https://api.vercel.com'
const VAULT_OWNER = '00000000-0000-0000-0000-000000000000'
const VAULT_PROVIDER = 'Stripe (Audit Pricing)'

type StripeOutcome = 'reused' | 'created' | 'repriced' | 'error'
type VercelOutcome = 'set' | 'updated' | 'skipped' | 'error'
type VaultOutcome = 'stored' | 'skipped' | 'error'

interface TierResult {
  tier: string
  envKey: string
  amount: number
  priceId?: string
  stripe: StripeOutcome
  vercel: VercelOutcome
  vault: VaultOutcome
  error?: string
}

function titleFor(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

async function stripePost(path: string, apiKey: string, params: Record<string, string>) {
  const res = await fetch(STRIPE + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const text = await res.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch { /* keep raw text */ }
  return { ok: res.ok, status: res.status, json, text }
}

export async function provisionAuditPricing(): Promise<{ ok: boolean; message?: string; data?: unknown; error?: string }> {
  const apiKey = process.env.STRIPE_SECRET_KEY
  const vToken = process.env.VERCEL_TOKEN
  const vProject = process.env.VERCEL_HUB_PROJECT
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!apiKey) return { ok: false, error: 'STRIPE_SECRET_KEY not set' }
  if (!vToken || !vProject) return { ok: false, error: 'Vercel not configured (VERCEL_TOKEN / VERCEL_HUB_PROJECT)' }
  if (!sbUrl || !sbKey) return { ok: false, error: 'Supabase admin not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' }

  const teamId = process.env.VERCEL_TEAM_ID
  const withTeam = (u: string) =>
    teamId ? u + (u.includes('?') ? '&' : '?') + 'teamId=' + encodeURIComponent(teamId) : u
  const targets = ['production', 'preview', 'development']
  const admin = createClient(sbUrl, sbKey)

  const results: TierResult[] = []

  for (const tier of AUDIT_PRICING_CONFIG.tiers) {
    const cents = Math.round(Number(tier.monthlyPrice) * 100)
    const lookupKey = 'audit_' + tier.id
    const r: TierResult = {
      tier: tier.id,
      envKey: tier.stripePriceEnvKey,
      amount: tier.monthlyPrice,
      stripe: 'error',
      vercel: 'skipped',
      vault: 'skipped',
    }

    try {
      // ---- Step 2: Stripe (find existing price by lookup_key, then reuse/reprice/create) ----
      const findRes = await fetch(
        STRIPE + '/v1/prices?lookup_keys[]=' + encodeURIComponent(lookupKey) + '&active=true&limit=1',
        { headers: { 'Authorization': 'Bearer ' + apiKey } },
      )
      const findJson: any = await findRes.json().catch(() => ({}))
      const existing = Array.isArray(findJson?.data) ? findJson.data[0] : undefined

      let priceId = ''
      if (existing && Number(existing.unit_amount) === cents) {
        priceId = String(existing.id)
        r.stripe = 'reused'
      } else {
        // Reuse the existing price's product when repricing; otherwise create one.
        let productId = existing && existing.product ? String(existing.product) : ''
        if (!productId) {
          const prod = await stripePost('/v1/products', apiKey, {
            name: 'SignalBoost Audit — ' + titleFor(tier.id),
            'metadata[signalboost_audit_tier]': tier.id,
          })
          if (!prod.ok) { r.error = 'product: ' + prod.text.slice(0, 300); results.push(r); continue }
          productId = String(prod.json.id)
        }
        const price = await stripePost('/v1/prices', apiKey, {
          product: productId,
          currency: 'usd',
          unit_amount: String(cents),
          'recurring[interval]': 'month',
          lookup_key: lookupKey,
          transfer_lookup_key: 'true',
          'metadata[signalboost_audit_tier]': tier.id,
        })
        if (!price.ok) { r.error = 'price: ' + price.text.slice(0, 300); results.push(r); continue }
        priceId = String(price.json.id)
        r.stripe = existing ? 'repriced' : 'created'
        // Best-effort: deactivate the old price now that its lookup_key has moved.
        if (existing && existing.id) {
          await stripePost('/v1/prices/' + existing.id, apiKey, { active: 'false' }).catch(() => null)
        }
      }
      r.priceId = priceId

      // ---- Step 3: Vercel (upsert the tier's NEXT_PUBLIC_* variable) ----
      const createRes = await fetch(withTeam(VERCEL + '/v9/projects/' + vProject + '/env'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + vToken },
        body: JSON.stringify({ key: tier.stripePriceEnvKey, value: priceId, type: 'encrypted', target: targets }),
      })
      if (createRes.ok) {
        r.vercel = 'set'
      } else {
        const eTxt = await createRes.text().catch(() => '')
        const exists = createRes.status === 400 || createRes.status === 409 || /exist/i.test(eTxt)
        if (!exists) {
          r.vercel = 'error'; r.error = 'vercel: ' + eTxt.slice(0, 300)
        } else {
          const listRes = await fetch(withTeam(VERCEL + '/v9/projects/' + vProject + '/env'), {
            headers: { 'Authorization': 'Bearer ' + vToken },
          })
          const listJson: any = await listRes.json().catch(() => ({}))
          const envs = Array.isArray(listJson?.envs) ? listJson.envs : (Array.isArray(listJson) ? listJson : [])
          const ex = envs.find((e: any) => e && e.key === tier.stripePriceEnvKey)
          if (ex && ex.id) {
            const patchRes = await fetch(withTeam(VERCEL + '/v9/projects/' + vProject + '/env/' + encodeURIComponent(ex.id)), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + vToken },
              body: JSON.stringify({ value: priceId, target: targets }),
            })
            if (patchRes.ok) { r.vercel = 'updated' }
            else { r.vercel = 'error'; r.error = 'vercel: ' + (await patchRes.text().catch(() => '')).slice(0, 300) }
          } else {
            r.vercel = 'error'; r.error = 'vercel: variable exists but its id was not found'
          }
        }
      }

      // ---- Step 4: Vault (record the key, encrypted) ----
      try {
        const enc = vaultEncrypt(priceId)
        if (!enc.ok) {
          r.vault = 'error'; r.error = (r.error ? r.error + ' | ' : '') + 'vault: ' + (enc.error || 'encrypt failed')
        } else {
          const { data: row } = await admin
            .from('vault_items')
            .select('id')
            .eq('provider', VAULT_PROVIDER)
            .eq('label', tier.stripePriceEnvKey)
            .maybeSingle()
          if (row && row.id) {
            await admin.from('vault_items').update({
              value_encrypted: enc.valueEncrypted, iv: enc.iv, tag: enc.tag,
              last4: priceId.slice(-4), status: 'active',
            }).eq('id', row.id)
          } else {
            await admin.from('vault_items').insert({
              owner_id: VAULT_OWNER,
              provider: VAULT_PROVIDER,
              label: tier.stripePriceEnvKey,
              value_encrypted: enc.valueEncrypted, iv: enc.iv, tag: enc.tag,
              last4: priceId.slice(-4), expires_at: null, status: 'active',
            })
          }
          await admin.from('vault_audit')
            .insert({ actor: 'console', action: 'add', provider: VAULT_PROVIDER, label: tier.stripePriceEnvKey })
            .then(() => {}, () => {})
          r.vault = 'stored'
        }
      } catch (ve: any) {
        r.vault = 'error'; r.error = (r.error ? r.error + ' | ' : '') + 'vault: ' + (ve && ve.message ? ve.message : 'write failed')
      }
    } catch (err: any) {
      r.error = (r.error ? r.error + ' | ' : '') + (err && err.message ? err.message : 'unexpected error')
    }

    results.push(r)
  }

  const allOk = results.every(r =>
    (r.stripe === 'reused' || r.stripe === 'created' || r.stripe === 'repriced') &&
    r.vercel !== 'error' && r.vault !== 'error',
  )
  const summary = results.map(r =>
    r.tier + ' $' + r.amount + ': stripe=' + r.stripe + (r.priceId ? ' (' + r.priceId + ')' : '') +
    ', vercel=' + r.vercel + ', vault=' + r.vault + (r.error ? ' — ' + r.error : ''),
  ).join('  |  ')

  return {
    ok: allOk,
    message: 'Audit pricing — ' + summary + '. ' +
      (allOk
        ? 'All tiers provisioned. A redeploy is required for the new Vercel variables to take effect.'
        : 'Some steps failed (see above). Safe to re-run — it is idempotent and will reuse what already succeeded.'),
    data: { results, redeployRequired: true },
  }
}
