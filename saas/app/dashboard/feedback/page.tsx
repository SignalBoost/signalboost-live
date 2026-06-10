'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

type Feedback = {
  id: string
  rating: number
  category: string
  message: string
  page: string
  status: string
  created_at: string
  user_id: string
}

type FeedbackCopy = {
  title: string
  subtitle: string
  submitTab: string
  boardTab: string
  thankYou: string
  thankYouMessage: string
  submitMore: string
  viewBoard: string
  ratingLabel: string
  categoryLabel: string
  messageLabel: string
  placeholders: Record<string, string>
  characters: string
  notice: string
  submitting: string
  submit: string
  communityFeedback: string
  all: string
  loading: string
  emptyTitle: string
  emptyText: string
  you: string
  time: {
    days: string
    hours: string
    mins: string
    ago: string
    now: string
  }
  ratings: string[]
  categories: Array<{
    id: string
    icon: string
    label: string
    desc: string
  }>
  statuses: Record<string, string>
}

const COPY: Record<string, FeedbackCopy> = {
  en: {
    title: 'Feedback',
    subtitle: 'Help us build SignalBoost better. Your feedback goes directly to Luis.',
    submitTab: '✍️ Submit feedback',
    boardTab: '📋 Feedback board',
    thankYou: 'Thank you',
    thankYouMessage: 'Your feedback has been received. Luis reads every single submission personally.',
    submitMore: 'Submit more feedback',
    viewBoard: 'View feedback board',
    ratingLabel: 'How would you rate SignalBoost overall? *',
    categoryLabel: 'What kind of feedback is this? *',
    messageLabel: 'Your feedback *',
    placeholders: {
      bug: 'Describe what happened and what you expected to happen...',
      feature: 'Describe the feature you would like to see...',
      praise: 'Tell us what you love about SignalBoost...',
      general: 'Share your thoughts...',
    },
    characters: 'characters',
    notice: '💡 Your feedback is visible to other SignalBoost users on the feedback board. This helps everyone see what is being worked on. Do not include personal or sensitive information.',
    submitting: 'Submitting...',
    submit: 'Submit feedback',
    communityFeedback: 'Community feedback',
    all: 'All',
    loading: 'Loading feedback...',
    emptyTitle: 'No feedback yet',
    emptyText: 'Be the first to share your thoughts!',
    you: 'You',
    time: { days: 'd', hours: 'h', mins: 'm', ago: 'ago', now: 'Just now' },
    ratings: ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Praise', desc: 'Something you love about SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Feature request', desc: 'Something you wish SignalBoost could do' },
      { id: 'bug', icon: '🐛', label: 'Bug report', desc: 'Something that is not working correctly' },
      { id: 'general', icon: '💬', label: 'General', desc: 'Anything else on your mind' },
    ],
    statuses: {
      new: 'New',
      reviewing: 'Under review',
      planned: 'Planned',
      done: 'Done',
    },
  },

  pt: {
    title: 'Feedback',
    subtitle: 'Ajude-nos a melhorar o SignalBoost. Seu feedback vai diretamente para Luis.',
    submitTab: '✍️ Enviar feedback',
    boardTab: '📋 Painel de feedback',
    thankYou: 'Obrigado',
    thankYouMessage: 'Seu feedback foi recebido. Luis lê pessoalmente cada envio.',
    submitMore: 'Enviar mais feedback',
    viewBoard: 'Ver painel de feedback',
    ratingLabel: 'Como você avalia o SignalBoost no geral? *',
    categoryLabel: 'Que tipo de feedback é este? *',
    messageLabel: 'Seu feedback *',
    placeholders: {
      bug: 'Descreva o que aconteceu e o que você esperava que acontecesse...',
      feature: 'Descreva o recurso que você gostaria de ver...',
      praise: 'Conte o que você gosta no SignalBoost...',
      general: 'Compartilhe seus pensamentos...',
    },
    characters: 'caracteres',
    notice: '💡 Seu feedback fica visível para outros usuários do SignalBoost no painel de feedback. Isso ajuda todos a verem o que está sendo trabalhado. Não inclua informações pessoais ou sensíveis.',
    submitting: 'Enviando...',
    submit: 'Enviar feedback',
    communityFeedback: 'Feedback da comunidade',
    all: 'Todos',
    loading: 'Carregando feedback...',
    emptyTitle: 'Ainda não há feedback',
    emptyText: 'Seja o primeiro a compartilhar sua opinião!',
    you: 'Você',
    time: { days: 'd', hours: 'h', mins: 'min', ago: 'atrás', now: 'Agora mesmo' },
    ratings: ['', 'Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Elogio', desc: 'Algo que você gosta no SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Pedido de recurso', desc: 'Algo que você gostaria que o SignalBoost fizesse' },
      { id: 'bug', icon: '🐛', label: 'Relato de bug', desc: 'Algo que não está funcionando corretamente' },
      { id: 'general', icon: '💬', label: 'Geral', desc: 'Qualquer outra coisa que esteja em sua mente' },
    ],
    statuses: {
      new: 'Novo',
      reviewing: 'Em análise',
      planned: 'Planejado',
      done: 'Concluído',
    },
  },

  es: {
    title: 'Comentarios',
    subtitle: 'Ayúdanos a mejorar SignalBoost. Tus comentarios van directamente a Luis.',
    submitTab: '✍️ Enviar comentario',
    boardTab: '📋 Panel de comentarios',
    thankYou: 'Gracias',
    thankYouMessage: 'Hemos recibido tu comentario. Luis lee personalmente cada envío.',
    submitMore: 'Enviar más comentarios',
    viewBoard: 'Ver panel de comentarios',
    ratingLabel: '¿Cómo calificarías SignalBoost en general? *',
    categoryLabel: '¿Qué tipo de comentario es este? *',
    messageLabel: 'Tu comentario *',
    placeholders: {
      bug: 'Describe qué ocurrió y qué esperabas que ocurriera...',
      feature: 'Describe la función que te gustaría ver...',
      praise: 'Cuéntanos qué te gusta de SignalBoost...',
      general: 'Comparte tus ideas...',
    },
    characters: 'caracteres',
    notice: '💡 Tu comentario será visible para otros usuarios de SignalBoost en el panel de comentarios. Esto ayuda a todos a ver en qué se está trabajando. No incluyas información personal o sensible.',
    submitting: 'Enviando...',
    submit: 'Enviar comentario',
    communityFeedback: 'Comentarios de la comunidad',
    all: 'Todos',
    loading: 'Cargando comentarios...',
    emptyTitle: 'Aún no hay comentarios',
    emptyText: '¡Sé el primero en compartir tu opinión!',
    you: 'Tú',
    time: { days: 'd', hours: 'h', mins: 'min', ago: 'atrás', now: 'Ahora mismo' },
    ratings: ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', '¡Excelente!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Elogio', desc: 'Algo que te encanta de SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Solicitud de función', desc: 'Algo que te gustaría que SignalBoost pudiera hacer' },
      { id: 'bug', icon: '🐛', label: 'Reporte de error', desc: 'Algo que no funciona correctamente' },
      { id: 'general', icon: '💬', label: 'General', desc: 'Cualquier otra cosa que tengas en mente' },
    ],
    statuses: {
      new: 'Nuevo',
      reviewing: 'En revisión',
      planned: 'Planeado',
      done: 'Hecho',
    },
  },

  pl: {
    title: 'Opinie',
    subtitle: 'Pomóż ulepszać SignalBoost. Twoja opinia trafia bezpośrednio do Luisa.',
    submitTab: '✍️ Prześlij opinię',
    boardTab: '📋 Tablica opinii',
    thankYou: 'Dziękujemy',
    thankYouMessage: 'Twoja opinia została odebrana. Luis osobiście czyta każde zgłoszenie.',
    submitMore: 'Prześlij kolejną opinię',
    viewBoard: 'Zobacz tablicę opinii',
    ratingLabel: 'Jak ogólnie oceniasz SignalBoost? *',
    categoryLabel: 'Jakiego typu jest ta opinia? *',
    messageLabel: 'Twoja opinia *',
    placeholders: {
      bug: 'Opisz, co się stało i czego oczekiwałeś...',
      feature: 'Opisz funkcję, którą chcesz zobaczyć...',
      praise: 'Powiedz nam, co lubisz w SignalBoost...',
      general: 'Podziel się swoimi myślami...',
    },
    characters: 'znaków',
    notice: '💡 Twoja opinia jest widoczna dla innych użytkowników SignalBoost na tablicy opinii. Nie podawaj informacji osobistych ani poufnych.',
    submitting: 'Wysyłanie...',
    submit: 'Prześlij opinię',
    communityFeedback: 'Opinie społeczności',
    all: 'Wszystkie',
    loading: 'Ładowanie opinii...',
    emptyTitle: 'Brak opinii',
    emptyText: 'Bądź pierwszą osobą, która podzieli się opinią!',
    you: 'Ty',
    time: { days: 'd', hours: 'g', mins: 'min', ago: 'temu', now: 'Teraz' },
    ratings: ['', 'Słabo', 'Średnio', 'Dobrze', 'Bardzo dobrze', 'Doskonale!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Pochwała', desc: 'Coś, co lubisz w SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Prośba o funkcję', desc: 'Coś, czego brakuje w SignalBoost' },
      { id: 'bug', icon: '🐛', label: 'Błąd', desc: 'Coś, co nie działa poprawnie' },
      { id: 'general', icon: '💬', label: 'Ogólne', desc: 'Inne uwagi lub pomysły' },
    ],
    statuses: {
      new: 'Nowe',
      reviewing: 'W trakcie analizy',
      planned: 'Zaplanowane',
      done: 'Gotowe',
    },
  },

  ru: {
    title: 'Обратная связь',
    subtitle: 'Помогите улучшить SignalBoost. Ваш отзыв попадет напрямую к Луису.',
    submitTab: '✍️ Отправить отзыв',
    boardTab: '📋 Доска отзывов',
    thankYou: 'Спасибо',
    thankYouMessage: 'Ваш отзыв получен. Луис лично читает каждую отправку.',
    submitMore: 'Отправить еще отзыв',
    viewBoard: 'Посмотреть доску отзывов',
    ratingLabel: 'Как вы в целом оцениваете SignalBoost? *',
    categoryLabel: 'Какой это тип отзыва? *',
    messageLabel: 'Ваш отзыв *',
    placeholders: {
      bug: 'Опишите, что произошло и что вы ожидали...',
      feature: 'Опишите функцию, которую хотели бы видеть...',
      praise: 'Расскажите, что вам нравится в SignalBoost...',
      general: 'Поделитесь своими мыслями...',
    },
    characters: 'символов',
    notice: '💡 Ваш отзыв виден другим пользователям SignalBoost на доске отзывов. Не указывайте личную или конфиденциальную информацию.',
    submitting: 'Отправка...',
    submit: 'Отправить отзыв',
    communityFeedback: 'Отзывы сообщества',
    all: 'Все',
    loading: 'Загрузка отзывов...',
    emptyTitle: 'Пока нет отзывов',
    emptyText: 'Будьте первым, кто поделится мнением!',
    you: 'Вы',
    time: { days: 'д', hours: 'ч', mins: 'мин', ago: 'назад', now: 'Только что' },
    ratings: ['', 'Плохо', 'Так себе', 'Хорошо', 'Отлично', 'Превосходно!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Похвала', desc: 'Что вам нравится в SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Запрос функции', desc: 'Что вы хотите видеть в SignalBoost' },
      { id: 'bug', icon: '🐛', label: 'Сообщение об ошибке', desc: 'Что работает неправильно' },
      { id: 'general', icon: '💬', label: 'Общее', desc: 'Любые другие мысли' },
    ],
    statuses: {
      new: 'Новый',
      reviewing: 'На рассмотрении',
      planned: 'Запланировано',
      done: 'Готово',
    },
  },
}

