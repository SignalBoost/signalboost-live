// saas/components/hub/pages/EnvVarsPage.tsx
'use client'

// Hub Console — Vercel Environment Variables workspace.
// Full CRUD: view (list) · add · edit (value/target) · delete.
// Self-contained: fetches its own data from /api/hub/env, like DomainsPage.
// Cockpit palette: navy gradients, gold #ffc300, cyan #1af0ff, monospaced readouts.

import { useEffect, useState } from 'react'
import { cardStyle, labelStyle, bodyStyle, rowStyle, monoStyle } from '../shared'

type EnvTarget = 'production' | 'preview' | 'development'

type EnvVar = {
  id: string
  key: string
  type: string
  target: EnvTarget[]
  gitBranch?: string | null
  updatedAt?: number
}

const ALL_TARGETS: EnvTarget[] = ['production', 'preview', 'development']
const TYPES = ['encrypted', 'plain', 'sensitive']

const CYAN = '#1af0ff'
const GOLD = '#ffc300'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 9,
  border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)',
  color: '#fff', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  outline: 'none', boxSizing: 'border-box',
}

function btn(tone: 'cyan' | 'gold' | 'ghost' | 'danger'): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    cyan: { border: '1px solid rgba(26,240,255,.45)', background: 'rgba(26,240,255,.12)', color: CYAN },
    gold: { border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.12)', color: GOLD },
    ghost: { border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)' },
    danger: { border: '1px solid rgba(255,107,107,.4)', background: 'rgba(255,107,107,.1)', color: '#ff6b6b' },
  }
  return { padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', ...map[tone] }
}

