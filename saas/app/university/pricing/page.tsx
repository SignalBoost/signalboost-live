import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_BRAND } from '@/lib/public-brand'

const canonical = `${PUBLIC_BRAND.siteUrl}/university/pricing`
export const metadata: Metadata = {
  title: 'University Credits & Provider Costs',
  description: 'Understand iTMounts University credits, pay-as-you-go billing and separate costs charged by your AI and GPU providers.',
  alternates: { canonical },
  robots: { index: true, follow: true },
}
export default function UniversityPricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-12 text-white sm:px-8">
      <Link href="/university" className="text-sm text-amber-300 underline">← iTMounts University</Link>
      <h1 className="mt-6 text-4xl font-bold">University credits and pricing</h1>
      <p className="mt-5 max-w-3xl text-lg text-slate-300">
        Paid University operations have two separate costs. You fund iTMounts platform usage with
        iTMounts credits and pay your connected AI and GPU providers separately, using your own accounts.
      </p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <section className="rounded-2xl border border-white/20 bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">1. iTMounts platform credits</h2>
          <p className="mt-4 text-slate-300">The intended model is pay-as-you-go credit purchases, with an optional subscription. Credits cover priced iTMounts software services—not external AI tokens or GPU rental. No mandatory monthly subscription is assumed.</p>
          <p className="mt-3 text-slate-300">If there are not enough iTMounts credits, new paid platform work must not begin. Credits can be replenished once purchasing is enabled.</p>
        </section>
        <section className="rounded-2xl border border-white/20 bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">2. Your AI and GPU provider funds</h2>
          <p className="mt-4 text-slate-300">OpenAI, Claude, Hugging Face and cloud GPU providers may bill you directly for teacher-model calls, distillation data generation, training or rented compute. These fees do not come from iTMounts credits.</p>
          <p className="mt-3 text-slate-300">If your provider balance, quota or permission runs out, affected operations cannot continue. Available balances are shown only when the provider exposes them reliably.</p>
        </section>
      </div>
      <section className="mt-8 rounded-2xl border border-amber-300/30 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Current availability of University credits</h2>
        <p className="mt-3 text-slate-300">
          The commercial University credit wallet and purchase flow are being prepared and have not yet
          passed live payment acceptance. Credit denominations, top-up amounts and optional subscription
          prices have not been published as approved University prices. This page does not sell or issue credits.
        </p>
        <p className="mt-3 text-slate-300">
          Before any paid University feature is enabled, its iTMounts price, credit requirement,
          provider-side cost estimate and authorization must be presented separately and verified.
          An external GPU job may keep billing until cancellation takes effect even when a platform
          balance is depleted, so jobs require provider-side limits and cleanup.
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
        <dl className="mt-4 space-y-5 text-slate-300">
          <div><dt className="font-semibold text-white">Do I need my own GPU?</dt><dd>No. Connect a supported cloud compute provider for training workloads.</dd></div>
          <div><dt className="font-semibold text-white">Do iTMounts credits pay for Claude or RunPod?</dt><dd>No. Third-party AI and GPU charges are separate from iTMounts platform credits.</dd></div>
          <div><dt className="font-semibold text-white">What if one balance runs out?</dt><dd>The affected paid work must be blocked or stopped safely. Running external jobs can require separate cancellation and reconciliation.</dd></div>
        </dl>
      </section>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link className="rounded-full bg-amber-300 px-6 py-3 font-semibold text-slate-950" href="/university">Explore University</Link>
      </div>
    </main>
  )
}
