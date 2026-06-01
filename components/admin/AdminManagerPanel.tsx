'use client'

import { useEffect, useState } from 'react'

type AdminRecord = {
  id: string
  email: string
  role: 'admin'
  is_primary: boolean
  created_at: string
}

type CurrentUser = {
  id: string
  email: string
  is_primary: boolean
} | null

export default function AdminManagerPanel() {
  const [admins, setAdmins] = useState<AdminRecord[]>([])
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const isPrimary = currentUser?.is_primary === true

  async function loadAdmins() {
    setLoading(true)
    setMessage('')
    const res = await fetch('/api/admin/roles', { cache: 'no-store', credentials: 'same-origin' })
    const data = await res.json()
    if (res.ok && data.success) {
      setAdmins(data.admins || [])
      setCurrentUser(data.currentUser || null)
    } else {
      setMessage(data.error || 'Admin list unavailable.')
    }
    setLoading(false)
  }

  useEffect(() => { loadAdmins() }, [])

  async function addAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    const res = await fetch('/api/admin/roles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (res.ok && data.success) {
      setAdmins(data.admins || [])
      setEmail('')
      setMessage('Admin access added through the Supabase admin table.')
    } else {
      setMessage(data.error || 'Unable to add admin.')
    }
  }

  async function removeAdmin(admin: AdminRecord) {
    setMessage('')
    const res = await fetch(`/api/admin/roles?id=${encodeURIComponent(admin.id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    const data = await res.json()
    if (res.ok && data.success) {
      setAdmins(data.admins || [])
      setMessage(`${admin.email} was removed from the Supabase admin table.`)
    } else {
      setMessage(data.error || 'Unable to remove admin.')
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-white/10 bg-white/[.04] p-6" aria-labelledby="admin-manager-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">Admin Manager</p>
          <h2 id="admin-manager-title" className="mt-2 text-2xl font-black">Supabase admin table access</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">Admin role is granted only when the signed-in email exists in the Supabase <code className="text-[#FFD700]">admin</code> table. Primary admin status controls admin management.</p>
        </div>
        <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">
          {isPrimary ? 'Primary admin controls enabled' : 'Read-only admin list'}
        </span>
      </div>

      {isPrimary ? (
        <form onSubmit={addAdmin} className="mt-6 flex flex-wrap gap-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="admin@example.com"
            className="min-w-[260px] flex-1 rounded-full border border-white/10 bg-black/40 px-5 py-3 text-white outline-none focus:border-[#FFD700]"
          />
          <button type="submit" className="rounded-full bg-[#FFD700] px-6 py-3 font-black text-black">Add admin</button>
        </form>
      ) : null}

      {message ? <p className="mt-5 rounded-2xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-4 text-sm text-[#FFE88A]">{message}</p> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-white/[.06] text-white/60">
            <tr>
              <th className="p-4">Email</th>
              <th className="p-4">Role</th>
              <th className="p-4">Primary</th>
              <th className="p-4">Created</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-white/60" colSpan={5}>Loading admins from Supabase…</td></tr>
            ) : admins.map((admin) => (
              <tr key={admin.id} className="border-t border-white/10">
                <td className="p-4 font-semibold text-white">{admin.email}</td>
                <td className="p-4 text-[#FFD700]">{admin.role}</td>
                <td className="p-4">{admin.is_primary ? <span className="rounded-full bg-[#FFD700]/15 px-3 py-1 text-[#FFD700]">Immutable primary</span> : <span className="text-white/50">No</span>}</td>
                <td className="p-4 text-white/50">{new Date(admin.created_at).toLocaleString()}</td>
                <td className="p-4">
                  {isPrimary && !admin.is_primary ? (
                    <button onClick={() => removeAdmin(admin)} className="rounded-full border border-red-300/30 px-4 py-2 text-red-100 hover:bg-red-500/10">Delete</button>
                  ) : <span className="text-white/40">Protected</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
