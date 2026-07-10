'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type DomainRow = { domain: string; status?: string; active?: boolean; aliases_count?: number | null }
type AliasRow = { alias: string; forward: string; active?: boolean }

async function run(templateId: string, payload: Record<string, unknown> = {}) {
  const res = await fetch('/api/hub/action/engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, payload }),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || 'ImprovMX request failed')
  return json
}

export default function ImprovMXPage() {
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [domain, setDomain] = useState('')
  const [aliases, setAliases] = useState<AliasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [alias, setAlias] = useState('')
  const [forward, setForward] = useState('')

  const loadDomains = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await run('improvmx.list_domains')
      const rows = result.data?.domains || []
      setDomains(rows)
      setDomain(current => current || rows[0]?.domain || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load ImprovMX domains')
    } finally { setLoading(false) }
  }, [])

  const loadAliases = useCallback(async (selected: string) => {
    if (!selected) { setAliases([]); return }
    setError('')
    try {
      const result = await run('improvmx.list_aliases', { domain: selected })
      setAliases(result.data?.aliases || [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load aliases') }
  }, [])

  useEffect(() => { loadDomains() }, [loadDomains])
  useEffect(() => { loadAliases(domain) }, [domain, loadAliases])

  const domainOptions = useMemo(() => domains.map(d => d.domain).filter(Boolean), [domains])

  async function createAlias() {
    if (!domain || !alias || !forward) return
    setError('')
    try {
      await run('improvmx.create_alias', { domain, alias, forward })
      setAlias(''); setForward('')
      await loadAliases(domain)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create alias') }
  }

  async function deleteAlias(name: string) {
    if (!confirm(`Delete ${name}@${domain}?`)) return
    setError('')
    try {
      await run('improvmx.delete_alias', { domain, alias: name })
      await loadAliases(domain)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete alias') }
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,.15)', background: '#0b1220', color: '#fff' }

  return <div style={{ padding: 18, color: '#fff' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>ImprovMX Email Forwarding</h2>
        <div style={{ color: 'rgba(255,255,255,.55)', marginTop: 4 }}>Live domains and forwarding aliases from the ImprovMX API.</div>
      </div>
      <button onClick={loadDomains} style={{ padding: '9px 13px', borderRadius: 9, cursor: 'pointer' }}>Refresh live data</button>
    </div>

    {error && <div style={{ padding: 12, border: '1px solid rgba(239,68,68,.45)', borderRadius: 10, color: '#fca5a5', marginBottom: 14 }}>{error}</div>}
    {loading ? <div>Loading live ImprovMX data…</div> : <>
      <label style={{ display: 'block', marginBottom: 6 }}>Domain</label>
      <select value={domain} onChange={e => setDomain(e.target.value)} style={{ ...inputStyle, marginBottom: 18 }}>
        {domainOptions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 18 }}>
        <input value={alias} onChange={e => setAlias(e.target.value)} placeholder="Alias, e.g. saaspartners" style={inputStyle} />
        <input value={forward} onChange={e => setForward(e.target.value)} placeholder="Forward to email" type="email" style={inputStyle} />
        <button onClick={createAlias} style={{ padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Create alias</button>
      </div>

      <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, overflow: 'hidden' }}>
        {aliases.length === 0 ? <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>No aliases returned for this domain.</div> : aliases.map(row =>
          <div key={row.alias} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 12, padding: 12, borderBottom: '1px solid rgba(255,255,255,.08)', alignItems: 'center' }}>
            <strong>{row.alias}@{domain}</strong>
            <span>{row.forward}</span>
            <button onClick={() => deleteAlias(row.alias)} style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }}>Delete</button>
          </div>)}
      </div>
    </>}
  </div>
}
