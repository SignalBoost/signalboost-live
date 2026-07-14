import Link from 'next/link'
import React from 'react'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language?.slice(0, 2).toLowerCase()
  if (l === 'es') return 'es'
  if (l === 'pt') return 'pt'
  if (l === 'pl') return 'pl'
  if (l === 'ru') return 'ru'
  return 'en'
}

const COPY: Record<Lang, {
  eyebrow: string
  heading: string
  subheading: string
  groups: { title: string; items: [string, string, string][] }[]
  previewEyebrow: string
  previewHeading: string
  previewHint: string
  toneLabel: string
  toneFriendly: string
  toneProfessional: string
  tonePlayful: string
  aiFeedbackLabel: string
  aiFeedbackText: string
}> = {
  en: {
    eyebrow: 'Your command center',
    heading: 'What should we grow next?',
    subheading: 'Pick one focused workspace. SignalBoost keeps the next best action visible.',
    groups: [
      {
        title: 'Create',
        items: [
          ['Dashboard', '/dashboard', '⌁'],
          ['Promote', '/dashboard/promote', '📣'],
          ['Builder', '/dashboard/builder', '🌐'],
          ['Reviews', '/dashboard/reviews', '⭐'],
          ['Audio', '/dashboard/audio', '🎙️'],
          ['Video', '/dashboard/video', '🎬'],
        ],
      },
      {
        title: 'Outreach',
        items: [
          ['Engine', '/dashboard/outreach/outreach', '🧠'],
          ['Discovery', '/dashboard/outreach/discovery', '🔎'],
          ['Pipeline', '/dashboard/outreach/pipeline', '🧭'],
          ['Contacts', '/dashboard/outreach/contacts', '🤝'],
        ],
      },
      {
        title: 'Operate',
        items: [
          ['Metrics', '/dashboard/metrics', '📊'],
          ['Data', '/dashboard/data', '🗄️'],
          ['Settings', '/dashboard/settings', '⚙️'],
        ],
      },
    ],
    previewEyebrow: 'Live preview',
    previewHeading: 'AI guidance before you type',
    previewHint: 'Try: "Find urgent buyers in my city, draft a friendly outreach note, and queue the strongest one for approval."',
    toneLabel: 'Tone selector',
    toneFriendly: 'Friendly',
    toneProfessional: 'Professional',
    tonePlayful: 'Playful',
    aiFeedbackLabel: 'AI feedback',
    aiFeedbackText: 'This campaign looks strong for urgency, but you could add a testimonial to improve trust.',
  },
  es: {
    eyebrow: 'Tu centro de mando',
    heading: '¿Qué deberíamos hacer crecer ahora?',
    subheading: 'Elige un espacio de trabajo enfocado. SignalBoost mantiene visible la mejor acción siguiente.',
    groups: [
      {
        title: 'Crear',
        items: [
          ['Panel', '/dashboard', '⌁'],
          ['Promover', '/dashboard/promote', '📣'],
          ['Constructor', '/dashboard/builder', '🌐'],
          ['Reseñas', '/dashboard/reviews', '⭐'],
          ['Audio', '/dashboard/audio', '🎙️'],
          ['Video', '/dashboard/video', '🎬'],
        ],
      },
      {
        title: 'Alcance',
        items: [
          ['Motor', '/dashboard/outreach/outreach', '🧠'],
          ['Descubrimiento', '/dashboard/outreach/discovery', '🔎'],
          ['Pipeline', '/dashboard/outreach/pipeline', '🧭'],
          ['Contactos', '/dashboard/outreach/contacts', '🤝'],
        ],
      },
      {
        title: 'Operar',
        items: [
          ['Métricas', '/dashboard/metrics', '📊'],
          ['Datos', '/dashboard/data', '🗄️'],
          ['Ajustes', '/dashboard/settings', '⚙️'],
        ],
      },
    ],
    previewEyebrow: 'Vista previa en vivo',
    previewHeading: 'Orientación de IA antes de escribir',
    previewHint: 'Prueba: "Encuentra compradores urgentes en mi ciudad, redacta una nota de contacto amigable y pon en cola la más fuerte para aprobación."',
    toneLabel: 'Selector de tono',
    toneFriendly: 'Amigable',
    toneProfessional: 'Profesional',
    tonePlayful: 'Lúdico',
    aiFeedbackLabel: 'Retroalimentación de IA',
    aiFeedbackText: 'Esta campaña se ve sólida en urgencia, pero podrías agregar un testimonio para mejorar la confianza.',
  },
  pt: {
    eyebrow: 'Seu centro de comando',
    heading: 'O que devemos crescer agora?',
    subheading: 'Escolha um espaço de trabalho focado. O SignalBoost mantém a próxima melhor ação visível.',
    groups: [
      {
        title: 'Criar',
        items: [
          ['Painel', '/dashboard', '⌁'],
          ['Promover', '/dashboard/promote', '📣'],
          ['Construtor', '/dashboard/builder', '🌐'],
          ['Avaliações', '/dashboard/reviews', '⭐'],
          ['Áudio', '/dashboard/audio', '🎙️'],
          ['Vídeo', '/dashboard/video', '🎬'],
        ],
      },
      {
        title: 'Alcance',
        items: [
          ['Motor', '/dashboard/outreach/outreach', '🧠'],
          ['Descoberta', '/dashboard/outreach/discovery', '🔎'],
          ['Pipeline', '/dashboard/outreach/pipeline', '🧭'],
          ['Contatos', '/dashboard/outreach/contacts', '🤝'],
        ],
      },
      {
        title: 'Operar',
        items: [
          ['Métricas', '/dashboard/metrics', '📊'],
          ['Dados', '/dashboard/data', '🗄️'],
          ['Configurações', '/dashboard/settings', '⚙️'],
        ],
      },
    ],
    previewEyebrow: 'Pré-visualização ao vivo',
    previewHeading: 'Orientação de IA antes de digitar',
    previewHint: 'Tente: "Encontre compradores urgentes na minha cidade, escreva uma nota de contato amigável e enfileire a mais forte para aprovação."',
    toneLabel: 'Seletor de tom',
    toneFriendly: 'Amigável',
    toneProfessional: 'Profissional',
    tonePlayful: 'Lúdico',
    aiFeedbackLabel: 'Feedback de IA',
    aiFeedbackText: 'Esta campanha parece forte em urgência, mas você poderia adicionar um depoimento para melhorar a confiança.',
  },
  pl: {
    eyebrow: 'Twoje centrum dowodzenia',
    heading: 'Co powinniśmy rozwijać dalej?',
    subheading: 'Wybierz jedno skoncentrowane miejsce pracy. SignalBoost utrzymuje widoczność najlepszej następnej akcji.',
    groups: [
      {
        title: 'Twórz',
        items: [
          ['Panel', '/dashboard', '⌁'],
          ['Promuj', '/dashboard/promote', '📣'],
          ['Kreator', '/dashboard/builder', '🌐'],
          ['Recenzje', '/dashboard/reviews', '⭐'],
          ['Audio', '/dashboard/audio', '🎙️'],
          ['Wideo', '/dashboard/video', '🎬'],
        ],
      },
      {
        title: 'Zasięg',
        items: [
          ['Silnik', '/dashboard/outreach/outreach', '🧠'],
          ['Odkrycie', '/dashboard/outreach/discovery', '🔎'],
          ['Pipeline', '/dashboard/outreach/pipeline', '🧭'],
          ['Kontakty', '/dashboard/outreach/contacts', '🤝'],
        ],
      },
      {
        title: 'Operuj',
        items: [
          ['Metryki', '/dashboard/metrics', '📊'],
          ['Dane', '/dashboard/data', '🗄️'],
          ['Ustawienia', '/dashboard/settings', '⚙️'],
        ],
      },
    ],
    previewEyebrow: 'Podgląd na żywo',
    previewHeading: 'Wskazówki AI przed wpisaniem',
    previewHint: 'Spróbuj: „Znajdź pilnych kupujących w moim mieście, napisz przyjazną wiadomość kontaktową i umieść najsilniejszą w kolejce do zatwierdzenia."',
    toneLabel: 'Wybór tonu',
    toneFriendly: 'Przyjazny',
    toneProfessional: 'Profesjonalny',
    tonePlayful: 'Zabawny',
    aiFeedbackLabel: 'Opinia AI',
    aiFeedbackText: 'Ta kampania wygląda mocno pod względem pilności, ale możesz dodać referencję, aby poprawić zaufanie.',
  },
  ru: {
    eyebrow: 'Ваш командный центр',
    heading: 'Что будем развивать дальше?',
    subheading: 'Выберите одно целевое рабочее пространство. SignalBoost всегда показывает следующий лучший шаг.',
    groups: [
      {
        title: 'Создать',
        items: [
          ['Панель', '/dashboard', '⌁'],
          ['Продвижение', '/dashboard/promote', '📣'],
          ['Конструктор', '/dashboard/builder', '🌐'],
          ['Отзывы', '/dashboard/reviews', '⭐'],
          ['Аудио', '/dashboard/audio', '🎙️'],
          ['Видео', '/dashboard/video', '🎬'],
        ],
      },
      {
        title: 'Охват',
        items: [
          ['Движок', '/dashboard/outreach/outreach', '🧠'],
          ['Поиск', '/dashboard/outreach/discovery', '🔎'],
          ['Воронка', '/dashboard/outreach/pipeline', '🧭'],
          ['Контакты', '/dashboard/outreach/contacts', '🤝'],
        ],
      },
      {
        title: 'Управление',
        items: [
          ['Метрики', '/dashboard/metrics', '📊'],
          ['Данные', '/dashboard/data', '🗄️'],
          ['Настройки', '/dashboard/settings', '⚙️'],
        ],
      },
    ],
    previewEyebrow: 'Живой предпросмотр',
    previewHeading: 'Подсказки ИИ до ввода текста',
    previewHint: 'Попробуйте: «Найди срочных покупателей в моём городе, составь дружелюбное письмо и поставь самое сильное в очередь на одобрение.»',
    toneLabel: 'Выбор тона',
    toneFriendly: 'Дружелюбный',
    toneProfessional: 'Профессиональный',
    tonePlayful: 'Игривый',
    aiFeedbackLabel: 'Обратная связь ИИ',
    aiFeedbackText: 'Эта кампания выглядит убедительно по срочности, но вы можете добавить отзыв для повышения доверия.',
  },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const lang = detectLang()
  const c = COPY[lang]

  return (
    <div className="sb-dashboard-shell">
      <aside className="sb-sidebar" aria-label="Dashboard navigation">
        <div className="sb-sidebar__header">
          <span className="sb-eyebrow">{c.eyebrow}</span>
          <h2>{c.heading}</h2>
          <p>{c.subheading}</p>
        </div>

        <nav className="sb-sidebar__nav">
          {c.groups.map(group => (
            <section key={group.title} className="sb-sidebar__group">
              <p>{group.title}</p>
              {group.items.map(([label, href, icon]) => (
                <Link key={href} href={href} className="sb-sidebar__link">
                  <span>{icon}</span>
                  {label}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <main className="sb-dashboard-main">{children}</main>

      <aside className="sb-live-preview" aria-label="Live preview panel">
        <span className="sb-eyebrow">{c.previewEyebrow}</span>
        <h3>{c.previewHeading}</h3>
        <p>{c.previewHint}</p>
        <div className="sb-tone-card">
          <span>{c.toneLabel}</span>
          <div>
            <button>{c.toneFriendly}</button>
            <button>{c.toneProfessional}</button>
            <button>{c.tonePlayful}</button>
          </div>
        </div>
        <div className="sb-ai-feedback">
          <strong>{c.aiFeedbackLabel}</strong>
          <p>{c.aiFeedbackText}</p>
        </div>
      </aside>
    </div>
  )
}
