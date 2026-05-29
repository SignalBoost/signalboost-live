'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'

const nav = [
  ['Dashboards', '/admin'],
  ['ADM Console', '/admin/adm'],
  ['Security Logs', '/admin/system'],
  ['Outreach Control', '/admin/sales'],
  ['Predictive Insights', '/admin/ai'],
  ['Partners', '/admin/partners'],
  ['Revenue', '/admin/revenue'],
  ['Settings', '/admin/settings'],
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

  if (loading) return <div className="min-h-screen bg-slate-950 p-10 text-slate-100">Checking owner/admin access...</div>
  if (!authorized) return null

  return (
    <div className="sb-dashboard-shell">
      <aside className="sb-sidebar">
        <div className="sb-sidebar__header">
          <span className="sb-eyebrow">Owner Console</span>
          <h2>Control room</h2>
          <p>Dashboards, security logs, outreach control, and predictive insights stay in one scan path.</p>
        </div>
        <nav className="sb-sidebar__nav">
          <section className="sb-sidebar__group">
            <p>Admin flow</p>
            {nav.map(([label, href]) => (
              <Link key={href} href={href} className="sb-sidebar__link" style={pathname === href ? { background: 'rgba(255,195,0,.12)', color: '#fff', borderColor: 'rgba(255,195,0,.3)' } : undefined}>{label}</Link>
            ))}
          </section>
        </nav>
      </aside>
      <main className="sb-dashboard-main">{children}</main>
      <aside className="sb-live-preview">
        <span className="sb-eyebrow">ADM preview</span>
        <h3>AI safety note</h3>
        <p>Review security logs and approval queues before sending external outreach.</p>
      </aside>
    </div>
  )
}
