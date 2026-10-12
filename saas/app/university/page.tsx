import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_BRAND } from '@/lib/public-brand'

const canonical = `${PUBLIC_BRAND.siteUrl}/university`
export const metadata: Metadata = {
  title: 'AI Model Training & Distillation University',
  description: 'Explore iTMounts AI University: train, fine-tune, evaluate and download AI models using your own provider accounts and cloud GPU compute. No GPU ownership required.',
  alternates: { canonical },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'iTMounts AI University — AI Model Training & Distillation',
    description: 'A guided AI training LAB using your own tools, cloud compute and approved datasets.',
    url: canonical, type: 'website', siteName: PUBLIC_BRAND.name,
  },
}
const steps = [
  { title: 'Create your workspace', detail: 'Sign in to iTMounts and create a private LAB workspace for your experiments.' },
  { title: 'Connect your providers', detail: 'Select a supported AI provider and a compute service. Provide your own authorized credentials; no custom adapter code is required for supported integrations.' },
  { title: 'Choose your training data', detail: 'Use permitted examples or approved source material. Review your model and training settings.' },
  { title: 'Check both balances and approve your budget', detail: 'Paid operations require sufficient iTMounts platform credits and sufficient funds or quota at your selected AI and GPU providers. Review separate costs before authorization.' },
  { title: 'Monitor and retrieve', detail: 'Track supported jobs and access your completed model artifacts through the LAB.' },
]
const schema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'iTMounts AI University',
  url: canonical,
  description: 'Guided AI model training and distillation using customer-controlled providers and compute.',
  isPartOf: { '@type': 'WebSite', name: 'iTMounts', url: PUBLIC_BRAND.siteUrl },
}
export default function UniversityLanding() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-12 text-white sm:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
      <section className="rounded-3xl border border-white/15 bg-white/5 px-6 py-12 sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">iTMounts AI University</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">Train AI models with your own tools. No GPU required.</h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">
          Connect supported AI and cloud-compute providers, prepare authorized training data,
          set spending limits and manage your model-training workflow in one place.
          iTMounts provides the LAB; your providers supply the services you choose.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/onboarding" className="rounded-full bg-amber-300 px-6 py-3 font-semibold text-slate-950">Get started</Link>
          <Link href="#how-it-works" className="rounded-full border border-white/30 px-6 py-3 font-semibold">How it works</Link>
        </div>
        <p className="mt-5 text-sm text-slate-400">iTMounts AI University is a paid software service when paid features are used. AI teacher usage and GPU compute are separate charges from your chosen providers. Review both before starting.</p>
      </section>
      <section aria-labelledby="university-pricing" className="py-12">
        <h2 id="university-pricing" className="text-3xl font-semibold">Understand what you pay for</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6"><h3 className="text-xl font-semibold">iTMounts platform fees</h3><p className="mt-3 text-slate-300">Using paid AI University services incurs separate iTMounts software charges under the applicable published plan or credit pricing. Do not assume training or distillation is free because you bring your own tools.</p></div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6"><h3 className="text-xl font-semibold">Your providers’ charges</h3><p className="mt-3 text-slate-300">AI teacher inference, model distillation inputs, hosted training and rented GPUs may be billed directly by OpenAI, Anthropic, Hugging Face or your chosen compute provider. These charges are separate from iTMounts fees.</p></div>
        </div>
        <p className="mt-5 text-sm text-slate-300">Important: paid AI University operations cannot continue if either required balance is exhausted. Without sufficient iTMounts credits, new billable LAB work must be blocked. Without sufficient external AI or GPU provider balance/quota, the affected provider work must stop or fail safely. Replenish the relevant account before starting or resuming paid work. No paid job should begin without a budget review and explicit authorization. Exact iTMounts prices must be shown before paid use; no subscription price is implied here.</p>
        <Link href="/university/pricing" className="mt-4 inline-block underline text-amber-300">How University credits and provider charges work</Link>
      </section>
      <section id="how-it-works" className="py-14">
        <h2 className="text-3xl font-semibold">How iTMounts AI University works</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, i) => (
            <article key={step.title} className="rounded-2xl border border-white/15 bg-white/5 p-6">
              <p className="text-sm font-semibold text-amber-300">Step {i + 1}</p>
              <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
              <p className="mt-3 leading-relaxed text-slate-300">{step.detail}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-white/15 bg-white/5 p-7">
        <h2 className="text-2xl font-semibold">Plug-and-play where supported</h2>
        <p className="mt-3 max-w-4xl leading-relaxed text-slate-300">
          The existing LAB supports provider connections for OpenAI, Anthropic Claude,
          Google Gemini, Hugging Face and compatible APIs. Hugging Face is the currently
          supported customer training-execution provider. Additional model APIs, GPU clouds,
          local connectors and development tools are planned; they must pass integration
          and security tests before they can be used for paid workflows.
        </p>
        <p className="mt-4 text-slate-300">Customers do not need to own GPUs, but do need an account with a supported cloud-compute provider when a workload requires GPU training.</p>
      </section>
      <section className="py-14">
        <h2 className="text-3xl font-semibold">Your accounts. Your budget. Your models.</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-slate-300">
          Provider credentials are encrypted for authorized LAB use. Choose approved source
          material or your own permitted data and review your budget before paid execution.
          The LAB is a workspace and tool provider, not an independent certification authority.
        </p>
        <Link href="/onboarding" className="mt-6 inline-block rounded-full bg-amber-300 px-6 py-3 font-semibold text-slate-950">Start with iTMounts</Link>
        <p className="mt-6 text-sm text-slate-400">Need help? <Link className="underline" href="/support">Contact support</Link>.</p>
      </section>
    </main>
  )
}
