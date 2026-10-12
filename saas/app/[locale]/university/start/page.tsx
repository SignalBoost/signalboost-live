import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import UniversityStartContent from '@/app/university/start/UniversityStartContent'
import { isPublicLocale } from '@/lib/seo/publicLocales'
import { UNIVERSITY_START_COPY } from '@/lib/seo/universityStartCopy'

type Props = { params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isPublicLocale(locale)) notFound()
  return { title: UNIVERSITY_START_COPY[locale].title + ' · iTMounts', robots: { index: false, follow: false } }
}
export default async function LocalizedUniversityStart({ params }: Props) {
  const { locale } = await params
  if (!isPublicLocale(locale)) notFound()
  if (locale === 'en') permanentRedirect('/university/start')
  return <UniversityStartContent locale={locale} />
}
