'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

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
  eyebrow: { en: uiText('generatedUi.u_ead331913b5ea9a1'), es: 'Tu centro de mando', pt: 'Seu centro de comando', pl: 'Twoje centrum dowodzenia', ru: 'Ваш командный центр' },
  heading: { en: uiText('generatedUi.u_099f32145cf6503a'), es: '¿Qué hacemos crecer ahora?', pt: 'O que vamos crescer a seguir?', pl: 'Co rozwijamy dalej?', ru: 'Что будем развивать дальше?' },
  subhead: { en: uiText('generatedUi.u_41bf6e01005529c8'), es: 'Elige un espacio de trabajo enfocado. SignalBoost mantiene visible la siguiente mejor acción.', pt: 'Escolha um espaço de trabalho focado. O SignalBoost mantém a próxima melhor ação visível.', pl: 'Wybierz jedną skupioną przestrzeń roboczą. SignalBoost pokazuje następny najlepszy krok.', ru: 'Выберите один рабочий раздел. SignalBoost показывает следующее лучшее действие.' },
  livePreview: { en: uiText('generatedUi.u_f65ddc1ff37bb18e'), es: 'Vista previa en vivo', pt: 'Pré-visualização ao vivo', pl: 'Podgląd na żywo', ru: 'Живой предпросмотр' },
  guidance: { en: uiText('generatedUi.u_4902d3cefcfbc866'), es: 'Guía de IA antes de escribir', pt: 'Orientação de IA antes de digitar', pl: 'Wskazówki AI zanim zaczniesz pisać', ru: 'Подсказки ИИ ещё до ввода' },
  examplePrompt: {
    en: uiText('generatedUi.u_d0c52fa75707935a'),
    es: 'Prueba: «Encuentra compradores urgentes en mi ciudad, redacta una nota de contacto amable y pon la más fuerte en cola para aprobación.»',
    pt: 'Tente: “Encontre compradores urgentes na minha cidade, escreva uma nota de contato amigável e coloque a mais forte na fila para aprovação.”',
    pl: 'Spróbuj: „Znajdź pilnych kupujących w moim mieście, napisz przyjazną wiadomość i skieruj najlepszą do zatwierdzenia.”',
    ru: 'Попробуйте: «Найди срочных покупателей в моём городе, составь дружелюбное сообщение и поставь лучшее на одобрение.»',
  },
  toneSelector: { en: uiText('generatedUi.u_06410c30f1872c0f'), es: 'Selector de tono', pt: 'Seletor de tom', pl: 'Wybór tonu', ru: 'Выбор тона' },
  aiFeedback: { en: uiText('generatedUi.u_d3be6e3c361f38a4'), es: 'Comentarios de IA', pt: 'Feedback da IA', pl: 'Opinia AI', ru: 'Обратная связь ИИ' },
  groups: {
    create: { en: uiText('generatedUi.u_4759498ac2a719c6'), es: 'Crear', pt: 'Criar', pl: 'Twórz', ru: 'Создать' },
    outreach: { en: uiText('generatedUi.u_a5803fdf10e57e66'), es: 'Alcance', pt: 'Alcance', pl: 'Kontakt', ru: 'Аутрич' },
    operate: { en: uiText('generatedUi.u_58c3939c4ce986c8'), es: 'Operar', pt: 'Operar', pl: 'Zarządzaj', ru: 'Управление' },
  },
  nav: {
    dashboard: { en: uiText('generatedUi.u_67b696468610b879'), es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель' },
    promote: { en: uiText('generatedUi.u_5834dab085442471'), es: 'Promocionar', pt: 'Promover', pl: 'Promuj', ru: 'Продвигать' },
    builder: { en: uiText('generatedUi.u_090940e7325896cc'), es: 'Constructor', pt: 'Construtor', pl: 'Kreator', ru: 'Конструктор' },
    reviews: { en: uiText('generatedUi.u_84cb7871b741c32e'), es: 'Reseñas', pt: 'Avaliações', pl: 'Opinie', ru: 'Отзывы' },
    audio: { en: uiText('generatedUi.u_bc1b88907d3b748a'), es: 'Audio', pt: 'Áudio', pl: 'Audio', ru: 'Аудио' },
    video: { en: uiText('generatedUi.u_d534be829e32196b'), es: 'Video', pt: 'Vídeo', pl: 'Wideo', ru: 'Видео' },
    cosa: { en: uiText('generatedUi.u_0fd2b25b2e05e978'), es: 'COSA Marketing y Ventas', pt: 'COSA Marketing e Vendas', pl: 'COSA Marketing i Sprzedaż', ru: 'COSA Маркетинг и продажи' },
    engine: { en: uiText('generatedUi.u_8e75ebbdb21505d2'), es: 'Motor', pt: 'Motor', pl: 'Silnik', ru: 'Движок' },
    discovery: { en: uiText('generatedUi.u_80fc402133201fbe'), es: 'Descubrimiento', pt: 'Descoberta', pl: 'Odkrywanie', ru: 'Поиск' },
    pipeline: { en: uiText('generatedUi.u_37e1c775f452d695'), es: 'Embudo', pt: 'Funil', pl: 'Lejek', ru: 'Воронка' },
    contacts: { en: uiText('generatedUi.u_b450645debe2cf0a'), es: 'Contactos', pt: 'Contatos', pl: 'Kontakty', ru: 'Контакты' },
    metrics: { en: uiText('generatedUi.u_a58da793c7250f1b'), es: 'Métricas', pt: 'Métricas', pl: 'Metryki', ru: 'Метрики' },
    data: { en: uiText('generatedUi.u_cec3a9b89b2e3913'), es: 'Datos', pt: 'Dados', pl: 'Dane', ru: 'Данные' },
    settings: { en: uiText('generatedUi.u_74a883a037bc227f'), es: 'Ajustes', pt: 'Configurações', pl: 'Ustawienia', ru: 'Настройки' },
  },
  tone: {
    friendly: { en: uiText('generatedUi.u_397423500c32c55a'), es: 'Amigable', pt: 'Amigável', pl: 'Przyjazny', ru: 'Дружелюбный' },
    professional: { en: uiText('generatedUi.u_19c73a5cdf346d96'), es: 'Profesional', pt: 'Profissional', pl: 'Profesjonalny', ru: 'Профессиональный' },
    playful: { en: uiText('generatedUi.u_dde9ac29785b19e6'), es: 'Divertido', pt: 'Descontraído', pl: 'Żartobliwy', ru: 'Игривый' },
  },
  feedback: {
    friendly: {
      en: uiText('generatedUi.u_8fba0a7decf6a63c'),
      es: 'Esta campaña se siente cálida y cercana: añade un testimonio breve para generar aún más confianza.',
      pt: 'Esta campanha parece calorosa e acessível — adicione um depoimento curto para gerar ainda mais confiança.',
      pl: 'Ta kampania jest ciepła i przyjazna — dodaj krótką opinię, aby zbudować jeszcze większe zaufanie.',
      ru: 'Эта кампания тёплая и располагающая — добавьте короткий отзыв, чтобы вызвать ещё больше доверия.',
    },
    professional: {
      en: uiText('generatedUi.u_60e04693289843e5'),
      es: 'Esta campaña resulta creíble y clara: ajusta la llamada a la acción para aumentar las conversiones.',
      pt: 'Esta campanha parece crível e clara — refine a chamada para ação para aumentar as conversões.',
      pl: 'Ta kampania jest wiarygodna i klarowna — dopracuj wezwanie do działania, aby zwiększyć konwersję.',
      ru: 'Эта кампания выглядит убедительно и ясно — усильте призыв к действию, чтобы повысить конверсию.',
    },
    playful: {
      en: uiText('generatedUi.u_18183ca0427adcda'),
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
      <aside className="sb-sidebar" aria-label={uiText('generatedUi.u_653ff8fb00079b82')}>
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

      <aside className="sb-live-preview" aria-label={uiText('generatedUi.u_66cdc081694b3f0b')}>
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