function TargetChips({
  selected, onToggle, disabled,
}: { selected: EnvTarget[]; onToggle: (t: EnvTarget) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ALL_TARGETS.map((t) => {
        const on = selected.includes(t)
        return (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(t)}
            style={{
              padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize',
              cursor: disabled ? 'default' : 'pointer',
              border: on ? `1px solid ${CYAN}80` : '1px solid rgba(255,255,255,.12)',
              background: on ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)',
              color: on ? CYAN : 'rgba(255,255,255,.55)',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

export default function EnvVarsPage() {
  const [vars, setVars] = useState<EnvVar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Add form state
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newType, setNewType] = useState('encrypted')
  const [newTargets, setNewTargets] = useState<EnvTarget[]>(['production'])

  // Edit state (one row at a time)
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editTargets, setEditTargets] = useState<EnvTarget[]>([])

  useEffect(() => { void load() }, [])

  function flash(msg: string) {
    setNotice(msg)
    setError(null)
    window.setTimeout(() => setNotice(null), 3500)
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/hub/env?t=' + Date.now(), { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) setVars(data.vars || [])
      else setError(data.error || 'Failed to load variables')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading variables')
    } finally {
      setLoading(false)
    }
  }

  async function addVar() {
    if (!newKey.trim() || newValue === '') {
      setError('Key and value are required')
      return
    }
    setBusy('add')
    setError(null)
    try {
      const res = await fetch('/api/hub/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newValue, type: newType, target: newTargets }),
      })
      const data = await res.json()
      if (data.ok) {
        setNewKey(''); setNewValue(''); setNewType('encrypted'); setNewTargets(['production'])
        flash(`Added ${newKey.trim()}`)
        await load()
      } else {
        setError(data.error || 'Failed to add variable')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error adding variable')
    } finally {
      setBusy(null)
    }
  }

  function startEdit(v: EnvVar) {
    setEditId(v.id)
    setEditValue('') // blank = keep current value
    setEditTargets(v.target.length ? v.target : ['production'])
    setError(null)
  }

  function cancelEdit() {
    setEditId(null); setEditValue(''); setEditTargets([])
  }

  async function saveEdit(id: string) {
    if (editValue === '' && editTargets.length === 0) {
      setError('Set a new value or change the targets')
      return
    }
    setBusy(id)
    setError(null)
    try {
      const payload: Record<string, unknown> = { id, target: editTargets }
      if (editValue !== '') payload.value = editValue
      const res = await fetch('/api/hub/env', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.ok) {
        flash('Variable updated')
        cancelEdit()
        await load()
      } else {
        setError(data.error || 'Failed to update variable')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating variable')
    } finally {
      setBusy(null)
    }
  }

  async function deleteVar(v: EnvVar) {
    if (!window.confirm(`Delete ${v.key}? This removes it from the build pipeline and cannot be undone.`)) return
    setBusy(v.id)
    setError(null)
    try {
      const res = await fetch('/api/hub/env?id=' + encodeURIComponent(v.id), { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        flash(`Deleted ${v.key}`)
        await load()
      } else {
        setError(data.error || 'Failed to delete variable')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting variable')
    } finally {
      setBusy(null)
    }
  }

  function toggle(list: EnvTarget[], setList: (v: EnvTarget[]) => void, t: EnvTarget) {
    setList(list.includes(t) ? list.filter((x) => x !== t) : [...list, t])
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Banners */}
      {error && (
        <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,0,0,.08)', border: '1px solid rgba(255,107,107,.3)', color: '#ff8a8a', fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(26,240,255,.08)', border: '1px solid rgba(26,240,255,.3)', color: CYAN, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {/* Add form */}
      <section style={{ ...cardStyle }}>
        <div style={{ ...bodyStyle, gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h3 style={{ ...labelStyle, margin: 0 }}>Add environment variable</h3>
            <span style={{ ...monoStyle, color: 'rgba(255,255,255,.4)' }}>{vars.length} live</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 10 }}>
            <input style={inputStyle} placeholder="KEY_NAME" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            <input style={inputStyle} placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...labelStyle }}>Type</span>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '8px 10px' }}>
                {TYPES.map((t) => <option key={t} value={t} style={{ color: '#000' }}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...labelStyle }}>Targets</span>
              <TargetChips selected={newTargets} onToggle={(t) => toggle(newTargets, setNewTargets, t)} />
            </div>
            <button onClick={addVar} disabled={busy === 'add'} style={{ ...btn('cyan'), marginLeft: 'auto', opacity: busy === 'add' ? 0.6 : 1 }}>
              {busy === 'add' ? 'Adding…' : '➕ Add variable'}
            </button>
          </div>
        </div>
      </section>

      {/* List */}
      <section style={{ ...cardStyle }}>
        <div style={{ ...bodyStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <h3 style={{ ...labelStyle, margin: 0 }}>Variables</h3>
            <button onClick={load} style={btn('ghost')}>{loading ? '…' : '↻ Refresh'}</button>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.45)', fontSize: 13 }}>Loading variables…</div>
          ) : vars.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.45)', fontSize: 13 }}>No variables yet. Add one above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vars.map((v) => {
                const isSystem = v.type === 'system'
                const editing = editId === v.id
                return (
                  <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }}>
                        <span style={{ ...monoStyle, color: '#fff', fontSize: 13 }}>{v.key}</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: isSystem ? GOLD : 'rgba(255,255,255,.4)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, padding: '2px 6px' }}>{v.type}</span>
                          {v.target.map((t) => (
                            <span key={t} style={{ fontSize: 10.5, color: CYAN, opacity: .85 }}>{t}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {isSystem ? (
                          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', alignSelf: 'center' }}>🔒 system</span>
                        ) : (
                          <>
                            <button onClick={() => (editing ? cancelEdit() : startEdit(v))} style={btn('gold')}>
                              {editing ? 'Close' : '✎ Edit'}
                            </button>
                            <button onClick={() => deleteVar(v)} disabled={busy === v.id} style={{ ...btn('danger'), opacity: busy === v.id ? 0.6 : 1 }}>
                              {busy === v.id ? '…' : '🗑 Delete'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {editing && (
                      <div style={{ margin: '8px 2px 2px', padding: 13, borderRadius: 11, border: '1px solid rgba(255,195,0,.25)', background: 'rgba(255,195,0,.04)', display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <input
                          style={inputStyle}
                          placeholder="new value (leave blank to keep current)"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={labelStyle}>Targets</span>
                          <TargetChips selected={editTargets} onToggle={(t) => toggle(editTargets, setEditTargets, t)} />
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button onClick={cancelEdit} style={btn('ghost')}>Cancel</button>
                            <button onClick={() => saveEdit(v.id)} disabled={busy === v.id} style={{ ...btn('cyan'), opacity: busy === v.id ? 0.6 : 1 }}>
                              {busy === v.id ? 'Saving…' : 'Save changes'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
