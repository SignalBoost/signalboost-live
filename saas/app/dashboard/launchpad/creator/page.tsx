'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  back:       { en: '← Back to Launchpad', es: '← Volver al Launchpad', pt: '← Voltar ao Launchpad', pl: '← Wróć do Launchpad', ru: '← Назад к Launchpad' },
  badge:      { en: '🎬 CREATOR', es: '🎬 CREADOR', pt: '🎬 CRIADOR', pl: '🎬 TWÓRCA', ru: '🎬 СОЗДАТЕЛЬ' },
  title1:     { en: 'Build your creator brand,', es: 'Construye tu marca de creador,', pt: 'Construa sua marca de criador,', pl: 'Buduj swoją markę twórcy,', ru: 'Создайте свой бренд создателя,' },
  title2:     { en: 'step by step', es: 'paso a paso', pt: 'passo a passo', pl: 'krok po kroku', ru: 'шаг за шагом' },
  subtitle:   { en: 'Turn your idea into a content ecosystem. Describe your brand, then move through each step.', es: 'Convierte tu idea en un ecosistema de contenido. Describe tu marca y avanza por cada paso.', pt: 'Transforme sua ideia em um ecossistema de conteúdo. Descreva sua marca e avance por cada etapa.', pl: 'Zamień swój pomysł w ekosystem treści. Opisz swoją markę i przejdź przez każdy krok.', ru: 'Превратите идею в контент-экосистему. Опишите свой бренд и пройдите каждый шаг.' },
  ideaLabel:  { en: "What's your creator brand about?", es: '¿De qué trata tu marca de creador?', pt: 'Sobre o que é a sua marca de criador?', pl: 'O czym jest Twoja marka twórcy?', ru: 'О чём ваш бренд создателя?' },
  ideaHolder: { en: 'e.g. A bilingual channel teaching home cooking to busy parents.', es: 'ej. Un canal bilingüe que enseña cocina casera a padres ocupados.', pt: 'ex. Um canal bilíngue ensinando culinária doméstica para pais ocupados.', pl: 'np. Dwujęzyczny kanał uczący gotowania w domu zapracowanych rodziców.', ru: 'напр. Двуязычный канал, обучающий домашней кулинарии занятых родителей.' },
  pathTitle:  { en: 'Your launch path', es: 'Tu ruta de lanzamiento', pt: 'Seu caminho de lançamento', pl: 'Twoja ścieżka uruchomienia', ru: 'Ваш путь запуска' },
  done:       { en: 'done', es: 'completado', pt: 'concluído', pl: 'ukończono', ru: 'выполнено' },
  open:       { en: 'Open →', es: 'Abrir →', pt: 'Abrir →', pl: 'Otwórz →', ru: 'Открыть →' },
  steps: [
    {
      label: { en: 'Build your creator site', es: 'Construye tu sitio de creador', pt: 'Construa seu site de criador', pl: 'Zbuduj swoją stronę twórcy', ru: 'Создайте сайт создателя' },
      desc:  { en: 'Publish a hub for your content, links, and brand.', es: 'Publica un centro para tu contenido, enlaces y marca.', pt: 'Publique um hub para seu conteúdo, links e marca.', pl: 'Opublikuj centrum dla swojej treści, linków i marki.', ru: 'Опубликуйте хаб для контента, ссылок и бренда.' },
      href: '/dashboard/builder',
    },
    {
      label: { en: 'Generate native voice & audio', es: 'Genera voz e audio nativos', pt: 'Gere voz e áudio nativos', pl: 'Generuj natywny głos i audio', ru: 'Создайте нативный голос и аудио' },
      desc:  { en: 'Create intros, narration, and audio clips in your language.', es: 'Crea intros, narración y clips de audio en tu idioma.', pt: 'Crie intros, narração e clipes de áudio no seu idioma.', pl: 'Twórz intro, narracje i klipy audio w swoim języku.', ru: 'Создавайте интро, нарратив и аудиоклипы на вашем языке.' },
      href: '/dashboard/audio',
    },
    {
      label: { en: 'Create short-form videos', es: 'Crea videos de formato corto', pt: 'Crie vídeos de formato curto', pl: 'Twórz krótkie filmy', ru: 'Создайте короткие видео' },
      desc:  { en: 'Script and produce clips for every platform.', es: 'Escribe y produce clips para cada plataforma.', pt: 'Escreva e produza clipes para cada plataforma.', pl: 'Pisz i produkuj klipy dla każdej platformy.', ru: 'Создавайте сценарии и снимайте клипы для каждой платформы.' },
      href: '/dashboard/video',
    },
    {
      label: { en: 'Grow with promotion', es: 'Crece con promoción', pt: 'Cresça com promoção', pl: 'Rozwijaj się dzięki promocji', ru: 'Развивайтесь с помощью продвижения' },
      desc:  { en: 'Plan outreach, captions, and campaigns to reach more people.', es: 'Planifica outreach, títulos y campañas para llegar a más personas.', pt: 'Planeje outreach, legendas e campanhas para alcançar mais pessoas.', pl: 'Planuj outreach, podpisy i kampanie, aby dotrzeć do więcej ludzi.', ru: 'Планируйте аутрич, подписи и кампании для охвата большей аудитории.' },
      href: '/dashboard/promote',
    },
    {
      label: { en: 'Track your audience', es: 'Sigue tu audiencia', pt: 'Acompanhe seu público', pl: 'Śledź swoją widownię', ru: 'Отслеживайте свою аудиторию' },
      desc:  { en: 'See your growth signals and next best moves.', es: 'Ve tus señales de crecimiento y próximas mejores acciones.', pt: 'Veja seus sinais de crescimento e próximas melhores ações.', pl: 'Zobacz swoje sygnały wzrostu i kolejne najlepsze działania.', ru: 'Смотрите сигналы роста и следующие лучшие действия.' },
      href: '/dashboard/metrics',
    },
  ],
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

const STORAGE_IDEA = 'launchpad:creator:idea'
const STORAGE_DONE = 'launchpad:creator:done'

export default function CreatorLaunchpadPage() {
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
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(168,85,247,.2), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(168,85,247,.28)', borderRadius: 28, padding: 'clamp(20px,4vw,32px)' }}>
        <div style={{ display: 'inline-flex', marginBottom: 14, padding: '5px 12px', borderRadius: 999, background: 'rgba(168,85,247,.12)', border: '1px solid rgba(168,85,247,.28)', color: '#c4b5fd', fontWeight: 900, fontSize: 11, letterSpacing: '.1em' }}>
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
