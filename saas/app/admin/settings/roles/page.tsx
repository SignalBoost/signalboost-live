'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'

type Role = 'user' | 'admin' | 'owner'

type TeamUser = {
  id: string
  email: string
  role: Role
}

export default function RolesManagementPage() {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: Role } | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<TeamUser | null>(null)
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function bootstrap() {
      const { data } = await supabase.auth.getUser()
      const authUser = data.user
      if (!authUser?.id || !authUser.email) return

      const role = (authUser.user_metadata?.role || 'user') as Role
      setCurrentUser({ id: authUser.id, email: authUser.email, role })
      setUsers([{ id: authUser.id, email: authUser.email, role }])
    }

    bootstrap()
  }, [])

  const isOwner = currentUser?.role === 'owner'

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.email.localeCompare(b.email))
  }, [users])

  async function confirmTransfer() {
    if (!pendingTransfer || !currentUser) return

    setLoading(true)
    setMessage('')

    try {
      const transferTarget = users.find(u => u.id === pendingTransfer.id)
      const oldRole = transferTarget?.role ?? 'user'

      const res = await fetch('/api/admin/roles/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorUserId: currentUser.id,
          actorEmail: currentUser.email,
          targetUserId: pendingTransfer.id,
          targetEmail: pendingTransfer.email,
          oldRole,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to transfer ownership')

      setUsers(prev =>
        prev.map(u => {
          if (u.id === currentUser.id) return { ...u, role: 'admin' }
          if (u.id === pendingTransfer.id) return { ...u, role: 'owner' }
          return u
        })
      )
      setCurrentUser(prev => (prev ? { ...prev, role: 'admin' } : prev))
      setMessage('Ownership transferred')
      setPendingTransfer(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  if (currentUser && currentUser.role === 'user') {
    return <div className="text-slate-300">You do not have access to Role Management.</div>
  }

  const roleCount = (role: string) => sortedUsers.filter(u => u.role === role).length

  return (
    <div>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div style={{ minWidth: 0 }}>
            <span className="sb-eyebrow">🛡️ Admin · Roles</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>Role Management</h1>
          </div>
          <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
            <div style={{ paddingTop: 0 }}><b className="gold">{roleCount('owner')}</b><span>Owner</span></div>
            <div style={{ paddingTop: 0 }}><b>{roleCount('admin')}</b><span>Admins</span></div>
            <div style={{ paddingTop: 0 }}><b>{sortedUsers.length}</b><span>Total</span></div>
          </div>
        </div>
      </header>
      <p className="text-sm text-slate-400" style={{ margin: '0 0 14px' }}>Only one owner is allowed at a time.</p>

      {message && <div style={{ borderLeft: '2px solid rgba(26,240,255,.5)', paddingLeft: 14, marginBottom: 14 }} className="text-sm">{message}</div>}

      <div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,.12)' }}>
              <th className="px-1 py-3 text-left" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Email</th>
              <th className="px-1 py-3 text-left" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Role</th>
              <th className="px-1 py-3 text-right" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map(user => (
              <tr key={user.id} style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
                <td className="px-1 py-3">{user.email}</td>
                <td className="px-1 py-3 capitalize">
                  <span className={user.role === 'owner' ? 'sb-chip sb-chip--gold' : user.role === 'admin' ? 'sb-chip' : ''} style={user.role === 'user' ? { color: 'rgba(255,255,255,.5)' } : undefined}>{user.role}</span>
                </td>
                <td className="px-1 py-3 text-right">
                  {isOwner && user.id !== currentUser?.id && (
                    <button
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
                      onClick={() => setPendingTransfer(user)}
                    >
                      Transfer Ownership
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md p-5" style={{ background: 'linear-gradient(160deg, #101827, #060913)', border: '1px solid rgba(26,240,255,.25)', borderRadius: 20, boxShadow: '0 32px 110px rgba(0,0,0,.6)' }}>
            <h2 className="text-lg font-semibold">Confirm ownership transfer</h2>
            <p className="mt-3 text-sm text-slate-200">
              Are you sure you want to transfer ownership to {pendingTransfer.email}?
            </p>
            <p className="mt-2 text-sm text-amber-300">You will lose owner privileges.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded border border-slate-700 px-3 py-1.5" onClick={() => setPendingTransfer(null)}>
                Cancel
              </button>
              <button
                className="rounded bg-red-600 px-3 py-1.5 text-white disabled:opacity-50"
                onClick={confirmTransfer}
                disabled={loading}
              >
                {loading ? 'Confirming...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
