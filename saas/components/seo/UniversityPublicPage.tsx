import Link from 'next/link'
import type { PublicLocale } from '@/lib/seo/publicLocales'
import { PUBLIC_LOCALES, PUBLIC_LOCALE_NAMES } from '@/lib/seo/publicLocales'
import { UNIVERSITY_COPY } from '@/lib/seo/universityCopy'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { writingDirection } from '@/lib/i18n/supportedLanguages'

export const universityPath = (locale: PublicLocale, pricing = false) =>
  `${locale === 'en' ? '' : '/' + locale}/university${pricing ? '/pricing' : ''}`

export function universityAlternates(pricing = false): Record<string, string> {
  return Object.fromEntries([
    ...PUBLIC_LOCALES.map(locale => [locale, PUBLIC_BRAND.siteUrl + universityPath(locale, pricing)]),
    ['x-default', PUBLIC_BRAND.siteUrl + universityPath('en', pricing)],
  ])
}

export function universityMetadata(locale: PublicLocale, pricing = false) {
  const copy = UNIVERSITY_COPY[locale]
  const canonical = PUBLIC_BRAND.siteUrl + universityPath(locale, pricing)
  const title = `${pricing ? copy.credits : 'iTMounts AI University'} · iTMounts`
  const description = pricing ? copy.separate + ' ' + copy.creditPlan : copy.hero + ' ' + copy.intro
  return {
    title: { absolute: title }, description, robots: { index: true, follow: true },
    alternates: { canonical, languages: universityAlternates(pricing) },
    openGraph: { title, description, type: 'website' as const, siteName: 'iTMounts', url: canonical },
  }
}

export default function UniversityPublicPage({ locale, pricing = false }: { locale: PublicLocale; pricing?: boolean }) {
  const c = UNIVERSITY_COPY[locale]
  const to = (pricingPage: boolean) => universityPath(locale, pricingPage)
  const schema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: pricing ? c.credits : 'iTMounts AI University', inLanguage: locale,
    url: PUBLIC_BRAND.siteUrl + to(pricing),
    isPartOf: { '@type': 'WebSite', name: 'iTMounts', url: PUBLIC_BRAND.siteUrl },
  }).replace(/</g, '\\u003c')

  return <main lang={locale} dir={writingDirection(locale)} className="mx-auto max-w-6xl px-5 py-12 text-white sm:px-8">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
    <nav aria-label="AI University navigation" className="mb-6 flex flex-wrap items-center gap-4 border-b border-white/15 pb-4 text-sm"><Link href={universityPath(locale)} className="font-semibold text-amber-300">iTMounts AI University</Link><Link href={universityPath(locale,true)} className="underline">{c.pricing}</Link><Link href={locale === 'en' ? '/university/start' : `/${locale}/university/start`} className="underline">{c.start}</Link><Link href="/support" className="underline">{c.support}</Link></nav>
    <nav aria-label="Languages" className="mb-8 border-b border-white/15 pb-5">
      <details className="group relative inline-block text-sm">
        <summary className="flex min-w-40 cursor-pointer list-none items-center justify-between gap-4 rounded-lg border border-white/30 bg-white/5 px-4 py-2 font-medium text-white marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 [&::-webkit-details-marker]:hidden">
          <span><span aria-hidden="true">🌐 </span><bdi>{PUBLIC_LOCALE_NAMES[locale]}</bdi></span>
          <span aria-hidden="true" className="text-amber-300">▾</span>
        </summary>
        <div className="absolute start-0 z-20 mt-1 max-h-72 min-w-full overflow-y-auto rounded-lg border border-white/25 bg-slate-950 p-1 shadow-xl">
          {PUBLIC_LOCALES.map(language => <Link key={language} href={universityPath(language, pricing)}
            hrefLang={language} lang={language} prefetch={false} aria-current={language === locale ? 'page' : undefined}
            className={`block whitespace-nowrap rounded-md px-4 py-2 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none ${language === locale ? 'bg-amber-300 font-semibold text-slate-950 hover:bg-amber-200' : 'text-slate-100'}`}>
            <bdi>{PUBLIC_LOCALE_NAMES[language]}</bdi>
          </Link>)}
        </div>
      </details>
    </nav>
    {pricing ? <>
      <Link className="text-sm text-amber-300 underline" href={to(false)}>← {c.home}</Link>
      <h1 className="mt-7 text-4xl font-bold">{c.credits}</h1>
      <p className="mt-5 text-lg text-slate-300">{c.separate}</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <section className="rounded-2xl border border-white/20 bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">{c.platform}</h2><p className="mt-4 text-slate-300">{c.creditPlan}</p>
        </section>
        <section className="rounded-2xl border border-white/20 bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">{c.provider}</h2><p className="mt-4 text-slate-300">{c.external}</p>
        </section>
      </div>
      <section className="mt-7 rounded-2xl border border-amber-300/30 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">{c.pricing}</h2><p className="mt-3 text-slate-300">{c.stop}</p>
        <p className="mt-3 text-slate-300">{c.approve}</p>
      </section>
      <Link href={to(false)} className="mt-7 inline-block rounded-full bg-amber-300 px-6 py-3 font-semibold text-slate-950">{c.home}</Link>
    </> : <>
      <section className="rounded-3xl border border-white/15 bg-white/5 px-6 py-12 sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">iTMounts AI University</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">{c.hero}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">{c.intro}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={locale === 'en' ? '/university/start' : `/${locale}/university/start`} className="rounded-full bg-amber-300 px-6 py-3 font-semibold text-slate-950">{c.start}</Link>
          <Link href="#how-it-works" className="rounded-full border border-white/30 px-6 py-3 font-semibold">{c.how}</Link>
        </div>
        <p className="mt-5 text-sm text-slate-300">{c.separate}</p>
      </section>
      <section className="py-12">
        <h2 className="text-3xl font-semibold">{c.pricing}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl border border-white/15 bg-white/5 p-6"><h3 className="text-xl font-semibold">{c.platform}</h3><p className="mt-3 text-slate-300">{c.creditPlan}</p></section>
          <section className="rounded-2xl border border-white/15 bg-white/5 p-6"><h3 className="text-xl font-semibold">{c.provider}</h3><p className="mt-3 text-slate-300">{c.external}</p></section>
        </div>
        <p className="mt-5 text-slate-300">{c.stop}</p>
        <Link href={to(true)} className="mt-4 inline-block font-semibold text-amber-300 underline">{c.credits}</Link>
      </section>
      <section id="how-it-works" className="py-10">
        <h2 className="text-3xl font-semibold">{c.how}</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[c.step1,c.step2,c.step3,c.step4,c.step5].map((title,i) => <section key={i} className="rounded-2xl border border-white/15 bg-white/5 p-6"><p className="text-amber-300">{i + 1}</p><h3 className="mt-3 text-lg font-semibold">{title}</h3></section>)}
        </div>
      </section>
      <section className="rounded-2xl border border-white/15 bg-white/5 p-7">
        <h2 className="text-2xl font-semibold">{c.available}</h2><p className="mt-3 text-slate-300">{c.current}</p><p className="mt-3 text-slate-300">{c.noGpu}</p>
      </section>
      <p className="py-8"><Link href="/support" className="underline text-amber-300">{c.support}</Link></p>
    </>}
  </main>
}
