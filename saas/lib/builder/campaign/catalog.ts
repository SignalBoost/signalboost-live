// saas/lib/builder/campaign/catalog.ts
//
// THE PRODUCTION ACCEPTANCE CAMPAIGN AS DATA. The owner's COS-PAC-001 brief lists twenty checks; this catalog is that
// list, owned by code so a campaign job executes the same checks every time, in order, with the same acceptance rule,
// never a reading of the brief's wording. Each item names the port that can execute it (ports.ts); an item whose port
// the host does not provide is BLOCKED with that cause, never skipped and never counted as PASS.
//
// Pure data, zero imports.

export type CampaignPort =
  | 'analysis'        // one real COS request on the production path, judged by the deterministic answer contract
  | 'fault'           // controlled provider fault against the inference harness in isolation
  | 'routing'         // one real request whose routing decision is read back from the production path
  | 'browser'         // a real browser session against the production site
  | 'observability'   // the turn trace read back from the production records
  | 'governance'      // budget and deadline enforcement read back from the production records
  | 'builder_fixture' // the Builder's own fail → change → pass cycle on a disposable fixture
  | 'release'         // CI and deployment checks for the deployed commit
  | 'reliability'     // N consecutive real analysis requests

export type CampaignItem = Readonly<{
  id: string
  title: string
  requiredResult: string
  port: CampaignPort
  /** For analysis/routing/reliability items: the exact prompt sent. Never modified to make COS pass. */
  prompt?: string
  /** For fault items: the fault scenario. */
  fault?: 'runpod_busy' | 'model_timeout' | 'output_truncation' | 'malformed_output'
  /** For reliability items: how many consecutive requests must succeed. */
  count?: number
}>

/** The original eight-part payment/Kafka incident prompt already employed during COS debugging (the brief forbids replacing it). */
export const PAC_01_PROMPT = [
  'At 14:22 UTC a payment service started returning elevated 5xx errors (peak 18% of requests).',
  'Kafka consumer lag on the payments.events topic climbed from <200 ms to 4–7 minutes at the same time.',
  'CPU and memory on the payment pods remained normal.',
  'The database primary showed a sudden jump in active connections and lock wait time.',
  'A deployment of a new fraud-scoring library had been completed 11 minutes earlier.',
  'No alerts fired for network or disk.',
  'Error messages are generic “upstream timeout”.',
  'Provide a full forensic analysis that covers all eight of the following:',
  '1. Identify plausible root causes.',
  '2. Rank the hypotheses with explanations.',
  '3. Distinguish correlations from causation.',
  '4. Identify the missing evidence and the decisive measurements that would resolve the case.',
  '5. Describe a practical forensic investigation plan.',
  '6. Design experiments that would differentiate the competing explanations.',
  '7. Describe possible interacting failure mechanisms.',
  '8. State your most-likely provisional explanation, including uncertainty level and the verification criteria that would confirm or refute it.',
  'Do not invent measurements or claim you already ran checks. Stay strictly within the given facts and mark uncertainty clearly.',
].join('\n')

const PAC_02_PROMPT = [
  'Incident ticket DB-4471 (format: ops chat transcript).',
  '[09:03] on-call: order_items inserts timing out, p99 went from 40 ms to 9 s at 08:58.',
  '[09:04] on-call: replica lag 0, no failover, disk 61%, autovacuum last ran on order_items 3 days ago.',
  '[09:06] dev: we shipped a migration at 08:55 adding a partial index on order_items(status) where status = \'open\'.',
  '[09:07] on-call: pg_stat_activity shows 140 sessions waiting on a lock held by one session running for 9 minutes.',
  '[09:09] dev: reads on order_items are fine, writes are the problem.',
  'Work the case:',
  '1. Rank the causal hypotheses with the evidence for and against each.',
  '2. Distinguish what is observed from what is assumed in the transcript.',
  '3. Identify the discriminating evidence that would separate the top two hypotheses.',
  '4. Design the experiments or queries that would settle it without worsening the incident.',
  '5. State the most likely working explanation with its uncertainty.',
  'Do not fabricate query results or claim checks you did not run.',
].join('\n')

