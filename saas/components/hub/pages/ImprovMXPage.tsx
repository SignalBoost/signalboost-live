'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type DomainRow = {
  domain: string
  active?: boolean
  status?: string
  added?: number
  aliases_count?: number | null
}

type AliasRow = {
  alias: string
  forward: string
  active?: boolean
}

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || 'ImprovMX request failed')
  }
  return json
}

export default function ImprovMXPage() {
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [domain, setDomain] = useState('')
  const [aliases, setAliases] = useState<AliasRow[]>([])
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [loadingAliases, setLoadingAliases] = useState(false)
  const [error, setError] = useState('')
  const [alias, setAlias] = useState('')
  const [forward, setForward] = useState('')
  const [saving, setSaving] = useState(false)

  const loadDomains = useCallback(async () => {
    setLoadingDomains(true)
    setError('')

    try {
      const data = await readJson(await fetch('/api/improvmx', { cache: 'no-store' }))
      const rows: DomainRow[] = Array.isArray(data.domains)
        ? data.domains
        : Array.isArray(data.data)
          ? data.data
          : []

      setDomains(rows)
      setDomain(current => {
        if (current && rows.some(row => row.domain === current)) return current
        return rows[0]?.domain || ''
      })
    } catch (err) {
      setDomains([])
      setDomain('')
      setError(err instanceof Error ? err.message : uiCopy('u_e195f5a8783c0abf'))
    } finally {
      setLoadingDomains(false)
    }
  }, [])

  const loadAliases = useCallback(async (selectedDomain: string) => {
    if (!selectedDomain) {
      setAliases([])
      return
    }

    setLoadingAliases(true)
    setError('')

    try {
      const data = await readJson(
        await fetch(`/api/improvmx?domain=${encodeURIComponent(selectedDomain)}`, {
          cache: 'no-store',
        }),
      )

      const rows: AliasRow[] = Array.isArray(data.aliases)
        ? data.aliases
        : Array.isArray(data.data)
          ? data.data
          : []

      setAliases(rows)
    } catch (err) {
      setAliases([])
      setError(err instanceof Error ? err.message : uiCopy('u_93302de8001f84d1'))
    } finally {
      setLoadingAliases(false)
    }
  }, [])

  useEffect(() => {
    void loadDomains()
  }, [loadDomains])

  useEffect(() => {
    void loadAliases(domain)
  }, [domain, loadAliases])

  const domainOptions = useMemo(
    () => domains.map(item => item.domain).filter(Boolean),
    [domains],
  )

  const activeDomains = useMemo(
    () => domains.filter(item => item.active || item.status === 'active').length,
    [domains],
  )

  async function createAlias() {
    if (!domain || !alias.trim() || !forward.trim()) return

    setSaving(true)
    setError('')

    try {
      await readJson(
        await fetch('/api/improvmx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain, alias, forward }),
        }),
      )

      setAlias('')
      setForward('')
      await loadAliases(domain)
    } catch (err) {
      setError(err instanceof Error ? err.message : uiCopy('u_8f6856d8e0626090'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteAlias(name: string) {
    if (!window.confirm(`Delete ${name}@${domain}?`)) return

    setError('')

    try {
      await readJson(
        await fetch('/api/improvmx', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain, alias: name }),
        }),
      )

      await loadAliases(domain)
    } catch (err) {
      setError(err instanceof Error ? err.message : uiCopy('u_6ad3cf58260d88eb'))
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,.15)',
    background: '#0b1220',
    color: '#fff',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ padding: 18, color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_0ffce93022be7b1a')} /></h2>
          <div style={{ color: 'rgba(255,255,255,.55)', marginTop: 4 }}><LocalizedText fallback={uiCopy('u_5aea9f9d9db3c662')} /></div>
        </div>
        <button onClick={() => void loadDomains()} style={{ padding: '9px 13px', borderRadius: 9, cursor: 'pointer' }}><LocalizedText fallback={uiCopy('u_346a26f37b62a803')} /></button>
      </div>

      {error && (
        <div style={{ padding: 12, border: '1px solid rgba(239,68,68,.45)', borderRadius: 10, color: '#fca5a5', marginBottom: 14 }}>{uiCopy('u_59cb6172a015118a')}{error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.10)', padding: 16, borderRadius: 12 }}>
          <div style={{ color: '#22d3ee', fontWeight: 800, marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}><LocalizedText fallback={uiCopy('u_6e47564b86f0609f')} /></div>
          {loadingDomains ? (
            <div style={{ color: 'rgba(255,255,255,.55)' }}>{uiCopy('u_db26b02ace00b47b')}</div>
          ) : domains.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,.55)' }}><LocalizedText fallback={uiCopy('u_52ef1cd9eebabc32')} /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {domains.map(item => {
                const active = Boolean(item.active || item.status === 'active')
                return (
                  <button
                    key={item.domain}
                    type="button"
                    onClick={() => setDomain(item.domain)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      background: domain === item.domain ? 'rgba(34,211,238,.10)' : '#070b14',
                      border: domain === item.domain ? '1px solid rgba(34,211,238,.35)' : '1px solid rgba(255,255,255,.08)',
                      color: '#fff',
                      padding: 11,
                      borderRadius: 9,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontFamily: 'monospace' }}>{item.domain}</span>
                    <span style={{ fontSize: 11, color: active ? '#34d399' : '#f87171' }}>
                      {active ? uiCopy('u_1dc5f5050156aaf5') : uiCopy('u_5b6cc1c05879ba19')}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.10)', padding: 16, borderRadius: 12 }}>
          <div style={{ color: '#22d3ee', fontWeight: 800, marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}><LocalizedText fallback={uiCopy('u_f952a9681c9ff30d')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 9, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{domains.length}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase' }}><LocalizedText fallback={uiCopy('u_ba4f038acc09b571')} /></div>
            </div>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 9, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399' }}>{activeDomains}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase' }}><LocalizedText fallback={uiCopy('u_ddf3ee07272914e1')} /></div>
            </div>
          </div>
        </div>
      </div>

      <label style={{ display: 'block', marginBottom: 6 }}><LocalizedText fallback={uiCopy('u_4b88483b191ab83e')} /></label>
      <select value={domain} onChange={event => setDomain(event.target.value)} style={{ ...inputStyle, marginBottom: 18 }}>
        <option value=""><LocalizedText fallback={uiCopy('u_2b4de4db3bfd411f')} /></option>
        {domainOptions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 18 }}>
        <input value={alias} onChange={event => setAlias(event.target.value)} placeholder={uiCopy('u_8a2e3e7bde8f0798')} style={inputStyle} />
        <input value={forward} onChange={event => setForward(event.target.value)} placeholder={uiCopy('u_e2a996872e379ca9')} type="email" style={inputStyle} />
        <button disabled={saving || !domain} onClick={() => void createAlias()} style={{ padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>
          {saving ? uiCopy('u_67310c543a7dec8f') : uiCopy('u_2bb28e9b2487f9a1')}
        </button>
      </div>

      <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, overflow: 'hidden' }}>
        {loadingAliases ? (
          <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>{uiCopy('u_272e2743163c767f')}</div>
        ) : aliases.length === 0 ? (
          <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>
            {domain ? uiCopy('u_0b5b6eccc6144d35') : uiCopy('u_0d7b7a17992487fb')}
          </div>
        ) : aliases.map(row => (
          <div key={row.alias} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 12, padding: 12, borderBottom: '1px solid rgba(255,255,255,.08)', alignItems: 'center' }}>
            <strong>{row.alias}@{domain}</strong>
            <span>{row.forward}</span>
            <button onClick={() => void deleteAlias(row.alias)} style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }}>{uiCopy('u_d56fde6470453832')}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
