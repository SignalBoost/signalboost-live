import Link from 'next/link'
import UniversityCustomerAccess from '@/app/university/start/UniversityCustomerAccess'
import LabCustomerTrainingSection from '@/app/dashboard/cos-university-telemetry/LabCustomerTrainingSection'
import { PUBLIC_LOCALES, PUBLIC_LOCALE_NAMES, type PublicLocale } from '@/lib/seo/publicLocales'
import { UNIVERSITY_START_COPY } from '@/lib/seo/universityStartCopy'
import { UNIVERSITY_COPY } from '@/lib/seo/universityCopy'
import { writingDirection } from '@/lib/i18n/supportedLanguages'

const legalLabels: Record<PublicLocale, { privacy: string; terms: string }> = {
  en: {privacy:'Privacy',terms:'Terms'},
  es: {privacy:'Privacidad',terms:'Condiciones'},
  pt: {privacy:'Privacidade',terms:'Termos'},
  pl: {privacy:'Prywatność',terms:'Warunki'},
  ru: {privacy:'Конфиденциальность',terms:'Условия'},
  de: {privacy:'Datenschutz',terms:'Bedingungen'},
  fr: {privacy:'Confidentialité',terms:'Conditions'},
  it: {privacy:'Privacy',terms:'Condizioni'},
  ja: {privacy:'プライバシー',terms:'利用規約'},
  ko: {privacy:'개인정보 보호',terms:'이용약관'},
  ar: {privacy:'الخصوصية',terms:'الشروط'},
}
export const universityStartPath = (locale: PublicLocale) =>
  locale === 'en' ? '/university/start' : `/${locale}/university/start`

export default function UniversityStartContent({ locale }: { locale: PublicLocale }) {
  const c = UNIVERSITY_START_COPY[locale]
  const marketing = UNIVERSITY_COPY[locale]
  const home = locale === 'en' ? '/university' : `/${locale}/university`
  return <main lang={locale} dir={writingDirection(locale)} className="mx-auto max-w-6xl px-5 py-10 text-white sm:px-8">
    <nav aria-label="AI University" className="mb-5 flex flex-wrap items-center gap-4 border-b border-white/20 pb-5 text-sm">
      <Link href={home} className="font-semibold text-amber-300">iTMounts AI University</Link>
      <Link href={home+'/pricing'} className="underline">{marketing.credits}</Link>
      <Link href="/support" className="underline">{marketing.support}</Link>
    </nav>
    <nav aria-label="Languages" className="mb-7 flex flex-wrap gap-2">
      {PUBLIC_LOCALES.map(language => <Link key={language} href={universityStartPath(language)} hrefLang={language} lang={language}
        className={`rounded-full px-3 py-1 text-sm ${language === locale ? 'bg-amber-300 font-semibold text-slate-950' : 'border border-white/30 text-slate-200'}`}>
        {PUBLIC_LOCALE_NAMES[language]}
      </Link>)}
    </nav>
    <h1 className="mb-3 text-3xl font-bold">{c.title}</h1>
    <p className="mb-8 max-w-3xl text-slate-300">{c.intro}</p>
    <UniversityCustomerAccess locale={locale}><LabCustomerTrainingSection language={locale}/></UniversityCustomerAccess>
    <footer className="mt-12 flex flex-wrap gap-5 border-t border-white/15 pt-5 text-xs text-slate-400">
      <Link href="/support" className="underline">{marketing.support}</Link>
      <Link href="/privacy" className="underline">{legalLabels[locale].privacy}</Link>
      <Link href="/terms" className="underline">{legalLabels[locale].terms}</Link>
    </footer>
  </main>
}