const PAC_03_PROMPT = [
  'Infrastructure incident report (format: bullet facts).',
  '- 03:40 UTC: 30% of HTTP requests to the api tier return 502 from the edge load balancer.',
  '- Only requests routed to availability zone C fail; zones A and B are healthy.',
  '- Zone C instances pass their health checks every 10 s during the whole window.',
  '- A node-pool upgrade in zone C finished at 03:31; pods were rescheduled with the new CNI plugin version.',
  '- Internal service-to-service calls inside zone C succeed; calls from the edge to zone C pods fail with connection reset.',
  '- No change was deployed to the api application itself.',
  'Deliver:',
  '1. Identify the plausible root causes consistent with every stated fact.',
  '2. Explain which facts rule out the common explanations (bad deploy, capacity, DNS).',
  '3. Rank the remaining hypotheses and state the evidence that would confirm each.',
  '4. Describe a rollback-versus-investigate decision with its criteria.',
  '5. State the most likely explanation and what would refute it.',
  'Stay within the stated facts; mark every inference as such.',
].join('\n')

const PAC_04_PROMPT = [
  'Security investigation brief (format: analyst notes).',
  'Observed: between 22:10 and 22:40 UTC, 1,900 failed logins for 1,900 distinct existing usernames, one attempt each, from 40 IPs in three ASNs.',
  'Observed: 12 of those usernames then logged in successfully from a different IP within 15 minutes.',
  'Observed: the 12 successful sessions each changed the account recovery email and nothing else.',
  'Observed: no password-reset emails were sent during the window; MFA is optional and was off for all 12 accounts.',
  'Observed: the web application firewall logged nothing because the requests were well-formed.',
  'Produce a defensive analysis:',
  '1. Identify the attack hypotheses that fit the pattern and rank them.',
  '2. Distinguish what is observed from what is assumed.',
  '3. Identify the discriminating evidence (logs, headers, timing) that separates credential stuffing from a credential leak and from an application flaw.',
  '4. Design containment and investigation steps in priority order, with the risk each step carries.',
  '5. State the most likely working explanation with uncertainty and the criteria that would confirm or refute it.',
  'Never claim to have run queries or seen data not listed above.',
].join('\n')

const PAC_05_PROMPT = [
  'Business investigation (format: finance memo excerpt).',
  'Q3 trial-to-paid conversion fell from 11.2% to 7.9% while trial sign-ups rose 38%.',
  'Paid churn was flat. Support tickets per trial user doubled. Average time-to-first-value for trials rose from 2 days to 6 days.',
  'In the same quarter: a new paid marketing channel began (video ads), the onboarding checklist was redesigned, and pricing added a cheaper tier.',
  'Sales reports the cheaper tier is where most new conversions land.',
  'Analyze:',
  '1. Identify the competing explanations for the conversion drop and rank them.',
  '2. Distinguish correlation from causation among the three changes.',
  '3. Identify the decisive measurements or segmentations that would separate the explanations.',
  '4. Design the experiments (or cohort cuts) that would settle it within one quarter.',
  '5. State the decision criteria for pausing the video channel, reverting the onboarding redesign, or keeping both.',
  'Do not invent numbers beyond those given.',
].join('\n')

const PAC_06_PROMPT = [
  'Engineering uncertainty case (format: design review question).',
  'A team must decide whether a background job scheduler that currently runs on one process (in-memory queue, ~4,000 jobs/hour, p95 job latency 1.2 s) will hold at 10x load next quarter.',
  'Known: jobs are CPU-light and I/O-heavy; the process is single-threaded; the downstream API has a 100 req/s rate limit per key; no load test exists.',
  'Unknown: job size distribution, the downstream API\'s latency under load, and whether jobs are independent.',
  'Reason it through:',
  '1. Identify the plausible bottlenecks at 10x load and rank them by likelihood.',
  '2. Distinguish what is known from what is unknown, and state which unknowns matter most.',
  '3. Identify the measurements that would reduce the largest uncertainties first.',
  '4. Design a load test and a staged migration plan with the signals that would stop it.',
  '5. State a provisional recommendation with its uncertainty and the criteria that would reverse it.',
  'Do not invent measurements; reason explicitly from the stated facts and the stated unknowns.',
].join('\n')

