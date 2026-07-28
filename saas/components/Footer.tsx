'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const GOLD = '#ffc300'
const BRAND = 'SignalBoost'
const AI_BRAND = 'SignalBoost AI'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type FooterCopy = {
  product: string
  home: string
  pricing: string
  repoCheck: string
  websiteOptimizer: string
  dashboard: string
  documentation: string
  faq: string
  podcasters: string
  build: string
  buildWebsite: string
  collectReviews: string
  generateNativeAudio: string
  createVideos: string
  company: string
  about: string
  partners: string
  privacy: string
  contact: string
  nativeExperiences: string
  poweredBy: string
}

const COPY: Record<Language, FooterCopy> = {
  en: {
    product: uiText('generatedUi.u_fb9ef894175c3274'), home: uiText('generatedUi.u_3a78695388b38b5c'), pricing: uiText('generatedUi.u_dfe95783edfef791'), repoCheck: uiText('generatedUi.u_8651dc793a5300ac'), websiteOptimizer: uiText('generatedUi.u_34c6e246583a97cc'), dashboard: uiText('generatedUi.u_67b696468610b879'), documentation: uiText('generatedUi.u_c205924de0fe636c'), faq: uiText('generatedUi.u_dbc468a14b601d5d'), podcasters: uiText('generatedUi.u_0d74ad5328bfdd35'), build: uiText('generatedUi.u_bdd254b65baac169'), buildWebsite: uiText('generatedUi.u_2572dc4557068313'), collectReviews: uiText('generatedUi.u_acb928c5ad0b574b'), generateNativeAudio: uiText('generatedUi.u_e6b4b7d5c4fa2d5b'), createVideos: uiText('generatedUi.u_e03e4252b1e8da4d'), company: uiText('generatedUi.u_de4743c879734dc3'), about: uiText('generatedUi.u_4efca0d10c5feb8e'), partners: uiText('generatedUi.u_5dab502bfba3c3df'), privacy: uiText('generatedUi.u_54a57c3147c49f33'), contact: uiText('generatedUi.u_2b5c3d26721ae9c3'), nativeExperiences: uiText('generatedUi.u_99b26c23af00f998'), poweredBy: uiText('generatedUi.u_fdc5d2e9410c2d88'),
  },
  es: {
    product: 'Producto', home: 'Inicio', pricing: 'Precios', repoCheck: 'Revisión gratuita del repositorio', websiteOptimizer: 'Optimizador web gratuito', dashboard: 'Panel', documentation: 'Documentación', faq: 'Preguntas frecuentes', podcasters: 'Podcasters', build: 'Crear', buildWebsite: 'Crear un sitio web', collectReviews: 'Recopilar reseñas', generateNativeAudio: 'Generar audio nativo', createVideos: 'Crear videos', company: 'Empresa', about: 'Acerca de', partners: 'Socios', privacy: 'Privacidad', contact: 'Contacto', nativeExperiences: 'Experiencias nativas disponibles en', poweredBy: 'Desarrollado por',
  },
  pt: {
    product: 'Produto', home: 'Início', pricing: 'Preços', repoCheck: 'Verificação gratuita do repositório', websiteOptimizer: 'Otimizador de site gratuito', dashboard: 'Painel', documentation: 'Documentação', faq: 'Perguntas frequentes', podcasters: 'Podcasters', build: 'Criar', buildWebsite: 'Criar um site', collectReviews: 'Coletar avaliações', generateNativeAudio: 'Gerar áudio nativo', createVideos: 'Criar vídeos', company: 'Empresa', about: 'Sobre', partners: 'Parceiros', privacy: 'Privacidade', contact: 'Contato', nativeExperiences: 'Experiências nativas disponíveis em', poweredBy: 'Desenvolvido por',
  },
  pl: {
    product: 'Produkt', home: 'Strona główna', pricing: 'Cennik', repoCheck: 'Bezpłatna kontrola repozytorium', websiteOptimizer: 'Bezpłatny optymalizator strony', dashboard: 'Panel', documentation: 'Dokumentacja', faq: 'Najczęstsze pytania', podcasters: 'Podcasterzy', build: 'Tworzenie', buildWebsite: 'Utwórz stronę internetową', collectReviews: 'Zbieraj opinie', generateNativeAudio: 'Generuj naturalne audio', createVideos: 'Twórz filmy', company: 'Firma', about: 'O nas', partners: 'Partnerzy', privacy: 'Prywatność', contact: 'Kontakt', nativeExperiences: 'Natywne wersje dostępne w językach', poweredBy: 'Obsługiwane przez',
  },
  ru: {
    product: 'Продукт', home: 'Главная', pricing: 'Цены', repoCheck: 'Бесплатная проверка репозитория', websiteOptimizer: 'Бесплатный оптимизатор сайта', dashboard: 'Панель', documentation: 'Документация', faq: 'Частые вопросы', podcasters: 'Подкастеры', build: 'Создание', buildWebsite: 'Создать сайт', collectReviews: 'Собирать отзывы', generateNativeAudio: 'Создать естественное аудио', createVideos: 'Создавать видео', company: 'Компания', about: 'О нас', partners: 'Партнёры', privacy: 'Конфиденциальность', contact: 'Контакты', nativeExperiences: 'Локализованные версии доступны на языках', poweredBy: 'Работает на платформе',
  },
}

