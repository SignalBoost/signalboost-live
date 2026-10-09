import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PublicLanding from '@/components/seo/PublicLanding'
import { PUBLIC_LOCALES, PUBLIC_TOPICS, isPublicLocale, isPublicTopic } from '@/lib/seo/publicLocales'
import { publicMetadata } from '@/lib/seo/publicSeo'

export const dynamicParams = false
export function generateStaticParams() {
  return PUBLIC_LOCALES.flatMap(locale => PUBLIC_TOPICS.map(topic => ({ locale, topic })))
}
type Props = { params: Promise<{ locale: string; topic: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, topic } = await params
  if (!isPublicLocale(locale) || !isPublicTopic(topic)) notFound()
  return publicMetadata(locale, topic)
}
export default async function LocalizedTopic({ params }: Props) {
  const { locale, topic } = await params
  if (!isPublicLocale(locale) || !isPublicTopic(topic)) notFound()
  return <PublicLanding locale={locale} topic={topic} />
}
