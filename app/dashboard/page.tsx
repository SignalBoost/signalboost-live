'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'

type ModuleCard = {
  href: string
  icon: string
  title: [string, string]
  desc: [string, string]
}

const modules: ModuleCard[] = [
  { href: '/dashboard/generate', icon: '✍️', title: ['dashboard.module.generate.title', 'Generate Content'], desc: ['dashboard.module.generate.desc', 'Create on-brand copy, posts, and pages in five languages.'] },
  { href: '/dashboard/promote', icon: '📣', title: ['dashboard.module.promote.title', 'Promote'], desc: ['dashboard.module.promote.desc', 'Launch promotions and campaigns tuned to your goal.'] },
  { href: '/dashboard/reviews', icon: '⭐', title: ['dashboard.module.reviews.title', 'Reviews'], desc: ['dashboard.module.reviews.desc', 'Request, monitor, and respond to customer reviews.'] },
  { href: '/dashboard/outreach', icon: '🤝', title: ['dashboard.module.outreach.title', 'Outreach'], desc: ['dashboard.module.outreach.desc', 'Find prospects and draft outreach ready to send.'] },
  { href: '/dashboard/sales', icon: '💼', title: ['dashboard.module.sales.title', 'Sales'], desc: ['dashboard.module.sales.desc', 'Turn interest into booked, qualified demand.'] },
  { href: '/dashboard/video', icon: '🎬', title: ['dashboard.module.video.title', 'Video Studio'], desc: ['dashboard.module.video.desc', 'Caption, edit, and export video right in the browser.'] },
  { href: '/dashboard/brand', icon: '🎨', title: ['dashboard.module.brand.title', 'Brand'], desc: ['dashboard.module.brand.desc', 'Set the brand memory that guides every output.'] },
  { href: '/dashboard/calendar', icon: '🗓️', title: ['dashboard.module.calendar.title', 'Calendar'], desc: ['dashboard.module.calendar.desc', 'Plan and schedule your publishing cadence.'] },
  { href: '/dashboard/assistant', icon: '⌁', title: ['dashboard.module.assistant.title', 'Concierge AI'], desc: ['dashboard.module.assistant.desc', 'Ask one assistant about every part of your cockpit.'] },
]

export default function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-5xl p-6">
      <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">
        {t('dashboard.eyebrow', 'Cockpit overview')}
      </p>
      <h1 className="mt-3 text-3xl font-black text-white">
        {t('dashboard.title', 'Your growth cockpit')}
      </h1>
      <p className="mt-3 max-w-2xl text-neutral-400">
        {t('dashboard.subtitle', 'Pick a workspace to keep momentum this week. SignalBoost keeps the next best action one click away.')}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-2xl border border-white/10 bg-white/[.04] p-5 no-underline transition hover:border-[#FFD700]/40 hover:bg-white/[.06]"
          >
            <span className="text-2xl">{m.icon}</span>
            <h2 className="mt-3 text-lg font-bold text-white group-hover:text-[#FFD700]">
              {t(m.title[0], m.title[1])}
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-400">
              {t(m.desc[0], m.desc[1])}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/executive" className="rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black no-underline">
          {t('dashboard.cta.executive', 'Executive dashboard')}
        </Link>
        <Link href="/pricing" className="rounded-full border border-white/15 px-5 py-3 font-bold text-white no-underline transition hover:border-[#FFD700]/40">
          {t('dashboard.cta.pricing', 'Plans & billing')}
        </Link>
      </div>
    </div>
  )
}
