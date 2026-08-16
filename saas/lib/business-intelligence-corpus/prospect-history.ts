import { getAdminSupabase } from '@/utils/supabase/server'
import { normalizeDomain, type BusinessIntelligenceRecord } from './contracts.ts'
import { corpusCount, lookupCorpus, upsertCorpusRecord } from './service.ts'

const DAY_MS = 86_400_000
const PAGE_SIZE = 200
const LOOKUP_BATCH_SIZE = 20
const SECOND_LEVEL_SUFFIXES = new Set(['com.br', 'co.uk', 'com.au', 'co.jp', 'co.in', 'com.mx', 'co.nz'])
const BLOCKED_HOST_PREFIXES = new Set(['blog', 'news', 'support', 'docs', 'careers', 'jobs', 'community', 'forum', 'help', 'servicos'])
const BLOCKED_ROOT_SUFFIXES = ['.gov', '.mil', '.edu', '.org']
const BLOCKED_TRACKING_HOSTS = new Set(['awin1.com', 'tpo.lv', 'ad.admitad.com'])
const GENERIC_NAMES = new Set(['home', 'company', 'companies', 'contact', 'about', 'services', 'solutions', 'welcome'])
const TITLE_LIKE = /(\btop\b|\bbest\b|\bwatch\b|\bedition\b|\bcomparison\b|\bcompanies\b|\bstartups\b|\bservices in\b|\bcompany in\b|\bdevelopment company\b|\bconsulting companies\b|\bmanaged service providers\b|\b202\d\b|\[[^\]]+\]|:|\?|\|)/i

export type ProspectHistoryObservation = Readonly<{
  jobId: string
  name: string
  url: string
  snippet?: string | null
  detail?: string | null
  outcome?: string | null
  observedAt?: string | null
  region?: string | null
  language?: string | null
}>

export type ValidatedProspectCandidate = Readonly<{
  record: BusinessIntelligenceRecord
  evidenceRows: number
  distinctCampaignJobs: number
  sameDomainContactEvidence: number
  descriptionEvidenceRows: number
}>

