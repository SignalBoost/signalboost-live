'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  back:       { en: '← Back to Launchpad', es: '← Volver al Launchpad', pt: '← Voltar ao Launchpad', pl: '← Wróć do Launchpad', ru: '← Назад к Launchpad' },
  badge:      { en: '🛒 STORE', es: '🛒 TIENDA', pt: '🛒 LOJA', pl: '🛒 SKLEP', ru: '🛒 МАГАЗИН' },
  title1:     { en: 'Launch your online store,', es: 'Lanza tu tienda online,', pt: 'Lance sua loja online,', pl: 'Uruchom swój sklep online,', ru: 'Запустите свой интернет-магазин,' },
  title2:     { en: 'step by step', es: 'paso a paso', pt: 'passo a passo', pl: 'krok po kroku', ru: 'шаг за шагом' },
  subtitle:   { en: 'Sell online with a site, videos, reviews, and marketing. Describe what you sell, then work the steps.', es: 'Vende online con un sitio, videos, reseñas y marketing. Describe lo que vendes y trabaja cada paso.', pt: 'Venda online com um site, vídeos, avaliações e marketing. Descreva o que você vende e trabalhe cada etapa.', pl: 'Sprzedawaj online z witryną, filmami, opiniami i marketingiem. Opisz co sprzedajesz i przejdź przez kroki.', ru: 'Продавайте онлайн с сайтом, видео, отзывами и маркетингом. Опишите что продаёте и пройдите шаги.' },
  ideaLabel:  { en: 'What do you want to sell?', es: '¿Qué quieres vender?', pt: 'O que você quer vender?', pl: 'Co chcesz sprzedawać?', ru: 'Что вы хотите продавать?' },
  ideaHolder: { en: 'e.g. Handmade ceramics shipped across Europe.', es: 'ej. Cerámica artesanal enviada a toda Europa.', pt: 'ex. Cerâmica artesanal enviada por toda a Europa.', pl: 'np. Ręcznie robiona ceramika wysyłana po całej Europie.', ru: 'напр. Керамика ручной работы с доставкой по Европе.' },
  pathTitle:  { en: 'Your launch path', es: 'Tu ruta de lanzamiento', pt: 'Seu caminho de lançamento', pl: 'Twoja ścieżka uruchomienia', ru: 'Ваш путь запуска' },
  done:       { en: 'done', es: 'completado', pt: 'concluído', pl: 'ukończono', ru: 'выполнено' },
  open:       { en: 'Open →', es: 'Abrir →', pt: 'Abrir →', pl: 'Otwórz →', ru: 'Открыть →' },
  steps: [
    {
      label: { en: 'Build your storefront site', es: 'Construye tu sitio de tienda', pt: 'Construa seu site de loja', pl: 'Zbuduj stronę sklepu', ru: 'Создайте сайт магазина' },
      desc:  { en: 'Publish a site that shows your products and brand.', es: 'Publica un sitio que muestre tus productos y marca.', pt: 'Publique um site que mostre seus produtos e marca.', pl: 'Opublikuj stronę prezentującą Twoje produkty i markę.', ru: 'Опубликуйте сайт, демонстрирующий ваши товары и бренд.' },
      href: '/dashboard/builder',
    },
    {
      label: { en: 'Create product videos', es: 'Crea videos de productos', pt: 'Crie vídeos de produtos', pl: 'Twórz filmy o produktach', ru: 'Создайте видео о товарах' },
      desc:  { en: 'Produce short videos that show products in action.', es: 'Produce videos cortos que muestren los productos en acción.', pt: 'Produza vídeos curtos que mostrem os produtos em ação.', pl: 'Produkuj krótkie filmy pokazujące produkty w akcji.', ru: 'Создавайте короткие видео с товарами в действии.' },
      href: '/dashboard/video',
    },
    {
      label: { en: 'Collect product reviews', es: 'Recopila reseñas de productos', pt: 'Colete avaliações de produtos', pl: 'Zbieraj opinie o produktach', ru: 'Соберите отзывы о товарах' },
      desc:  { en: 'Gather customer trust and reuse it in marketing.', es: 'Reúne la confianza del cliente y reutilízala en marketing.', pt: 'Reúna a confiança do cliente e reutilize-a no marketing.', pl: 'Zbieraj zaufanie klientów i wykorzystuj je w marketingu.', ru: 'Собирайте доверие клиентов и используйте его в маркетинге.' },
      href: '/dashboard/reviews',
    },
    {
      label: { en: 'Launch marketing campaigns', es: 'Lanza campañas de marketing', pt: 'Lance campanhas de marketing', pl: 'Uruchamiaj kampanie marketingowe', ru: 'Запустите маркетинговые кампании' },
      desc:  { en: 'Generate localized promos and outreach for your store.', es: 'Genera promociones localizadas y outreach para tu tienda.', pt: 'Gere promoções localizadas e outreach para sua loja.', pl: 'Generuj zlokalizowane promocje i outreach dla swojego sklepu.', ru: 'Создавайте локализованные акции и аутрич для вашего магазина.' },
      href: '/dashboard/promote',
    },
    {
      label: { en: 'Track sales signals', es: 'Sigue las señales de ventas', pt: 'Acompanhe os sinais de vendas', pl: 'Śledź sygnały sprzedaży', ru: 'Отслеживайте сигналы продаж' },
      desc:  { en: 'Monitor what works and where to focus next.', es: 'Monitorea qué funciona y dónde enfocarte a continuación.', pt: 'Monitore o que funciona e onde focar a seguir.', pl: 'Monitoruj co działa i gdzie skupić się dalej.', ru: 'Отслеживайте что работает и на чём сосредоточиться далее.' },
      href: '/dashboard/metrics',
    },
  ],
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

