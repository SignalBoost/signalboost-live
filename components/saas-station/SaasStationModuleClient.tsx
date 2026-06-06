'use client'

import type { FormEvent, ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { runSaasStationPipeline, type SaasStationPipelineOutput, type SubscriptionTier } from '@/lib/saasStation/pipeline'
import type { ModuleDefinition } from '@/lib/saasStation/modules'

const tiers: SubscriptionTier[] = ['free', 'launch', 'growth', 'command']

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function QuotaStatusBar({ result }: { result: SaasStationPipelineOutput }) {
  const { t } = useTranslation()
  const percent = Math.min(100, Math.round((result.subscription.usageAfter / result.subscription.quota) * 100))
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#FFD700]">{t('saas.quota.title')}</p>
          <p className="mt-1 text-sm text-white/60">{t('saas.quota.subtitle')}</p>
        </div>
        <p className="rounded-full bg-black/40 px-4 py-2 text-sm text-white/80">
          {result.subscription.usageAfter} / {result.subscription.quota}
        </p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/60">
        <div className="h-full rounded-full bg-gradient-to-r from-[#FFD700] to-cyan-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-white/60">
        {result.subscription.remaining > 0
          ? `${result.subscription.remaining} ${t('saas.quota.remaining')}`
          : `${result.subscription.overageUnits} ${t('saas.quota.overage')}`}
      </p>
    </section>
  )
}

function BillingBanner({ result }: { result: SaasStationPipelineOutput }) {
  const { t } = useTranslation()
  if (result.billing.amountCents === 0) {
    return <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-100">{t('saas.billing.none')}</div>
  }

  return (
    <section className="rounded-3xl border border-orange-300/30 bg-orange-400/10 p-5 text-orange-50">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-bold">{t('saas.billing.title')}</p>
          <p className="mt-1 text-sm text-orange-100/80">
            {formatCurrency(result.billing.amountCents)} · {result.billing.provider.toUpperCase()} · {result.billing.invoiceReference}
          </p>
          <p className="mt-2 text-sm text-orange-100/70">{result.billing.explanation}</p>
        </div>
        {result.billing.checkoutUrl ? (
          <a href={result.billing.checkoutUrl} className="rounded-full bg-orange-200 px-5 py-3 text-sm font-bold text-black no-underline">{t('saas.billing.checkout')}</a>
        ) : (
          <span className="rounded-full border border-orange-200/40 px-4 py-2 text-sm">{t('saas.billing.ledger')}</span>
        )}
      </div>
    </section>
  )
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[.035] p-6 shadow-2xl">
      <p className="text-xs uppercase tracking-[0.25em] text-[#FFD700]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold">{title}</h2>
      <div className="mt-5">{children}</div>
    </article>
  )
}

