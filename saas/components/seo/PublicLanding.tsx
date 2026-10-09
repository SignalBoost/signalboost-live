import Link from 'next/link'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { PUBLIC_COPY } from '@/lib/seo/publicCopy'
import { PUBLIC_LOCALES, PUBLIC_LOCALE_NAMES, PUBLIC_TOPICS, publicPagePath, type PublicLocale, type PublicTopic } from '@/lib/seo/publicLocales'
import { publicPageSchema, publicTopicCopy } from '@/lib/seo/publicSeo'
import { writingDirection } from '@/lib/i18n/supportedLanguages'

export default function PublicLanding({ locale, topic }: { locale: PublicLocale; topic?: PublicTopic }) {
  const copy = PUBLIC_COPY[locale]
  const page = publicTopicCopy(locale, topic)
  const schema = JSON.stringify(publicPageSchema(locale, topic)).replace(/</g, '\\u003c')
  // Explicit native copy must not be rewritten by the application's persisted locale.
  return (
    <article data-public-localized lang={locale} dir={writingDirection(locale)} className="mx-auto max-w-6xl px-5 py-8 text-white sm:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-white/15 pb-6">
        <Link href={publicPagePath(locale)} prefetch={false} className="text-2xl font-semibold"><bdi>{PUBLIC_BRAND.name}</bdi></Link>
        <nav aria-label={copy.features} className="flex flex-wrap gap-4 text-sm">
          <Link href={publicPagePath(locale)} prefetch={false}>{copy.home}</Link>
          <Link href="/support" prefetch={false}>{copy.support}</Link>
        </nav>
      </header>
      <section className="py-14 sm:py-20">
        <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl">{page.title}</h1>
        <p className="mt-7 max-w-3xl text-lg leading-relaxed text-slate-300">{page.description}</p>
        <Link href="/" prefetch={false} className="mt-8 inline-block rounded-full bg-amber-300 px-6 py-3 font-semibold text-slate-950">{copy.start}</Link>
      </section>
      <section aria-labelledby="public-features">
        <h2 id="public-features" className="mb-6 text-2xl font-semibold">{copy.features}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {PUBLIC_TOPICS.filter(value => value !== topic).map(value => {
            const feature = publicTopicCopy(locale, value)
            return <section key={value} className="min-w-0 rounded-2xl border border-white/15 bg-white/5 p-6">
              <h3 className="text-xl font-semibold"><Link href={publicPagePath(locale, value)} prefetch={false}>{feature.title}</Link></h3>
              <p className="mt-3 leading-relaxed text-slate-300">{feature.description}</p>
            </section>
          })}
        </div>
      </section>
      <section className="py-10">
        <h2 className="text-2xl font-semibold">{copy.howTitle}</h2>
        <p className="mt-4 max-w-3xl leading-relaxed text-slate-300">{copy.how}</p>
        {topic === 'ai-website-builder' ? <Link href="/website-optimizer" prefetch={false} className="mt-5 inline-block underline">{copy.optimizer}</Link> : null}
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-slate-400">{copy.availability}</p>
      </section>
      <footer className="border-t border-white/15 py-6">
        <nav aria-label={copy.languages} className="flex flex-wrap gap-x-5 gap-y-3">
          {PUBLIC_LOCALES.map(language => <Link key={language} href={publicPagePath(language, topic)} hrefLang={language} lang={language}
            aria-current={language === locale ? 'page' : undefined} prefetch={false} className="underline underline-offset-4"><bdi>{PUBLIC_LOCALE_NAMES[language]}</bdi></Link>)}
        </nav>
        <div className="mt-7 flex flex-wrap gap-5 text-sm text-slate-300">
          <Link href="/docs#your-data" prefetch={false}>{copy.privacy}</Link>
          <Link href="/support" prefetch={false}>{copy.support}</Link>
          <span><bdi>© {PUBLIC_BRAND.name}</bdi></span>
        </div>
      </footer>
    </article>
  )
}
