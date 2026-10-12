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
    <nav aria-label="Languages" className="mb-7">
      <details className="group relative inline-block text-sm">
        <summary className="flex min-w-40 cursor-pointer list-none items-center justify-between gap-4 rounded-lg border border-white/30 bg-white/5 px-4 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 [&::-webkit-details-marker]:hidden">
          <span><span aria-hidden="true">🌐 </span><bdi>{PUBLIC_LOCALE_NAMES[locale]}</bdi></span>
          <span aria-hidden="true" className="text-amber-300">▾</span>
        </summary>
        <div className="absolute start-0 z-20 mt-1 max-h-72 min-w-full overflow-y-auto rounded-lg border border-white/25 bg-slate-950 p-1 shadow-xl">
          {PUBLIC_LOCALES.map(language => <Link key={language} href={universityStartPath(language)}
            hrefLang={language} lang={language} prefetch={false} aria-current={language === locale ? 'page' : undefined}
            className={`block whitespace-nowrap rounded-md px-4 py-2 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none ${language === locale ? 'bg-amber-300 font-semibold text-slate-950 hover:bg-amber-200' : 'text-slate-100'}`}>
            <bdi>{PUBLIC_LOCALE_NAMES[language]}</bdi>
          </Link>)}
        </div>
      </details>
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
