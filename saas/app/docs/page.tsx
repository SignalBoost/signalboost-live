'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:   { en: 'Documentation', es: 'Documentación', pt: 'Documentação', pl: 'Dokumentacja', ru: 'Документация' },
  title:     { en: 'A clear map for building with SignalBoost.', es: 'Un mapa claro para construir con SignalBoost.', pt: 'Um mapa claro para construir com SignalBoost.', pl: 'Przejrzysta mapa do budowania z SignalBoost.', ru: 'Чёткая карта для создания с SignalBoost.' },
  subtitle:  { en: 'Docs are organized by how a human thinks through work: choose an intent, follow AI guidance, review the output, and approve the final action.', es: 'Los docs están organizados por cómo una persona piensa el trabajo: elige una intención, sigue la guía IA, revisa el resultado y aprueba la acción final.', pt: 'Os docs estão organizados por como uma pessoa pensa o trabalho: escolha uma intenção, siga a orientação IA, revise o resultado e aprove a ação final.', pl: 'Dokumenty są zorganizowane według sposobu myślenia człowieka: wybierz intencję, śledź wskazówki AI, sprawdź wynik i zatwierdź końcowe działanie.', ru: 'Документы организованы так, как человек думает о работе: выберите намерение, следуйте руководству ИИ, проверьте результат и одобрите финальное действие.' },
  scanPath:  { en: 'Scan path', es: 'Ruta de escaneo', pt: 'Caminho de leitura', pl: 'Ścieżka skanowania', ru: 'Путь обзора' },
  step:      { en: 'Step', es: 'Paso', pt: 'Passo', pl: 'Krok', ru: 'Шаг' },
  publicTools: {
    title: { en: 'Free public tools / ad landing pages', es: 'Herramientas públicas gratis / páginas para anuncios', pt: 'Ferramentas públicas gratuitas / páginas para anúncios', pl: 'Darmowe narzędzia publiczne / strony do reklam', ru: 'Бесплатные публичные инструменты / страницы для рекламы' },
    body: { en: 'Use these links when preparing digital newspaper, community classified, or local directory ads. The first two are public-safe and best for cold public ads.', es: 'Usa estos enlaces al preparar anuncios para periódicos digitales, clasificados comunitarios o directorios locales. Los dos primeros son públicos y mejores para anuncios fríos.', pt: 'Use estes links ao preparar anúncios para jornais digitais, classificados comunitários ou diretórios locais. Os dois primeiros são públicos e melhores para anúncios frios.', pl: 'Używaj tych linków przy przygotowywaniu reklam do gazet cyfrowych, ogłoszeń społecznościowych lub katalogów lokalnych. Pierwsze dwa są publiczne i najlepsze do reklam.', ru: 'Используйте эти ссылки для цифровых газет, объявлений и локальных каталогов. Первые две страницы публичные и лучше подходят для рекламы.' },
    bestForAds: { en: 'Best for newspaper ads', es: 'Mejor para anuncios', pt: 'Melhor para anúncios', pl: 'Najlepsze do reklam', ru: 'Лучше для рекламы' },
    internal: { en: 'Internal / logged-in reference', es: 'Referencia interna / con sesión', pt: 'Referência interna / com login', pl: 'Wewnętrzne / po zalogowaniu', ru: 'Внутренняя ссылка / вход' },
  },
  quickLinks: {
    dashboard: { en: 'Dashboard', es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель' },
    outreach:  { en: 'Outreach Engine', es: 'Motor de prospección', pt: 'Motor de prospecção', pl: 'Silnik outreach', ru: 'Движок аутрича' },
    pricing:   { en: 'Pricing', es: 'Precios', pt: 'Preços', pl: 'Cennik', ru: 'Цены' },
    support:   { en: 'Support', es: 'Soporte', pt: 'Suporte', pl: 'Wsparcie', ru: 'Поддержка' },
  },
  sections: [
    {
      step: '1',
      title: { en: 'Choose an intent', es: 'Elige una intención', pt: 'Escolha uma intenção', pl: 'Wybierz intencję', ru: 'Выберите намерение' },
      body:  { en: 'Start with Promote, Builder, Reviews, Audio, Video, or Outreach so every workflow has one clear goal.', es: 'Comienza con Promocionar, Constructor, Reseñas, Audio, Video o Prospección para que cada flujo tenga un objetivo claro.', pt: 'Comece com Promover, Construtor, Avaliações, Áudio, Vídeo ou Prospecção para que cada fluxo tenha um objetivo claro.', pl: 'Zacznij od Promocji, Kreatora, Opinii, Audio, Wideo lub Outreachu, aby każdy przepływ miał jeden jasny cel.', ru: 'Начните с Продвижения, Конструктора, Отзывов, Аудио, Видео или Аутрича, чтобы каждый процесс имел одну чёткую цель.' },
    },
    {
      step: '2',
      title: { en: 'Let AI suggest first', es: 'Deja que la IA sugiera primero', pt: 'Deixe a IA sugerir primeiro', pl: 'Najpierw pozwól AI zasugerować', ru: 'Сначала пусть ИИ предложит' },
      body:  { en: 'Read the suggested prompt, tone, and feedback before typing your own instructions.', es: 'Lee el prompt sugerido, el tono y el feedback antes de escribir tus propias instrucciones.', pt: 'Leia o prompt sugerido, o tom e o feedback antes de digitar suas próprias instruções.', pl: 'Przeczytaj sugerowany prompt, ton i informacje zwrotne przed wpisaniem własnych instrukcji.', ru: 'Прочитайте предложенный промпт, тон и обратную связь перед вводом собственных инструкций.' },
    },
    {
      step: '3',
      title: { en: 'Review generated assets', es: 'Revisa los activos generados', pt: 'Revise os ativos gerados', pl: 'Przejrzyj wygenerowane zasoby', ru: 'Проверьте созданные материалы' },
      body:  { en: 'Scan grouped cards: summary, audience, copy, proof, and risks. Avoid bouncing between unrelated panels.', es: 'Escanea tarjetas agrupadas: resumen, audiencia, copy, prueba y riesgos. Evita saltar entre paneles no relacionados.', pt: 'Escaneie cartões agrupados: resumo, público, copy, prova e riscos. Evite pular entre painéis não relacionados.', pl: 'Skanuj zgrupowane karty: podsumowanie, odbiorcy, treść, dowód i ryzyka. Unikaj przeskakiwania między niezwiązanymi panelami.', ru: 'Просматривайте сгруппированные карточки: резюме, аудитория, текст, доказательства и риски. Избегайте прыжков между несвязанными панелями.' },
    },
    {
      step: '4',
      title: { en: 'Approve and publish', es: 'Aprueba y publica', pt: 'Aprove e publique', pl: 'Zatwierdź i opublikuj', ru: 'Одобрите и опубликуйте' },
      body:  { en: 'Use the approval queue for final human judgment before outreach or public content goes live.', es: 'Usa la cola de aprobación para el juicio humano final antes de que el outreach o el contenido público se publique.', pt: 'Use a fila de aprovação para o julgamento humano final antes que o outreach ou conteúdo público seja publicado.', pl: 'Użyj kolejki zatwierdzania do ostatecznej oceny ludzkiej przed uruchomieniem outreachu lub treści publicznych.', ru: 'Используйте очередь одобрения для финального человеческого решения перед публикацией аутрича или публичного контента.' },
    },
  ],
}

