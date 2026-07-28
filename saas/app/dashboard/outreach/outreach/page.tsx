'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:      { en: uiText('generatedUi.u_7b855b0f8767d64d'), es: 'Motor de prospección', pt: 'Motor de prospecção', pl: 'Silnik kontaktów', ru: 'Движок аутрича' },
  title:        { en: uiText('generatedUi.u_71cdc7678ac86ce2'), es: 'Convierte un prospecto en una campaña aprobada.', pt: 'Transforme um lead em uma campanha aprovada.', pl: 'Zamień lead w zatwierdzoną kampanię.', ru: 'Превратите лид в одобренную кампанию.' },
  subtitle:     { en: uiText('generatedUi.u_9075916896a1ca33'), es: 'La prospección es un proceso con revisión humana: analizar, aprobar, dar seguimiento. Empieza abajo o entra a cualquier paso.', pt: 'A prospecção é um processo com revisão humana: analisar, aprovar, acompanhar. Comece abaixo ou entre em qualquer etapa.', pl: 'Outreach to proces z ludzką weryfikacją: analizuj, zatwierdzaj, śledź. Zacznij poniżej lub przejdź do dowolnego kroku.', ru: 'Аутрич — это процесс с проверкой человеком: анализ, одобрение, отслеживание. Начните ниже или перейдите к любому шагу.' },
  openPipeline: { en: uiText('generatedUi.u_dd98b46fbee7d162'), es: 'Abrir pipeline', pt: 'Abrir pipeline', pl: 'Otwórz pipeline', ru: 'Открыть воронку' },
  start:        { en: uiText('generatedUi.u_2e6ede9026a934b7'), es: 'Empieza con un prospecto', pt: 'Comece com um lead', pl: 'Zacznij od leada', ru: 'Начните с лида' },
  placeholder:  { en: uiText('generatedUi.u_d5abfa385cc3e90a'), es: 'Pega el sitio web o perfil del negocio…', pt: 'Cole o site ou perfil do negócio…', pl: 'Wklej adres strony lub profilu firmy…', ru: 'Вставьте сайт или профиль бизнеса…' },
  analyze:      { en: uiText('generatedUi.u_b9d33481edd84a6b'), es: 'Analizar prospecto', pt: 'Analisar lead', pl: 'Analizuj lead', ru: 'Анализировать лид' },
  help:         { en: uiText('generatedUi.u_90aa76568373385a'), es: 'Esto abre Discovery y ejecuta el análisis real sobre la URL que ingreses.', pt: 'Isso abre o Discovery e executa a análise real na URL que você inserir.', pl: 'Otwiera Discovery i uruchamia analizę podanego adresu URL.', ru: 'Откроется Discovery и запустится анализ введённого URL.' },
  step:         { en: uiText('generatedUi.u_78e75a25d80993a5'), es: 'PASO', pt: 'ETAPA', pl: 'KROK', ru: 'ШАГ' },
  open:         { en: uiText('generatedUi.u_1d2902ca81b6d2db'), es: 'Abrir →', pt: 'Abrir →', pl: 'Otwórz →', ru: 'Открыть →' },
  s1title:      { en: uiText('generatedUi.u_b55bb5be20928223'), es: 'Analizador', pt: 'Analisador', pl: 'Analizator', ru: 'Анализатор' },
  s1prompt:     { en: uiText('generatedUi.u_3307cd27f83d56ef'), es: '¿A quién debe entender SignalBoost primero?', pt: 'Quem o SignalBoost deve entender primeiro?', pl: 'Kogo SignalBoost powinien poznać najpierw?', ru: 'Кого SignalBoost должен изучить первым?' },
  s1detail:     { en: uiText('generatedUi.u_c2d828605fe1262c'), es: 'Pega un sitio web público, perfil de Google o red social. La IA resume el negocio y el disparador humano a usar.', pt: 'Cole um site público, perfil do Google ou rede social. A IA resume o negócio e o gatilho humano a usar.', pl: 'Wklej publiczną stronę, profil Google lub social media. AI podsumuje biznes i ludzki wyzwalacz do użycia.', ru: 'Вставьте сайт, профиль Google или соцсеть. ИИ резюмирует бизнес и человеческий триггер для контакта.' },
  s2title:      { en: uiText('generatedUi.u_b450645debe2cf0a'), es: 'Contactos', pt: 'Contatos', pl: 'Kontakty', ru: 'Контакты' },
  s2prompt:     { en: uiText('generatedUi.u_afdbbdfe02e24523'), es: '¿Qué prospectos analizados valen la pena?', pt: 'Quais leads analisados valem a pena?', pl: 'Które przeanalizowane leady są warte uwagi?', ru: 'Какие проанализированные лиды стоят внимания?' },
  s2detail:     { en: uiText('generatedUi.u_0eca8a25856ff5f7'), es: 'Revisa los prospectos preparados por IA y aprueba los que encajan antes de enviar cualquier mensaje.', pt: 'Revise os leads preparados pela IA e aprove os que se encaixam antes de qualquer envio.', pl: 'Przejrzyj leady przygotowane przez AI i zatwierdź pasujące, zanim cokolwiek zostanie wysłane.', ru: 'Проверьте подготовленные ИИ лиды и одобрите подходящие до любой отправки.' },
  s3title:      { en: uiText('generatedUi.u_37e1c775f452d695'), es: 'Pipeline', pt: 'Pipeline', pl: 'Pipeline', ru: 'Воронка' },
  s3prompt:     { en: uiText('generatedUi.u_c630f4909d4b4d70'), es: '¿En qué punto del recorrido está cada prospecto?', pt: 'Onde está cada prospect na jornada?', pl: 'Na jakim etapie jest każdy prospekt?', ru: 'На каком этапе находится каждый потенциальный клиент?' },
  s3detail:     { en: uiText('generatedUi.u_aac58400af3fc9c5'), es: 'Sigue a los prospectos por descubierto, contactado, respondió, agendado y cerrado.', pt: 'Acompanhe os prospects por descoberto, contatado, respondeu, agendado e fechado.', pl: 'Śledź prospekty: odkryty, skontaktowany, odpowiedział, umówiony, zamknięty.', ru: 'Отслеживайте этапы: найден, контакт, ответил, встреча, закрыт.' },
  s4title:      { en: uiText('generatedUi.u_2fde89461213f512'), es: 'Centro de prospección', pt: 'Central de prospecção', pl: 'Centrum kontaktów', ru: 'Центр аутрича' },
  s4prompt:     { en: uiText('generatedUi.u_c43b8c07cb2ddb73'), es: '¿Quieres la vista completa?', pt: 'Quer a visão completa?', pl: 'Chcesz pełny przegląd?', ru: 'Нужен полный обзор?' },
  s4detail:     { en: uiText('generatedUi.u_8ed7dc9685408711'), es: 'Conteos, prospectos recientes y acceso rápido a todas las herramientas en un solo lugar.', pt: 'Contagens, leads recentes e acesso rápido a todas as ferramentas em um só lugar.', pl: 'Liczby, ostatnie leady i szybki dostęp do wszystkich narzędzi w jednym miejscu.', ru: 'Статистика, последние лиды и быстрый доступ ко всем инструментам в одном месте.' },
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

      <section style={{ display: 'grid', gap: 16 }} aria-label={uiText('generatedUi.u_d9160601a53130b4')}>
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
