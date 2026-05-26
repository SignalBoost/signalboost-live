'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'

const nav = [
  ['Overview', '/admin'],['SignalBoost', '/admin/signalboost'],['SaaSSignal', '/admin/saas'],['Sales / Outreach', '/admin/sales'],['Revenue', '/admin/revenue'],['AI Operations', '/admin/ai'],['Email / Marketing', '/admin/email'],['Partners', '/admin/partners'],['System Health', '/admin/system'],['Settings', '/admin/settings'],
]

export default function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const adminEmails = useMemo(
    () => (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
    []
  )

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) {
        router.replace('/dashboard')
        return
      }

      const emailAllowed = !!user.email && adminEmails.includes(user.email.toLowerCase())
      let roleAllowed = false
      const { data: memberships } = await supabase
        .from('team_members')
        .select('role,status,owner_id,member_id')
        .or(`member_id.eq.${user.id},owner_id.eq.${user.id}`)

      if (memberships?.length) {
        roleAllowed = memberships.some(
          m => (m.status === 'active' || m.owner_id === user.id) && (m.role === 'owner' || m.role === 'admin' || m.owner_id === user.id)
        )
      }

      const ok = emailAllowed || roleAllowed
      setAuthorized(ok)
      setLoading(false)
      if (!ok) router.replace('/dashboard')
    }
    check()
  }, [adminEmails, router])

  if (loading) return <div className="min-h-screen bg-slate-950 text-slate-100 p-10">Checking owner/admin access...</div>
  if (!authorized) return null

  return <div className="min-h-screen bg-slate-950 text-slate-100 flex">
    <aside className="w-72 border-r border-slate-800 p-5">
      <h1 className="text-lg font-semibold mb-1">Owner Console</h1>
      <p className="text-xs text-slate-400 mb-5">SignalBoost + SaaSSignal</p>
      <nav className="space-y-1">
        {nav.map(([label, href]) => <Link key={href} href={href} className={`block rounded px-3 py-2 text-sm ${pathname===href?'bg-blue-600 text-white':'text-slate-300 hover:bg-slate-800'}`}>{label}</Link>)}
      </nav>
    </aside>
    <main className="flex-1 p-6">{children}</main>
  </div>
}
