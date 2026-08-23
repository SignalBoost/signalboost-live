// Request-specific discipline for hypothetical operational incidents that also touch mutable law or
// regulatory obligations. The goal is to preserve useful recovery/governance reasoning without
// letting an ordinary conceptual answer invent current statutory deadlines or applicability rules.

const INCIDENT = /\b(?:cyberattack|cyber\s+attack|data\s+breach|security\s+incident|ransomware|intrusion|outage|compromise)\b/i
const OPERATIONS = /\b(?:operations?|recovery|restore|restoration|shipments?|logistics|supply\s+chain|continuity|containment|forensic|incident\s+response)\b/i
const REGULATORY = /\b(?:regulat(?:ory|ion)|reporting|notification|jurisdiction|jurisdictions|privacy\s+law|data\s+protection|gdpr|pipl|appi|pdpa|supervisory\s+authorit|regulator)\b/i

export function regulatedOperationalScenarioDirective(prompt: string): string | null {
  const input = String(prompt ?? '').slice(0, 12_000)
  if (!INCIDENT.test(input) || !OPERATIONS.test(input) || !REGULATORY.test(input)) return null
  return [
    'REGULATED INCIDENT MODE: PARALLEL RECOVERY AND COMPLIANCE, WITH CURRENT-LAW CLAIMS EVIDENCE-BOUNDED.',
    'Answer the operational/governance question directly: separate containment and service recovery from legal/regulatory assessment, run them in parallel, preserve forensic evidence, maintain a unified decision log, map affected systems/data/people to jurisdictions, and assign explicit owners and escalation points.',
    'Do not assert a current statutory deadline, named regulator requirement, jurisdictional applicability rule, or legal conclusion unless authoritative live evidence supporting that exact claim is present in the prompt.',
    'If exact current obligations are not live-verified, say they require jurisdiction-specific verification by qualified legal/privacy counsel and the relevant authoritative source; do not fill the gap from model memory.',
    'Distinguish operational facts (where service is disrupted) from data-impact facts (what data/systems were affected) and from legal conclusions (which notification duties actually attach). Geography of operational impact alone does not prove the scope of a reporting duty.',
    'Prefer a decision framework over legal trivia: preserve evidence first, recover by criticality and safe restoration criteria, build a jurisdiction matrix, track when awareness/impact facts become known, and update notifications as verified facts develop.',
    'Do not collapse the whole answer to a refusal merely because current law is mutable. Provide the timeless incident-governance framework and clearly mark any legal specifics that require live verification.',
  ].join(' ')
}
