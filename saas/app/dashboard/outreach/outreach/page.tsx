'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:      { en: uiCopy('u_6f98bebd2bae7fb3'), es: 'Motor de prospección', pt: 'Motor de prospecção', pl: 'Silnik kontaktów', ru: 'Движок аутрича' },
  title:        { en: uiCopy('u_bbcc6a5658e39e07'), es: 'Convierte un prospecto en una campaña aprobada.', pt: 'Transforme um lead em uma campanha aprovada.', pl: 'Zamień lead w zatwierdzoną kampanię.', ru: 'Превратите лид в одобренную кампанию.' },
  subtitle:     { en: uiCopy('u_6ea9073c3109bed0'), es: 'La prospección es un proceso con revisión humana: analizar, aprobar, dar seguimiento. Empieza abajo o entra a cualquier paso.', pt: 'A prospecção é um processo com revisão humana: analisar, aprovar, acompanhar. Comece abaixo ou entre em qualquer etapa.', pl: 'Outreach to proces z ludzką weryfikacją: analizuj, zatwierdzaj, śledź. Zacznij poniżej lub przejdź do dowolnego kroku.', ru: 'Аутрич — это процесс с проверкой человеком: анализ, одобрение, отслеживание. Начните ниже или перейдите к любому шагу.' },
  openPipeline: { en: uiCopy('u_b04fc49344a501d8'), es: 'Abrir pipeline', pt: 'Abrir pipeline', pl: 'Otwórz pipeline', ru: 'Открыть воронку' },
  start:        { en: uiCopy('u_a87b67eedd1b9304'), es: 'Empieza con un prospecto', pt: 'Comece com um lead', pl: 'Zacznij od leada', ru: 'Начните с лида' },
  placeholder:  { en: uiCopy('u_7d67218fe9f90bd1'), es: 'Pega el sitio web o perfil del negocio…', pt: 'Cole o site ou perfil do negócio…', pl: 'Wklej adres strony lub profilu firmy…', ru: 'Вставьте сайт или профиль бизнеса…' },
  analyze:      { en: uiCopy('u_06bf23148041699f'), es: 'Analizar prospecto', pt: 'Analisar lead', pl: 'Analizuj lead', ru: 'Анализировать лид' },
  help:         { en: uiCopy('u_572f95cbbd423eea'), es: 'Esto abre Discovery y ejecuta el análisis real sobre la URL que ingreses.', pt: 'Isso abre o Discovery e executa a análise real na URL que você inserir.', pl: 'Otwiera Discovery i uruchamia analizę podanego adresu URL.', ru: 'Откроется Discovery и запустится анализ введённого URL.' },
  step:         { en: uiCopy('u_a8204340b17864be'), es: 'PASO', pt: 'ETAPA', pl: 'KROK', ru: 'ШАГ' },
  open:         { en: uiCopy('u_cb56e02ed9f0c3c7'), es: 'Abrir →', pt: 'Abrir →', pl: 'Otwórz →', ru: 'Открыть →' },
  s1title:      { en: uiCopy('u_59cc840f285eb2fd'), es: 'Analizador', pt: 'Analisador', pl: 'Analizator', ru: 'Анализатор' },
  s1prompt:     { en: uiCopy('u_305d3f7eca0a6ce7'), es: '¿A quién debe entender SignalBoost primero?', pt: 'Quem o SignalBoost deve entender primeiro?', pl: 'Kogo SignalBoost powinien poznać najpierw?', ru: 'Кого SignalBoost должен изучить первым?' },
  s1detail:     { en: uiCopy('u_e56ea599bee416f6'), es: 'Pega un sitio web público, perfil de Google o red social. La IA resume el negocio y el disparador humano a usar.', pt: 'Cole um site público, perfil do Google ou rede social. A IA resume o negócio e o gatilho humano a usar.', pl: 'Wklej publiczną stronę, profil Google lub social media. AI podsumuje biznes i ludzki wyzwalacz do użycia.', ru: 'Вставьте сайт, профиль Google или соцсеть. ИИ резюмирует бизнес и человеческий триггер для контакта.' },
  s2title:      { en: uiCopy('u_dd6720353cce66dc'), es: 'Contactos', pt: 'Contatos', pl: 'Kontakty', ru: 'Контакты' },
  s2prompt:     { en: uiCopy('u_74ad74ce2e17ebe8'), es: '¿Qué prospectos analizados valen la pena?', pt: 'Quais leads analisados valem a pena?', pl: 'Które przeanalizowane leady są warte uwagi?', ru: 'Какие проанализированные лиды стоят внимания?' },
  s2detail:     { en: uiCopy('u_317119e269259281'), es: 'Revisa los prospectos preparados por IA y aprueba los que encajan antes de enviar cualquier mensaje.', pt: 'Revise os leads preparados pela IA e aprove os que se encaixam antes de qualquer envio.', pl: 'Przejrzyj leady przygotowane przez AI i zatwierdź pasujące, zanim cokolwiek zostanie wysłane.', ru: 'Проверьте подготовленные ИИ лиды и одобрите подходящие до любой отправки.' },
  s3title:      { en: uiCopy('u_cef91b150075eab8'), es: 'Pipeline', pt: 'Pipeline', pl: 'Pipeline', ru: 'Воронка' },
  s3prompt:     { en: uiCopy('u_ef93a5e91d7e5575'), es: '¿En qué punto del recorrido está cada prospecto?', pt: 'Onde está cada prospect na jornada?', pl: 'Na jakim etapie jest każdy prospekt?', ru: 'На каком этапе находится каждый потенциальный клиент?' },
  s3detail:     { en: uiCopy('u_c80e2b2b2ac478f9'), es: 'Sigue a los prospectos por descubierto, contactado, respondió, agendado y cerrado.', pt: 'Acompanhe os prospects por descoberto, contatado, respondeu, agendado e fechado.', pl: 'Śledź prospekty: odkryty, skontaktowany, odpowiedział, umówiony, zamknięty.', ru: 'Отслеживайте этапы: найден, контакт, ответил, встреча, закрыт.' },
  s4title:      { en: uiCopy('u_b549c26e1346a966'), es: 'Centro de prospección', pt: 'Central de prospecção', pl: 'Centrum kontaktów', ru: 'Центр аутрича' },
  s4prompt:     { en: uiCopy('u_c4b76883cb1d10a1'), es: '¿Quieres la vista completa?', pt: 'Quer a visão completa?', pl: 'Chcesz pełny przegląd?', ru: 'Нужен полный обзор?' },
  s4detail:     { en: uiCopy('u_8246249559f504c6'), es: 'Conteos, prospectos recientes y acceso rápido a todas las herramientas en un solo lugar.', pt: 'Contagens, leads recentes e acesso rápido a todas as ferramentas em um só lugar.', pl: 'Liczby, ostatnie leady i szybki dostęp do wszystkich narzędzi w jednym miejscu.', ru: 'Статистика, последние лиды и быстрый доступ ко всем инструментам в одном месте.' },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

