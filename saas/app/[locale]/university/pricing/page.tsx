import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import UniversityPublicPage, { universityMetadata } from '@/components/seo/UniversityPublicPage'
import { PUBLIC_LOCALES, isPublicLocale } from '@/lib/seo/publicLocales'
export const dynamicParams = false
export function generateStaticParams() { return PUBLIC_LOCALES.map(locale => ({ locale })) }
type Props = { params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isPublicLocale(locale)) notFound()
  return universityMetadata(locale, true)
}
export default async function LocalizedUniversityPricing({ params }: Props) {
  const { locale } = await params
  if (!isPublicLocale(locale)) notFound()
  if (locale === 'en') permanentRedirect('/university/pricing')
  return <UniversityPublicPage locale={locale} pricing />
}
