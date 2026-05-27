'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'pt' | 'es' | 'pl' | 'ru'

type WorkshopModule = {
  id: string
  icon: string
  title: Record<Lang, string>
  description: Record<Lang, string>
  time: string
  href: string
  steps: Record<Lang, string[]>
}

const LANGS: Lang[] = ['en', 'pt', 'es', 'pl', 'ru']

const COPY: Record<Lang, {
  badge: string
  title: string
  subtitle: string
  promise: string
  workshopTitle: string
  workshopTagline: string
  goalTitle: string
  goalItems: string[]
  examplesTitle: string
  pick: string
  experienceTitle: string
  experienceSubtitle: string
  start: string
  stepLabel: string
  beginner: string
  intermediate: string
  comfortable: string
  advanced: string
  noTech: string
  guided: string
  realOutput: string
  stepHints: { beginner: string; intermediate: string; comfortable: string; advanced: string }
  nav: { promote: string; site: string; reviews: string; audio: string; video: string; lab: string }
}> = {
  en: {
    badge: 'Apprentice Workshop',
    title: 'Learn while building.',
    subtitle: 'No technical experience needed. Choose what you want to create and SignalBoost will guide you one simple step at a time.',
    promise: 'Start from zero. Leave with something real.',
    workshopTitle: 'SignalBoost Apprentice Workshop',
    workshopTagline: 'Learn while building.',
    goalTitle: 'Goal',
    goalItems: ['Teach while creating', 'Guide step-by-step', 'Remove technical fear', 'Convert goals into workflows'],
    examplesTitle: 'Examples',
    pick: 'What do you want to build first?',
    experienceTitle: 'How much experience do you have?',
    experienceSubtitle: 'This helps SignalBoost decide how much explanation to show. You can change it later.',
    start: 'Start guide',
    stepLabel: 'First steps',
    beginner: 'Never used these tools',
    intermediate: 'A little experience',
    comfortable: 'Comfortable',
    advanced: 'Advanced',
    noTech: 'No technical terms first',
    guided: 'Simple guided steps',
    realOutput: 'Built into real SignalBoost tools',
    stepHints: { beginner: 'We’ll explain each step with simple examples.', intermediate: 'We’ll add quick tips and shortcuts.', comfortable: 'You’ll see concise steps without extra detail.', advanced: 'Just the checklist — no explanations.' },
    nav: { promote: 'Promote business', site: 'Create site', reviews: 'Collect reviews', audio: 'Generate audio', video: 'Create videos', lab: 'Lab' },
  },
  pt: {
    badge: 'Oficina de Aprendiz',
    title: 'Aprenda enquanto constrói.',
    subtitle: 'Não precisa ter experiência técnica. Escolha o que quer criar e a SignalBoost guia você passo a passo.',
    promise: 'Comece do zero. Termine com algo real.',
    workshopTitle: 'Oficina de Aprendiz SignalBoost',
    workshopTagline: 'Aprenda enquanto constrói.',
    goalTitle: 'Objetivo',
    goalItems: ['Ensinar enquanto cria','Guiar passo a passo','Remover medo técnico','Converter metas em fluxos'],
    examplesTitle: 'Exemplos',
    pick: 'O que você quer construir primeiro?',
    experienceTitle: 'Quanta experiência você tem?',
    experienceSubtitle: 'Isso ajuda a SignalBoost a decidir quanta explicação mostrar. Você pode mudar depois.',
    start: 'Começar guia',
    stepLabel: 'Primeiros passos',
    beginner: 'Nunca usei essas ferramentas',
    intermediate: 'Tenho um pouco de experiência',
    comfortable: 'Me sinto confortável',
    advanced: 'Avançado',
    noTech: 'Sem termos técnicos no começo',
    guided: 'Passos simples e guiados',
    realOutput: 'Conectado às ferramentas reais da SignalBoost',
    stepHints: { beginner: 'Explicaremos cada etapa com exemplos simples.', intermediate: 'Adicionaremos dicas rápidas e atalhos.', comfortable: 'Você verá etapas concisas sem detalhes extras.', advanced: 'Apenas a lista de verificação — sem explicações.' },
    nav: { promote: 'Promover negócio', site: 'Criar site', reviews: 'Coletar avaliações', audio: 'Gerar áudio', video: 'Criar vídeos', lab: 'Laboratório' },
  },
  es: {
    badge: 'Taller de Aprendiz',
    title: 'Aprende mientras construyes.',
    subtitle: 'No necesitas experiencia técnica. Elige lo que quieres crear y SignalBoost te guía paso a paso.',
    promise: 'Empieza desde cero. Termina con algo real.',
    workshopTitle: 'Taller de Aprendiz SignalBoost',
    workshopTagline: 'Aprende mientras construyes.',
    goalTitle: 'Objetivo',
    goalItems: ['Enseñar mientras creas','Guiar paso a paso','Eliminar el miedo técnico','Convertir metas en flujos'],
    examplesTitle: 'Ejemplos',
    pick: '¿Qué quieres construir primero?',
    experienceTitle: '¿Cuánta experiencia tienes?',
    experienceSubtitle: 'Esto ayuda a SignalBoost a decidir cuánta explicación mostrar. Puedes cambiarlo después.',
    start: 'Empezar guía',
    stepLabel: 'Primeros pasos',
    beginner: 'Nunca usé estas herramientas',
    intermediate: 'Tengo algo de experiencia',
    comfortable: 'Me siento cómodo',
    advanced: 'Avanzado',
    noTech: 'Sin términos técnicos al inicio',
    guided: 'Pasos simples y guiados',
    realOutput: 'Conectado a herramientas reales de SignalBoost',
    stepHints: { beginner: 'Explicaremos cada paso con ejemplos sencillos.', intermediate: 'Agregaremos consejos rápidos y atajos.', comfortable: 'Verás pasos concisos sin detalles adicionales.', advanced: 'Solo la lista de pasos — sin explicaciones.' },
    nav: { promote: 'Promocionar negocio', site: 'Crear sitio', reviews: 'Recopilar reseñas', audio: 'Generar audio', video: 'Crear videos', lab: 'Laboratorio' },
  },
  pl: {
    badge: 'Warsztat Ucznia',
    title: 'Ucz się, budując.',
    subtitle: 'Nie potrzebujesz doświadczenia technicznego. Wybierz, co chcesz stworzyć, a SignalBoost poprowadzi Cię krok po kroku.',
    promise: 'Zacznij od zera. Zakończ z czymś prawdziwym.',
    workshopTitle: 'Warsztat Ucznia SignalBoost',
    workshopTagline: 'Ucz się, budując.',
    goalTitle: 'Cel',
    goalItems: ['Uczyć podczas tworzenia','Prowadzić krok po kroku','Usunąć techniczny lęk','Zamieniać cele w przepływy pracy'],
    examplesTitle: 'Przykłady',
    pick: 'Co chcesz zbudować najpierw?',
    experienceTitle: 'Jakie masz doświadczenie?',
    experienceSubtitle: 'To pomaga SignalBoost dobrać poziom wyjaśnień. Możesz zmienić to później.',
    start: 'Rozpocznij przewodnik',
    stepLabel: 'Pierwsze kroki',
    beginner: 'Nigdy nie używałem tych narzędzi',
    intermediate: 'Mam trochę doświadczenia',
    comfortable: 'Czuję się pewnie',
    advanced: 'Zaawansowany',
    noTech: 'Bez technicznych terminów na start',
    guided: 'Proste kroki z prowadzeniem',
    realOutput: 'Połączone z prawdziwymi narzędziami SignalBoost',
    stepHints: { beginner: 'Wyjaśnimy każdy krok prostymi przykładami.', intermediate: 'Dodamy szybkie wskazówki i skróty.', comfortable: 'Zobaczysz zwięzłe kroki bez dodatkowych szczegółów.', advanced: 'Tylko lista kroków — bez wyjaśnień.' },
    nav: { promote: 'Promować biznes', site: 'Stworzyć stronę', reviews: 'Zbierać opinie', audio: 'Generować audio', video: 'Tworzyć filmy', lab: 'Laboratorium' },
  },
  ru: {
    badge: 'Мастерская ученика',
    title: 'Учитесь, создавая.',
    subtitle: 'Технический опыт не нужен. Выберите, что хотите создать, и SignalBoost проведёт вас простыми шагами.',
    promise: 'Начните с нуля. Получите реальный результат.',
    workshopTitle: 'Мастерская ученика SignalBoost',
    workshopTagline: 'Учитесь, создавая.',
    goalTitle: 'Цель',
    goalItems: ['Учить в процессе создания','Вести шаг за шагом','Убрать технический страх','Преобразовывать цели в рабочие процессы'],
    examplesTitle: 'Примеры',
    pick: 'Что вы хотите создать сначала?',
    experienceTitle: 'Какой у вас уровень опыта?',
    experienceSubtitle: 'Это помогает SignalBoost выбрать уровень объяснений. Вы сможете изменить это позже.',
    start: 'Начать руководство',
    stepLabel: 'Первые шаги',
    beginner: 'Никогда не пользовался такими инструментами',
    intermediate: 'Есть небольшой опыт',
    comfortable: 'Чувствую себя уверенно',
    advanced: 'Продвинутый',
    noTech: 'Без технических терминов в начале',
    guided: 'Простые пошаговые инструкции',
    realOutput: 'Подключено к реальным инструментам SignalBoost',
    stepHints: { beginner: 'Мы объясним каждый шаг простыми примерами.', intermediate: 'Добавим быстрые советы и сокращения.', comfortable: 'Вы увидите краткие шаги без лишних деталей.', advanced: 'Только список действий — без объяснений.' },
    nav: { promote: 'Продвигать бизнес', site: 'Создать сайт', reviews: 'Собирать отзывы', audio: 'Генерировать аудио', video: 'Создавать видео', lab: 'Лаборатория' },
  },
}

