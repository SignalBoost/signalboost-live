'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:   { en: uiCopy('u_ad115f095d80c460'), es: 'Documentación', pt: 'Documentação', pl: 'Dokumentacja', ru: 'Документация' },
  title:     { en: uiCopy('u_33b560fe105a2462'), es: 'Un mapa claro para construir con SignalBoost.', pt: 'Um mapa claro para construir com SignalBoost.', pl: 'Przejrzysta mapa do budowania z SignalBoost.', ru: 'Чёткая карта для создания с SignalBoost.' },
  subtitle:  { en: uiCopy('u_b78d4fb1a672d6a5'), es: 'Los docs están organizados por cómo una persona piensa el trabajo: elige una intención, sigue la guía IA, revisa el resultado y aprueba la acción final.', pt: 'Os docs estão organizados por como uma pessoa pensa o trabalho: escolha uma intenção, siga a orientação IA, revise o resultado e aprove a ação final.', pl: 'Dokumenty są zorganizowane według sposobu myślenia człowieka: wybierz intencję, śledź wskazówki AI, sprawdź wynik i zatwierdź końcowe działanie.', ru: 'Документы организованы так, как человек думает о работе: выберите намерение, следуйте руководству ИИ, проверьте результат и одобрите финальное действие.' },
  scanPath:  { en: uiCopy('u_cec06ad16542634e'), es: 'Ruta de escaneo', pt: 'Caminho de leitura', pl: 'Ścieżka skanowania', ru: 'Путь обзора' },
  step:      { en: uiCopy('u_b5a32b18226320bb'), es: 'Paso', pt: 'Passo', pl: 'Krok', ru: 'Шаг' },
  publicTools: {
    title: { en: uiCopy('u_c65ce50d3c8ba106'), es: 'Herramientas públicas gratis / páginas para anuncios', pt: 'Ferramentas públicas gratuitas / páginas para anúncios', pl: 'Darmowe narzędzia publiczne / strony do reklam', ru: 'Бесплатные публичные инструменты / страницы для рекламы' },
    body: { en: uiCopy('u_74304fba9217afed'), es: 'Usa estos enlaces al preparar anuncios para periódicos digitales, clasificados comunitarios o directorios locales. Los dos primeros son públicos y mejores para anuncios fríos.', pt: 'Use estes links ao preparar anúncios para jornais digitais, classificados comunitários ou diretórios locais. Os dois primeiros são públicos e melhores para anúncios frios.', pl: 'Używaj tych linków przy przygotowywaniu reklam do gazet cyfrowych, ogłoszeń społecznościowych lub katalogów lokalnych. Pierwsze dwa są publiczne i najlepsze do reklam.', ru: 'Используйте эти ссылки для цифровых газет, объявлений и локальных каталогов. Первые две страницы публичные и лучше подходят для рекламы.' },
    bestForAds: { en: uiCopy('u_afc95e3add1c9f3f'), es: 'Mejor para anuncios', pt: 'Melhor para anúncios', pl: 'Najlepsze do reklam', ru: 'Лучше для рекламы' },
    internal: { en: uiCopy('u_a59b6800f39603fb'), es: 'Referencia interna / con sesión', pt: 'Referência interna / com login', pl: 'Wewnętrzne / po zalogowaniu', ru: 'Внутренняя ссылка / вход' },
  },
  quickLinks: {
    dashboard: { en: uiCopy('u_d155fd8934991647'), es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель' },
    outreach:  { en: uiCopy('u_fb61a7122a0e558e'), es: 'Motor de prospección', pt: 'Motor de prospecção', pl: 'Silnik outreach', ru: 'Движок аутрича' },
    pricing:   { en: uiCopy('u_43ded76ca067c634'), es: 'Precios', pt: 'Preços', pl: 'Cennik', ru: 'Цены' },
    support:   { en: uiCopy('u_f2b40ee3d21b3c47'), es: 'Soporte', pt: 'Suporte', pl: 'Wsparcie', ru: 'Поддержка' },
  },
  sections: [
    {
      step: '1',
      title: { en: uiCopy('u_9464586ccc81ad26'), es: 'Elige una intención', pt: 'Escolha uma intenção', pl: 'Wybierz intencję', ru: 'Выберите намерение' },
      body:  { en: uiCopy('u_ace33378bf8c4973'), es: 'Comienza con Promocionar, Constructor, Reseñas, Audio, Video o Prospección para que cada flujo tenga un objetivo claro.', pt: 'Comece com Promover, Construtor, Avaliações, Áudio, Vídeo ou Prospecção para que cada fluxo tenha um objetivo claro.', pl: 'Zacznij od Promocji, Kreatora, Opinii, Audio, Wideo lub Outreachu, aby każdy przepływ miał jeden jasny cel.', ru: 'Начните с Продвижения, Конструктора, Отзывов, Аудио, Видео или Аутрича, чтобы каждый процесс имел одну чёткую цель.' },
    },
    {
      step: '2',
      title: { en: uiCopy('u_db3c15cbf77ae499'), es: 'Deja que la IA sugiera primero', pt: 'Deixe a IA sugerir primeiro', pl: 'Najpierw pozwól AI zasugerować', ru: 'Сначала пусть ИИ предложит' },
      body:  { en: uiCopy('u_356b1a65d629fcfb'), es: 'Lee el prompt sugerido, el tono y el feedback antes de escribir tus propias instrucciones.', pt: 'Leia o prompt sugerido, o tom e o feedback antes de digitar suas próprias instruções.', pl: 'Przeczytaj sugerowany prompt, ton i informacje zwrotne przed wpisaniem własnych instrukcji.', ru: 'Прочитайте предложенный промпт, тон и обратную связь перед вводом собственных инструкций.' },
    },
    {
      step: '3',
      title: { en: uiCopy('u_d5868430b31979e0'), es: 'Revisa los activos generados', pt: 'Revise os ativos gerados', pl: 'Przejrzyj wygenerowane zasoby', ru: 'Проверьте созданные материалы' },
      body:  { en: uiCopy('u_45b53c1abdf3192f'), es: 'Escanea tarjetas agrupadas: resumen, audiencia, copy, prueba y riesgos. Evita saltar entre paneles no relacionados.', pt: 'Escaneie cartões agrupados: resumo, público, copy, prova e riscos. Evite pular entre painéis não relacionados.', pl: 'Skanuj zgrupowane karty: podsumowanie, odbiorcy, treść, dowód i ryzyka. Unikaj przeskakiwania między niezwiązanymi panelami.', ru: 'Просматривайте сгруппированные карточки: резюме, аудитория, текст, доказательства и риски. Избегайте прыжков между несвязанными панелями.' },
    },
    {
      step: '4',
      title: { en: uiCopy('u_47e553e9a4f11584'), es: 'Aprueba y publica', pt: 'Aprove e publique', pl: 'Zatwierdź i opublikuj', ru: 'Одобрите и опубликуйте' },
      body:  { en: uiCopy('u_9cc2120781e15807'), es: 'Usa la cola de aprobación para el juicio humano final antes de que el outreach o el contenido público se publique.', pt: 'Use a fila de aprovação para o julgamento humano final antes que o outreach ou conteúdo público seja publicado.', pl: 'Użyj kolejki zatwierdzania do ostatecznej oceny ludzkiej przed uruchomieniem outreachu lub treści publicznych.', ru: 'Используйте очередь одобрения для финального человеческого решения перед публикацией аутрича или публичного контента.' },
    },
  ],
}