const LANGUAGES = [
  { flag: '🇺🇸', name: 'English' },
  { flag: '🇧🇷', name: 'Português' },
  { flag: '🇪🇸', name: 'Español' },
  { flag: '🇵🇱', name: 'Polski' },
  { flag: '🇷🇺', name: 'Русский' },
]

export default function Footer() {
  const { lang } = useI18n()
  const copy = COPY[(lang as Language) in COPY ? (lang as Language) : 'en']
  const pathname = usePathname()
  const year = new Date().getFullYear()

  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin')) return null

  const productLinks = [
    { label: copy.home, href: '/' },
    { label: copy.pricing, href: '/pricing' },
    { label: copy.repoCheck, href: '/repo-check' },
    { label: copy.websiteOptimizer, href: '/website-optimizer' },
    { label: copy.dashboard, href: '/dashboard' },
    { label: copy.documentation, href: '/docs' },
    { label: copy.faq, href: '/faq' },
    { label: copy.podcasters, href: '/podcasters' },
  ]
  const buildLinks = [
    { label: copy.buildWebsite, href: '/dashboard/builder' },
    { label: copy.collectReviews, href: '/dashboard/reviews' },
    { label: copy.generateNativeAudio, href: '/dashboard/audio' },
    { label: copy.createVideos, href: '/dashboard/video' },
  ]
  const companyLinks = [
    { label: copy.about, href: '/docs#how-it-works' },
    { label: copy.partners, href: '/docs#partners' },
    { label: copy.privacy, href: '/docs#your-data' },
    { label: copy.contact, href: '/support' },
  ]

  const LinkGroup = ({ title, items }: { title: string; items: Array<{ label: string; href: string }> }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => (
          <Link key={item.href} href={item.href} style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }} onMouseEnter={event => { event.currentTarget.style.color = '#fff' }} onMouseLeave={event => { event.currentTarget.style.color = 'var(--text-muted)' }}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )

  return (
    <footer style={{ background: 'var(--surface-1)', borderTop: '1px solid var(--border-soft)', fontFamily: 'system-ui', color: 'var(--text-primary)', marginTop: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 32, marginBottom: 36 }}>
          <LinkGroup title={copy.product} items={productLinks} />
          <LinkGroup title={copy.build} items={buildLinks} />
          <LinkGroup title={copy.company} items={companyLinks} />
        </div>

        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{copy.nativeExperiences}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {LANGUAGES.map(language => (
              <div key={language.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{language.flag}</span>
                <span>{language.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>© {year} {BRAND}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {copy.poweredBy}{' '}<span style={{ color: GOLD }}>{AI_BRAND}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
