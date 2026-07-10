'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type DomainRow = {
  domain: string
  status: string
  active: boolean
  aliases_count: number | null
  created: string | null
}

type AliasRow = {
  alias: string
  forward: string
  active: boolean
  created: string | null
}

type DomainResponse = { ok: boolean; error?: string; domains?: DomainRow[] }
type AliasResponse = { ok: boolean; error?: string; aliases?: AliasRow[] }

const copy = {
  title: 'ImprovMX Workspace',
  subtitle: 'Live domains and email routes synced through the secure serverless proxy.',
  refresh: 'Refresh live data',
  loadingDomains: 'Loading live ImprovMX domains…',
  loadingAliases: 'Syncing aliases…',
  noDomains: 'No ImprovMX domains were returned.',
  noAliases: 'No aliases returned for this domain.',
  deleteHint: 'Select a live alias above, then use its scoped delete action to remove the route securely.',
  domains: 'DOMAINS',
  aliases: 'ALIASES',
  listDomains: 'List Domains',
  domainStatus: 'Domain Status',
  listAliases: 'List Aliases',
  createAlias: 'Create Alias',
  deleteAlias: 'Delete Alias',
  setupRequired: 'Setup Required',
  active: 'Active',
  selected: 'Selected monitored domain',
  endpointDomains: 'GET /api/improvmx',
  endpointAliases: 'GET /api/improvmx?domain=',
}

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok || json.error) throw new Error(json.error || 'ImprovMX request failed')
  return json
}

