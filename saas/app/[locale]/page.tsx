import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PublicLanding from '@/components/seo/PublicLanding'
import { PUBLIC_LOCALES, isPublicLocale } from '@/lib/seo/publicLocales'
import { publicMetadata } from '@/lib/seo/publicSeo'

export const dynamicParams = false
export function generateStaticParams() { return PUBLIC_LOCALES.map(locale => ({ locale })) }
type Props = { params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isPublicLocale(locale)) notFound()
  return publicMetadata(locale)
}
export default async function LocalizedHome({ params }: Props) {
  const { locale } = await params
  if (!isPublicLocale(locale)) notFound()
  return <PublicLanding locale={locale} />
}
