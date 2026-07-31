// saas/lib/outreach/sources/github.ts
//
// GITHUB ORGANIZATIONS AS A PROSPECT SOURCE.
//
// Why this source and not the cloud partner directories: AWS, Microsoft and Google's
// partner finders are JavaScript search apps whose terms prohibit automated extraction,
// so they can only be browsed by hand. GitHub's REST API is published FOR programmatic
// access and documents its own rate limit, which is the permission in writing — staying
// inside it is the whole compliance question, and a token raises it from 60 requests an
// hour to 5,000.
//
// Why it qualifies well for THIS product: a company with public Terraform, Kubernetes,
// Ansible or Helm repositories is a DevOps shop by demonstration rather than by claim.
// That is a far stronger signal than a directory listing, and it works in every country
// with only the location filter changed.
//
// The hard part is noise. A raw search for Brazilian organizations mentioning DevOps
// returns conferences (DevOpsDaysGoiania), training orgs (devops-education), personal
// study accounts (Estudos-Pessoais) and university projects alongside real companies —
// roughly two thirds unusable. Everything below exists to separate the businesses from
// the community accounts, because a cold email to a meetup group is worse than no email.

const GITHUB_API = 'https://api.github.com'
const SEARCH_PAGE_SIZE = 30
const MIN_PUBLIC_REPOS = 3

export type GithubOrgCandidate = { name: string; url: string; snippet: string }

// Accounts that exist to teach, meet or study rather than to sell. Matched against the
// org login and display name.
const NON_COMPANY_PATTERNS: RegExp[] = [
  /\b(devopsdays|meetup|conference|conf\d{2,4}|summit|hackathon|workshop)\b/i,
  /\b(education|educacao|educação|academy|academia|bootcamp|curso|cursos|training|treinamento|tutorial|tutorialz|learn|learning|estudo|estudos|study|studies|aula|aulas)\b/i,
  /\b(community|comunidade|comunidad|users?-?group|usergroup|grupo)\b/i,
  /\b(university|universidade|universidad|faculdade|fiap|unb|ufrj|usp|student|alumni|tcc)\b/i,
  /\b(playground|sandbox|demo|example|examples|test|testing|lab|labs|pessoal|personal|myorg|meu)\b/i,
  /\b(awesome|roadmap|cheatsheet|interview|challenge|desafio)\b/i,
  /^(projeto|projetos|project|projects)[-_]/i,
]

// Repository topics that indicate the org actually operates infrastructure.
const SIGNAL_TOPICS = [
  'kubernetes', 'terraform', 'ansible', 'helm', 'devops', 'sre', 'aws', 'azure', 'gcp',
  'docker', 'observability', 'cloud', 'k8s', 'platform-engineering', 'infrastructure',
]

// Two passes. Word-boundary patterns catch separated names ("devops-education").
// But GitHub logins are frequently run together — "DevOpsDaysGoiania",
// "devopsdaysnatal", "projetokube", "LaboratorioCloud" — where \b never fires. So a
// second pass strips separators and looks for high-confidence tokens anywhere in the
// string. Only unambiguous tokens go in that list: "lab" would kill GitLab, "demo"
// would kill legitimate names, so neither is there.
const NON_COMPANY_TOKENS = [
  'devopsdays', 'meetup', 'hackathon', 'bootcamp', 'conference', 'summit',
  'tutorial', 'academy', 'academia', 'curso', 'cursos', 'treinamento', 'training',
  'education', 'educacao', 'educacão', 'estudo', 'estudos', 'aprend',
  'university', 'universidade', 'universidad', 'faculdade', 'student', 'alumni',
  'comunidade', 'comunidad', 'community', 'usergroup',
  'laboratorio', 'laboratory', 'projetos', 'projeto', 'playground',
  'projectslab', 'projectlab', 'projetolab', 'sandbox',
  'cheatsheet', 'roadmap', 'awesome', 'desafio', 'challenge',
]

function looksLikeCompany(login: string, name: string | null): boolean {
  const hay = `${login} ${name || ''}`
  if (NON_COMPANY_PATTERNS.some(pattern => pattern.test(hay))) return false
  const squashed = hay.toLowerCase().replace(/[^a-z\u00e0-\u00ff]/g, '')
  return !NON_COMPANY_TOKENS.some(token => squashed.includes(token.replace(/[^a-z\u00e0-\u00ff]/g, '')))
}

function normalizeSite(blog: string | null): string {
  const raw = String(blog || '').trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    const host = url.hostname.replace(/^www\./i, '').toLowerCase()
    // A personal GitHub Pages site or a social profile is not a company website, and
    // the email finder has nothing to scrape on one.
    if (/(github\.io|github\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|medium\.com|notion\.site|linktr\.ee)$/i.test(host)) return ''
    return `https://${host}`
  } catch {
    return ''
  }
}

