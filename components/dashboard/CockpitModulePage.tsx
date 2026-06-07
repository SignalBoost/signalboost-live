'use client'

import Link from 'next/link'
import { signalBoostModules, type SignalBoostModule } from '@/lib/platform/unifiedPlatform'
import { useTranslation } from '@/lib/i18n/useTranslation'

type Props = {
  module: SignalBoostModule
  primaryActionKey: string
  checklistPrefix: string
  previewPrefix: string
  children?: React.ReactNode
}

export default function CockpitModulePage({ module, primaryActionKey, checklistPrefix, previewPrefix, children }: Props) {
  const { t, tList } = useTranslation()
  const checklist = tList(checklistPrefix)
  const preview = tList(previewPrefix)

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.18),transparent_35%),linear-gradient(135deg,rgba(13,20,35,.96),rgba(5,7,11,.98))] p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('dashboard.layout.metadataTitle')}</p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              <span className="mr-3">{module.icon}</span>{t(module.labelKey)}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-white/70">{t(module.descriptionKey)}</p>
          </div>
          <Link href="/dashboard/assistant" className="rounded-full bg-[#FFD700] px-5 py-3 font-bold text-black no-underline shadow-[0_0_30px_rgba(255,215,0,.25)]">
            {t('common.askConcierge')}
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[.04] p-6">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-sm text-white/50">{t('common.missionRole')}</p>
              <h2 className="text-2xl font-bold">{t(module.cockpitRoleKey)}</h2>
            </div>
            <span className="rounded-full border border-[#FFD700]/40 bg-[#FFD700]/10 px-4 py-2 text-sm text-[#FFD700]">{t(primaryActionKey)}</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {preview.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="mb-4 h-2 rounded-full bg-gradient-to-r from-[#FFD700] via-cyan-300 to-transparent" />
                <p className="text-white/80">{item}</p>
              </div>
            ))}
          </div>
          {children}
        </div>

        <aside className="rounded-3xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-bold">{t('common.telemetryChecklist')}</h2>
          <p className="mt-2 text-sm text-white/50">{t('common.event', 'Event: {event}', { event: module.telemetryEvent })}</p>
          <ul className="mt-5 space-y-3">
            {checklist.map((item) => (
              <li key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3 text-sm text-white/75">
                <span className="text-[#FFD700]">●</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="mt-8 rounded-3xl border border-white/10 bg-white/[.03] p-6">
        <h2 className="text-xl font-bold">{t('common.allCockpitModules')}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {signalBoostModules.map((item) => (
            <Link key={item.key} href={item.href} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white no-underline transition hover:border-[#FFD700]/50">
              <span className="mr-2">{item.icon}</span>{t(item.labelKey)}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
