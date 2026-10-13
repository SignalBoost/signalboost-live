import { PUBLIC_BRAND } from '../public-brand.ts'
import { PUBLIC_COPY } from './publicCopy.ts'
import { PUBLIC_LOCALES, PUBLIC_TOPICS, publicPagePath, type PublicLocale, type PublicTopic } from './publicLocales.ts'

export function publicTopicCopy(locale: PublicLocale, topic?: PublicTopic) {
  const copy = PUBLIC_COPY[locale]
  switch (topic) {
    case 'ai-website-builder': return { title: copy.websiteTitle, description: copy.website }
    case 'customer-reviews': return { title: copy.reviewsTitle, description: copy.reviews }
    case 'ai-content': return { title: copy.contentTitle, description: copy.content }
    case 'ai-lab': return { title: copy.labTitle, description: copy.lab }
    default: return { title: copy.title, description: copy.lead }
  }
}

// Language-neutral routes remain accessible globally; regional aliases improve market relevance.
const PUBLIC_REGIONAL_HREFLANG: Record<PublicLocale, string> = {
  en: 'en-US', es: 'es-ES', pt: 'pt-BR', pl: 'pl-PL', ru: 'ru-RU',
  de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-SA',
}

function regionalAlternates(pathFor: (locale: PublicLocale) => string): Record<string, string> {
  return Object.fromEntries([
    ...PUBLIC_LOCALES.flatMap(locale => [
      [locale, `${PUBLIC_BRAND.siteUrl}${pathFor(locale)}`],
      [PUBLIC_REGIONAL_HREFLANG[locale], `${PUBLIC_BRAND.siteUrl}${pathFor(locale)}`],
    ]),
    ['x-default', `${PUBLIC_BRAND.siteUrl}${pathFor('en')}`],
  ])
}

export function publicAlternates(topic?: PublicTopic): Record<string, string> {
  return regionalAlternates(locale => publicPagePath(locale, topic))
}

export function publicMetadata(locale: PublicLocale, topic?: PublicTopic) {
  const { title, description } = publicTopicCopy(locale, topic)
  const url = `${PUBLIC_BRAND.siteUrl}${publicPagePath(locale, topic)}`
  const fullTitle = `${title} · ${PUBLIC_BRAND.name}`
  const ogLocale: Record<PublicLocale, string> = {
    en: 'en_US', es: 'es_ES', pt: 'pt_BR', pl: 'pl_PL', ru: 'ru_RU',
    de: 'de_DE', fr: 'fr_FR', it: 'it_IT', ja: 'ja_JP', ko: 'ko_KR', ar: 'ar_AR',
  }
  return {
    title: { absolute: fullTitle }, description,
    alternates: { canonical: url, languages: publicAlternates(topic) },
    robots: { index: true, follow: true },
    openGraph: { type: 'website' as const, url, siteName: PUBLIC_BRAND.name, title: fullTitle, description,
      locale: ogLocale[locale], alternateLocale: PUBLIC_LOCALES.filter(value => value !== locale).map(value => ogLocale[value]),
      images: [{ url: `${PUBLIC_BRAND.siteUrl}/og-image.png`, width: 1200, height: 630, alt: fullTitle }] },
    twitter: { card: 'summary_large_image' as const, title: fullTitle, description, images: [`${PUBLIC_BRAND.siteUrl}/og-image.png`] },
  }
}

export function publicSitemapEntries() {
  return [
    { url: PUBLIC_BRAND.siteUrl },
    { url: `${PUBLIC_BRAND.siteUrl}/university`, changeFrequency: 'weekly' as const, priority: 0.9 },
    { url: `${PUBLIC_BRAND.siteUrl}/university/pricing`, changeFrequency: 'monthly' as const, priority: 0.7 },
    ...PUBLIC_LOCALES.filter(locale => locale !== 'en').flatMap(locale => [false, true].map(pricing => ({
      url: `${PUBLIC_BRAND.siteUrl}/${locale}/university${pricing ? '/pricing' : ''}`,
      changeFrequency: pricing ? 'monthly' as const : 'weekly' as const,
      alternates: { languages: regionalAlternates(language => `${language === 'en' ? '' : '/' + language}/university${pricing ? '/pricing' : ''}`) },
    }))),
    ...PUBLIC_LOCALES.flatMap(locale => [undefined, ...PUBLIC_TOPICS].map(topic => ({
      url: `${PUBLIC_BRAND.siteUrl}${publicPagePath(locale, topic)}`,
      alternates: { languages: publicAlternates(topic) },
    }))),
  ]
}

export function publicPageSchema(locale: PublicLocale, topic?: PublicTopic) {
  const { title, description } = publicTopicCopy(locale, topic)
  return {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: title, description, inLanguage: locale,
    url: `${PUBLIC_BRAND.siteUrl}${publicPagePath(locale, topic)}`,
    isPartOf: { '@type': 'WebSite', name: PUBLIC_BRAND.name, url: PUBLIC_BRAND.siteUrl },
  }
}
