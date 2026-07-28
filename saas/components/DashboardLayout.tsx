'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']
function c(obj: Record<Lang, string>, lang: Lang): string {
  return obj[lang] ?? obj.en
}

type ToneId = 'friendly' | 'professional' | 'playful'

// Nav items: [copyKey, href, icon]. Labels resolve from COPY.nav[key].
const sidebarGroups: { titleKey: keyof typeof COPY['groups']; items: [keyof typeof COPY['nav'], string, string][] }[] = [
  {
    titleKey: 'create',
    items: [
      ['dashboard', '/dashboard', '⌁'],
      ['promote', '/dashboard/promote', '📣'],
      ['builder', '/dashboard/builder', '🌐'],
      ['reviews', '/dashboard/reviews', '⭐'],
      ['audio', '/dashboard/audio', '🎙️'],
      ['video', '/dashboard/video', '🎬'],
    ],
  },
  {
    titleKey: 'outreach',
    items: [
      ['cosa', '/dashboard/cosa', '🧠'],
      ['engine', '/dashboard/outreach/outreach', '🧠'],
      ['discovery', '/dashboard/outreach/discovery', '🔎'],
      ['pipeline', '/dashboard/outreach/pipeline', '🧭'],
      ['contacts', '/dashboard/outreach/contacts', '🤝'],
    ],
  },
  {
    titleKey: 'operate',
    items: [
      ['metrics', '/dashboard/metrics', '📊'],
      ['data', '/dashboard/data', '🗄️'],
      ['settings', '/dashboard/settings', '⚙️'],
    ],
  },
]

const TONES: { id: ToneId; labelKey: keyof typeof COPY['tone'] }[] = [
  { id: 'friendly', labelKey: 'friendly' },
  { id: 'professional', labelKey: 'professional' },
  { id: 'playful', labelKey: 'playful' },
]

