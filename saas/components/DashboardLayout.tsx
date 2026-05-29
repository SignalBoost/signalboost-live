import Link from 'next/link'
import React from 'react'

const sidebarGroups = [
  {
    title: 'Create',
    items: [
      ['Dashboard', '/dashboard', '⌁'],
      ['Promote', '/dashboard/promote', '📣'],
      ['Builder', '/dashboard/builder', '🌐'],
      ['Reviews', '/dashboard/reviews', '⭐'],
      ['Audio', '/dashboard/audio', '🎙️'],
      ['Video', '/dashboard/video', '🎬'],
    ],
  },
  {
    title: 'Outreach',
    items: [
      ['Engine', '/dashboard/outreach/outreach', '🧠'],
      ['Discovery', '/dashboard/outreach/discovery', '🔎'],
      ['Pipeline', '/dashboard/outreach/pipeline', '🧭'],
      ['Contacts', '/dashboard/outreach/contacts', '🤝'],
    ],
  },
  {
    title: 'Operate',
    items: [
      ['Metrics', '/dashboard/metrics', '📊'],
      ['Data', '/dashboard/data', '🗄️'],
      ['Settings', '/dashboard/settings', '⚙️'],
    ],
  },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sb-dashboard-shell">
      <aside className="sb-sidebar" aria-label="Dashboard navigation">
        <div className="sb-sidebar__header">
          <span className="sb-eyebrow">Your command center</span>
          <h2>What should we grow next?</h2>
          <p>Pick one focused workspace. SignalBoost keeps the next best action visible.</p>
        </div>

        <nav className="sb-sidebar__nav">
          {sidebarGroups.map(group => (
            <section key={group.title} className="sb-sidebar__group">
              <p>{group.title}</p>
              {group.items.map(([label, href, icon]) => (
                <Link key={href} href={href} className="sb-sidebar__link">
                  <span>{icon}</span>
                  {label}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <main className="sb-dashboard-main">{children}</main>

      <aside className="sb-live-preview" aria-label="Live preview panel">
        <span className="sb-eyebrow">Live preview</span>
        <h3>AI guidance before you type</h3>
        <p>Try: “Find urgent buyers in my city, draft a friendly outreach note, and queue the strongest one for approval.”</p>
        <div className="sb-tone-card">
          <span>Tone selector</span>
          <div>
            <button>Friendly</button>
            <button>Professional</button>
            <button>Playful</button>
          </div>
        </div>
        <div className="sb-ai-feedback">
          <strong>AI feedback</strong>
          <p>This campaign looks strong for urgency, but you could add a testimonial to improve trust.</p>
        </div>
      </aside>
    </div>
  )
}
