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

      // Seed list with current user and a couple example users when live user directory is unavailable.
      setUsers([
        { id: authUser.id, email: authUser.email, role },
        { id: 'seed-admin', email: 'admin@example.com', role: 'admin' },
        { id: 'seed-user', email: 'user@example.com', role: 'user' },
      ])
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin Role Management</h1>
      <p className="text-sm text-slate-400">Only one owner is allowed at a time.</p>

      {message && <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm">{message}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-300">
            <tr>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-right">ActionMenu</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map(user => (
              <tr key={user.id} className="border-t border-slate-800">
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3 capitalize">{user.role}</td>
                <td className="px-4 py-3 text-right">
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
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-5">
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
