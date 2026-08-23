// Request-specific discipline for hypothetical operational incidents and regulated decision systems
// that touch mutable law or regulatory obligations. The goal is to preserve useful governance
// reasoning without letting an ordinary conceptual answer invent current statutory deadlines,
// classifications, thresholds, or applicability rules.

const INCIDENT = /\b(?:cyberattack|cyber\s+attack|data\s+breach|security\s+incident|ransomware|intrusion|outage|compromise)\b/i
const OPERATIONS = /\b(?:operations?|recovery|restore|restoration|shipments?|logistics|supply\s+chain|continuity|containment|forensic|incident\s+response)\b/i
const REGULATORY = /\b(?:regulat(?:ory|ion)|reporting|notification|jurisdiction|jurisdictions|privacy\s+law|data\s+protection|gdpr|pipl|appi|pdpa|supervisory\s+authorit|regulator)\b/i

const EMPLOYMENT_AI = /\b(?:hiring|recruit(?:ing|ment)|employment|job\s+applicant|candidate|resume|résumé|screening|selection|promotion|termination)\b/i
const AI_SYSTEM = /\b(?:ai|artificial\s+intelligence|algorithm(?:ic)?|automated\s+(?:decision|screening|selection)|model|machine\s+learning)\b/i
const EMPLOYMENT_GOVERNANCE = /\b(?:fairness|bias|disparate\s+impact|discrimination|protected\s+(?:class|group)|compliance|eeoc|equal\s+employment\s+opportunity|eu\s+ai\s+act|ai\s+act|employment\s+law|anti[- ]discrimination|human\s+oversight|explainab(?:ility|le))\b/i

function incidentDirective(): string {
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

function employmentAiDirective(): string {
  return [
    'REGULATED EMPLOYMENT AI MODE: EFFICIENCY IS SUBORDINATE TO VERIFIED FAIRNESS, VALIDITY, HUMAN ACCOUNTABILITY, AND CURRENT-LAW EVIDENCE.',
    'Answer the governance/design question directly, but separate timeless engineering controls from mutable legal claims.',
    'Do not state the current EU AI Act classification, implementation status, article-level duty, prohibited-practice rule, human-oversight requirement, documentation duty, or enforcement consequence from model memory. Do not state a current EEOC legal threshold, safe harbor, reporting duty, validation requirement, or enforcement rule from model memory.',
    'Any exact claim about what the EU AI Act, EEOC, Title VII, ADA, ADEA, Uniform Guidelines, or another employment rule currently requires must be supported by authoritative live evidence from the relevant primary authority before it is presented as law.',
    'Do not treat the four-fifths/80% selection-rate rule, demographic parity, equalized odds, or any single fairness metric as a universal legal compliance threshold or proof of fairness. Metrics are diagnostics whose relevance depends on the decision, job, population, validation method, and governing law.',
    'Use a governance framework: define the legitimate job-related objective; validate inputs and outcomes; test for disparate impact and proxy effects; document data provenance and model changes; preserve meaningful human review and override; provide accommodation/contest paths where applicable; monitor drift and subgroup outcomes; and keep an auditable decision record.',
    'Measure efficiency separately from fairness and compliance guardrails. Faster screening, lower recruiter workload, or lower cost is not a successful optimization if protected-group outcomes, job-related validity, accessibility, or accountable review deteriorate.',
    'When current legal specifics are needed, say they require live verification against authoritative EU and U.S. sources and qualified employment/privacy counsel. Do not collapse the entire answer to a refusal; provide the timeless governance architecture and clearly mark the legal details that remain to be verified.',
  ].join(' ')
}

export function regulatedOperationalScenarioDirective(prompt: string): string | null {
  const input = String(prompt ?? '').slice(0, 12_000)
  if (INCIDENT.test(input) && OPERATIONS.test(input) && REGULATORY.test(input)) return incidentDirective()
  if (EMPLOYMENT_AI.test(input) && AI_SYSTEM.test(input) && EMPLOYMENT_GOVERNANCE.test(input)) return employmentAiDirective()
  return null
}
