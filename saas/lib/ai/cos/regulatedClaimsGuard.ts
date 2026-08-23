export type RegulatedDomain = 'health' | 'financial' | 'legal'

const SUBJECT: Record<RegulatedDomain, RegExp> = {
  health: /\b(?:medical|device|drug|therapy|treatment|clinical|patient|lifespan|longevity|health|medicine|medycz|lecz|здоров|медицин)/iu,
  financial: /\b(?:invest|return|yield|portfolio|crypto|stock|fund|trading|profit|roi|apy|apr|inwestyc|инвестиц)/iu,
  legal: /\b(?:lawsuit|litigation|court|attorney|lawyer|liability|damages|settlement|compliance|sąd|adwokat|суд|адвокат)/iu,
}

export function regulatedDomainsOf(input: string): RegulatedDomain[] {
  const text = String(input || '')
  return (Object.keys(SUBJECT) as RegulatedDomain[]).filter(domain => SUBJECT[domain].test(text))
}

/** Constraints passed to the reasoner for authoring in a regulated domain. */
export function regulatedClaimsContract(domains: readonly RegulatedDomain[]): string {
  if (!domains.length) return ''
  return [
    `REGULATED-CLAIMS CONSTRAINT: this content touches ${domains.join(', ')}.`,
    'Write the requested artifact. Do not originate unsupported efficacy, safety, return, risk, legal-outcome, or compliance claims.',
    'You may describe intended purpose, mechanism, and features. For any outcome claim, use a clear placeholder that identifies the needed approved labeling, supplied evidence, or legal/regulatory review.',
    'After the artifact, add a brief “Claims withheld” note naming omitted claims and the evidence required. Do not refuse the writing task.',
  ].join('\n')
}