const PAC_12_PROMPT = [
  'Routing check (format: short request). Investigate why a nightly report job finished 40 minutes late on three of the last five nights while CPU, memory and queue depth looked normal.',
  '1. Rank the plausible causes.',
  '2. Identify the evidence that would separate them.',
  '3. Describe the investigation plan.',
].join('\n')

export const PAC_CATALOG: readonly CampaignItem[] = Object.freeze([
  { id: 'PAC-01', title: 'Eight-part forensic investigation', requiredResult: 'All eight deliverables answered', port: 'analysis', prompt: PAC_01_PROMPT },
  { id: 'PAC-02', title: 'Unseen database incident', requiredResult: 'Ranked causal hypotheses and experiments', port: 'analysis', prompt: PAC_02_PROMPT },
  { id: 'PAC-03', title: 'Unseen infrastructure incident', requiredResult: 'Evidence-driven root-cause analysis', port: 'analysis', prompt: PAC_03_PROMPT },
  { id: 'PAC-04', title: 'Unseen cybersecurity investigation', requiredResult: 'Hypothesis-based defensive analysis', port: 'analysis', prompt: PAC_04_PROMPT },
  { id: 'PAC-05', title: 'Business investigation', requiredResult: 'Competing explanations and decision criteria', port: 'analysis', prompt: PAC_05_PROMPT },
  { id: 'PAC-06', title: 'Engineering uncertainty', requiredResult: 'Technical reasoning without invented measurements', port: 'analysis', prompt: PAC_06_PROMPT },
  { id: 'PAC-07', title: 'RunPod busy', requiredResult: 'Governed recovery or bounded failure', port: 'fault', fault: 'runpod_busy' },
  { id: 'PAC-08', title: 'Model timeout', requiredResult: 'No uncontrolled retry loop', port: 'fault', fault: 'model_timeout' },
  { id: 'PAC-09', title: 'Output-length truncation', requiredResult: 'Complete recovered answer or honest terminal failure', port: 'fault', fault: 'output_truncation' },
  { id: 'PAC-10', title: 'Malformed model output', requiredResult: 'Safe parsing and bounded recovery', port: 'fault', fault: 'malformed_output' },
  { id: 'PAC-11', title: 'Answer acceptance contract', requiredResult: 'Reject incomplete, duplicated, or generic responses', port: 'analysis', prompt: PAC_01_PROMPT },
  { id: 'PAC-12', title: 'Correct routing', requiredResult: 'Investigation never enters Builder as coding work', port: 'routing', prompt: PAC_12_PROMPT },
  { id: 'PAC-13', title: 'Playwright browser workflow', requiredResult: 'Actual submitted request reaches final response', port: 'browser' },
  { id: 'PAC-14', title: 'Conversation History', requiredResult: 'Completed results persist after refresh and return', port: 'browser' },
  { id: 'PAC-15', title: 'Cancellation and recovery', requiredResult: 'No unintended duplicate execution', port: 'browser' },
  { id: 'PAC-16', title: 'Observability', requiredResult: 'Complete correlated request trace', port: 'observability' },
  { id: 'PAC-17', title: 'Budget and deadline enforcement', requiredResult: 'No configured limit bypass', port: 'governance' },
  { id: 'PAC-18', title: 'Builder V2 integration', requiredResult: 'Verified fail/change/pass cycle in isolation', port: 'builder_fixture' },
  { id: 'PAC-19', title: 'CI and deployment checks', requiredResult: 'All required checks green', port: 'release' },
  { id: 'PAC-20', title: 'Production reliability', requiredResult: '20 consecutive successful analytical requests', port: 'reliability', prompt: PAC_01_PROMPT, count: 20 },
])

export const PAC_CAMPAIGN_ID = 'COS-PAC-001'

/**
 * Whether a request carries the campaign's own identifier. This is a lookup against the identifier the catalog
 * owns, as exact as a command, not a reading of the request's wording: the owner pasting the campaign document
 * (which names COS-PAC-001) is asking for that campaign.
 */
export function namesVerificationCampaign(request: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9-])${PAC_CAMPAIGN_ID}(?![A-Za-z0-9-])`).test(String(request || ''))
}
