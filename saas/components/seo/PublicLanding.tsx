import Link from 'next/link'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { PUBLIC_COPY } from '@/lib/seo/publicCopy'
import { PUBLIC_LOCALES, PUBLIC_LOCALE_NAMES, PUBLIC_TOPICS, publicPagePath, type PublicLocale, type PublicTopic } from '@/lib/seo/publicLocales'
import { publicPageSchema, publicTopicCopy } from '@/lib/seo/publicSeo'
import { writingDirection } from '@/lib/i18n/localeExpansion'

const EU_PRIVACY_COPY: Partial<Record<PublicLocale, { heading: string; body: string; link: string }>> = {
  en: { heading: 'Privacy, GDPR and data location', body: 'We take European data-protection requirements seriously. Where personal data is stored or processed can depend on the service and the providers you connect. Review our data-handling information and contact support for the applicable hosting region, subprocessors, international transfers, retention and your access or deletion rights before sharing sensitive data.', link: 'Data-handling information' },
  de: { heading: 'Datenschutz, DSGVO und Datenspeicherung', body: 'Der Schutz personenbezogener Daten ist wichtig. Speicher- und Verarbeitungsorte können je nach Dienst und angebundenem Anbieter variieren. Informieren Sie sich vor der Übermittlung sensibler Daten über Hosting-Regionen, Auftragsverarbeiter, internationale Übermittlungen, Aufbewahrung sowie Auskunfts- und Löschrechte.', link: 'Informationen zur Datenverarbeitung' },
  fr: { heading: 'Confidentialité, RGPD et localisation des données', body: 'La protection des données personnelles est essentielle. Les lieux de stockage et de traitement peuvent varier selon le service et les fournisseurs connectés. Avant de transmettre des données sensibles, renseignez-vous sur les régions d’hébergement, les sous-traitants, les transferts internationaux, la conservation et vos droits d’accès et d’effacement.', link: 'Informations sur le traitement des données' },
  it: { heading: 'Privacy, GDPR e ubicazione dei dati', body: 'La protezione dei dati personali è importante. Il luogo di archiviazione e trattamento può variare in base al servizio e ai fornitori collegati. Prima di condividere dati sensibili, verifica le regioni di hosting, i responsabili del trattamento, i trasferimenti internazionali, i periodi di conservazione e i diritti di accesso e cancellazione.', link: 'Informazioni sul trattamento dei dati' },
  es: { heading: 'Privacidad, RGPD y ubicación de los datos', body: 'La protección de los datos personales es importante. El lugar de almacenamiento y tratamiento puede variar según el servicio y los proveedores conectados. Antes de compartir datos sensibles, consulta las regiones de alojamiento, los encargados del tratamiento, las transferencias internacionales, la conservación y tus derechos de acceso y supresión.', link: 'Información sobre el tratamiento de datos' },
  pt: { heading: 'Privacidade, RGPD e localização dos dados', body: 'A proteção dos dados pessoais é importante. O armazenamento e o processamento podem ocorrer em locais diferentes conforme o serviço e os fornecedores ligados. Antes de partilhar dados sensíveis, consulte as regiões de alojamento, os subcontratantes, as transferências internacionais, a conservação e os direitos de acesso e eliminação.', link: 'Informações sobre tratamento de dados' },
  pl: { heading: 'Prywatność, RODO i lokalizacja danych', body: 'Ochrona danych osobowych jest ważna. Miejsce przechowywania i przetwarzania danych może zależeć od usługi i podłączonych dostawców. Przed przesłaniem danych wrażliwych sprawdź regiony hostingu, podmioty przetwarzające, transfery międzynarodowe, okres przechowywania oraz prawa dostępu i usunięcia danych.', link: 'Informacje o przetwarzaniu danych' },
}

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
      {EU_PRIVACY_COPY[locale] ? <section aria-labelledby="eu-data-privacy" className="my-8 rounded-2xl border border-white/20 bg-white/5 p-6">
        <h2 id="eu-data-privacy" className="text-2xl font-semibold">{EU_PRIVACY_COPY[locale].heading}</h2>
        <p className="mt-4 max-w-4xl leading-relaxed text-slate-300">{EU_PRIVACY_COPY[locale].body}</p>
        <Link href="/docs#your-data" prefetch={false} className="mt-4 inline-block underline underline-offset-4">{EU_PRIVACY_COPY[locale].link}</Link>
      </section> : null}
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
