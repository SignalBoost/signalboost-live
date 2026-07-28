// saas/components/hub/pages/EnvVarsPage.tsx
'use client'

// Hub Console — Vercel Environment Variables workspace.
// Full CRUD: view (list) · add · edit (value/target) · delete.
// Self-contained: fetches its own data from /api/hub/env, like DomainsPage.
// Cockpit palette: navy gradients, gold #ffc300, cyan #1af0ff, monospaced readouts.

import { useEffect, useState } from 'react'
import { cardStyle, labelStyle, bodyStyle, rowStyle, monoStyle } from '../shared.tsx'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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

// A searchable picker for the key name.
//
// WHY THIS IS NOT A PLAIN TEXT INPUT. The key is the one field where a typo is silent and
// expensive: "SUPERVISOR_LICENCE_TOKEN" creates a second, useless variable instead of
// touching the one the build reads, and nothing complains until something fails to start.
// Every key that already exists in the project is offered here, so the ordinary case
// requires no typing at all. A genuinely new name is still possible — it just has to be
// chosen deliberately rather than arrived at by mistyping an existing one.

function KeyPicker({
  value, onChange, options, existing, placeholder, newLabel, searchLabel, emptyLabel, duplicateWarning,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  existing: boolean
  placeholder: string
  newLabel: string
  searchLabel: string
  emptyLabel: string
  duplicateWarning: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const filtered = needle ? options.filter((k) => k.toLowerCase().includes(needle)) : options
  const typed = query.trim()
  const canCreate = typed.length > 0 && !options.some((k) => k.toLowerCase() === typed.toLowerCase())

  function pick(next: string) {
    onChange(next)
    setQuery('')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', color: value ? '#fff' : 'rgba(255,255,255,.45)' }}
      >
        {value || placeholder}
      </button>

      {existing && value ? (
        <div style={{ marginTop: 6, fontSize: 12, color: GOLD }}>{duplicateWarning}</div>
      ) : null}

      {open ? (
        <div style={{ position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%', marginTop: 6, padding: 8, borderRadius: 12, border: '1px solid rgba(255,255,255,.15)', background: '#07111f', boxShadow: '0 18px 50px rgba(0,0,0,.45)', maxHeight: 320, overflowY: 'auto' }}>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOpen(false); setQuery('') }
              if (e.key === 'Enter' && canCreate) { e.preventDefault(); pick(typed) }
            }}
            placeholder={searchLabel}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div role="listbox" style={{ display: 'grid', gap: 4 }}>
            {filtered.map((k) => (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={k === value}
                onClick={() => pick(k)}
                style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid transparent', background: k === value ? 'rgba(26,240,255,.12)' : 'transparent', color: '#fff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, cursor: 'pointer' }}
              >
                {k}
              </button>
            ))}
            {filtered.length === 0 && !canCreate ? (
              <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'rgba(255,255,255,.5)' }}>{emptyLabel}</div>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                onClick={() => pick(typed)}
                style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,195,0,.4)', background: 'rgba(255,195,0,.1)', color: GOLD, fontSize: 12.5, cursor: 'pointer' }}
              >
                {newLabel.replace(uiCopy('u_c363a80aaf7982d4'), typed)}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
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
  const { t } = useTranslation()
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
      else setError(data.error || t('console.env.err_load', uiCopy('u_9e4a94b6894c9b3e')))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.env.err_load2', uiCopy('u_4fd0417f1862bf82')))
    } finally {
      setLoading(false)
    }
  }

  async function addVar() {
    if (!newKey.trim() || newValue === '') {
      setError(t('console.env.err_required', uiCopy('u_d0fde39fb5fd952c')))
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
        flash(t('console.env.added', uiCopy('u_1ef821d853d9f704')).replace('{key}', newKey.trim()))
        await load()
      } else {
        setError(data.error || t('console.env.err_add', uiCopy('u_8447b8a274705cd9')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.env.err_add2', uiCopy('u_e25063ede87ce217')))
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
      setError(t('console.env.err_edit_required', uiCopy('u_6aeb139cc732e665')))
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
        flash(t('console.env.updated', uiCopy('u_d12874a305dc6f28')))
        cancelEdit()
        await load()
      } else {
        setError(data.error || t('console.env.err_update', uiCopy('u_7b816c474fb34d79')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.env.err_update2', uiCopy('u_e7ae91f037c20304')))
    } finally {
      setBusy(null)
    }
  }

  async function deleteVar(v: EnvVar) {
    if (!window.confirm(t('console.env.confirm_delete', uiCopy('u_e70f8e3c2500d06d')).replace('{key}', v.key))) return
    setBusy(v.id)
    setError(null)
    try {
      const res = await fetch('/api/hub/env?id=' + encodeURIComponent(v.id), { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        flash(t('console.env.deleted', uiCopy('u_8a8f597eb101e06e')).replace('{key}', v.key))
        await load()
      } else {
        setError(data.error || t('console.env.err_delete', uiCopy('u_bae688daec759d74')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.env.err_delete2', uiCopy('u_3cf3c1b16433189b')))
    } finally {
      setBusy(null)
    }
  }

  // Every key already in the project, so the common case needs no typing.
  const keyOptions = [...new Set(vars.map((v) => v.key))].sort((a, b) => a.localeCompare(b))
  const keyExists = keyOptions.some((k) => k.toLowerCase() === newKey.trim().toLowerCase())

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
            <h3 style={{ ...labelStyle, margin: 0 }}>{t('console.env.title', uiCopy('u_bd95a74fa1461241'))}</h3>
            <span style={{ ...monoStyle, color: 'rgba(255,255,255,.4)' }}>{t('console.env.count_live', uiCopy('u_4c1970d3aaf2766d')).replace('{n}', String(vars.length))}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 10 }}>
            <KeyPicker
              value={newKey}
              onChange={setNewKey}
              options={keyOptions}
              existing={keyExists}
              placeholder={t('console.env.ph_key', uiCopy('u_069ff7e5395c7df1'))}
              searchLabel={t('console.env.ph_key_search', uiCopy('u_fdc0fc6b440d5b98'))}
              newLabel={t('console.env.key_new', uiCopy('u_a0ecb1a083301fb2'))}
              emptyLabel={t('console.env.key_none', uiCopy('u_61539372e5aa33f8'))}
              duplicateWarning={t('console.env.key_duplicate', uiCopy('u_055fdc294629d876'))}
            />
            <input style={inputStyle} placeholder={t('console.env.ph_value', uiCopy('u_6e6d293475b241f6'))} value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...labelStyle }}>{t('console.env.type', uiCopy('u_b380d7b5b94a1c5b'))}</span>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '8px 10px' }}>
                {TYPES.map((t) => <option key={t} value={t} style={{ color: '#000' }}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...labelStyle }}>{t('console.env.targets', uiCopy('u_65f26ee63e556219'))}</span>
              <TargetChips selected={newTargets} onToggle={(t) => toggle(newTargets, setNewTargets, t)} />
            </div>
            <button onClick={addVar} disabled={busy === 'add'} style={{ ...btn('cyan'), marginLeft: 'auto', opacity: busy === 'add' ? 0.6 : 1 }}>
              {busy === 'add' ? t('console.env.adding', uiCopy('u_68420c7c13dd67bf')) : '➕ ' + t('console.env.add', uiCopy('u_299d72fe1390bd8c'))}
            </button>
          </div>
        </div>
      </section>

      {/* List */}
      <section style={{ ...cardStyle }}>
        <div style={{ ...bodyStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <h3 style={{ ...labelStyle, margin: 0 }}>{t('console.env.list_title', uiCopy('u_a6d769db06e7b3d7'))}</h3>
            <button onClick={load} style={btn('ghost')}>{loading ? '…' : '↻ ' + t('console.env.refresh', uiCopy('u_7ab487348311f7a8'))}</button>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.45)', fontSize: 13 }}>{t('console.env.loading', uiCopy('u_250b87e232aae76d'))}</div>
          ) : vars.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,.45)', fontSize: 13 }}>{t('console.env.empty', uiCopy('u_68a8fb3ac369f1eb'))}</div>
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
                          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', alignSelf: 'center' }}>🔒 {t('console.env.system', uiCopy('u_d62e5d3b57c8bd0f'))}</span>
                        ) : (
                          <>
                            <button onClick={() => (editing ? cancelEdit() : startEdit(v))} style={btn('gold')}>
                              {editing ? t('console.env.close', uiCopy('u_dddd8720311192c4')) : '✎ ' + t('console.env.edit', uiCopy('u_b0f25dd99c8676ec'))}
                            </button>
                            <button onClick={() => deleteVar(v)} disabled={busy === v.id} style={{ ...btn('danger'), opacity: busy === v.id ? 0.6 : 1 }}>
                              {busy === v.id ? '…' : '🗑 ' + t('console.env.delete', uiCopy('u_dce4af495dcba936'))}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {editing && (
                      <div style={{ margin: '8px 2px 2px', padding: 13, borderRadius: 11, border: '1px solid rgba(255,195,0,.25)', background: 'rgba(255,195,0,.04)', display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <input
                          style={inputStyle}
                          placeholder={t('console.env.ph_new_value', uiCopy('u_6c4a9efa778efe4e'))}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={labelStyle}>{t('console.env.targets', uiCopy('u_ec3ba4ebfab143b0'))}</span>
                          <TargetChips selected={editTargets} onToggle={(t) => toggle(editTargets, setEditTargets, t)} />
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button onClick={cancelEdit} style={btn('ghost')}>{t('console.env.cancel', uiCopy('u_f6599d73ddab437f'))}</button>
                            <button onClick={() => saveEdit(v.id)} disabled={busy === v.id} style={{ ...btn('cyan'), opacity: busy === v.id ? 0.6 : 1 }}>
                              {busy === v.id ? t('console.env.saving', uiCopy('u_2ebf4d78c4e3333c')) : t('console.env.save', uiCopy('u_5a413980ce99c8ff'))}
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