const AD_LANDING_LINKS = [
  {
    title: uiCopy('u_97571e758203697a'),
    href: '/website-optimizer',
    url: 'https://www.saas.signalboostapp.com/website-optimizer',
    badge: uiCopy('u_07be5d3c6b7ece63'),
    description: uiCopy('u_61e404b59c3de7fe'),
  },
  {
    title: uiCopy('u_0c0bc591487174dc'),
    href: '/cybersecurity-check',
    url: 'https://www.saas.signalboostapp.com/cybersecurity-check',
    badge: uiCopy('u_26f39ecace65fe4f'),
    description: uiCopy('u_c8ec6cd56cacbd7f'),
  },
  {
    title: uiCopy('u_c330a2176bee03c0'),
    href: '/dashboard/audit',
    url: 'https://www.saas.signalboostapp.com/dashboard/audit',
    badge: uiCopy('u_0e35648b1cc22c41'),
    description: uiCopy('u_c474565c10661546'),
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
              <span style={{ color: '#1af0ff', fontWeight: 900, fontSize: 11, marginTop: 2, flexShrink: 0 }}>{uiCopy('u_6fbb869bb762ef0d')}</span>
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
            <p className="sb-eyebrow" style={{ marginBottom: 8 }}>{uiCopy('u_1064cba4abc4191d')}</p>
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