const COPY = {
  eyebrow: { en: uiCopy('u_c20b2f1b79269bae'), es: 'Tu centro de mando', pt: 'Seu centro de comando', pl: 'Twoje centrum dowodzenia', ru: 'Ваш командный центр' },
  heading: { en: uiCopy('u_cd8ca7198dd2934a'), es: '¿Qué hacemos crecer ahora?', pt: 'O que vamos crescer a seguir?', pl: 'Co rozwijamy dalej?', ru: 'Что будем развивать дальше?' },
  subhead: { en: uiCopy('u_e46c5fcec05da3a7'), es: 'Elige un espacio de trabajo enfocado. SignalBoost mantiene visible la siguiente mejor acción.', pt: 'Escolha um espaço de trabalho focado. O SignalBoost mantém a próxima melhor ação visível.', pl: 'Wybierz jedną skupioną przestrzeń roboczą. SignalBoost pokazuje następny najlepszy krok.', ru: 'Выберите один рабочий раздел. SignalBoost показывает следующее лучшее действие.' },
  livePreview: { en: uiCopy('u_6e5f64bd260bf71a'), es: 'Vista previa en vivo', pt: 'Pré-visualização ao vivo', pl: 'Podgląd na żywo', ru: 'Живой предпросмотр' },
  guidance: { en: uiCopy('u_c395bb500d6c1441'), es: 'Guía de IA antes de escribir', pt: 'Orientação de IA antes de digitar', pl: 'Wskazówki AI zanim zaczniesz pisać', ru: 'Подсказки ИИ ещё до ввода' },
  examplePrompt: {
    en: uiCopy('u_ca89cb9759b395b3'),
    es: 'Prueba: «Encuentra compradores urgentes en mi ciudad, redacta una nota de contacto amable y pon la más fuerte en cola para aprobación.»',
    pt: 'Tente: “Encontre compradores urgentes na minha cidade, escreva uma nota de contato amigável e coloque a mais forte na fila para aprovação.”',
    pl: 'Spróbuj: „Znajdź pilnych kupujących w moim mieście, napisz przyjazną wiadomość i skieruj najlepszą do zatwierdzenia.”',
    ru: 'Попробуйте: «Найди срочных покупателей в моём городе, составь дружелюбное сообщение и поставь лучшее на одобрение.»',
  },
  toneSelector: { en: uiCopy('u_fc1fcd1cfa010cd4'), es: 'Selector de tono', pt: 'Seletor de tom', pl: 'Wybór tonu', ru: 'Выбор тона' },
  aiFeedback: { en: uiCopy('u_e573fe3ff99491e8'), es: 'Comentarios de IA', pt: 'Feedback da IA', pl: 'Opinia AI', ru: 'Обратная связь ИИ' },
  groups: {
    create: { en: uiCopy('u_57aac2ef1500fb0a'), es: 'Crear', pt: 'Criar', pl: 'Twórz', ru: 'Создать' },
    outreach: { en: uiCopy('u_d294024a0e413eed'), es: 'Alcance', pt: 'Alcance', pl: 'Kontakt', ru: 'Аутрич' },
    operate: { en: uiCopy('u_3bfcd0ecee7d6f87'), es: 'Operar', pt: 'Operar', pl: 'Zarządzaj', ru: 'Управление' },
  },
  nav: {
    dashboard: { en: uiCopy('u_3c07b629aa11ecfe'), es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель' },
    promote: { en: uiCopy('u_e17d70e895fa6e2e'), es: 'Promocionar', pt: 'Promover', pl: 'Promuj', ru: 'Продвигать' },
    builder: { en: uiCopy('u_a15eb568bca7a702'), es: 'Constructor', pt: 'Construtor', pl: 'Kreator', ru: 'Конструктор' },
    reviews: { en: uiCopy('u_6ac1ea49c4178bcc'), es: 'Reseñas', pt: 'Avaliações', pl: 'Opinie', ru: 'Отзывы' },
    audio: { en: uiCopy('u_12c483de167dcf41'), es: 'Audio', pt: 'Áudio', pl: 'Audio', ru: 'Аудио' },
    video: { en: uiCopy('u_b52060b80e935554'), es: 'Video', pt: 'Vídeo', pl: 'Wideo', ru: 'Видео' },
    cosa: { en: uiCopy('u_d91f29495d11a46a'), es: 'COSA Marketing y Ventas', pt: 'COSA Marketing e Vendas', pl: 'COSA Marketing i Sprzedaż', ru: 'COSA Маркетинг и продажи' },
    engine: { en: uiCopy('u_ccbf291a12dc0f9d'), es: 'Motor', pt: 'Motor', pl: 'Silnik', ru: 'Движок' },
    discovery: { en: uiCopy('u_83f5b470d9d357d7'), es: 'Descubrimiento', pt: 'Descoberta', pl: 'Odkrywanie', ru: 'Поиск' },
    pipeline: { en: uiCopy('u_32f07315614910cd'), es: 'Embudo', pt: 'Funil', pl: 'Lejek', ru: 'Воронка' },
    contacts: { en: uiCopy('u_9cdf9773f1a3cb69'), es: 'Contactos', pt: 'Contatos', pl: 'Kontakty', ru: 'Контакты' },
    metrics: { en: uiCopy('u_2c3ec5a474166e31'), es: 'Métricas', pt: 'Métricas', pl: 'Metryki', ru: 'Метрики' },
    data: { en: uiCopy('u_2a2f519159f85b5a'), es: 'Datos', pt: 'Dados', pl: 'Dane', ru: 'Данные' },
    settings: { en: uiCopy('u_21ad74b80f972fb8'), es: 'Ajustes', pt: 'Configurações', pl: 'Ustawienia', ru: 'Настройки' },
  },
  tone: {
    friendly: { en: uiCopy('u_07cdbc821029a270'), es: 'Amigable', pt: 'Amigável', pl: 'Przyjazny', ru: 'Дружелюбный' },
    professional: { en: uiCopy('u_57a5e729f9194374'), es: 'Profesional', pt: 'Profissional', pl: 'Profesjonalny', ru: 'Профессиональный' },
    playful: { en: uiCopy('u_3b3cbc80f9fe2209'), es: 'Divertido', pt: 'Descontraído', pl: 'Żartobliwy', ru: 'Игривый' },
  },
  feedback: {
    friendly: {
      en: uiCopy('u_8fb23e6efb9fa102'),
      es: 'Esta campaña se siente cálida y cercana: añade un testimonio breve para generar aún más confianza.',
      pt: 'Esta campanha parece calorosa e acessível — adicione um depoimento curto para gerar ainda mais confiança.',
      pl: 'Ta kampania jest ciepła i przyjazna — dodaj krótką opinię, aby zbudować jeszcze większe zaufanie.',
      ru: 'Эта кампания тёплая и располагающая — добавьте короткий отзыв, чтобы вызвать ещё больше доверия.',
    },
    professional: {
      en: uiCopy('u_570d66d7a5425c9f'),
      es: 'Esta campaña resulta creíble y clara: ajusta la llamada a la acción para aumentar las conversiones.',
      pt: 'Esta campanha parece crível e clara — refine a chamada para ação para aumentar as conversões.',
      pl: 'Ta kampania jest wiarygodna i klarowna — dopracuj wezwanie do działania, aby zwiększyć konwersję.',
      ru: 'Эта кампания выглядит убедительно и ясно — усильте призыв к действию, чтобы повысить конверсию.',
    },
    playful: {
      en: uiCopy('u_0836935027f1c472'),
      es: 'Esta campaña es divertida y enérgica: mantén un beneficio concreto al frente para que el mensaje funcione.',
      pt: 'Esta campanha é divertida e enérgica — mantenha um benefício concreto em destaque para a mensagem funcionar.',
      pl: 'Ta kampania jest zabawna i energiczna — zostaw jeden konkretny atut na początku, aby przekaz trafił.',
      ru: 'Эта кампания весёлая и энергичная — оставьте одну конкретную выгоду на виду, чтобы сообщение сработало.',
    },
  },
} as const

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { lang: rawLang } = useI18n()
  const lang: Lang = (LANGS as string[]).includes(rawLang) ? (rawLang as Lang) : 'en'
  const [tone, setTone] = useState<ToneId>('friendly')

  return (
    <div className="sb-dashboard-shell">
      <aside className="sb-sidebar" aria-label={uiCopy('u_be284fc8563146d3')}>
        <div className="sb-sidebar__header">
          <span className="sb-eyebrow">{c(COPY.eyebrow, lang)}</span>
          <h2>{c(COPY.heading, lang)}</h2>
          <p>{c(COPY.subhead, lang)}</p>
        </div>

        <nav className="sb-sidebar__nav">
          {sidebarGroups.map(group => (
            <section key={group.titleKey} className="sb-sidebar__group">
              <p>{c(COPY.groups[group.titleKey], lang)}</p>
              {group.items.map(([key, href, icon]) => (
                <Link key={href} href={href} className="sb-sidebar__link">
                  <span>{icon}</span>
                  {c(COPY.nav[key], lang)}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <main className="sb-dashboard-main">{children}</main>

      <aside className="sb-live-preview" aria-label={uiCopy('u_1ddb710111dcc3c3')}>
        <span className="sb-eyebrow">{c(COPY.livePreview, lang)}</span>
        <h3>{c(COPY.guidance, lang)}</h3>
        <p>{c(COPY.examplePrompt, lang)}</p>
        <div className="sb-tone-card">
          <span>{c(COPY.toneSelector, lang)}</span>
          <div role="group" aria-label={c(COPY.toneSelector, lang)}>
            {TONES.map(({ id, labelKey }) => {
              const active = tone === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTone(id)}
                  style={
                    active
                      ? { borderColor: '#ffc300', color: '#ffc300', background: 'rgba(255,195,0,.12)' }
                      : undefined
                  }
                >
                  {c(COPY.tone[labelKey], lang)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="sb-ai-feedback">
          <strong>{c(COPY.aiFeedback, lang)}</strong>
          <p>{c(COPY.feedback[tone], lang)}</p>
        </div>
      </aside>
    </div>
  )
}
