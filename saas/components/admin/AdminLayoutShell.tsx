'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'

const nav = [
  ['📊', 'Dashboards', '/admin'],
  ['🛡️', 'Security Logs', '/admin/system'],
  ['📣', 'Outreach Control', '/admin/adm'],
  ['🔮', 'Predictive Insights', '/admin/ai'],
  ['🤝', 'Partners', '/admin/partners'],
  ['💸', 'Revenue', '/admin/revenue'],
  ['✉️', 'Email / Marketing', '/admin/email'],
  ['⚙️', 'Settings', '/admin/settings'],
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

  if (loading) return <div className="sb-page"><div className="sb-glass" style={{ padding: 24 }}>Checking owner/admin access...</div></div>
  if (!authorized) return null

  return (
    <div className="sb-admin-shell">
      <aside className="sb-glass-soft" style={{ padding: 18, alignSelf: 'start', position: 'sticky', top: 104 }}>
        <p className="sb-eyebrow">ADM Console</p>
        <h1 className="sb-h3">Owner Command Center</h1>
        <p className="sb-caption" style={{ marginTop: 8 }}>Dashboards → Security Logs → Outreach Control → Predictive Insights.</p>
        <nav className="sb-stack" style={{ gap: 6, marginTop: 20 }}>
          {nav.map(([icon, label, href]) => {
            const active = pathname === href || (href !== '/admin' && pathname?.startsWith(href))
            return <Link key={href} href={href} className={`sb-side-link ${active ? 'sb-side-link-active' : ''}`}><span>{icon}</span><span>{label}</span></Link>
          })}
        </nav>
      </aside>
      <main className="sb-stack" style={{ minWidth: 0 }}>{children}</main>
    </div>
  )
}