function statusLabel(row: Pick<DomainRow, 'active' | 'status'>) {
  return row.active || row.status === 'active' || row.status === 'verified' ? copy.active : copy.setupRequired
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  const classes = active
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
    : 'border-rose-400/30 bg-rose-400/10 text-rose-300'

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${classes}`}>{label}</span>
}

function ConsoleCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4 shadow-[0_20px_70px_rgba(2,6,23,.28)]">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">{eyebrow}</p>
        <h3 className="m-0 mt-1 text-sm font-semibold text-slate-100">{title}</h3>
      </div>
    </div>
    {children}
  </section>
}

export default function ImprovMXPage() {
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const [aliases, setAliases] = useState<AliasRow[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [aliasesLoading, setAliasesLoading] = useState(false)
  const [error, setError] = useState('')
  const [alias, setAlias] = useState('')
  const [forward, setForward] = useState('')

  const activeDomain = useMemo(
    () => domains.find(row => row.domain === selectedDomain) || domains[0],
    [domains, selectedDomain],
  )

  const loadDomains = useCallback(async () => {
    setDomainsLoading(true)
    setError('')
    try {
      const json = await fetch('/api/improvmx', { cache: 'no-store' }).then(response => readJson<DomainResponse>(response))
      const nextDomains = json.domains || []
      setDomains(nextDomains)
      setSelectedDomain(current => current || nextDomains[0]?.domain || '')
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load ImprovMX domains')
      setDomains([])
    } finally {
      setDomainsLoading(false)
    }
  }, [])

  const loadAliases = useCallback(async (domain: string) => {
    if (!domain) {
      setAliases([])
      return
    }

    setAliasesLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ domain })
      const json = await fetch(`/api/improvmx?${params.toString()}`, { cache: 'no-store' }).then(response => readJson<AliasResponse>(response))
      setAliases(json.aliases || [])
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to load ImprovMX aliases')
      setAliases([])
    } finally {
      setAliasesLoading(false)
    }
  }, [])

  useEffect(() => { loadDomains() }, [loadDomains])
  useEffect(() => { loadAliases(selectedDomain) }, [selectedDomain, loadAliases])

  async function createAlias() {
    if (!selectedDomain || !alias || !forward) return

    setError('')
    try {
      await fetch('/api/improvmx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: selectedDomain, alias, forward }),
      }).then(response => readJson(response))
      setAlias('')
      setForward('')
      await loadAliases(selectedDomain)
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to create ImprovMX alias')
    }
  }

  async function deleteAlias(name: string) {
    if (!selectedDomain) return

    setError('')
    try {
      const params = new URLSearchParams({ domain: selectedDomain, alias: name })
      await fetch(`/api/improvmx?${params.toString()}`, { method: 'DELETE' }).then(response => readJson(response))
      await loadAliases(selectedDomain)
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Unable to delete ImprovMX alias')
    }
  }

  return <div className="space-y-4 p-[18px] text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Tier 2 Providers</p>
        <h2 className="m-0 mt-1 text-xl font-semibold text-white">{copy.title}</h2>
        <p className="m-0 mt-1 max-w-2xl text-sm text-slate-400">{copy.subtitle}</p>
      </div>
      <button onClick={loadDomains} className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300/60 hover:bg-emerald-400/15">
        {copy.refresh}
      </button>
    </header>

    {error ? <div className="rounded-xl border border-rose-400/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

    <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-4">
        <ConsoleCard eyebrow={copy.domains} title={copy.listDomains}>
          <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 font-mono text-[11px] text-emerald-300/80">{copy.endpointDomains}</div>
          {domainsLoading ? <p className="text-sm text-slate-400">{copy.loadingDomains}</p> : null}
          {!domainsLoading && domains.length === 0 ? <p className="text-sm text-slate-400">{copy.noDomains}</p> : null}
          <div className="space-y-2">
            {domains.map(row => {
              const selected = row.domain === selectedDomain
              return <button key={row.domain} onClick={() => setSelectedDomain(row.domain)} className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all font-mono text-sm text-slate-100">{row.domain}</span>
                  <StatusBadge active={statusLabel(row) === copy.active} label={statusLabel(row)} />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{row.aliases_count ?? 0} routes</span>
                  {selected ? <span className="text-emerald-300">{copy.selected}</span> : null}
                </div>
              </button>
            })}
          </div>
        </ConsoleCard>

        <ConsoleCard eyebrow={copy.domains} title={copy.domainStatus}>
          {activeDomain ? <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"><p className="m-0 text-xs text-slate-500">Domain</p><p className="m-0 mt-1 break-all font-mono text-sm text-white">{activeDomain.domain}</p></div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"><p className="m-0 text-xs text-slate-500">State</p><div className="mt-2"><StatusBadge active={statusLabel(activeDomain) === copy.active} label={statusLabel(activeDomain)} /></div></div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"><p className="m-0 text-xs text-slate-500">Aliases</p><p className="m-0 mt-1 font-mono text-sm text-white">{activeDomain.aliases_count ?? aliases.length}</p></div>
          </div> : <p className="text-sm text-slate-400">{copy.noDomains}</p>}
        </ConsoleCard>
      </div>

      <div className="space-y-4">
        <ConsoleCard eyebrow={copy.aliases} title={copy.listAliases}>
          <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 font-mono text-[11px] text-emerald-300/80">{copy.endpointAliases}{selectedDomain || ':domain'}</div>
          {aliasesLoading ? <p className="text-sm text-slate-400">{copy.loadingAliases}</p> : null}
          {!aliasesLoading && aliases.length === 0 ? <p className="text-sm text-slate-400">{copy.noAliases}</p> : null}
          <div className="space-y-2">
            {aliases.map(row => <div key={`${row.alias}-${row.forward}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all font-mono text-sm text-slate-100">{row.alias}@{selectedDomain}</span>
                <StatusBadge active={row.active} label={row.active ? copy.active : copy.setupRequired} />
              </div>
              <p className="m-0 mt-2 break-all text-sm text-slate-400">→ {row.forward}</p>
              <button onClick={() => deleteAlias(row.alias)} className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:border-rose-300/60">{copy.deleteAlias}</button>
            </div>)}
          </div>
        </ConsoleCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <ConsoleCard eyebrow={copy.aliases} title={copy.createAlias}>
            <div className="grid gap-3">
              <input value={alias} onChange={event => setAlias(event.target.value)} placeholder="Alias, e.g. press" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/60" />
              <input value={forward} onChange={event => setForward(event.target.value)} placeholder="Forward to email" type="email" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/60" />
              <button onClick={createAlias} disabled={!selectedDomain || !alias || !forward} className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-50">{copy.createAlias}</button>
            </div>
          </ConsoleCard>

          <ConsoleCard eyebrow={copy.aliases} title={copy.deleteAlias}>
            <p className="m-0 text-sm text-slate-400">{copy.deleteHint}</p>
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <p className="m-0 text-xs text-slate-500">Selected domain</p>
              <p className="m-0 mt-1 break-all font-mono text-sm text-white">{selectedDomain || '—'}</p>
              <p className="m-0 mt-2 text-xs text-slate-500">{aliases.length} active delete target{aliases.length === 1 ? '' : 's'}</p>
            </div>
          </ConsoleCard>
        </div>
      </div>
    </div>
  </div>
}