function identityKey(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function registrableRootParts(host: string): { rootLabel: string; isRootHost: boolean } | null {
  const labels = host.split('.').filter(Boolean)
  if (labels.length < 2) return null
  const suffix2 = labels.slice(-2).join('.')
  if (SECOND_LEVEL_SUFFIXES.has(suffix2)) {
    if (labels.length < 3) return null
    return { rootLabel: labels[labels.length - 3], isRootHost: labels.length === 3 }
  }
  return { rootLabel: labels[labels.length - 2], isRootHost: labels.length === 2 }
}

function isBlockedHost(host: string): boolean {
  if (BLOCKED_TRACKING_HOSTS.has(host) || host.endsWith('.tpo.lv')) return true
  const first = host.split('.')[0]
  if (BLOCKED_HOST_PREFIXES.has(first)) return true
  return BLOCKED_ROOT_SUFFIXES.some(suffix => host.endsWith(suffix) || host.includes(`${suffix}.`))
}

function cleanEmail(value: unknown): string | undefined {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined
}

function cleanSnippet(value: unknown): string | undefined {
  const snippet = String(value || '').replace(/\s+/g, ' ').trim()
  return snippet.length >= 20 ? snippet.slice(0, 1200) : undefined
}

function observationIdentity(observation: ProspectHistoryObservation) {
  const host = normalizeDomain(observation.url)
  if (!host || !host.includes('.') || isBlockedHost(host)) return null
  const root = registrableRootParts(host)
  if (!root?.isRootHost) return null

  const name = String(observation.name || '').trim()
  if (name.length < 2 || name.length > 80 || name.split(/\s+/).length > 6) return null
  if (GENERIC_NAMES.has(name.toLowerCase()) || TITLE_LIKE.test(name)) return null

  const rootKey = identityKey(root.rootLabel)
  const nameKey = identityKey(name)
  if (rootKey.length < 4 || !nameKey) return null
  if (!(nameKey === rootKey || nameKey.startsWith(rootKey) || rootKey.startsWith(nameKey))) return null

  const email = cleanEmail(observation.detail)
  const sameDomainEmail = Boolean(email && email.split('@')[1] === host && observation.outcome === 'drafted')
  return { host, name, email: sameDomainEmail ? email : undefined, snippet: cleanSnippet(observation.snippet) }
}

function bestName(observations: Array<{ name: string }>): string {
  const counts = new Map<string, number>()
  for (const item of observations) counts.set(item.name, (counts.get(item.name) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0]?.[0] || ''
}

function bestDescription(values: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0]?.[0]
}

function confidenceForEvidence(jobs: number, sameDomainContacts: number): number {
  if (sameDomainContacts > 0 && jobs >= 2) return 0.92
  if (sameDomainContacts > 0) return 0.90
  if (jobs >= 10) return 0.90
  if (jobs >= 5) return 0.86
  if (jobs >= 3) return 0.83
  return 0.80
}

export function validateProspectHistoryObservations(
  observations: readonly ProspectHistoryObservation[],
  now = new Date(),
): ValidatedProspectCandidate[] {
  const groups = new Map<string, Array<{ observation: ProspectHistoryObservation; identity: NonNullable<ReturnType<typeof observationIdentity>> }>>()

  for (const observation of observations) {
    const identity = observationIdentity(observation)
    if (!identity) continue
    const group = groups.get(identity.host) || []
    group.push({ observation, identity })
    groups.set(identity.host, group)
  }

  const candidates: ValidatedProspectCandidate[] = []
  for (const [host, group] of groups) {
    const jobIds = [...new Set(group.map(item => item.observation.jobId).filter(Boolean))]
    const contacts = [...new Set(group.map(item => item.identity.email).filter((value): value is string => Boolean(value)))]
    if (jobIds.length < 2 && contacts.length === 0) continue

    const snippets = group.map(item => item.identity.snippet).filter((value): value is string => Boolean(value))
    const description = bestDescription(snippets)
    if (!description && contacts.length === 0) continue

    const names = group.map(item => ({ name: item.identity.name }))
    const companyName = bestName(names)
    if (!companyName) continue

    const timestamps = group
      .map(item => Date.parse(String(item.observation.observedAt || '')))
      .filter(Number.isFinite)
    const latestMs = timestamps.length ? Math.max(...timestamps) : now.getTime()
    const latest = new Date(latestMs).toISOString()
    const regions = [...new Set(group.map(item => String(item.observation.region || '').trim()).filter(Boolean))]
    const languages = [...new Set(group.map(item => String(item.observation.language || '').trim()).filter(Boolean))]
    const outcomes = group.reduce<Record<string, number>>((acc, item) => {
      const outcome = String(item.observation.outcome || 'unknown')
      acc[outcome] = (acc[outcome] || 0) + 1
      return acc
    }, {})

    candidates.push({
      record: {
        canonicalDomain: host,
        companyName,
        aliases: [...new Set(group.map(item => item.identity.name).filter(name => name !== companyName))],
        website: `https://${host}`,
        description,
        contacts: contacts.map(email => ({ email })),
        technologies: [],
        attributes: {
          prospectHistoryValidated: true,
          validationRule: 'registrable_root_name_identity_plus_repeated_campaign_or_same_domain_contact_with_profile_evidence_v2',
          evidenceRows: group.length,
          distinctCampaignJobs: jobIds.length,
          sameDomainContactEvidence: contacts.length,
          descriptionEvidenceRows: snippets.length,
          discoveryRegions: regions,
          discoveryLanguages: languages,
          outcomes,
          externalProviderCalls: 0,
          externalAiCalls: 0,
        },
        confidence: confidenceForEvidence(jobIds.length, contacts.length),
        sourceType: 'learned',
        sourceIds: jobIds.map(id => `prospect_campaign_job:${id}`),
        verifiedAt: latest,
        refreshedAt: latest,
        expiresAt: new Date(latestMs + 90 * DAY_MS).toISOString(),
      },
      evidenceRows: group.length,
      distinctCampaignJobs: jobIds.length,
      sameDomainContactEvidence: contacts.length,
      descriptionEvidenceRows: snippets.length,
    })
  }

  return candidates.sort((a, b) =>
    b.record.confidence - a.record.confidence ||
    b.distinctCampaignJobs - a.distinctCampaignJobs ||
    a.record.canonicalDomain.localeCompare(b.record.canonicalDomain),
  )
}

async function loadProspectHistoryObservations(): Promise<ProspectHistoryObservation[]> {
  const admin = getAdminSupabase()
  const observations: ProspectHistoryObservation[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('prospect_campaign_jobs')
      .select('id,region,language,results,candidates')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`PROSPECT_HISTORY_READ_FAILED: ${error.message}`)
    const page = data || []
    for (const job of page) {
      const snippetsByHost = new Map<string, string>()
      const rawCandidates = Array.isArray(job.candidates) ? job.candidates : []
      for (const candidate of rawCandidates) {
        if (!candidate || typeof candidate !== 'object') continue
        const host = normalizeDomain(String((candidate as any).url || ''))
        const snippet = cleanSnippet((candidate as any).snippet)
        if (!host || !snippet) continue
        const existing = snippetsByHost.get(host)
        if (!existing || snippet.length > existing.length) snippetsByHost.set(host, snippet)
      }

      const results = Array.isArray(job.results) ? job.results : []
      for (const result of results) {
        if (!result || typeof result !== 'object') continue
        const url = String((result as any).url || '')
        const host = normalizeDomain(url)
        observations.push({
          jobId: String(job.id || ''),
          name: String((result as any).name || ''),
          url,
          snippet: snippetsByHost.get(host) || null,
          detail: (result as any).detail || null,
          outcome: (result as any).outcome || null,
          observedAt: (result as any).at || null,
          region: job.region || null,
          language: job.language || null,
        })
      }
    }
    if (page.length < PAGE_SIZE) break
  }

  return observations
}