const MODULES: WorkshopModule[] = [
  {
    id: 'website', icon: '🌐', time: '5–10 min', href: '/dashboard/builder',
    title: { en: 'Build my first website', pt: 'Criar meu primeiro site', es: 'Crear mi primer sitio web', pl: 'Zbudować moją pierwszą stronę', ru: 'Создать мой первый сайт' },
    description: { en: 'Answer simple questions and create a multilingual website.', pt: 'Responda perguntas simples e crie um site multilíngue.', es: 'Responde preguntas simples y crea un sitio multilingüe.', pl: 'Odpowiedz na proste pytania i utwórz wielojęzyczną stronę.', ru: 'Ответьте на простые вопросы и создайте многоязычный сайт.' },
    steps: {
      en: ['Business name', 'What you do', 'Languages', 'Contact details', 'Generate site'],
      pt: ['Nome do negócio', 'O que você faz', 'Idiomas', 'Contato', 'Gerar site'],
      es: ['Nombre del negocio', 'Qué haces', 'Idiomas', 'Contacto', 'Generar sitio'],
      pl: ['Nazwa firmy', 'Co robisz', 'Języki', 'Kontakt', 'Utwórz stronę'],
      ru: ['Название бизнеса', 'Что вы делаете', 'Языки', 'Контакты', 'Создать сайт'],
    },
  },
  {
    id: 'podcast', icon: '🎙️', time: '10–15 min', href: '/podcasters',
    title: { en: 'Start my first podcast', pt: 'Começar meu primeiro podcast', es: 'Empezar mi primer podcast', pl: 'Uruchomić mój pierwszy podcast', ru: 'Запустить мой первый подкаст' },
    description: { en: 'Plan your show, page, audio, clips, and distribution.', pt: 'Planeje programa, página, áudio, clipes e distribuição.', es: 'Planifica tu programa, página, audio, clips y distribución.', pl: 'Zaplanuj program, stronę, audio, klipy i dystrybucję.', ru: 'Спланируйте шоу, страницу, аудио, клипы и распространение.' },
    steps: {
      en: ['Podcast topic', 'Audience', 'First episode', 'Languages', 'Studio setup'],
      pt: ['Tema do podcast', 'Público', 'Primeiro episódio', 'Idiomas', 'Configurar estúdio'],
      es: ['Tema del podcast', 'Audiencia', 'Primer episodio', 'Idiomas', 'Configurar estudio'],
      pl: ['Temat podcastu', 'Publiczność', 'Pierwszy odcinek', 'Języki', 'Konfiguracja studia'],
      ru: ['Тема подкаста', 'Аудитория', 'Первый эпизод', 'Языки', 'Настройка студии'],
    },
  },
  {
    id: 'customers', icon: '📈', time: '8–12 min', href: '/dashboard/sales/pipeline',
    title: { en: 'Get my first customers', pt: 'Conseguir meus primeiros clientes', es: 'Conseguir mis primeros clientes', pl: 'Zdobyć pierwszych klientów', ru: 'Получить первых клиентов' },
    description: { en: 'Find prospects and prepare friendly outreach.', pt: 'Encontre prospects e prepare uma abordagem amigável.', es: 'Encuentra prospectos y prepara un contacto amigable.', pl: 'Znajdź potencjalnych klientów i przygotuj kontakt.', ru: 'Найдите клиентов и подготовьте дружелюбное обращение.' },
    steps: {
      en: ['Target customer', 'Location', 'Find prospects', 'Draft outreach', 'Track replies'],
      pt: ['Cliente ideal', 'Localização', 'Encontrar prospects', 'Criar abordagem', 'Acompanhar respostas'],
      es: ['Cliente ideal', 'Ubicación', 'Encontrar prospectos', 'Crear mensaje', 'Seguir respuestas'],
      pl: ['Idealny klient', 'Lokalizacja', 'Znajdź kontakty', 'Napisz wiadomość', 'Śledź odpowiedzi'],
      ru: ['Целевой клиент', 'Локация', 'Найти контакты', 'Подготовить письмо', 'Отслеживать ответы'],
    },
  },
  {
    id: 'reviews', icon: '⭐', time: '5 min', href: '/dashboard/reviews',
    title: { en: 'Collect reviews', pt: 'Coletar avaliações', es: 'Recopilar reseñas', pl: 'Zbierać opinie', ru: 'Собирать отзывы' },
    description: { en: 'Create a review link and ask customers clearly.', pt: 'Crie um link de avaliações e peça aos clientes com clareza.', es: 'Crea un enlace de reseñas y pide comentarios claramente.', pl: 'Utwórz link opinii i jasno poproś klientów.', ru: 'Создайте ссылку отзывов и понятно попросите клиентов.' },
    steps: {
      en: ['Create link', 'Write message', 'Share with customer', 'Approve reviews', 'Show testimonials'],
      pt: ['Criar link', 'Escrever mensagem', 'Compartilhar', 'Aprovar avaliações', 'Mostrar depoimentos'],
      es: ['Crear enlace', 'Escribir mensaje', 'Compartir', 'Aprobar reseñas', 'Mostrar testimonios'],
      pl: ['Utwórz link', 'Napisz wiadomość', 'Udostępnij', 'Zatwierdź opinie', 'Pokaż rekomendacje'],
      ru: ['Создать ссылку', 'Написать сообщение', 'Поделиться', 'Одобрить отзывы', 'Показать рекомендации'],
    },
  },
  {
    id: 'campaign', icon: '📧', time: '8–10 min', href: '/dashboard/promote',
    title: { en: 'Send my first campaign', pt: 'Enviar minha primeira campanha', es: 'Enviar mi primera campaña', pl: 'Wysłać pierwszą kampanię', ru: 'Отправить первую кампанию' },
    description: { en: 'Turn an offer into email, social copy, and next steps.', pt: 'Transforme uma oferta em email, postagens e próximos passos.', es: 'Convierte una oferta en email, publicaciones y próximos pasos.', pl: 'Zmień ofertę w email, posty i kolejne kroki.', ru: 'Превратите предложение в email, посты и следующие шаги.' },
    steps: {
      en: ['Offer', 'Audience', 'Tone', 'Generate copy', 'Review and send'],
      pt: ['Oferta', 'Público', 'Tom', 'Gerar texto', 'Revisar e enviar'],
      es: ['Oferta', 'Audiencia', 'Tono', 'Generar texto', 'Revisar y enviar'],
      pl: ['Oferta', 'Odbiorcy', 'Ton', 'Wygeneruj tekst', 'Sprawdź i wyślij'],
      ru: ['Предложение', 'Аудитория', 'Тон', 'Создать текст', 'Проверить и отправить'],
    },
  },
  {
    id: 'video', icon: '🎥', time: '8–12 min', href: '/dashboard/video',
    title: { en: 'Create my first videos', pt: 'Criar meus primeiros vídeos', es: 'Crear mis primeros videos', pl: 'Stworzyć pierwsze filmy', ru: 'Создать первые видео' },
    description: { en: 'Create captions, clips, and social-ready video assets.', pt: 'Crie legendas, clipes e materiais prontos para redes sociais.', es: 'Crea subtítulos, clips y recursos para redes sociales.', pl: 'Twórz napisy, klipy i materiały do social mediów.', ru: 'Создавайте субтитры, клипы и материалы для соцсетей.' },
    steps: {
      en: ['Upload video', 'Choose language', 'Generate captions', 'Create clips', 'Download assets'],
      pt: ['Enviar vídeo', 'Escolher idioma', 'Gerar legendas', 'Criar clipes', 'Baixar materiais'],
      es: ['Subir video', 'Elegir idioma', 'Generar subtítulos', 'Crear clips', 'Descargar recursos'],
      pl: ['Prześlij film', 'Wybierz język', 'Wygeneruj napisy', 'Utwórz klipy', 'Pobierz materiały'],
      ru: ['Загрузить видео', 'Выбрать язык', 'Создать субтитры', 'Создать клипы', 'Скачать материалы'],
    },
  },
]

