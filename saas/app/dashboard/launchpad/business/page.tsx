'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  back:        { en: '← Back to Launchpad', es: '← Volver al Launchpad', pt: '← Voltar ao Launchpad', pl: '← Wróć do Launchpad', ru: '← Назад к Launchpad' },
  badge:       { en: '🏪 BUSINESS', es: '🏪 NEGOCIO', pt: '🏪 NEGÓCIO', pl: '🏪 BIZNES', ru: '🏪 БИЗНЕС' },
  title1:      { en: 'Launch your business,', es: 'Lanza tu negocio,', pt: 'Lance seu negócio,', pl: 'Uruchom swój biznes,', ru: 'Запустите свой бизнес,' },
  title2:      { en: 'step by step', es: 'paso a paso', pt: 'passo a passo', pl: 'krok po kroku', ru: 'шаг за шагом' },
  subtitle:    { en: 'You bring the idea — SignalBoost handles the build. Start by describing your business, then work through each step.', es: 'Tú traes la idea — SignalBoost se encarga de construirlo. Comienza describiendo tu negocio y trabaja cada paso.', pt: 'Você traz a ideia — SignalBoost cuida da construção. Comece descrevendo seu negócio e trabalhe cada etapa.', pl: 'Ty masz pomysł — SignalBoost zajmuje się budową. Zacznij od opisania swojego biznesu i przejdź przez każdy krok.', ru: 'Вы приносите идею — SignalBoost занимается созданием. Начните с описания вашего бизнеса и пройдите каждый шаг.' },
  ideaLabel:   { en: "What's your business?", es: '¿Cuál es tu negocio?', pt: 'Qual é o seu negócio?', pl: 'Czym jest Twój biznes?', ru: 'Что такое ваш бизнес?' },
  ideaHolder:  { en: 'e.g. A family-run bakery in Lisbon that ships custom cakes.', es: 'ej. Una panadería familiar en Lisboa que envía tartas personalizadas.', pt: 'ex. Uma padaria familiar em Lisboa que envia bolos personalizados.', pl: 'np. Rodzinna piekarnia w Lizbonie wysyłająca torty na zamówienie.', ru: 'напр. Семейная пекарня в Лиссабоне, которая отправляет торты на заказ.' },
  pathTitle:   { en: 'Your launch path', es: 'Tu ruta de lanzamiento', pt: 'Seu caminho de lançamento', pl: 'Twoja ścieżka uruchomienia', ru: 'Ваш путь запуска' },
  done:        { en: 'done', es: 'completado', pt: 'concluído', pl: 'ukończono', ru: 'выполнено' },
  open:        { en: 'Open →', es: 'Abrir →', pt: 'Abrir →', pl: 'Otwórz →', ru: 'Открыть →' },
  steps: [
    {
      label: { en: 'Generate your website', es: 'Genera tu sitio web', pt: 'Gere seu site', pl: 'Wygeneruj swoją stronę', ru: 'Создайте сайт' },
      desc:  { en: 'Describe your business and publish a multilingual site.', es: 'Describe tu negocio y publica un sitio multilingüe.', pt: 'Descreva seu negócio e publique um site multilíngue.', pl: 'Opisz swój biznes i opublikuj wielojęzyczną stronę.', ru: 'Опишите бизнес и опубликуйте многоязычный сайт.' },
      href: '/dashboard/builder',
    },
    {
      label: { en: 'Set up review collection', es: 'Configura la recopilación de reseñas', pt: 'Configure a coleta de avaliações', pl: 'Skonfiguruj zbieranie opinii', ru: 'Настройте сбор отзывов' },
      desc:  { en: 'Create a public review link and turn trust into growth.', es: 'Crea un enlace de reseña público y convierte la confianza en crecimiento.', pt: 'Crie um link de avaliação público e transforme confiança em crescimento.', pl: 'Utwórz publiczny link do opinii i zamień zaufanie we wzrost.', ru: 'Создайте публичную ссылку для отзывов и превратите доверие в рост.' },
      href: '/dashboard/reviews',
    },
    {
      label: { en: 'Create promo audio', es: 'Crea audio promocional', pt: 'Crie áudio promocional', pl: 'Utwórz audio promocyjne', ru: 'Создайте промо-аудио' },
      desc:  { en: 'Turn your offer into natural voice content.', es: 'Convierte tu oferta en contenido de voz natural.', pt: 'Transforme sua oferta em conteúdo de voz natural.', pl: 'Zamień swoją ofertę w naturalną treść głosową.', ru: 'Превратите ваше предложение в естественный голосовой контент.' },
      href: '/dashboard/audio',
    },
    {
      label: { en: 'Prepare a marketing campaign', es: 'Prepara una campaña de marketing', pt: 'Prepare uma campanha de marketing', pl: 'Przygotuj kampanię marketingową', ru: 'Подготовьте маркетинговую кампанию' },
      desc:  { en: 'Generate localized ad copy, outreach, and offers.', es: 'Genera textos publicitarios localizados, prospección y ofertas.', pt: 'Gere textos publicitários localizados, prospecção e ofertas.', pl: 'Generuj zlokalizowane treści reklamowe, outreach i oferty.', ru: 'Создавайте локализованные рекламные тексты, аутрич и предложения.' },
      href: '/dashboard/promote',
    },
    {
      label: { en: 'Launch & track', es: 'Lanzar y seguir', pt: 'Lançar e acompanhar', pl: 'Uruchom i śledź', ru: 'Запустить и отслеживать' },
      desc:  { en: 'Watch your signals and next best actions.', es: 'Observa tus señales y próximas acciones.', pt: 'Acompanhe seus sinais e próximas ações.', pl: 'Obserwuj swoje sygnały i kolejne najlepsze działania.', ru: 'Следите за сигналами и следующими лучшими действиями.' },
      href: '/dashboard/metrics',
    },
  ],
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

const STORAGE_IDEA = 'launchpad:business:idea'
const STORAGE_DONE = 'launchpad:business:done'

export default function BusinessLaunchpadPage() {
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
    <div style={{ maxWidth: 880, margin: '0 auto', color: 'var(--text-primary)', display: 'grid', gap: 20 }}>

      {/* Back */}
      <Link href="/dashboard/launchpad" style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {c(COPY.back, l)}
      </Link>

      {/* Header */}
      <header className="sb-console" style={{ marginBottom: 0 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">{c(COPY.badge, l)}</span>
            <h1>{c(COPY.title1, l)} <span style={{ color: '#ffc300' }}>{c(COPY.title2, l)}</span></h1>
            <p className="sb-body">{c(COPY.subtitle, l)}</p>
          </div>
        </div>
        <div className="sb-telemetry">
          <div><b className="gold">{completed}/{COPY.steps.length}</b><span>{c(COPY.done, l)}</span></div>
          <div><b style={{ fontSize: 14, textTransform: 'uppercase' }}>{experience}</b><span>{c(COPY.badge, l)}</span></div>
        </div>
      </header>

      {/* Idea input */}
      <div style={{ display: 'grid', gap: 10 }}>
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
            <article key={i} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '16px 0 16px 14px', borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: done[i] ? '2px solid rgba(134,239,172,.7)' : '2px solid rgba(255,255,255,.12)', transition: 'border-color .18s' }}>
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