const STORAGE_IDEA = 'launchpad:store:idea'
const STORAGE_DONE = 'launchpad:store:done'

export default function StoreLaunchpadPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [experience, setExperience] = useState('guided')
  const [idea, setIdea]             = useState('')
  const [done, setDone]             = useState<boolean[]>(() => COPY.steps.map(() => false))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setExperience(params.get('experience') || 'guided')
    try {
      setIdea(localStorage.getItem(STORAGE_IDEA) || '')
      const saved = localStorage.getItem(STORAGE_DONE)
      if (saved) setDone(JSON.parse(saved))
    } catch {}
  }, [])

  function saveIdea(value: string) {
    setIdea(value)
    try { localStorage.setItem(STORAGE_IDEA, value) } catch {}
  }

  function toggle(i: number) {
    setDone(prev => {
      const next = prev.map((v, idx) => idx === i ? !v : v)
      try { localStorage.setItem(STORAGE_DONE, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const completed = done.filter(Boolean).length

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(18px,4vw,40px) 0 80px', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      {/* Back */}
      <Link href="/dashboard/launchpad" style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {c(COPY.back, l)}
      </Link>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(74,222,128,.18), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(74,222,128,.26)', borderRadius: 28, padding: 'clamp(20px,4vw,32px)' }}>
        <div style={{ display: 'inline-flex', marginBottom: 14, padding: '5px 12px', borderRadius: 999, background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.26)', color: '#86efac', fontWeight: 900, fontSize: 11, letterSpacing: '.1em' }}>
          {c(COPY.badge, l)} · {experience.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 'clamp(26px,5vw,48px)', fontWeight: 900, letterSpacing: '-.05em', lineHeight: 1.05, margin: '0 0 12px' }}>
          {c(COPY.title1, l)} <span style={{ color: '#ffc300' }}>{c(COPY.title2, l)}</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.7, maxWidth: 600, margin: 0 }}>{c(COPY.subtitle, l)}</p>
      </div>

      {/* Idea input */}
      <div style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 'clamp(16px,3vw,22px)', display: 'grid', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 800, color: '#fff' }} htmlFor="idea">{c(COPY.ideaLabel, l)}</label>
        <textarea
          id="idea"
          value={idea}
          onChange={e => saveIdea(e.target.value)}
          rows={3}
          placeholder={c(COPY.ideaHolder, l)}
          className="sb-input"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.7 }}
        />
      </div>

      {/* Steps */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(16px,3vw,22px)', fontWeight: 900, letterSpacing: '-.03em' }}>{c(COPY.pathTitle, l)}</h2>
          <span style={{ color: '#ffc300', fontWeight: 900, fontSize: 13 }}>{completed}/{COPY.steps.length} {c(COPY.done, l)}</span>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {COPY.steps.map((step, i) => (
            <article key={i} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: 18, borderRadius: 20, background: done[i] ? 'rgba(134,239,172,.06)' : 'rgba(255,255,255,.03)', border: done[i] ? '1px solid rgba(134,239,172,.32)' : '1px solid rgba(255,255,255,.09)', transition: 'border-color .18s, background .18s' }}>
              <button
                onClick={() => toggle(i)}
                aria-label="Toggle step complete"
                style={{ cursor: 'pointer', width: 34, height: 34, borderRadius: 999, border: done[i] ? '1px solid #86efac' : '1px solid rgba(255,255,255,.28)', background: done[i] ? '#86efac' : 'rgba(255,255,255,.04)', color: done[i] ? '#05210f' : 'rgba(255,255,255,.7)', fontWeight: 900, fontSize: 13, display: 'grid', placeItems: 'center', transition: 'all .18s' }}
              >
                {done[i] ? '✓' : i + 1}
              </button>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 14, fontWeight: 800, color: done[i] ? '#86efac' : '#fff', marginBottom: 3 }}>{c(step.label, l)}</strong>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, lineHeight: 1.6 }}>{c(step.desc, l)}</span>
              </div>
              <Link href={step.href} style={{ whiteSpace: 'nowrap', padding: '10px 16px', borderRadius: 12, background: '#ffc300', color: '#1a1300', fontWeight: 900, textDecoration: 'none', fontSize: 13 }}>
                {c(COPY.open, l)}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
