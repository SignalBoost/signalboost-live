'use client'

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#ffc300'

type Member = {
  id: string
  member_email: string
  member_id: string | null
  role: 'owner' | 'admin' | 'member'
  status: 'pending' | 'active' | 'removed'
  created_at: string
}

const ROLE_UI: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  owner:  { label: 'Owner',  color: '#ffc300', bg: 'rgba(255,195,0,.14)',  desc: 'Full access, including billing and team management.' },
  admin:  { label: 'Admin (IT)', color: '#7dd3fc', bg: 'rgba(125,211,252,.14)', desc: 'System/IT pages and team management.' },
  member: { label: 'Member', color: '#86efac', bg: 'rgba(134,239,172,.14)', desc: 'Daily work tools only. No admin or billing.' },
}

const STATUS_UI: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending — awaiting sign-up', color: '#fde68a' },
  active:  { label: 'Active', color: '#86efac' },
  removed: { label: 'Removed', color: 'rgba(255,255,255,.4)' },
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notAllowed, setNotAllowed] = useState(false)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/team', { cache: 'no-store' })
      if (res.status === 403 || res.status === 401) { setNotAllowed(true); setLoading(false); return }
      const data = await res.json()
      if (!res.ok) setError(data?.error || 'Could not load your team.')
      setMembers(Array.isArray(data.members) ? data.members : [])
    } catch {
      setError('Something went wrong loading your team.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addMember() {
    if (!email.trim() || adding) return
    setAdding(true); setError('')
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || 'Could not add member.'); setAdding(false); return }
      setEmail(''); setRole('member')
      await load()
    } catch {
      setError('Could not add the member.')
    } finally {
      setAdding(false)
    }
  }

  async function changeRole(id: string, newRole: 'admin' | 'member') {
    setMembers(prev => prev.map(m => (m.id === id ? { ...m, role: newRole } : m)))
    await fetch('/api/team', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role: newRole }),
    })
  }

  async function remove(id: string) {
    setMembers(prev => prev.filter(m => m.id !== id))
    await fetch(`/api/team?id=${id}`, { method: 'DELETE' })
  }

  if (notAllowed) {
    return (
      <main style={{ padding: 24, color: '#fff', maxWidth: 720, margin: '0 auto' }}>
        <div className="sb-card" style={{ padding: 28, textAlign: 'center' }}>
          <h1 className="sb-h3" style={{ marginTop: 0 }}>Team management</h1>
          <p className="sb-body" style={{ margin: 0 }}>Only the account owner can manage the team.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">Account</span>
        <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>Team & roles</h1>
        <p className="sb-body" style={{ margin: 0 }}>Add people and choose what they can access. Each person signs up with the email you add here to activate.</p>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}

      {/* Add member */}
      <section className="sb-card" style={{ padding: 20, marginBottom: 22 }}>
        <h2 className="sb-h3" style={{ marginTop: 0 }}>Add a team member</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, alignItems: 'center' }}>
          <input
            className="sb-input"
            style={{ padding: 12 }}
            type="email"
            placeholder="name@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addMember() }}
          />
          <select className="sb-input" style={{ padding: 12 }} value={role} onChange={e => setRole(e.target.value as 'admin' | 'member')}>
            <option value="member">Member (daily work)</option>
            <option value="admin">Admin (IT)</option>
          </select>
          <button onClick={addMember} disabled={adding || !email.trim()} className="sb-button-primary" style={{ opacity: adding || !email.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        <p className="sb-caption" style={{ marginTop: 10 }}>{ROLE_UI[role]?.desc}</p>
      </section>

      {loading && <p className="sb-body">Loading your team…</p>}

      {/* Member list */}
      {!loading && (
        <div style={{ display: 'grid', gap: 12 }}>
          {members.length === 0 && (
            <div className="sb-card" style={{ padding: 24, textAlign: 'center' }}>
              <p className="sb-body" style={{ margin: 0 }}>No team members yet. Add someone above.</p>
            </div>
          )}
          {members.map(m => {
            const ru = ROLE_UI[m.role] || ROLE_UI.member
            const su = STATUS_UI[m.status] || STATUS_UI.pending
            const isOwnerRow = m.role === 'owner'
            return (
              <article key={m.id} className="sb-card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: '#fff' }}>{m.member_email}</strong>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 999, background: ru.bg, color: ru.color }}>{ru.label}</span>
                  </div>
                  <div className="sb-caption" style={{ marginTop: 4, color: su.color }}>{su.label}</div>
                </div>

                {isOwnerRow ? (
                  <span className="sb-caption" style={{ opacity: 0.6 }}>That's you</span>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value as 'admin' | 'member')}
                      style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: '#fff', border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer' }}
                    >
                      <option value="member" style={{ background: '#0f1117' }}>Member</option>
                      <option value="admin" style={{ background: '#0f1117' }}>Admin (IT)</option>
                    </select>
                    <button onClick={() => remove(m.id)} title="Remove" style={{ background: 'transparent', border: '1px solid rgba(252,165,165,.3)', color: '#fca5a5', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>Remove</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* How it works */}
      <section className="sb-card" style={{ padding: 18, marginTop: 22 }}>
        <h3 className="sb-h3" style={{ marginTop: 0, fontSize: 15 }}>How roles work</h3>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'rgba(255,255,255,.75)', fontSize: 13, lineHeight: 1.7 }}>
          <li><strong style={{ color: ROLE_UI.owner.color }}>Owner</strong> — everything: all tools, IT/admin pages, billing, and team management.</li>
          <li><strong style={{ color: ROLE_UI.admin.color }}>Admin (IT)</strong> — system/IT pages and team management, plus the daily-work tools.</li>
          <li><strong style={{ color: ROLE_UI.member.color }}>Member</strong> — daily-work tools only. No admin pages, no billing, no team management.</li>
        </ul>
        <p className="sb-caption" style={{ marginTop: 12 }}>Adding someone reserves their seat as <em>Pending</em>. They become <em>Active</em> when they sign up with that email.</p>
      </section>
    </main>
  )
}