async function githubFetch(path: string, token: string): Promise<any | null> {
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${GITHUB_API}${path}`, { headers })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Search queries are built from the country name plus one infrastructure keyword.
// GitHub's location filter is free text matched against what the org typed, so both
// the English and local spellings are tried where they differ.
function searchQueries(locations: string[], keywords: string[]): string[] {
  const queries: string[] = []
  for (const location of locations) {
    for (const keyword of keywords) {
      queries.push(`type:org location:${location} ${keyword}`)
    }
  }
  return queries
}

export async function discoverGithubOrgs(input: {
  locations: string[]
  keywords?: string[]
  limit?: number
}): Promise<{ ok: boolean; candidates: GithubOrgCandidate[]; error?: string; examined: number }> {
  // Token preference, most-appropriate first. GITHUB_WRITE_TOKEN is accepted as a last
  // resort so discovery works on an existing setup without new configuration, but it is
  // the wrong credential for this job: discovery only ever reads public data, while that
  // token can write to repositories. A separate scope-free read token is the better
  // arrangement — set GITHUB_TOKEN and this stops reaching for the write one.
  const token = String(
    process.env.GITHUB_TOKEN
    || process.env.GITHUB_DISCOVERY_TOKEN
    || process.env.GITHUB_WRITE_TOKEN
    || '',
  ).trim()
  const locations = input.locations.filter(Boolean).slice(0, 3)
  if (!locations.length) return { ok: false, candidates: [], examined: 0, error: 'No location supplied for GitHub discovery.' }

  const keywords = (input.keywords && input.keywords.length ? input.keywords : ['devops', 'kubernetes', 'cloud', 'sre']).slice(0, 4)
  const limit = Math.max(1, Math.min(input.limit || 12, 30))

  const logins = new Set<string>()
  for (const query of searchQueries(locations, keywords)) {
    if (logins.size >= limit * 4) break
    const data = await githubFetch(`/search/users?q=${encodeURIComponent(query)}&per_page=${SEARCH_PAGE_SIZE}`, token)
    for (const item of data?.items || []) {
      if (typeof item?.login === 'string') logins.add(item.login)
    }
  }

  if (!logins.size) {
    return {
      ok: false,
      candidates: [],
      examined: 0,
      error: token
        ? 'GitHub search returned no organizations for this location.'
        : 'GitHub search failed and no GITHUB_TOKEN is configured — unauthenticated access is capped at 60 requests per hour.',
    }
  }

  const candidates: GithubOrgCandidate[] = []
  const seenHosts = new Set<string>()
  let examined = 0

  for (const login of logins) {
    if (candidates.length >= limit) break
    examined += 1

    const org = await githubFetch(`/orgs/${encodeURIComponent(login)}`, token)
    if (!org) continue

    // A company publishes its own website and maintains more than a repo or two.
    const site = normalizeSite(org.blog)
    if (!site) continue
    if (Number(org.public_repos || 0) < MIN_PUBLIC_REPOS) continue
    if (!looksLikeCompany(String(org.login || ''), org.name ? String(org.name) : null)) continue

    const host = site.replace(/^https:\/\//, '')
    if (seenHosts.has(host)) continue
    seenHosts.add(host)

    // One more confirmation that this org runs infrastructure rather than merely
    // mentioning it: at least one public repo carrying a relevant topic or language.
    const repos = await githubFetch(`/orgs/${encodeURIComponent(login)}/repos?per_page=20&sort=pushed`, token)
    const topics: string[] = []
    for (const repo of repos || []) {
      for (const topic of repo?.topics || []) topics.push(String(topic).toLowerCase())
      if (repo?.language) topics.push(String(repo.language).toLowerCase())
      if (repo?.name) topics.push(String(repo.name).toLowerCase())
    }
    const signals = SIGNAL_TOPICS.filter(topic => topics.some(value => value.includes(topic)))
    if (!signals.length) continue

    candidates.push({
      name: String(org.name || org.login),
      url: site,
      snippet: [
        String(org.description || '').replace(/\s+/g, ' ').trim().slice(0, 260),
        org.location ? `Location: ${org.location}.` : '',
        `Public infrastructure work: ${signals.slice(0, 6).join(', ')}.`,
      ].filter(Boolean).join(' '),
    })
  }

  if (!candidates.length) {
    return { ok: false, candidates: [], examined, error: `GitHub returned ${examined} organizations but none had a company website plus public infrastructure work.` }
  }
  return { ok: true, candidates, examined }
}
