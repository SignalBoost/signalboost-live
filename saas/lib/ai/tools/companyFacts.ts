// saas/lib/ai/tools/companyFacts.ts
//
// THE COMPANY FACTS RECORD, WRITABLE BY COS.
//
// This record is the allow-list the press generator may state: brand and legal name,
// website, the product names it is permitted to use, the boilerplate, the spokesperson,
// the approved quote, and the permitted / forbidden claims. Anything missing comes out
// of a release as a visible [PLACEHOLDER] instead of an invented detail — which is
// correct, and which also means an empty record produces a stack of unusable drafts.
//
// WHY THIS FILE EXISTS: the record could only ever be filled by a human typing into the
// cockpit form. So every time it mattered, the honest advice was "go and fill in the
// form" — and the owner's standing instruction is that this platform is AI-driven, not
// a set of forms he fills in himself. He was right: there was no tool, so COS could not
// do it even when it knew the answers. Now there is.
//
// WHAT IS AND IS NOT DERIVABLE — the distinction that keeps this honest:
//
//   Derivable, because it is FIRST-PARTY FACT the company publishes about itself:
//   brand name, legal name, website, product names, boilerplate. COS should read these
//   from the company's own site (getExternalInfo) and from the platform's own product
//   catalog, never from what the model remembers about the company.
//
//   NOT derivable, ever: the approved quote and the person it is attributed to. A quote
//   is a person saying words. No source can supply one, and the release engine is built
//   to write no quote at all rather than invent one. COS may DRAFT a quote and show it;
//   it becomes real only when the owner says yes, because at that point he said it.
//
// So `save` is a write the owner has to authorise in the conversation — the tool
// description tells the model to show the exact values first. That is the same shape as
// everything else here: the AI prepares, the human releases.

import { getAdminSupabase } from '@/utils/supabase/server'

export interface CompanyFactsInput {
  legalName?: string
  brandName?: string
  website?: string
  products?: string          // newline-separated
  boilerplate?: string
  spokespersonName?: string
  spokespersonTitle?: string
  approvedQuote?: string
  permittedClaims?: string   // newline-separated
  forbiddenClaims?: string   // newline-separated
  datelineCity?: string
  mediaContactName?: string
  mediaContactTitle?: string
  mediaContactEmail?: string
  mediaContactPhone?: string
}

export interface CompanyFactsResult {
  ok: boolean
  saved?: string[]
  missing?: string[]
  warnings?: string[]
  error?: string
}

function str(value: unknown, max = 4_000): string {
  return String(value ?? '').replace(/\r/g, '').trim().slice(0, max)
}

function lines(value: unknown): string[] {
  return str(value).split('\n').map(l => l.trim()).filter(Boolean)
}

/** Read the current record, as plain text COS can quote back to the owner. */
export async function readCompanyFacts(): Promise<{ ok: boolean; text: string; empty: boolean; error?: string }> {
  try {
    const db = getAdminSupabase()
    const { data, error } = await db.from('press_company_profile').select('*').limit(1)
    if (error) return { ok: false, text: '', empty: true, error: error.message }
    const row = (Array.isArray(data) ? data[0] : null) || null
    if (!row) return { ok: true, text: 'No company facts are saved. Every company-specific detail in a generated release will appear as a visible [PLACEHOLDER].', empty: true }

    const out: string[] = []
    const push = (label: string, value: unknown) => { const v = str(value); if (v) out.push(`- ${label}: ${v}`) }
    push('Legal name', row.legal_name)
    push('Brand name', row.brand_name)
    push('Website', row.website)
    push('Products', row.products)
    push('Boilerplate', row.boilerplate)
    push('Spokesperson', [str(row.spokesperson_name), str(row.spokesperson_title)].filter(Boolean).join(', '))
    push('Approved quote', row.approved_quote)
    push('Permitted claims', row.permitted_claims)
    push('Forbidden claims', row.forbidden_claims)
    push('Dateline city', row.dateline_city)
    push('Media contact', [row.media_contact_name, row.media_contact_title, row.media_contact_email, row.media_contact_phone].map((v: unknown) => str(v)).filter(Boolean).join(', '))

    const missing = missingFields(row)
    return {
      ok: true,
      empty: !out.length,
      text: [
        out.length ? 'CURRENT COMPANY FACTS:' : 'The company facts record exists but is empty.',
        ...out,
        missing.length ? `\nStill missing (these become [PLACEHOLDER] in every release): ${missing.join(', ')}.` : '\nEvery field is filled.',
      ].join('\n'),
    }
  } catch (error: any) {
    return { ok: false, text: '', empty: true, error: error?.message || 'read_failed' }
  }
}

