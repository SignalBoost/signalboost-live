import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PUBLIC_COPY } from '../lib/seo/publicCopy.ts'
import { PUBLIC_LOCALES, PUBLIC_TOPICS, publicPagePath, publicLocaleFromPath, isPublicLocale, isPublicTopic } from '../lib/seo/publicLocales.ts'
import { publicAlternates, publicMetadata, publicPageSchema, publicSitemapEntries } from '../lib/seo/publicSeo.ts'
import { SUPPORTED_LANGUAGES } from '../lib/i18n/supportedLanguages.ts'
import { writingDirection } from '../lib/i18n/localeExpansion.ts'
import config from '../next.config.mjs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('public translations cover eleven languages without activating incomplete app locales', () => {
  assert.deepEqual([...PUBLIC_LOCALES], ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'])
  assert.deepEqual([...SUPPORTED_LANGUAGES], ['en', 'es', 'pt', 'pl', 'ru'])
  assert.deepEqual(Object.keys(PUBLIC_COPY).sort(), [...PUBLIC_LOCALES].sort())
})

for (const locale of PUBLIC_LOCALES) {
  test(`${locale}: complete native copy and reciprocal canonical metadata for every page`, () => {
    const copy = PUBLIC_COPY[locale]
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(PUBLIC_COPY.en).sort())
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(value.trim(), `${locale}.${key} must not be blank`)
      if (locale !== 'en') assert.notEqual(value, PUBLIC_COPY.en[key as keyof typeof copy], `${locale}.${key} must be translated`)
      assert.doesNotMatch(value, /SignalBoost|GDPR.certified|guaranteed.rank/i)
    }
    for (const topic of [undefined, ...PUBLIC_TOPICS]) {
      const url = `https://itmounts.com${publicPagePath(locale, topic)}`
      const metadata = publicMetadata(locale, topic)
      assert.equal(metadata.alternates.canonical, url)
      assert.equal(metadata.openGraph.url, url)
      assert.equal(metadata.openGraph.title, metadata.title.absolute)
      assert.equal(metadata.twitter.description, metadata.description)
      assert.equal(metadata.robots.index, true)
      assert.equal(metadata.alternates.languages[locale], url)
      assert.equal(Object.keys(metadata.alternates.languages).length, 12)
      for (const alternate of PUBLIC_LOCALES) {
        assert.equal(metadata.alternates.languages[alternate], publicMetadata(alternate, topic).alternates.canonical)
        assert.deepEqual(metadata.alternates.languages, publicMetadata(alternate, topic).alternates.languages)
      }
      assert.equal(publicPageSchema(locale, topic).inLanguage, locale)
      assert.equal(publicPageSchema(locale, topic).url, url)
    }
  })
}

test('sitemap contains each indexable canonical once and no private or invented locale URLs', () => {
  const entries = publicSitemapEntries()
  assert.equal(entries.length, 56)
  assert.equal(new Set(entries.map(entry => entry.url)).size, entries.length)
  for (const entry of entries.slice(1)) {
    const parts = new URL(entry.url).pathname.split('/').slice(1)
    assert.ok(isPublicLocale(parts[0]))
    if (parts[1]) assert.ok(isPublicTopic(parts[1]))
    assert.deepEqual(entry.alternates?.languages, publicAlternates(parts[1] as typeof PUBLIC_TOPICS[number] | undefined))
    for (const alternate of Object.values(entry.alternates?.languages || {})) assert.ok(entries.some(value => value.url === alternate))
  }
  assert.equal(entries.some(entry => /dashboard|admin|api|pt-PT|pt-BR|EU/.test(entry.url)), false)
})

test('localized chrome applies only to exact published pages, including Arabic RTL', () => {
  for (const locale of PUBLIC_LOCALES) {
    assert.equal(publicLocaleFromPath(`/${locale}`), locale)
    assert.equal(publicLocaleFromPath(`/${locale}/`), locale)
    for (const topic of PUBLIC_TOPICS) assert.equal(publicLocaleFromPath(`/${locale}/${topic}`), locale)
  }
  for (const path of [null, '/', '/dashboard', '/de/admin', '/de/api/cos', '/fr/unknown', '/en/ai-content/extra', '/de-DE', '/EN', '//ar']) {
    assert.equal(publicLocaleFromPath(path), null)
  }
  assert.equal(writingDirection('ar'), 'rtl')
  assert.equal(writingDirection('ja'), 'ltr')
})

test('each public canonical receives its actual language response header', async () => {
  const headers = await config.headers()
  for (const locale of PUBLIC_LOCALES) {
    for (const topic of [undefined, ...PUBLIC_TOPICS]) {
      assert.ok(headers.some(rule => rule.source === publicPagePath(locale, topic)
        && rule.headers.some(header => header.key === 'Content-Language' && header.value === locale)))
    }
  }
})

test('rendered pages stay server authored and protected from saved application-language rewriting', () => {
  const landing = read('../components/seo/PublicLanding.tsx')
  assert.doesNotMatch(landing, /['"]use client['"]|useEffect|fetch\(/)
  assert.match(landing, /data-public-localized lang=\{locale\} dir=\{writingDirection\(locale\)\}/)
  assert.match(landing, /hrefLang=\{language\} lang=\{language\}/)
  assert.match(landing, /<bdi>\{PUBLIC_LOCALE_NAMES\[language\]\}<\/bdi>/)
  const provider = read('../components/i18n/I18nProvider.tsx')
  assert.match(provider, /el\.closest\('\[data-public-localized\]'\)/)
  assert.match(provider, /parent\.closest\('\[data-public-localized\]'\)/)
  assert.match(read('../components/Footer.tsx'), /PUBLIC_LOCALES\.map/)
  for (const path of ['../app/[locale]/page.tsx', '../app/[locale]/[topic]/page.tsx']) {
    const source = read(path)
    assert.match(source, /dynamicParams = false/)
    assert.match(source, /notFound\(\)/)
    assert.match(source, /generateStaticParams/)
  }
})
