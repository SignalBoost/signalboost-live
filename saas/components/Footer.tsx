'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
    product: uiCopy('u_f6c2a37d5674a049'), home: uiCopy('u_2742b68cb5e3034c'), pricing: uiCopy('u_c38bc5a996802a03'), repoCheck: uiCopy('u_3739e2a269f1a5da'), websiteOptimizer: uiCopy('u_fd3fc3d3742daa36'), dashboard: uiCopy('u_2419d769a0e4163d'), documentation: uiCopy('u_dafcf754def0fcf4'), faq: uiCopy('u_327ddb725f37432c'), podcasters: uiCopy('u_e69d9f4c10880709'), build: uiCopy('u_b1e7ecd0f0736d68'), buildWebsite: uiCopy('u_16546e3882337db2'), collectReviews: uiCopy('u_5505ded130cfe875'), generateNativeAudio: uiCopy('u_1f56f9863432a198'), createVideos: uiCopy('u_cae9c0a6ecb95397'), company: uiCopy('u_c549f87d7cbd312c'), about: uiCopy('u_46f2b33a8b5e778b'), partners: uiCopy('u_00d0874f2e403ad3'), privacy: uiCopy('u_9456f608b52bec8b'), contact: uiCopy('u_5d7961c2350d98b7'), nativeExperiences: uiCopy('u_065e388536138856'), poweredBy: uiCopy('u_1be3d77adb95e486'),
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