const STATUS_COLORS: Record<string, string> = {
  new: 'rgba(255,255,255,0.3)',
  reviewing: '#ffc300',
  planned: '#3b82f6',
  done: '#4ade80',
}

type CopyLang = keyof typeof COPY

function getCopy(lang: string): FeedbackCopy {
  return COPY[lang as CopyLang] || COPY.en
}

export default function FeedbackPage() {
  const { lang } = useI18n()
  const copy = getCopy(lang)

  const [tab, setTab] = useState<'submit' | 'board'>('submit')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([])
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id)
        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        setUserName(fullName.split(' ')[0] || '')
      }
    })
  }, [])

  useEffect(() => {
    if (tab === 'board') loadFeedback()
  }, [tab])

  async function loadFeedback() {
    setLoadingFeedback(true)

    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setAllFeedback(data)

    setLoadingFeedback(false)
  }

  async function handleSubmit() {
    if (!message.trim() || !category || rating === 0) return

    setSubmitting(true)

    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      rating,
      category,
      message: message.trim(),
      page: window.location.pathname,
      status: 'new',
    })

    if (!error) {
      setSubmitted(true)
      setMessage('')
      setRating(0)
      setCategory('')
    }

    setSubmitting(false)
  }

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}${copy.time.days} ${copy.time.ago}`
    if (hours > 0) return `${hours}${copy.time.hours} ${copy.time.ago}`
    if (mins > 0) return `${mins}${copy.time.mins} ${copy.time.ago}`

    return copy.time.now
  }

  const filtered =
    filterCategory === 'all'
      ? allFeedback
      : allFeedback.filter((feedback) => feedback.category === filterCategory)

  const selectedPlaceholder =
    copy.placeholders[category] || copy.placeholders.general

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
          💬 {copy.title}
        </h1>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          {copy.subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'submit', label: copy.submitTab },
          { id: 'board', label: `${copy.boardTab} ${allFeedback.length > 0 ? `(${allFeedback.length})` : ''}` },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id as 'submit' | 'board')}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: tab === item.id ? BLUE : 'transparent',
              color: tab === item.id ? '#fff' : 'rgba(255,255,255,0.45)',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'submit' && (
        <div style={{ maxWidth: 580 }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '40px 0', borderTop: '1px solid rgba(74,222,128,0.35)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>

              <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>
                {copy.thankYou}{userName ? `, ${userName}` : ''}!
              </h2>

              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                {copy.thankYouMessage}
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={() => setSubmitted(false)}
                  style={{ background: BLUE, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}
                >
                  {copy.submitMore}
                </button>

                <button
                  onClick={() => {
                    setSubmitted(false)
                    setTab('board')
                    loadFeedback()
                  }}
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                >
                  {copy.viewBoard}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 12 }}>
                  {copy.ratingLabel}
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 24,
                        background: (hoveredRating || rating) >= star ? 'rgba(255,195,0,0.15)' : 'rgba(255,255,255,0.03)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {(hoveredRating || rating) >= star ? '★' : '☆'}
                    </button>
                  ))}

                  {rating > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8, fontSize: 13, color: GOLD, fontWeight: 600 }}>
                      {copy.ratings[rating]}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 12 }}>
                  {copy.categoryLabel}
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  {copy.categories.map((cat) => (
                    <div
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        cursor: 'pointer',
                        background: category === cat.id ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${category === cat.id ? BLUE : 'rgba(255,255,255,0.07)'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{cat.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{cat.label}</span>
                        {category === cat.id && <span style={{ marginLeft: 'auto', color: BLUE }}>✓</span>}
                      </div>

                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{cat.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  {copy.messageLabel}
                </label>

                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={selectedPlaceholder}
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'system-ui',
                    lineHeight: 1.6,
                  }}
                  onFocus={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'
                  }}
                  onBlur={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  }}
                />

                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
                  {message.length} {copy.characters}
                </div>
              </div>

              <div style={{ borderLeft: '2px solid rgba(255,195,0,0.5)', paddingLeft: 14, marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                {copy.notice}
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim() || !category || rating === 0}
                style={{
                  background: !message.trim() || !category || rating === 0 ? 'rgba(255,255,255,0.05)' : GOLD,
                  color: !message.trim() || !category || rating === 0 ? 'rgba(255,255,255,0.3)' : '#000',
                  fontWeight: 800,
                  fontSize: 14,
                  padding: '13px 36px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: !message.trim() || !category || rating === 0 ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? copy.submitting : copy.submit}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'board' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{copy.communityFeedback}</h2>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ id: 'all', label: copy.all }, ...copy.categories.map((cat) => ({ id: cat.id, label: `${cat.icon} ${cat.label}` }))].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setFilterCategory(filter.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: filterCategory === filter.id ? BLUE : 'rgba(255,255,255,0.05)',
                    color: filterCategory === filter.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {loadingFeedback ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)' }}>
              {copy.loading}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{copy.emptyTitle}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>{copy.emptyText}</div>

              <button
                onClick={() => setTab('submit')}
                style={{ background: BLUE, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}
              >
                {copy.submit}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map((item) => {
                const cat = copy.categories.find((categoryItem) => categoryItem.id === item.category)
                const isOwn = item.user_id === userId
                const statusLabel = copy.statuses[item.status] || item.status

                return (
                  <div
                    key={item.id}
                    style={{
                      borderTop: '1px solid rgba(255,255,255,0.07)',
                      borderLeft: isOwn ? '2px solid rgba(59,130,246,0.6)' : '2px solid rgba(255,255,255,0.1)',
                      padding: '14px 0 14px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 18 }}>{cat?.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {cat?.label}
                        </span>

                        <div style={{ display: 'flex', gap: 2 }}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} style={{ fontSize: 12, color: star <= item.rating ? GOLD : 'rgba(255,255,255,0.15)' }}>
                              ★
                            </span>
                          ))}
                        </div>

                        {isOwn && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 999, padding: '2px 8px' }}>
                            {copy.you}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: STATUS_COLORS[item.status] || 'rgba(255,255,255,0.4)' }}>
                          {statusLabel}
                        </span>

                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                          {timeAgo(item.created_at)}
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0 }}>
                      {item.message}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