const stages = [
  { key: 's1', accent: 'var(--gold)', href: '/dashboard/outreach/discovery' },
  { key: 's2', accent: '#1af0ff', href: '/dashboard/outreach/contacts' },
  { key: 's3', accent: '#7dd3fc', href: '/dashboard/outreach/pipeline' },
  { key: 's4', accent: '#86efac', href: '/dashboard/outreach' },
]

export default function OutreachEnginePage() {
  const router = useRouter()
  const { lang } = useI18n()
  const [url, setUrl] = useState('')

  function analyze() {
    const value = url.trim()
    if (!value) { router.push('/dashboard/outreach/discovery'); return }
    // Hand off to the real Discovery analyzer with the URL prefilled.
    router.push(`/dashboard/outreach/discovery?url=${encodeURIComponent(value)}`)
  }

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <span className="sb-eyebrow">{c('eyebrow', lang)}</span>
          <h1 className="sb-h2" style={{ marginTop: 10 }}>{c('title', lang)}</h1>
          <p className="sb-body" style={{ maxWidth: 680 }}>{c('subtitle', lang)}</p>
        </div>
        <Link className="sb-button-primary" href="/dashboard/outreach/pipeline">{c('openPipeline', lang)}</Link>
      </div>

      <section className="sb-card" style={{ padding: 20, marginBottom: 24 }}>
        <label className="sb-eyebrow" htmlFor="lead-url">{c('start', lang)}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, marginTop: 12 }}>
          <input
            id="lead-url"
            className="sb-input"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') analyze() }}
            placeholder={c('placeholder', lang)}
            style={{ borderRadius: 16, padding: 14 }}
          />
          <button className="sb-button-primary" type="button" onClick={analyze}>{c('analyze', lang)}</button>
        </div>
        <p className="sb-caption" style={{ marginTop: 10 }}>{c('help', lang)}</p>
      </section>

      <section style={{ display: 'grid', gap: 16 }} aria-label={uiCopy('u_21bc5321b385a899')}>
        {stages.map((stage, index) => (
          <Link key={stage.key} href={stage.href} className="sb-card" style={{ padding: 20, display: 'grid', gridTemplateColumns: '72px minmax(0,1fr) auto', gap: 16, alignItems: 'center', textDecoration: 'none' }}>
            <div style={{ color: stage.accent, fontSize: 13, fontWeight: 950, letterSpacing: '.12em' }}>{c('step', lang)} {index + 1}</div>
            <div>
              <h2 className="sb-h3">{c(`${stage.key}title`, lang)}</h2>
              <p style={{ color: '#fff', fontWeight: 800, margin: '10px 0 4px' }}>{c(`${stage.key}prompt`, lang)}</p>
              <p className="sb-body" style={{ fontSize: 14, margin: 0 }}>{c(`${stage.key}detail`, lang)}</p>
            </div>
            <span style={{ color: stage.accent, fontWeight: 800 }}>{c('open', lang)}</span>
          </Link>
        ))}
      </section>
    </main>
  )
}
