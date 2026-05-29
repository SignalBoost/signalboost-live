'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'
const BLUE = '#3b82f6'

type ModuleKey =
  | 'promote'
  | 'builder'
  | 'reviews'
  | 'audio'
  | 'video'
  | 'improve'
  | 'podcastStudio'
  | 'lab'
  | 'apprentice'

export default function DashboardModules() {
  const { dict } = useI18n()
  const [active, setActive] = useState<ModuleKey>('promote')

  const modules = useMemo(
    () => [
      {
        key: 'promote' as const,
        icon: '📣',
        href: '/dashboard/promote',
        title: t(dict, 'dashboard_modules.promote.title', 'Promote business'),
        desc: t(dict, 'dashboard_modules.promote.desc', 'Build campaigns, ads, social copy, and local outreach from one brand brief.'),
        cta: t(dict, 'dashboard_modules.promote.cta', 'Open marketing tools'),
        tasks: [
          t(dict, 'dashboard_modules.promote.task1', 'Campaign brief generator'),
          t(dict, 'dashboard_modules.promote.task2', 'Localized ad copy'),
          t(dict, 'dashboard_modules.promote.task3', 'Outreach queue'),
        ],
      },
      {
        key: 'builder' as const,
        icon: '🌐',
        href: '/dashboard/builder',
        title: t(dict, 'dashboard_modules.builder.title', 'Build a website'),
        desc: t(dict, 'dashboard_modules.builder.desc', 'Describe your business and publish a responsive multilingual website.'),
        cta: t(dict, 'dashboard_modules.builder.cta', 'Open website builder'),
        tasks: [
          t(dict, 'dashboard_modules.builder.task1', 'AI site outline'),
          t(dict, 'dashboard_modules.builder.task2', 'Live preview'),
          t(dict, 'dashboard_modules.builder.task3', 'One-click publishing'),
        ],
      },
      {
        key: 'reviews' as const,
        icon: '⭐',
        href: '/dashboard/reviews',
        title: t(dict, 'dashboard_modules.reviews.title', 'Collect reviews'),
        desc: t(dict, 'dashboard_modules.reviews.desc', 'Create shareable review links and convert feedback into testimonials.'),
        cta: t(dict, 'dashboard_modules.reviews.cta', 'Open review collection'),
        tasks: [
          t(dict, 'dashboard_modules.reviews.task1', 'Public review page'),
          t(dict, 'dashboard_modules.reviews.task2', 'Rating capture'),
          t(dict, 'dashboard_modules.reviews.task3', 'Testimonial library'),
        ],
      },
      {
        key: 'audio' as const,
        icon: '🎙️',
        href: '/dashboard/audio',
        title: t(dict, 'dashboard_modules.audio.title', 'Generate audio'),
        desc: t(dict, 'dashboard_modules.audio.desc', 'Turn scripts into natural voice content for every supported language.'),
        cta: t(dict, 'dashboard_modules.audio.cta', 'Open audio studio'),
        tasks: [
          t(dict, 'dashboard_modules.audio.task1', 'Voice selection'),
          t(dict, 'dashboard_modules.audio.task2', 'Script localization'),
          t(dict, 'dashboard_modules.audio.task3', 'Audio export'),
        ],
      },
      {
        key: 'video' as const,
        icon: '🎬',
        href: '/dashboard/video',
        title: t(dict, 'dashboard_modules.video.title', 'Create videos'),
        desc: t(dict, 'dashboard_modules.video.desc', 'Generate video concepts, creative assets, and publish-ready clips.'),
        cta: t(dict, 'dashboard_modules.video.cta', 'Open video creator'),
        tasks: [
          t(dict, 'dashboard_modules.video.task1', 'Video prompts'),
          t(dict, 'dashboard_modules.video.task2', 'Creative previews'),
          t(dict, 'dashboard_modules.video.task3', 'Clip workflow'),
        ],
      },
      {
        key: 'improve' as const,
        icon: '🧭',
        href: '/dashboard/improve-website',
        title: t(dict, 'dashboard_modules.improve.title', 'Improve website'),
        desc: t(dict, 'dashboard_modules.improve.desc', 'Audit SEO, speed, accessibility, and conversion gaps with validated next steps.'),
        cta: t(dict, 'dashboard_modules.improve.cta', 'Open website audit'),
        tasks: [
          t(dict, 'dashboard_modules.improve.task1', 'SEO scoring'),
          t(dict, 'dashboard_modules.improve.task2', 'Conversion checklist'),
          t(dict, 'dashboard_modules.improve.task3', 'Fix plan validation'),
        ],
      },
      {
        key: 'podcastStudio' as const,
        icon: '🎚️',
        href: '/dashboard/podcast-studio',
        title: t(dict, 'dashboard_modules.podcastStudio.title', 'Optimize Podcast Studio'),
        desc: t(dict, 'dashboard_modules.podcastStudio.desc', 'Turn episodes into multilingual show notes, clips, and publishing checklists.'),
        cta: t(dict, 'dashboard_modules.podcastStudio.cta', 'Open podcast studio'),
        tasks: [
          t(dict, 'dashboard_modules.podcastStudio.task1', 'Episode diagnostics'),
          t(dict, 'dashboard_modules.podcastStudio.task2', 'Clip opportunities'),
          t(dict, 'dashboard_modules.podcastStudio.task3', 'Publishing package'),
        ],
      },
      {
        key: 'lab' as const,
        icon: '🧪',
        href: '/dashboard/lab',
        title: t(dict, 'dashboard_modules.lab.title', 'Lab'),
        desc: t(dict, 'dashboard_modules.lab.desc', 'Experiment with search, video, and emerging AI workflows before they graduate.'),
        cta: t(dict, 'dashboard_modules.lab.cta', 'Open lab'),
        tasks: [
          t(dict, 'dashboard_modules.lab.task1', 'Video search'),
          t(dict, 'dashboard_modules.lab.task2', 'Motion prompts'),
          t(dict, 'dashboard_modules.lab.task3', 'Prototype workflows'),
        ],
      },
      {
        key: 'apprentice' as const,
        icon: '🛠️',
        href: '/dashboard/apprentice',
        title: t(dict, 'dashboard_modules.apprentice.title', 'Workshop Apprentice'),
        desc: t(dict, 'dashboard_modules.apprentice.desc', 'Follow guided tutorials that teach the fastest path through each SignalBoost tool.'),
        cta: t(dict, 'dashboard_modules.apprentice.cta', 'Start tutorial'),
        tasks: [
          t(dict, 'dashboard_modules.apprentice.task1', 'Beginner path'),
          t(dict, 'dashboard_modules.apprentice.task2', 'Tool walkthroughs'),
          t(dict, 'dashboard_modules.apprentice.task3', 'Launch checklist'),
        ],
      },
    ],
    [dict]
  )

  const selected = modules.find(module => module.key === active) || modules[0]

  return (
    <section className="fathom-glass" style={{ borderRadius: 18, padding: 18, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div className="terminal-text" style={{ color: GOLD, fontSize: 11, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>
            {t(dict, 'dashboard_modules.kicker', 'Workspace modules')}
          </div>
          <h2 style={{ margin: '6px 0 0', fontSize: 24 }}>{t(dict, 'dashboard_modules.title', 'Choose what to build next')}</h2>
        </div>
        <Link href="/faq" className="terminal-text" style={{ color: '#fff', textDecoration: 'none', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '9px 13px', fontSize: 12, fontWeight: 800 }}>
          ❓ {t(dict, 'support.faq', 'FAQ')}
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, .8fr) minmax(260px, 1.2fr)', gap: 16 }} className="dashboard-module-grid">
        <div style={{ display: 'grid', gap: 8 }}>
          {modules.map(module => {
            const isActive = module.key === active
            return (
              <button
                key={module.key}
                type="button"
                onClick={() => setActive(module.key)}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${isActive ? 'rgba(255,195,0,.45)' : 'var(--border-soft)'}`,
                  background: isActive ? 'rgba(255,195,0,.12)' : 'rgba(255,255,255,.03)',
                  color: '#fff',
                  borderRadius: 14,
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 20 }}>{module.icon}</span>
                <span style={{ fontWeight: 800 }}>{module.title}</span>
              </button>
            )
          })}
        </div>

        <article style={{ border: `1px solid rgba(59,130,246,.25)`, background: 'linear-gradient(135deg, rgba(59,130,246,.12), rgba(255,195,0,.06))', borderRadius: 18, padding: 20, minHeight: 260 }}>
          <div style={{ fontSize: 38 }}>{selected.icon}</div>
          <h3 style={{ margin: '8px 0', fontSize: 28 }}>{selected.title}</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{selected.desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            {selected.tasks.map(task => (
              <div key={task} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 10, color: 'var(--text-muted)', background: 'rgba(0,0,0,.18)', fontSize: 13 }}>
                <span style={{ color: BLUE }}>●</span> {task}
              </div>
            ))}
          </div>
          <Link href={selected.href} className="sb-button-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
            {selected.cta} →
          </Link>
        </article>
      </div>
    </section>
  )
}
