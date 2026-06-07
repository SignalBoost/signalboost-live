import Link from 'next/link'

const proofMetrics = [
  { value: '2.8x', label: 'faster campaign launches' },
  { value: '41%', label: 'more review requests sent' },
  { value: '12k+', label: 'local workflows automated' },
]

const featureStories = [
  {
    eyebrow: 'Launch desk',
    title: 'Turn one idea into a complete promotion system.',
    body: 'Brief the assistant once, then ship landing copy, social captions, outreach lists, and follow-up tasks without losing the strategy thread.',
    accent: 'from-amber-300 to-orange-500',
  },
  {
    eyebrow: 'Reputation loop',
    title: 'Ask at the right moment and recover at-risk customers.',
    body: 'SignalBoost routes happy customers to public reviews and gives your team a private recovery workflow when sentiment drops.',
    accent: 'from-cyan-300 to-blue-500',
  },
  {
    eyebrow: 'Revenue cockpit',
    title: 'See what moved the business, not just what posted.',
    body: 'Connect promotions, replies, booked calls, and revenue signals in one daily operating view built for owners and lean teams.',
    accent: 'from-violet-300 to-fuchsia-500',
  },
]

const workflowSteps = [
  'Plan the campaign',
  'Generate assets',
  'Coordinate outreach',
  'Track conversion',
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07080c] text-[#f7f3ea] antialiased">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-18rem] h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="absolute right-[-12rem] top-[30rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_top,black,transparent_70%)]" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link href="/" className="group flex items-center gap-3" aria-label="SignalBoost home">
          <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-2xl shadow-amber-400/10">
            <span className="h-4 w-4 rounded-full bg-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.85)]" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.28em] text-white/85 transition group-hover:text-white">
            SignalBoost
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-white/58 md:flex">
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <a href="#proof" className="transition hover:text-white">Proof</a>
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
        </nav>
        <Link
          href="/login"
          className="rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white/88 shadow-sm backdrop-blur transition hover:border-white/22 hover:bg-white/[0.1]"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 md:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:px-10 lg:pb-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1.5 text-sm font-medium text-amber-100 shadow-2xl shadow-amber-500/10">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Built for local operators who need momentum this week
          </div>
          <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-white sm:text-6xl md:text-7xl lg:text-[5.65rem]">
            Your growth team, distilled into one calm cockpit.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/64 sm:text-xl">
            SignalBoost coordinates promotions, reviews, outreach, content, and analytics so lean businesses can ship polished campaigns without agency overhead.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-[#f7c948] px-6 py-3.5 text-sm font-bold text-[#151007] shadow-[0_18px_60px_rgba(247,201,72,0.26)] transition hover:-translate-y-0.5 hover:bg-[#ffe083]"
            >
              Start free trial
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/[0.1]"
            >
              View live cockpit
            </Link>
          </div>
          <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/10 pt-6">
            {proofMetrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">{metric.value}</div>
                <div className="mt-1 text-xs font-medium leading-5 text-white/48 sm:text-sm">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative lg:pl-6">
          <div className="absolute -left-6 top-14 hidden h-24 w-24 rounded-full bg-amber-300/20 blur-2xl lg:block" />
          <div className="rounded-[2rem] border border-white/12 bg-white/[0.07] p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="rounded-[1.45rem] border border-white/10 bg-[#0d1018] p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/38">Today&apos;s command center</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">June promotion sprint</h2>
                </div>
                <div className="rounded-full bg-emerald-300/12 px-3 py-1 text-xs font-bold text-emerald-200">Live</div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_0.72fr]">
                <div className="rounded-3xl bg-[#f7f3ea] p-4 text-[#17130c]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/40">Campaign score</p>
                    <span className="rounded-full bg-black px-2.5 py-1 text-xs font-bold text-white">92%</span>
                  </div>
                  <div className="mt-10 flex items-end gap-2">
                    {[44, 62, 51, 76, 68, 88, 82].map((height, index) => (
                      <div key={index} className="flex-1 rounded-t-full bg-[#17130c]/10" style={{ height: `${height}px` }}>
                        <div className="h-1/2 rounded-t-full bg-[#f7c948]" />
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-sm font-medium leading-6 text-black/56">Recommended next move: send VIP review requests before the lunch traffic peak.</p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">Revenue signal</p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">$18.4k</p>
                    <p className="mt-1 text-sm text-emerald-200">+24% from last launch</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">Queued assets</p>
                    <div className="mt-3 flex -space-x-2">
                      {['Ad', 'SMS', 'IG', 'LP'].map((item) => (
                        <span key={item} className="grid h-10 w-10 place-items-center rounded-full border border-[#0d1018] bg-white text-xs font-black text-[#17130c]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-3xl border border-white/10 bg-white/[0.045] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">AI operating plan</p>
                    <p className="mt-1 text-sm text-white/45">Four steps generated from your revenue goal.</p>
                  </div>
                  <span className="rounded-full bg-cyan-300/12 px-3 py-1 text-xs font-bold text-cyan-100">12 min saved</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  {workflowSteps.map((step, index) => (
                    <div key={step} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-6 text-xs font-bold text-white/35">0{index + 1}</div>
                      <div className="text-sm font-semibold leading-5 text-white/84">{step}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur md:grid-cols-[0.86fr_1.14fr] md:p-8 lg:p-10">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-amber-200/80">Value proposition</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-4xl lg:text-5xl">
              One workspace where strategy becomes finished work.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {['Prompted by business goals, not blank canvases.', 'Designed for owner-led teams, not enterprise admin bloat.', 'Every generated asset stays tied to a measurable outcome.', 'The assistant remembers context across campaigns and channels.'].map((item) => (
              <div key={item} className="rounded-3xl border border-white/10 bg-[#0b0d13] p-5">
                <div className="mb-6 h-1.5 w-10 rounded-full bg-amber-300" />
                <p className="text-base font-medium leading-7 text-white/76">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="proof" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-[2rem] border border-white/10 bg-[#f7f3ea] p-6 text-[#17130c] sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-black/40">Social proof</p>
            <blockquote className="mt-8 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">
              “SignalBoost feels like the missing operating layer between our ideas and actual revenue.”
            </blockquote>
            <div className="mt-8 flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-300 to-orange-500" />
              <div>
                <p className="font-bold">Maya Chen</p>
                <p className="text-sm font-medium text-black/48">Founder, Northline Studios</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {['Independent clinics', 'Hospitality groups', 'Fitness studios', 'Creative agencies', 'Local franchises', 'Community teams'].map((segment) => (
              <div key={segment} className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 min-h-36">
                <div className="h-9 w-9 rounded-2xl bg-white/10" />
                <p className="mt-8 text-lg font-semibold tracking-[-0.03em] text-white">{segment}</p>
                <p className="mt-2 text-sm leading-6 text-white/45">Use SignalBoost to convert attention into booked demand.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-100/70">Features</p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] text-white sm:text-5xl">
            Built around the real rhythm of growing a business.
          </h2>
        </div>
        <div className="mt-8 space-y-4">
          {featureStories.map((feature, index) => (
            <article key={feature.title} className="group grid gap-5 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 transition hover:bg-white/[0.07] md:grid-cols-[0.2fr_0.8fr_1.35fr] md:items-center md:p-6">
              <div className="text-sm font-bold text-white/34">0{index + 1}</div>
              <div>
                <div className={`mb-5 h-2 w-20 rounded-full bg-gradient-to-r ${feature.accent}`} />
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/42">{feature.eyebrow}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[0.85fr_1.15fr] md:items-start">
                <h3 className="text-2xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-3xl">{feature.title}</h3>
                <p className="text-base leading-7 text-white/56">{feature.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-[#f7c948] p-6 text-[#17130c] shadow-2xl shadow-amber-500/20 sm:p-10 lg:p-12">
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full bg-white/35 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-black/45">Ready when you are</p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Give your next campaign the polish of a full growth team.
              </h2>
            </div>
            <div className="rounded-[1.5rem] bg-[#17130c] p-5 text-white">
              <p className="text-sm leading-6 text-white/58">Start with one location, one offer, and one measurable outcome. SignalBoost will assemble the operating plan.</p>
              <Link
                href="/signup"
                className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-black text-[#17130c] transition hover:-translate-y-0.5 hover:bg-amber-50"
              >
                Create your cockpit
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-white/45 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <div className="font-semibold text-white/70">SignalBoost</div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/docs" className="hover:text-white">Docs</Link>
          <Link href="/support" className="hover:text-white">Support</Link>
          <span>© {new Date().getFullYear()} SignalBoost</span>
        </div>
      </footer>
    </main>
  )
}
