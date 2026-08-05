// saas/portable-kernel/facts.ts
// FACTUAL DISCIPLINE — shared by every portable that generates text on a company's behalf.
//
// Why: a live press run produced a release naming a product that does not exist, because the
// generator had no company context and filled the gap. The same shape of bug lives anywhere a
// missing fact gets a silent default. Context alone is not the cure — a better-informed model
// invents less often but more convincingly. The cure is an explicit rule plus a visible gap.
import type { CompanyFacts } from './types.ts'

export const FACTUAL_DISCIPLINE = [
  'FACTUAL DISCIPLINE — these rules override every other instruction:',
  '1. Never invent a product name, brand name, company name, person, job title, quote, statistic, price, customer count, award, partnership, or date. If a fact was not supplied, you may not state it.',
  '2. When a fact is required by the format but was not supplied, write a visible placeholder in square brackets — [PRODUCT NAME], [SPOKESPERSON NAME], [DATE], [METRIC] — and continue. A visible gap is correct; an invented detail is a failure.',
  '3. Use only the approved quote, verbatim, if one was supplied. If none was supplied, OMIT the quote paragraph entirely — no quotation marks, no [SPOKESPERSON QUOTE] placeholder, no attributed sentence. Rule 2\'s placeholder mechanism does not apply to quotes: an empty quote is not a missing fact, it is a fact (there is no quote).',
  '4. Do not state results, performance, or comparative claims ("the leading", "the first", "reduces costs by") unless that exact claim appears in the permitted claims.',
  '5. Prefer omitting a sentence over guessing its content. A shorter, entirely true text is the goal.',
].join('\n')

// Render the supplied facts as an explicit allow-list for the model.
export function renderCompanyFacts(facts?: CompanyFacts | null): string {
  if (!facts) return 'COMPANY FACTS: none supplied. Use placeholders for every company-specific detail.'
  const lines: string[] = []
  const push = (label: string, value?: string) => { if (value && value.trim()) lines.push(`- ${label}: ${value.trim()}`) }

  push('Legal name', facts.legalName)
  push('Brand name', facts.brandName)
  push('Website', facts.website)
  // One product per line. A products entry may carry a description after an em-dash
  // ("Self-Healing Supervisor Software — monitors operations, snapshots state before
  // acting, gates risky operations behind sign-off"), and that description is then the
  // ONLY thing the model may say the product does. Joining with commas destroyed exactly
  // this structure, which left the model knowing the names and inventing the capabilities
  // — a release once told editors the Supervisor "corrects AI-generated content", a
  // product that does not exist.
  if (facts.products?.length) {
    lines.push('- Product names you may use (and ONLY these). Where a line carries a description after the dash, that description is the complete statement of what the product does — state nothing beyond it:')
    for (const product of facts.products) lines.push(`    · ${product}`)
  }
  push('Boilerplate (use verbatim as the About paragraph)', facts.boilerplate)
  push('Dateline city (press releases open "CITY, DATE —" with this city)', facts.datelineCity)
  if (facts.spokespersonName) push('Spokesperson', `${facts.spokespersonName}${facts.spokespersonTitle ? `, ${facts.spokespersonTitle}` : ''}`)
  if (facts.mediaContactName || facts.mediaContactEmail) {
    push('Media contact (for the Media Contact block)', [facts.mediaContactName, facts.mediaContactTitle, facts.mediaContactEmail, facts.mediaContactPhone].filter(Boolean).join(', '))
  }
  push('Approved quote (use verbatim or not at all)', facts.approvedQuote)
  if (facts.permittedClaims?.length) lines.push(`- Permitted claims (only these may be stated): ${facts.permittedClaims.join(' | ')}`)
  if (facts.forbiddenClaims?.length) lines.push(`- Forbidden claims (never state): ${facts.forbiddenClaims.join(' | ')}`)

  if (!lines.length) return 'COMPANY FACTS: none supplied. Use placeholders for every company-specific detail.'
  return ['COMPANY FACTS — the complete set of company details you may state:', ...lines].join('\n')
}

// The full factual preamble a host prepends to ANY generation system prompt, in any portable.
export function buildFactualPreamble(facts?: CompanyFacts | null): string {
  return `${renderCompanyFacts(facts)}\n\n${FACTUAL_DISCIPLINE}`
}

// Placeholders left in generated text, so a UI can stop an owner sending an unfilled gap.
export function findPlaceholders(text: string): string[] {
  const found = String(text || '').match(/\[[A-Z][A-Z0-9 _/-]{2,40}\]/g)
  return found ? Array.from(new Set(found)) : []
}

// A brand name is never silently replaced with the seller's. If the host cannot say who it
// works for, the text carries a visible gap instead of somebody else's trademark.
export function brandOrPlaceholder(name?: string | null): string {
  const value = String(name || '').trim()
  return value || '[BRAND NAME]'
}