export default function ApprenticeWorkshopPage() {
  const { lang } = useI18n()
  const activeLang = (LANGS.includes(lang as Lang) ? lang : 'en') as Lang
  const copy = COPY[activeLang]
  const [level, setLevel] = useState('beginner')
  const [selected, setSelected] = useState(MODULES[0].id)
  const activeModule = useMemo(() => MODULES.find(item => item.id === selected) || MODULES[0], [selected])
  const levels = [
    { id: 'beginner', label: copy.beginner },
    { id: 'intermediate', label: copy.intermediate },
    { id: 'comfortable', label: copy.comfortable },
    { id: 'advanced', label: copy.advanced },
  ]

  const workshopNav = [
    { label: copy.nav.promote, href: '/dashboard/promote' },
    { label: copy.nav.site, href: '/dashboard/builder' },
    { label: copy.nav.reviews, href: '/dashboard/reviews' },
    { label: copy.nav.audio, href: '/dashboard/audio' },
    { label: copy.nav.video, href: '/dashboard/video' },
    { label: copy.nav.lab, href: '/dashboard/lab' },
  ]

  return (
    <main className="sb-page" style={{ background: 'radial-gradient(circle at 12% 10%, rgba(255,195,0,.09), transparent 25%), radial-gradient(circle at 90% 0%, rgba(59,130,246,.10), transparent 28%), linear-gradient(180deg, #07080f 0%, #0a0b14 48%, #090b12 100%)' }}>
      <section style={{ marginBottom: 18, border: '1px solid var(--border-soft)', borderRadius: 18, background: 'rgba(7,10,18,.72)', backdropFilter: 'blur(8px)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ color: '#fff', fontWeight: 900, letterSpacing: '.03em' }}>✨ SignalBoost Apprentice Workshop</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Workshop environment · guided tracks · real tools</div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {workshopNav.map(item => (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', border: '1px solid rgba(255,255,255,.14)', color: '#dbe3ff', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,.03)' }}>
              {item.label}
            </Link>
          ))}
        </div>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 22, alignItems: 'stretch' }}>
        <div className="hero-panel" style={{ padding: 28 }}>
          <div className="sb-kicker">✨ {copy.badge}</div>
          <h1 className="sb-title" style={{ fontSize: 'clamp(42px, 6vw, 76px)' }}>{copy.title}</h1>
          <p className="sb-subtitle">{copy.subtitle}</p>
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {[copy.noTech, copy.guided, copy.realOutput].map(item => (
              <div key={item} style={{ border: '1px solid var(--border-soft)', borderRadius: 16, padding: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,.035)', fontSize: 13 }}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="hero-panel" style={{ padding: 24 }}>
          <div style={{ color: 'var(--gold)', fontWeight: 950, fontSize: 13, marginBottom: 8 }}>{copy.experienceTitle}</div>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 0 }}>{copy.experienceSubtitle}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {levels.map((item) => {
              const value = item.id
              return (
                <button key={item.id} onClick={() => setLevel(value)} className={level === value ? 'sb-button-primary' : 'sb-button-ghost'} style={{ justifyContent: 'flex-start' }}>
                  {item.label}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 18, color: 'var(--text-muted)', fontSize: 13 }}>
            {copy.stepHints[level as keyof typeof copy.stepHints]}
          </div>
        </div>
      </section>


      <section className="hero-panel" style={{ marginTop: 28, padding: 24 }}>
        <div style={{ color: 'var(--gold)', fontWeight: 950, letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 12 }}>New Core Feature</div>
        <h2 style={{ color: '#fff', fontSize: 32, margin: '8px 0 6px' }}>✨ {copy.workshopTitle}</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 0, fontWeight: 700 }}>{copy.workshopTagline}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 12 }}>
          <div>
            <h3 style={{ color: '#fff', marginBottom: 8 }}>{copy.goalTitle}</h3>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {copy.goalItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <h3 style={{ color: '#fff', marginBottom: 8 }}>{copy.examplesTitle}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {MODULES.map((item) => (
                <div key={`example-${item.id}`} style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '8px 10px', background: 'rgba(255,255,255,.03)' }}>
                  {item.icon} {item.title[activeLang]}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ color: '#fff', fontSize: 24, marginBottom: 14 }}>{copy.pick}</h2>
        <div className="sb-grid-3">
          {MODULES.map(item => (
            <button key={item.id} onClick={() => setSelected(item.id)} className="hero-panel" style={{ textAlign: 'left', padding: 20, borderColor: selected === item.id ? 'var(--border-gold)' : 'var(--border-soft)' }}>
              <div style={{ fontSize: 34 }}>{item.icon}</div>
              <div style={{ color: '#fff', fontWeight: 950, fontSize: 18, marginTop: 10 }}>{item.title[activeLang]}</div>
              <div style={{ color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}>{item.description[activeLang]}</div>
              <div style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 900, marginTop: 12 }}>{item.time}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="hero-panel" style={{ marginTop: 28, padding: 24, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 22 }}>
        <div>
          <div style={{ color: 'var(--text-faint)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{copy.stepLabel}</div>
          <h3 style={{ color: '#fff', fontSize: 26, margin: '8px 0 16px' }}>{activeModule.icon} {activeModule.title[activeLang]}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {activeModule.steps[activeLang].map((step, index) => (
              <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, background: 'rgba(255,255,255,.045)', border: '1px solid var(--border-soft)' }}>
                <div style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--gold-soft)', color: 'var(--gold)', fontWeight: 950 }}>{index + 1}</div>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 750 }}>{step}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ alignSelf: 'end' }}>
          <Link href={activeModule.href} className="sb-button-primary" style={{ width: '100%' }}>
            {copy.start}
          </Link>
        </div>
      </section>
    </main>
  )
}
