'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'
import { useI18n } from '@/components/i18n/I18nProvider'
import { supabase } from '@/utils/supabase/client'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type ItLevel = 'beginner' | 'intermediate' | 'advanced'
type WorkshopProfile = { it_level: ItLevel | null; role: string | null; tone_preference: string | null }

const COPY = {
  eyebrow:        { en: uiCopy('u_45e35331e5bacf05'), es: 'Taller Aprendiz', pt: 'Oficina Aprendiz', pl: 'Warsztat Adepta', ru: 'Мастерская' },
  title:          { en: uiCopy('u_9e88791bf71dd5b6'), es: 'Taller Aprendiz', pt: 'Oficina Aprendiz', pl: 'Warsztat Adepta', ru: 'Мастерская стажёра' },
  toneLabel:      { en: uiCopy('u_21219d0d72bf6c09'), es: 'Tono', pt: 'Tom', pl: 'Ton', ru: 'Тон' },
  roleLabel:      { en: uiCopy('u_db8633706eeda2f7'), es: 'Rol', pt: 'Função', pl: 'Rola', ru: 'Роль' },
  notSet:         { en: uiCopy('u_9146c958560d281b'), es: 'no definido', pt: 'não definido', pl: 'nie ustawiono', ru: 'не задано' },
  tutorialsTitle: { en: uiCopy('u_ac618ab9f918a8ec'), es: 'Tutoriales de nuevos servicios', pt: 'Tutoriais de novos serviços', pl: 'Nowe samouczki usług', ru: 'Обучающие материалы' },
  startTutorial:  { en: uiCopy('u_494044f697ed14e0'), es: 'Iniciar tutorial', pt: 'Iniciar tutorial', pl: 'Rozpocznij samouczek', ru: 'Начать обучение' },
  visualExamples: { en: uiCopy('u_e06530578c5e8340'), es: 'Ejemplos visuales', pt: 'Exemplos visuais', pl: 'Przykłady wizualne', ru: 'Визуальные примеры' },
  modules: {
    website:       { en: uiCopy('u_ac846e15ae00783a'), es: 'Constructor de sitios', pt: 'Construtor de sites', pl: 'Kreator stron', ru: 'Конструктор сайтов' },
    podcast:       { en: uiCopy('u_79c0de33921bcb83'), es: 'Podcast', pt: 'Podcast', pl: 'Podcast', ru: 'Подкаст' },
    outreach:      { en: uiCopy('u_71a88fb8e3b3fe7e'), es: 'Prospección', pt: 'Prospecção', pl: 'Outreach', ru: 'Аутрич' },
    reviews:       { en: uiCopy('u_4958f5ccdc07964e'), es: 'Reseñas', pt: 'Avaliações', pl: 'Opinie', ru: 'Отзывы' },
    video:         { en: uiCopy('u_58e087959f6b6490'), es: 'Video', pt: 'Vídeo', pl: 'Wideo', ru: 'Видео' },
    improve:       { en: uiCopy('u_f6de2a18dfead6a5'), es: 'Mejorar sitio', pt: 'Melhorar site', pl: 'Ulepsz stronę', ru: 'Улучшить сайт' },
    podcastStudio: { en: uiCopy('u_7a084abc09a9b5c4'), es: 'Optimizar Podcast Studio', pt: 'Otimizar Podcast Studio', pl: 'Optymalizuj Podcast Studio', ru: 'Оптимизация студии' },
  },
  levels: {
    beginner: {
      badge:    { en: uiCopy('u_3fb7afa9e577af32'), es: 'Ruta guiada para principiantes', pt: 'Caminho guiado para iniciantes', pl: 'Ścieżka dla początkujących', ru: 'Путь для начинающих' },
      subtitle: { en: uiCopy('u_50b50d6ab61de25a'), es: 'Cada módulo incluye definiciones simples, valores seguros y un paso a la vez.', pt: 'Cada módulo inclui definições simples, padrões seguros e um passo de cada vez.', pl: 'Każdy moduł zawiera proste definicje, bezpieczne ustawienia i jeden krok na raz.', ru: 'Каждый модуль содержит простые определения, безопасные настройки и пошаговые инструкции.' },
      tasks: {
        t1: { en: uiCopy('u_81bd2d2fe3a26136'), es: 'Comienza con la lista de lanzamiento', pt: 'Comece com a lista de lançamento', pl: 'Zacznij od listy startowej', ru: 'Начните со списка запуска' },
        t2: { en: uiCopy('u_732195a6687e5c01'), es: 'Usa plantillas antes de configuraciones avanzadas', pt: 'Use modelos antes das configurações avançadas', pl: 'Używaj szablonów przed zaawansowanymi ustawieniami', ru: 'Используйте шаблоны перед расширенными настройками' },
        t3: { en: uiCopy('u_26e57c7a45a9e4ca'), es: 'Revisa cada recomendación antes de publicar', pt: 'Revise cada recomendação antes de publicar', pl: 'Przejrzyj każdą rekomendację przed publikacją', ru: 'Проверяйте каждую рекомендацию перед публикацией' },
      },
    },
    intermediate: {
      badge:    { en: uiCopy('u_1a9ae65b462bb9a7'), es: 'Ruta equilibrada de construcción', pt: 'Caminho equilibrado de construção', pl: 'Zrównoważona ścieżka budowania', ru: 'Сбалансированный путь' },
      subtitle: { en: uiCopy('u_51a7292405746f42'), es: 'Los módulos combinan explicaciones guiadas con atajos prácticos y flujos configurables.', pt: 'Os módulos combinam explicações guiadas com atalhos práticos e fluxos configuráveis.', pl: 'Moduły łączą wyjaśnienia z praktycznymi skrótami i konfigurowalnymi przepływami.', ru: 'Модули сочетают пошаговые объяснения с практическими ярлыками и настраиваемыми процессами.' },
      tasks: {
        t1: { en: uiCopy('u_ad9d944717899c07'), es: 'Compara las configuraciones recomendadas', pt: 'Compare as configurações recomendadas', pl: 'Porównaj zalecane ustawienia', ru: 'Сравните рекомендуемые настройки' },
        t2: { en: uiCopy('u_902ca216af59e64d'), es: 'Personaliza las reglas de automatización', pt: 'Personalize as regras de automação', pl: 'Dostosuj reguły automatyzacji', ru: 'Настройте правила автоматизации' },
        t3: { en: uiCopy('u_ef327108c9a433d0'), es: 'Revisa los análisis después de cada lanzamiento', pt: 'Revise as análises após cada lançamento', pl: 'Przeglądaj analizy po każdym uruchomieniu', ru: 'Анализируйте результаты после каждого запуска' },
      },
    },
    advanced: {
      badge:    { en: uiCopy('u_dcffcb245230ff5d'), es: 'Ruta de operador avanzado', pt: 'Caminho de operador avançado', pl: 'Ścieżka zaawansowanego operatora', ru: 'Расширенный путь оператора' },
      subtitle: { en: uiCopy('u_44e1d95ff82792fd'), es: 'Los módulos enfatizan diagnósticos, verificaciones de despliegue, registros, integraciones y ejecución rápida.', pt: 'Os módulos enfatizam diagnósticos, verificações de implantação, logs, integrações e execução rápida.', pl: 'Moduły kładą nacisk na diagnostykę, sprawdzanie wdrożeń, logi, integracje i szybkie wykonanie.', ru: 'Модули акцентируют диагностику, проверки развёртывания, логи, интеграции и быстрое выполнение.' },
      tasks: {
        t1: { en: uiCopy('u_ae2ab5e32f8cb54f'), es: 'Inspecciona los registros de despliegue y API', pt: 'Inspecione logs de implantação e API', pl: 'Sprawdzaj logi wdrożeń i API', ru: 'Проверяйте логи развёртывания и API' },
        t2: { en: uiCopy('u_b59187a20b206615'), es: 'Ajusta integraciones y fuentes de datos', pt: 'Ajuste integrações e fontes de dados', pl: 'Dostrajaj integracje i źródła danych', ru: 'Настройте интеграции и источники данных' },
        t3: { en: uiCopy('u_ea9fc2475d7f8d27'), es: 'Valida los presupuestos de rendimiento antes del lanzamiento', pt: 'Valide os orçamentos de desempenho antes do lançamento', pl: 'Sprawdzaj budżety wydajności przed wydaniem', ru: 'Проверяйте бюджеты производительности перед релизом' },
      },
    },
  },
  tutorials: {
    improve: {
      title: { en: uiCopy('u_2cc3f7d9bb16984b'), es: 'Mejorar sitio web', pt: 'Melhorar site', pl: 'Ulepsz stronę', ru: 'Улучшить сайт' },
      step1: { en: uiCopy('u_a534bfd3495d2f5b'), es: 'Pega la URL del sitio e identifica el objetivo de conversión principal.', pt: 'Cole a URL do site e identifique o objetivo de conversão principal.', pl: 'Wklej URL strony i zidentyfikuj główny cel konwersji.', ru: 'Вставьте URL сайта и определите основную цель конверсии.' },
      step2: { en: uiCopy('u_556c318c6449fca7'), es: 'Revisa ejemplos visuales para hero, CTA, SEO, accesibilidad y velocidad.', pt: 'Revise exemplos visuais para hero, CTA, SEO, acessibilidade e velocidade.', pl: 'Przejrzyj przykłady wizualne dla hero, CTA, SEO, dostępności i szybkości.', ru: 'Изучите визуальные примеры для hero, CTA, SEO, доступности и скорости.' },
      step3: { en: uiCopy('u_04070223bf057779'), es: 'Aplica la lista priorizada y abre el módulo de optimización.', pt: 'Aplique a lista priorizada e abra o módulo de otimização.', pl: 'Zastosuj priorytetową listę i otwórz moduł optymalizacji.', ru: 'Примените приоритетный список и откройте модуль оптимизации.' },
    },
    podcastStudio: {
      title: { en: uiCopy('u_94b4026355cc638d'), es: 'Optimizar Podcast Studio', pt: 'Otimizar Podcast Studio', pl: 'Optymalizuj Podcast Studio', ru: 'Оптимизация студии подкастов' },
      step1: { en: uiCopy('u_8804aa7f7a4ff104'), es: 'Sube o enlaza un episodio y confirma el objetivo del programa.', pt: 'Faça upload ou vincule um episódio e confirme o objetivo do programa.', pl: 'Prześlij lub podlinkuj odcinek i potwierdź cel programu.', ru: 'Загрузите или свяжите эпизод и подтвердите цель шоу.' },
      step2: { en: uiCopy('u_dc87aab4ef375831'), es: 'Revisa ejemplos visuales para limpieza de transcripción, clips cortos, títulos y metadatos.', pt: 'Revise exemplos visuais para limpeza de transcrição, clipes curtos, títulos e metadados.', pl: 'Przejrzyj przykłady wizualne dla czyszczenia transkryptów, krótkich klipów, tytułów i metadanych.', ru: 'Изучите визуальные примеры для очистки транскриптов, коротких клипов, заголовков и метаданных.' },
      step3: { en: uiCopy('u_22ce9e583064f220'), es: 'Aprueba la lista de distribución y abre el optimizador del estudio de podcast.', pt: 'Aprove a lista de distribuição e abra o otimizador do estúdio de podcast.', pl: 'Zatwierdź listę dystrybucji i otwórz optymalizator studia podcastów.', ru: 'Утвердите список распространения и откройте оптимизатор студии подкастов.' },
    },
  },
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

export default function ApprenticeWorkshopPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [profile, setProfile] = useState<WorkshopProfile>({ it_level: 'beginner', role: null, tone_preference: 'friendly' })

  useEffect(() => {
    async function loadProfile() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return
      const { data } = await supabase.from('user_profile').select('it_level,role,tone_preference').eq('user_id', auth.user.id).maybeSingle()
      if (data) setProfile(data as WorkshopProfile)
    }
    loadProfile()
  }, [])

  const level = profile.it_level || 'beginner'
  const levelData = COPY.levels[level]

  const moduleItems = useMemo(() => [
    { href: '/dashboard/builder',           key: 'website',       depth: level === 'advanced' ? 'Deployment, DNS, and performance checks' : 'Guided website setup' },
    { href: '/podcasters',                  key: 'podcast',       depth: level === 'beginner' ? 'Script templates and publishing basics' : 'Multilingual show workflow' },
    { href: '/dashboard/outreach/discovery',key: 'outreach',      depth: level === 'advanced' ? 'Pipeline rules and data diagnostics' : 'Audience discovery walkthrough' },
    { href: '/dashboard/reviews',           key: 'reviews',       depth: level === 'intermediate' ? 'Review automations and response tuning' : 'Trust-building review collection' },
    { href: '/dashboard/video',             key: 'video',         depth: level === 'advanced' ? 'Generation settings and render status' : 'Social video starter flow' },
    { href: '/dashboard/improve',           key: 'improve',       depth: level === 'advanced' ? 'SEO, accessibility, conversion, and speed audit' : 'Website improvement walkthrough' },
    { href: '/dashboard/podcast/studio',    key: 'podcastStudio', depth: level === 'beginner' ? 'Upload, transcript, clips, titles, and publishing checklist' : 'Studio optimization, metadata, and multilingual distribution' },
  ], [level])

  const LEVEL_ACCENT: Record<ItLevel, string> = {
    beginner: '#7dd3fc', intermediate: '#c4b5fd', advanced: '#1af0ff',
  }
  const accent = LEVEL_ACCENT[level]

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      <div style={{ minHeight: 'calc(100vh - 125px)', display: 'grid', gap: 22, alignContent: 'start' }}>
      {/* Header */}
      <header className="sb-console" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span className="sb-eyebrow">🛠️ {c(COPY.eyebrow, l)}</span>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 999, padding: '4px 10px' }}>{c(levelData.badge, l)}</span>
        </div>
        <h1>{c(COPY.title, l)}</h1>
        <p className="sb-body">{c(levelData.subtitle, l)}</p>
        <div className="sb-telemetry">
          <div><b className="gold" style={{ fontSize: 14, textTransform: 'capitalize' }}>{level}</b><span>{c(levelData.badge, l)}</span></div>
          <div><b style={{ fontSize: 14, textTransform: 'capitalize' }}>{profile.tone_preference || uiCopy('u_4a0bf20c7a5472b8')}</b><span>{c(COPY.toneLabel, l)}</span></div>
          <div><b style={{ fontSize: 14 }}>{profile.role || c(COPY.notSet, l)}</b><span>{c(COPY.roleLabel, l)}</span></div>
          <div><b>{moduleItems.length}</b><span>{c(COPY.tutorialsTitle, l)}</span></div>
        </div>
      </header>

      {/* Tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignContent: 'start' }}>
        {(['t1', 't2', 't3'] as const).map((tk, i) => (
          <div key={tk} style={{ borderTop: '1px solid rgba(255,255,255,.07)', padding: '14px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 24, height: 24, borderRadius: 999, background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontWeight: 900, fontSize: 12, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
            <span style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.8)' }}>{c((levelData.tasks as any)[tk], l)}</span>
          </div>
        ))}
      </div>

      {/* Module grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {moduleItems.map(item => (
          <Link key={item.key} href={item.href} style={{ color: '#fff', textDecoration: 'none', borderTop: '1px solid rgba(255,255,255,.07)', borderLeft: `2px solid ${accent}55`, padding: '14px 0 14px 14px', display: 'block' }}>
            <strong style={{ fontSize: 14, fontWeight: 800, display: 'block', marginBottom: 6 }}>{c((COPY.modules as any)[item.key], l)}</strong>
            <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{item.depth}</p>
          </Link>
        ))}
      </div>

      </div>

      {/* Tutorials — starts on the second screen */}
      <div>
        <h2 style={{ fontSize: 'clamp(18px,3vw,26px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 16px' }}>{c(COPY.tutorialsTitle, l)}</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {([uiCopy('u_0417072bdcca46bc'), uiCopy('u_729cb565900ef8f7')] as const).map(key => {
            const tut = COPY.tutorials[key]
            const href = key === 'improve' ? '/dashboard/improve' : '/dashboard/podcast/studio'
            return (
              <article key={key} style={{ borderTop: '1px solid rgba(255,195,0,.25)', padding: '18px 0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <strong style={{ fontSize: 16, fontWeight: 800, display: 'block', marginBottom: 12 }}>{c(tut.title, l)}</strong>
                    <ol style={{ color: 'rgba(255,255,255,.7)', lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
                      <li style={{ fontSize: 13 }}>{c(tut.step1, l)}</li>
                      <li style={{ fontSize: 13 }}>{c(tut.step2, l)}</li>
                      <li style={{ fontSize: 13 }}>{c(tut.step3, l)}</li>
                    </ol>
                  </div>
                  <Link className="sb-button-primary" href={href} style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{c(COPY.startTutorial, l)}</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(80px, 1fr))', gap: 10 }} aria-label={c(COPY.visualExamples, l)}>
                  {['01', '02', '03'].map(label => (
                    <div key={label} style={{ minHeight: 70, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'linear-gradient(135deg, rgba(56,189,248,.14), rgba(255,255,255,.04))', display: 'grid', placeItems: 'center', color: '#fde68a', fontWeight: 900, fontSize: 18 }}>{label}</div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <OrchestrationPanel module="apprentice" compact />
    </div>
  )
}
