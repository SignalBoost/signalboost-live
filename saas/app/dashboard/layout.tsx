'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  ['🏠', 'Overview', '/dashboard'],
  ['📣', 'Promote', '/dashboard/promote'],
  ['🌐', 'Website operator', '/dashboard/operator'],
  ['🧲', 'Outreach engine', '/dashboard/outreach/outreach'],
  ['⭐', 'Reviews', '/dashboard/reviews'],
  ['🎙️', 'Audio', '/dashboard/audio'],
  ['🎬', 'Video', '/dashboard/video'],
  ['📊', 'Metrics', '/dashboard/metrics'],
  ['⚙️', 'Settings', '/dashboard/settings'],
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="sb-dashboard-shell">
      <aside className="sb-dashboard-sidebar sb-glass-soft" style={{ padding: 16 }} aria-label="Dashboard navigation">
        <p className="sb-eyebrow">Workspace</p>
        <nav className="sb-stack" style={{ gap: 6 }}>
          {navItems.map(([icon, label, href]) => {
            const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href))
            return (
              <Link key={href} href={href} className={`sb-side-link ${active ? 'sb-side-link-active' : ''}`}>
                <span>{icon}</span><span>{label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <main className="sb-stack" style={{ minWidth: 0 }}>
        {children}
      </main>

      <aside className="sb-dashboard-preview sb-glass" style={{ padding: 20 }} aria-label="Live preview panel">
        <p className="sb-eyebrow">Live preview</p>
        <div className="sb-glass-soft sb-stack" style={{ padding: 16, minHeight: 220 }}>
          <div className="sb-row" style={{ justifyContent: 'space-between' }}>
            <span className="sb-chip">● Draft</span>
            <span className="sb-caption">Auto-saved</span>
          </div>
          <h3 className="sb-h3">Your next customer sees this first.</h3>
          <p className="sb-body" style={{ fontSize: 14 }}>
            Use each dashboard tool from left to right. SignalBoost keeps the preview panel ready so every page has one obvious outcome: publish something clearer.
          </p>
        </div>
        <div className="sb-ai-prompt" style={{ marginTop: 16 }}>
          “Try adding one proof point and a sharper CTA before you publish.”
        </div>
        <div className="sb-tone-selector" style={{ marginTop: 16 }}>
          <span>Friendly</span><span>Professional</span><span>Playful</span>
        </div>
      </aside>
    </div>
  )
}
