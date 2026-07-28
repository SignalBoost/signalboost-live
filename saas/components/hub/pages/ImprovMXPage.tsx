'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { uiText } from '@/lib/i18n/uiText'

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
      setError(err instanceof Error ? err.message : "Unable to load ImprovMX domains")
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
      setError(err instanceof Error ? err.message : "Unable to load ImprovMX aliases")
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
      setError(err instanceof Error ? err.message : "Unable to create alias")
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
      setError(err instanceof Error ? err.message : "Unable to delete alias")
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
          <h2 style={{ margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_f46ea1bb1a754547')} /></h2>
          <div style={{ color: 'rgba(255,255,255,.55)', marginTop: 4 }}><LocalizedText fallback={uiText('generatedUi.u_b163d4c837c52d5e')} /></div>
        </div>
        <button onClick={() => void loadDomains()} style={{ padding: '9px 13px', borderRadius: 9, cursor: 'pointer' }}><LocalizedText fallback={uiText('generatedUi.u_984d47a1e0dd0c2c')} /></button>
      </div>

      {error && (
        <div style={{ padding: 12, border: '1px solid rgba(239,68,68,.45)', borderRadius: 10, color: '#fca5a5', marginBottom: 14 }}>{uiText('generatedUi.u_dc3f767f95774dce')}{error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.10)', padding: 16, borderRadius: 12 }}>
          <div style={{ color: '#22d3ee', fontWeight: 800, marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}><LocalizedText fallback={uiText('generatedUi.u_8b925b14879ff054')} /></div>
          {loadingDomains ? (
            <div style={{ color: 'rgba(255,255,255,.55)' }}>{uiText('generatedUi.u_620c6e0c06bffcd9')}</div>
          ) : domains.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,.55)' }}><LocalizedText fallback={uiText('generatedUi.u_e59418996b904e06')} /></div>
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
                      {active ? uiText('generatedUi.u_92340695899bd2d8') : uiText('generatedUi.u_d0c82eb89b8d659d')}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ background: '#0b1220', border: '1px solid rgba(255,255,255,.10)', padding: 16, borderRadius: 12 }}>
          <div style={{ color: '#22d3ee', fontWeight: 800, marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}><LocalizedText fallback={uiText('generatedUi.u_48abf90399b2265b')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 9, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{domains.length}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase' }}><LocalizedText fallback={uiText('generatedUi.u_3d00b55f774ad2d7')} /></div>
            </div>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 9, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399' }}>{activeDomains}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase' }}><LocalizedText fallback={uiText('generatedUi.u_ca5afc3eee09008b')} /></div>
            </div>
          </div>
        </div>
      </div>

      <label style={{ display: 'block', marginBottom: 6 }}><LocalizedText fallback={uiText('generatedUi.u_e53431804aeefa87')} /></label>
      <select value={domain} onChange={event => setDomain(event.target.value)} style={{ ...inputStyle, marginBottom: 18 }}>
        <option value=""><LocalizedText fallback={uiText('generatedUi.u_0d07cde42a48510f')} /></option>
        {domainOptions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 18 }}>
        <input value={alias} onChange={event => setAlias(event.target.value)} placeholder={uiText('generatedUi.u_e79b7ffadc886d8f')} style={inputStyle} />
        <input value={forward} onChange={event => setForward(event.target.value)} placeholder={uiText('generatedUi.u_def701389eb26689')} type="email" style={inputStyle} />
        <button disabled={saving || !domain} onClick={() => void createAlias()} style={{ padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>
          {saving ? uiText('generatedUi.u_c79ed9492e3c1719') : uiText('generatedUi.u_93f3598b8ab1a000')}
        </button>
      </div>

      <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, overflow: 'hidden' }}>
        {loadingAliases ? (
          <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>{uiText('generatedUi.u_2ce3a568505251cb')}</div>
        ) : aliases.length === 0 ? (
          <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>
            {domain ? uiText('generatedUi.u_62569df7ad826427') : uiText('generatedUi.u_9f2c3f57c2935398')}
          </div>
        ) : aliases.map(row => (
          <div key={row.alias} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 12, padding: 12, borderBottom: '1px solid rgba(255,255,255,.08)', alignItems: 'center' }}>
            <strong>{row.alias}@{domain}</strong>
            <span>{row.forward}</span>
            <button onClick={() => void deleteAlias(row.alias)} style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }}>{uiText('generatedUi.u_e2d0a54968ead24e')}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