export default function SaasStationModuleClient({ module }: { module: ModuleDefinition }) {
  const { t } = useTranslation()
  const { lang, setLang } = useI18n()
  const [tier, setTier] = useState<SubscriptionTier>('free')
  const [usage, setUsage] = useState(module.freeQuota - 1)
  const [text, setText] = useState(`Analyze and rebuild my ${module.key} workflow for multilingual growth.`)
  const [result, setResult] = useState<SaasStationPipelineOutput>(() => runSaasStationPipeline({ module: module.key, text, locale: lang, subscriptionTier: tier, usage }))
  const featureKeys = result.subscription.isPaid
    ? ['saas.features.paid.analyzer', 'saas.features.paid.optimizer', 'saas.features.paid.rebuild', 'saas.features.paid.billing']
    : ['saas.features.demo.playback', 'saas.features.demo.preview', 'saas.features.demo.readonly']

  function runPipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(runSaasStationPipeline({ module: module.key, text, locale: lang, subscriptionTier: tier, usage, userId: 'ui-user' }))
    setUsage((current) => current + 1)
  }

  return (
    <main className="min-h-screen bg-[#05070b] p-5 text-white md:p-8">
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.18),transparent_35%),linear-gradient(135deg,rgba(13,20,35,.96),rgba(5,7,11,.98))] p-8 shadow-2xl">
        <Link href="/dashboard" className="text-sm font-bold text-[#FFD700] no-underline">← {t('nav.dashboard')}</Link>
        <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t('saas.station.kicker')}</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl"><span className="mr-3">{module.icon}</span>{t(module.titleKey)}</h1>
            <p className="mt-4 max-w-3xl text-lg text-white/70">{t(module.descriptionKey)}</p>
          </div>
          <div className="flex gap-2 rounded-full border border-white/10 bg-black/30 p-2">
            {(['en', 'es', 'pt', 'pl', 'ru'] as const).map((locale) => (
              <button key={locale} type="button" onClick={() => setLang(locale)} className={`rounded-full px-3 py-2 text-xs font-bold uppercase ${lang === locale ? 'bg-[#FFD700] text-black' : 'text-white/60'}`}>{locale}</button>
            ))}
          </div>
        </div>
      </section>

      <form onSubmit={runPipeline} className="mt-6 grid gap-4 rounded-3xl border border-white/10 bg-black/40 p-5 lg:grid-cols-[1fr_220px_180px]">
        <label className="grid gap-2 text-sm text-white/70">
          {t('saas.input.label')}
          <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-24 rounded-2xl border border-white/10 bg-white/[.06] p-4 text-white outline-none focus:border-[#FFD700]" />
        </label>
        <label className="grid gap-2 text-sm text-white/70">
          {t('saas.tier.label')}
          <select value={tier} onChange={(event) => setTier(event.target.value as SubscriptionTier)} className="rounded-2xl border border-white/10 bg-[#111827] p-4 text-white outline-none focus:border-[#FFD700]">
            {tiers.map((item) => <option key={item} value={item}>{t(`saas.tier.${item}`)}</option>)}
          </select>
        </label>
        <button className="self-end rounded-2xl bg-[#FFD700] px-5 py-4 font-black text-black">{t('saas.run')}</button>
      </form>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_.8fr]">
        <QuotaStatusBar result={result} />
        <BillingBanner result={result} />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-3">
        <Panel eyebrow={t('saas.panel.analyzer.eyebrow')} title={t('saas.panel.analyzer.title')}>
          <div className="rounded-2xl bg-black/40 p-5">
            <p className="text-5xl font-black text-[#FFD700]">{result.analyzer.score}</p>
            <p className="mt-3 text-sm text-white/65">{result.analyzer.summary}</p>
          </div>
          <div className="mt-4 grid gap-3">
            {result.analyzer.signals.map((signal) => (
              <div key={signal.name} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex justify-between gap-3 text-sm"><span>{signal.name}</span><span className="text-[#FFD700]">{signal.score}</span></div>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/40">{signal.status}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow={t('saas.panel.optimizer.eyebrow')} title={t('saas.panel.optimizer.title')}>
          <div className="grid gap-3">
            {result.optimizer.recommendations.map((recommendation) => (
              <div key={recommendation.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{recommendation.title}</h3><span className="text-sm text-[#FFD700]">{recommendation.impactScore}</span></div>
                <p className="mt-2 text-sm text-white/60">{recommendation.rationale}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow={t('saas.panel.rebuild.eyebrow')} title={t('saas.panel.rebuild.title')}>
          <p className="rounded-2xl border border-[#FFD700]/20 bg-[#FFD700]/10 p-4 text-sm text-[#FFD700]">
            {result.rebuild.canExecute ? t('saas.rebuild.ready') : t('saas.rebuild.demo')}
          </p>
          <ol className="mt-4 grid gap-3">
            {result.rebuild.steps.map((step) => (
              <li key={step.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex justify-between gap-3"><span>{step.title}</span><span className="text-xs uppercase text-white/40">{step.status}</span></div>
                <p className="mt-2 text-xs text-white/45">{step.owner} · {step.estimatedMinutes}m</p>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/[.035] p-6">
          <h2 className="text-2xl font-bold">{t('saas.features.title')}</h2>
          <ul className="mt-4 grid gap-3">
            {featureKeys.map((featureKey) => <li key={featureKey} className="rounded-2xl bg-black/30 p-3 text-sm text-white/70">✓ {t(featureKey)}</li>)}
          </ul>
        </article>
        <article className="rounded-3xl border border-white/10 bg-white/[.035] p-6">
          <h2 className="text-2xl font-bold">{t('saas.concierge.title')}</h2>
          <p className="mt-3 text-white/65">{result.concierge.reply}</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-black/50 p-4 text-xs text-cyan-100">{JSON.stringify({ subscription: result.subscription, telemetry: result.telemetry, billing: result.billing }, null, 2)}</pre>
        </article>
      </section>
    </main>
  )
}
