'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { SERVICES } from '@/lib/services/catalog'

// Credit pack pricing renders only when the activation flag is on (Vercel env:
// NEXT_PUBLIC_CREDITS_ACTIVATION=1). Off by default so the public console never
// shows prices before the owner enables the credit ledger.
const CREDITS_ACTIVATION = process.env.NEXT_PUBLIC_CREDITS_ACTIVATION === '1'

const INTENT_GROUPS = [
  { key: 'growth', serviceKeys: ['promote', 'reviews'] },
  { key: 'media', serviceKeys: ['video', 'audio'] },
  { key: 'web', serviceKeys: ['builder', 'improve'] },
  { key: 'utilities', serviceKeys: ['podcastStudio', 'lab', 'apprentice'] },
] as const

export default function PublicSaaSConsole() {
  const { dict } = useI18n()

  const localized = useMemo(() => SERVICES.map(service => ({
    ...service,
    title: t(dict, `services.${service.key}.title`, service.titleFallback),
    desc: t(dict, `services.${service.key}.desc`, service.descFallback),
    cta: t(dict, `services.${service.key}.cta`, service.ctaFallback),
    intent: t(dict, `studio.intent.${service.key}`, service.inputType === 'url' ? 'URL-first utility' : 'Brief-to-asset workflow'),
  })), [dict])

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/30 md:p-7" aria-label={t(dict, 'studio.catalog.aria', 'Universal Media Hub service catalog')}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(255,195,0,.16),transparent_28%),linear-gradient(135deg,rgba(255,255,255,.08),transparent_45%)]" />
      <div className="relative">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">{t(dict, 'studio.catalog.eyebrow', 'Universal Media Hub')}</p>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white md:text-5xl">{t(dict, 'studio.catalog.title', 'Choose the exact outcome you want.')}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">{t(dict, 'studio.catalog.subtitle', 'Studio now mirrors the Home Page taxonomy: nine services and free utilities grouped by real intent, with COS Core v1 preparing drafts silently until you approve the next financial step.')}</p>
          </div>
          {CREDITS_ACTIVATION && (
            <div className="rounded-2xl border border-amber-200/25 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">
              {t(dict, 'credits.packs', 'Starter Pack: 50 Credits = $15 · Pro Pack: 200 Credits = $50.')}
            </div>
          )}
        </div>

        <div className="mt-7 grid gap-5">
          {INTENT_GROUPS.map(group => {
            const services = localized.filter(service => group.serviceKeys.includes(service.key as never))
            return (
              <section key={group.key} className="rounded-3xl border border-white/10 bg-white/[.045] p-4 backdrop-blur-xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black text-white">{t(dict, `studio.group.${group.key}.title`, group.key)}</h3>
                    <p className="mt-1 text-sm text-slate-400">{t(dict, `studio.group.${group.key}.desc`, 'Select a guided path.')}</p>
                  </div>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-[.16em] text-cyan-100">COS Core v1</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {services.map(service => (
                    <Link key={service.key} href={service.dashboardHref} className="group relative min-h-[230px] overflow-hidden rounded-3xl border border-white/10 bg-white/[.07] p-5 text-white no-underline shadow-xl shadow-black/20 backdrop-blur-2xl transition hover:-translate-y-1 hover:border-cyan-200/40 hover:bg-white/[.10]">
                      <div className="absolute inset-x-0 top-0 h-1" style={{ background: service.accent }} />
                      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40" style={{ background: service.accent }} />
                      <div className="relative flex h-full flex-col">
                        <div className="flex items-start justify-between gap-3"><span className="text-4xl">{service.icon}</span><span className="rounded-full border border-white/10 bg-slate-950/45 px-2.5 py-1 text-[11px] font-bold text-slate-300">{service.intent}</span></div>
                        <h4 className="mt-4 text-2xl font-black">{service.title}</h4>
                        <p className="mt-3 flex-1 text-sm leading-6 text-slate-300">{service.desc}</p>
                        <span className="mt-5 inline-flex items-center text-sm font-black text-cyan-200">{service.cta} →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </section>
  )
}
