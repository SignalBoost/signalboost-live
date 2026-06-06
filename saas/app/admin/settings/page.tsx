'use client'

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Flag = { key: string; label: string; desc: string; on: boolean }

export default function AdminSettingsPage() {
  const [flags, setFlags] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [notAllowed, setNotAllowed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) { setNotAllowed(true); setLoading(false); return }
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not load settings.'); setLoading(false); return }
      setFlags(Array.isArray(data.flags) ? data.flags : [])
    } catch {
      setError('Something went wrong loading settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(key: string, next: boolean) {
    setSavingKey(key)
    setFlags(prev => prev.map(f => (f.key === key ? { ...f, on: next } : f)))
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, on: next }),
      })
      if (!res.ok) {
        setFlags(prev => prev.map(f => (f.key === key ? { ...f, on: !next } : f)))
        const d = await res.json().catch(() => ({}))
        setError(d?.error || 'Could not save that setting.')
      } else {
        setError('')
      }
    } catch {
      setFlags(prev => prev.map(f => (f.key === key ? { ...f, on: !next } : f)))
      setError('Could not save that setting.')
    } finally {
      setSavingKey(null)
    }
  }

  if (notAllowed) {
    return (
      <main style={{ padding: 24, color: '#fff', maxWidth: 720, margin: '0 auto' }}>
        <div className="sb-card" style={{ padding: 28, textAlign: 'center' }}>
          <h1 className="sb-h3" style={{ marginTop: 0 }}>Admin settings</h1>
          <p className="sb-body" style={{ margin: 0 }}>Only the account owner can change system settings.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">Admin</span>
        <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>System settings</h1>
        <p className="sb-body" style={{ margin: 0 }}>Owner-only switches that affect the whole platform.</p>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {loading && <p className="sb-body">Loading settings…</p>}

      {!loading && (
        <div style={{ display: 'grid', gap: 12 }}>
          {flags.map(f => (
            <div key={f.key} className="sb-card" style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#fff' }}>
                  {f.label}
                  {savingKey === f.key && <span className="sb-caption" style={{ marginLeft: 8, opacity: 0.6 }}>saving…</span>}
                </div>
                <div className="sb-caption" style={{ marginTop: 4 }}>{f.desc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={f.on}
                onClick={() => toggle(f.key, !f.on)}
                disabled={savingKey === f.key}
                style={{
                  flexShrink: 0, width: 48, height: 27, borderRadius: 999, border: 'none',
                  cursor: savingKey === f.key ? 'wait' : 'pointer',
                  background: f.on ? GOLD : 'rgba(255,255,255,.18)', position: 'relative', transition: 'background .15s',
                }}
              >
                <span style={{ position: 'absolute', top: 3, left: f.on ? 24 : 3, width: 21, height: 21, borderRadius: '50%', background: '#0f1117', transition: 'left .15s' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="sb-caption" style={{ marginTop: 18, opacity: 0.6 }}>
        Changes take effect immediately. The outreach kill-switch is already enforced by the sending routes; the others are stored and ready to wire into behavior.
      </p>
    </main>
  )
}