const AD_LANDING_LINKS = [
  {
    title: 'Free Website Optimization Scan',
    href: '/website-optimizer',
    url: 'https://www.saas.signalboostapp.com/website-optimizer',
    badge: 'Best for newspaper ads',
    description: 'SEO, performance, accessibility, security, conversion, and business-growth preview.',
  },
  {
    title: 'Free Cybersecurity Preview',
    href: '/cybersecurity-check',
    url: 'https://www.saas.signalboostapp.com/cybersecurity-check',
    badge: 'Best for newspaper ads',
    description: 'Safe public website security signals: HTTPS, headers, cookie flags, and exposure indicators.',
  },
  {
    title: 'Audit Console',
    href: '/dashboard/audit',
    url: 'https://www.saas.signalboostapp.com/dashboard/audit',
    badge: 'Internal / logged-in reference',
    description: 'Dashboard audit workspace. Use as internal reference, not as the default cold newspaper-ad CTA.',
  },
]

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

export default function DocsPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const quickLinks = [
    { label: c(COPY.quickLinks.dashboard, l), href: '/dashboard' },
    { label: c(COPY.quickLinks.outreach, l),  href: '/dashboard/outreach/outreach' },
    { label: c(COPY.quickLinks.pricing, l),   href: '/pricing' },
    { label: c(COPY.quickLinks.support, l),   href: '/support' },
  ]

  return (
    <div className="sb-page-shell" style={{ padding: 'clamp(18px,4vw,48px) 0 80px', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      {/* Header — flat compact bar */}
      <section style={{ borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>📖 {c(COPY.eyebrow, l)}</p>
            <h1 style={{ fontSize: 24, fontWeight: 950, letterSpacing: '-.045em', lineHeight: 1.1, margin: '4px 0 0' }}>{c(COPY.title, l)}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {quickLinks.map(({ label, href }) => (
              <Link key={href} className="sb-button-secondary" href={href} style={{ fontSize: 12, padding: '7px 13px' }}>{label}</Link>
            ))}
          </div>
        </div>
      </section>

      {/* Body */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, alignItems: 'start' }} className="sb-docs-grid">

        {/* Sidebar nav */}
        <aside style={{ borderRight: '1px solid rgba(255,255,255,.08)', paddingRight: 20, position: 'sticky', top: 90 }}>
          <p className="sb-eyebrow" style={{ marginBottom: 14 }}>{c(COPY.scanPath, l)}</p>
          <nav style={{ display: 'grid', gap: 10 }}>
            <a href="#ad-landing-pages" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#1af0ff', fontWeight: 900, fontSize: 11, marginTop: 2, flexShrink: 0 }}>ADS</span>
              {c(COPY.publicTools.title, l)}
            </a>
            {COPY.sections.map(s => (
              <a key={s.step} href={`#step-${s.step}`} style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#ffc300', fontWeight: 900, fontSize: 11, marginTop: 2, flexShrink: 0 }}>{c(COPY.step, l)} {s.step}</span>
                {c(s.title, l)}
              </a>
            ))}
          </nav>
        </aside>

        {/* Steps */}
        <div style={{ display: 'grid', gap: 14 }}>
          <article id="ad-landing-pages" style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '18px 0 8px', scrollMarginTop: 90 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 8 }}>📰 Digital newspaper ads</p>
            <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 10px' }}>{c(COPY.publicTools.title, l)}</h2>
            <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.7, fontSize: 14, margin: 0 }}>{c(COPY.publicTools.body, l)}</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {AD_LANDING_LINKS.map(link => (
                <Link key={link.href} href={link.href} style={{ display: 'grid', gap: 6, border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: 14, color: 'inherit', textDecoration: 'none', background: 'rgba(255,255,255,.035)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong style={{ color: '#fff', fontSize: 14 }}>{link.title}</strong>
                    <span style={{ border: '1px solid rgba(26,240,255,.28)', borderRadius: 999, color: '#1af0ff', padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>{link.badge}</span>
                  </div>
                  <code style={{ color: '#ffc300', fontSize: 12, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{link.url}</code>
                  <span style={{ color: 'rgba(255,255,255,.58)', fontSize: 13, lineHeight: 1.5 }}>{link.description}</span>
                </Link>
              ))}
            </div>
          </article>

          {COPY.sections.map(s => (
            <article key={s.step} id={`step-${s.step}`} style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '18px 0 6px', scrollMarginTop: 90 }}>
              <p className="sb-eyebrow" style={{ marginBottom: 8 }}>{c(COPY.step, l)} {s.step}</p>
              <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 10px' }}>{c(s.title, l)}</h2>
              <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.7, fontSize: 14, margin: 0 }}>{c(s.body, l)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