function missingFields(row: any): string[] {
  const want: Array<[string, unknown]> = [
    ['brand name', row?.brand_name],
    ['legal name', row?.legal_name],
    ['website', row?.website],
    ['product names', row?.products],
    ['boilerplate', row?.boilerplate],
    ['spokesperson', row?.spokesperson_name],
    ['approved quote', row?.approved_quote],
    ['permitted claims', row?.permitted_claims],
    ['forbidden claims', row?.forbidden_claims],
    ['dateline city', row?.dateline_city],
    ['media contact email', row?.media_contact_email],
  ]
  return want.filter(([, v]) => !str(v)).map(([label]) => label)
}

/**
 * Write the record. Only the fields supplied are changed; anything omitted keeps its
 * existing value, so COS can fill the derivable fields now and the quote later without
 * wiping what is already there.
 */
export async function saveCompanyFacts(input: CompanyFactsInput): Promise<CompanyFactsResult> {
  try {
    const db = getAdminSupabase()
    const { data } = await db.from('press_company_profile').select('*').limit(1)
    const current = (Array.isArray(data) ? data[0] : null) || {}

    const warnings: string[] = []

    // A quote needs someone to have said it. Saving words with no name attached is how
    // "said a SignalBoost spokesperson" reaches an editor — refuse rather than allow it.
    const quote = str(input.approvedQuote, 1_200)
    const speaker = str(input.spokespersonName, 200) || str(current.spokesperson_name, 200)
    if (quote && !speaker) {
      return { ok: false, error: 'An approved quote needs a spokesperson name. A quote with nobody attached cannot be published — supply spokespersonName, or leave the quote empty and the release will carry no quote at all.' }
    }

    const next: Record<string, unknown> = { singleton: true, updated_at: new Date().toISOString() }
    const set = (column: string, value: string | undefined, currentValue: unknown) => {
      const v = value === undefined ? undefined : str(value)
      next[column] = v === undefined ? (currentValue ?? null) : (v || null)
    }

    set('legal_name', input.legalName, current.legal_name)
    set('brand_name', input.brandName, current.brand_name)
    set('website', input.website, current.website)
    set('products', input.products, current.products)
    set('boilerplate', input.boilerplate, current.boilerplate)
    set('spokesperson_name', input.spokespersonName, current.spokesperson_name)
    set('spokesperson_title', input.spokespersonTitle, current.spokesperson_title)
    set('approved_quote', input.approvedQuote, current.approved_quote)
    set('permitted_claims', input.permittedClaims, current.permitted_claims)
    set('forbidden_claims', input.forbiddenClaims, current.forbidden_claims)
    set('dateline_city', input.datelineCity, current.dateline_city)
    set('media_contact_name', input.mediaContactName, current.media_contact_name)
    set('media_contact_title', input.mediaContactTitle, current.media_contact_title)
    set('media_contact_email', input.mediaContactEmail, current.media_contact_email)
    set('media_contact_phone', input.mediaContactPhone, current.media_contact_phone)

    if (!str(next.brand_name) && !str(next.legal_name)) {
      return { ok: false, error: 'A brand name or a legal name is required — the generator cannot name the company otherwise.' }
    }

    // Permitted claims are an ALLOW-LIST: a claim not on it may not be stated. An empty
    // list is therefore the safest possible setting, not a gap — say so rather than
    // letting it read as something forgotten.
    if (!lines(next.permitted_claims).length) {
      warnings.push('No permitted claims are set, so the release may state no result, performance or comparative claim at all. That is safe; add claims only when you can stand behind each one.')
    }
    if (!str(next.approved_quote)) {
      warnings.push('No approved quote is set, so releases will carry no quote rather than an invented one.')
    }

    const { error } = await db.from('press_company_profile').upsert(next, { onConflict: 'singleton' })
    if (error) return { ok: false, error: error.message }

    const saved = Object.keys(next)
      .filter(k => k !== 'singleton' && k !== 'updated_at' && str(next[k]))
      .map(k => k.replace(/_/g, ' '))

    return { ok: true, saved, missing: missingFields(next), warnings }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'save_failed' }
  }
}