async function missingCorpusCandidates(candidates: readonly ValidatedProspectCandidate[]) {
  const missing: ValidatedProspectCandidate[] = []
  for (let index = 0; index < candidates.length; index += LOOKUP_BATCH_SIZE) {
    const chunk = candidates.slice(index, index + LOOKUP_BATCH_SIZE)
    const checked = await Promise.all(chunk.map(async candidate => ({
      candidate,
      lookup: await lookupCorpus({
        query: candidate.record.canonicalDomain,
        canonicalDomain: candidate.record.canonicalDomain,
        minConfidence: 0,
        requireFresh: false,
      }),
    })))
    for (const item of checked) {
      if (!item.lookup.hit) missing.push(item.candidate)
    }
  }
  return missing
}

export async function seedCorpusFromValidatedProspectHistory(args: { apply?: boolean; limit?: number } = {}) {
  const apply = args.apply === true
  const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 250)))
  const observations = await loadProspectHistoryObservations()
  const candidates = validateProspectHistoryObservations(observations)
  const newCandidates = await missingCorpusCandidates(candidates)
  const selected = newCandidates.slice(0, limit)
  const before = await corpusCount()

  const failures: Array<{ canonicalDomain: string; error: string }> = []
  let succeeded = 0
  if (apply) {
    for (const candidate of selected) {
      try {
        await upsertCorpusRecord(candidate.record)
        succeeded += 1
      } catch (error) {
        failures.push({
          canonicalDomain: candidate.record.canonicalDomain,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const after = apply ? await corpusCount() : before
  return {
    source: 'prospect_campaign_jobs',
    mode: apply ? 'apply' : 'dry_run',
    providerCalls: 0,
    externalAiCalls: 0,
    observations: observations.length,
    validatedCandidates: candidates.length,
    alreadyPresent: candidates.length - newCandidates.length,
    newCandidates: newCandidates.length,
    selected: selected.length,
    attempted: apply ? selected.length : 0,
    succeeded,
    failed: failures.length,
    failures: failures.slice(0, 50),
    before,
    after,
    netAdded: Math.max(0, after - before),
    candidates: selected.map(candidate => ({
      canonicalDomain: candidate.record.canonicalDomain,
      companyName: candidate.record.companyName,
      confidence: candidate.record.confidence,
      evidenceRows: candidate.evidenceRows,
      distinctCampaignJobs: candidate.distinctCampaignJobs,
      sameDomainContactEvidence: candidate.sameDomainContactEvidence,
      descriptionEvidenceRows: candidate.descriptionEvidenceRows,
    })),
  }
}
