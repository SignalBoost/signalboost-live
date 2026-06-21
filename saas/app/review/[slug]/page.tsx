// saas/app/review/[slug]/page.tsx
//
// Public review submission page. No auth.
//
// Privacy:
//   * URL contains the owner's slug, not their uuid.
//   * This page shows ONLY the slug back to the reviewer. No email, no name,
//     no plan, no other reviews of this owner.
//   * Reviewer's email is collected (required) but never displayed back.

'use client'

import { useState, useEffect, use } from 'react'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, {
  leaveReview: string
  pageNotFound: string
  pageNotFoundSub: string
  thankYou: string
  thankYouSub: string
  ratingLabel: string
  starLabel: (n: number) => string
  nameLabel: string
  namePlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  emailNote: string
  reviewLabel: string
  reviewPlaceholder: string
  submitBtn: string
  submittingBtn: string
  disclaimer: string
  errName: string
  errEmail: string
  errRating: string
  errReview: string
  errGeneric: string
  errNetwork: string
}> = {
  en: {
    leaveReview: 'Leave a review for',
    pageNotFound: 'Page not found',
    pageNotFoundSub: "This review link doesn't exist or has been removed.",
    thankYou: 'Thank you',
    thankYouSub: 'Your review has been submitted. It will appear publicly once the owner reviews it.',
    ratingLabel: 'Your rating',
    starLabel: (n) => `${n} star${n > 1 ? 's' : ''}`,
    nameLabel: 'Your name',
    namePlaceholder: 'Jane Doe',
    emailLabel: 'Your email',
    emailPlaceholder: 'jane@example.com',
    emailNote: "Only shared with the person you're reviewing. Never shown publicly.",
    reviewLabel: 'Your review',
    reviewPlaceholder: 'Tell others about your experience…',
    submitBtn: 'Submit review',
    submittingBtn: 'Submitting…',
    disclaimer: 'By submitting, you confirm this is your honest experience.',
    errName: 'Please enter your name.',
    errEmail: 'Please enter a valid email.',
    errRating: 'Please choose a rating from 1 to 5.',
    errReview: 'Please write your review.',
    errGeneric: 'Something went wrong.',
    errNetwork: 'Network error. Please try again.',
  },
  es: {
    leaveReview: 'Deja una reseña para',
    pageNotFound: 'Página no encontrada',
    pageNotFoundSub: 'Este enlace de reseña no existe o ha sido eliminado.',
    thankYou: 'Gracias',
    thankYouSub: 'Tu reseña ha sido enviada. Aparecerá públicamente una vez que el propietario la revise.',
    ratingLabel: 'Tu calificación',
    starLabel: (n) => `${n} estrella${n > 1 ? 's' : ''}`,
    nameLabel: 'Tu nombre',
    namePlaceholder: 'Juan Pérez',
    emailLabel: 'Tu correo electrónico',
    emailPlaceholder: 'juan@ejemplo.com',
    emailNote: 'Solo se comparte con la persona que estás reseñando. Nunca se muestra públicamente.',
    reviewLabel: 'Tu reseña',
    reviewPlaceholder: 'Cuéntales a otros sobre tu experiencia…',
    submitBtn: 'Enviar reseña',
    submittingBtn: 'Enviando…',
    disclaimer: 'Al enviar, confirmas que esta es tu experiencia honesta.',
    errName: 'Por favor ingresa tu nombre.',
    errEmail: 'Por favor ingresa un correo electrónico válido.',
    errRating: 'Por favor elige una calificación del 1 al 5.',
    errReview: 'Por favor escribe tu reseña.',
    errGeneric: 'Algo salió mal.',
    errNetwork: 'Error de red. Por favor intenta de nuevo.',
  },
  pt: {
    leaveReview: 'Deixe uma avaliação para',
    pageNotFound: 'Página não encontrada',
    pageNotFoundSub: 'Este link de avaliação não existe ou foi removido.',
    thankYou: 'Obrigado',
    thankYouSub: 'Sua avaliação foi enviada. Ela aparecerá publicamente após a revisão do proprietário.',
    ratingLabel: 'Sua avaliação',
    starLabel: (n) => `${n} estrela${n > 1 ? 's' : ''}`,
    nameLabel: 'Seu nome',
    namePlaceholder: 'João Silva',
    emailLabel: 'Seu e-mail',
    emailPlaceholder: 'joao@exemplo.com',
    emailNote: 'Compartilhado apenas com a pessoa que você está avaliando. Nunca exibido publicamente.',
    reviewLabel: 'Sua avaliação',
    reviewPlaceholder: 'Conte aos outros sobre sua experiência…',
    submitBtn: 'Enviar avaliação',
    submittingBtn: 'Enviando…',
    disclaimer: 'Ao enviar, você confirma que esta é sua experiência honesta.',
    errName: 'Por favor, insira seu nome.',
    errEmail: 'Por favor, insira um e-mail válido.',
    errRating: 'Por favor, escolha uma avaliação de 1 a 5.',
    errReview: 'Por favor, escreva sua avaliação.',
    errGeneric: 'Algo deu errado.',
    errNetwork: 'Erro de rede. Por favor, tente novamente.',
  },
  pl: {
    leaveReview: 'Zostaw opinię dla',
    pageNotFound: 'Strona nie znaleziona',
    pageNotFoundSub: 'Ten link do opinii nie istnieje lub został usunięty.',
    thankYou: 'Dziękujemy',
    thankYouSub: 'Twoja opinia została przesłana. Pojawi się publicznie po zatwierdzeniu przez właściciela.',
    ratingLabel: 'Twoja ocena',
    starLabel: (n) => `${n} gwiazdka${n > 1 ? (n < 5 ? 'i' : '') : ''}`,
    nameLabel: 'Twoje imię',
    namePlaceholder: 'Jan Kowalski',
    emailLabel: 'Twój e-mail',
    emailPlaceholder: 'jan@przyklad.pl',
    emailNote: 'Udostępniany tylko osobie, którą oceniasz. Nigdy nie jest wyświetlany publicznie.',
    reviewLabel: 'Twoja opinia',
    reviewPlaceholder: 'Opowiedz innym o swoim doświadczeniu…',
    submitBtn: 'Wyślij opinię',
    submittingBtn: 'Wysyłanie…',
    disclaimer: 'Przesyłając, potwierdzasz, że to jest Twoje uczciwe doświadczenie.',
    errName: 'Proszę podać swoje imię.',
    errEmail: 'Proszę podać prawidłowy adres e-mail.',
    errRating: 'Proszę wybrać ocenę od 1 do 5.',
    errReview: 'Proszę napisać swoją opinię.',
    errGeneric: 'Coś poszło nie tak.',
    errNetwork: 'Błąd sieci. Proszę spróbować ponownie.',
  },
  ru: {
    leaveReview: 'Оставьте отзыв для',
    pageNotFound: 'Страница не найдена',
    pageNotFoundSub: 'Эта ссылка на отзыв не существует или была удалена.',
    thankYou: 'Спасибо',
    thankYouSub: 'Ваш отзыв отправлен. Он появится публично после проверки владельцем.',
    ratingLabel: 'Ваша оценка',
    starLabel: (n) => `${n} звезда${n > 1 ? (n < 5 ? 'ы' : '') : ''}`,
    nameLabel: 'Ваше имя',
    namePlaceholder: 'Иван Иванов',
    emailLabel: 'Ваш e-mail',
    emailPlaceholder: 'ivan@primer.ru',
    emailNote: 'Передаётся только тому, кого вы оцениваете. Никогда не отображается публично.',
    reviewLabel: 'Ваш отзыв',
    reviewPlaceholder: 'Расскажите другим о своём опыте…',
    submitBtn: 'Отправить отзыв',
    submittingBtn: 'Отправка…',
    disclaimer: 'Отправляя, вы подтверждаете, что это ваш честный опыт.',
    errName: 'Пожалуйста, введите ваше имя.',
    errEmail: 'Пожалуйста, введите действительный адрес e-mail.',
    errRating: 'Пожалуйста, выберите оценку от 1 до 5.',
    errReview: 'Пожалуйста, напишите ваш отзыв.',
    errGeneric: 'Что-то пошло не так.',
    errNetwork: 'Ошибка сети. Пожалуйста, попробуйте снова.',
  },
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error', message: string }
  | { kind: 'not-found' }

export default function PublicReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [authorName, setAuthorName]   = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [rating, setRating]           = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [content, setContent]         = useState('')
  const [status, setStatus]           = useState<Status>({ kind: 'idle' })

  // Detect submitter's language from their browser — purely informational,
  // used so the owner can see what language each review came in.
  const [language, setLanguage] = useState('en')
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const raw = (navigator.language || 'en').toLowerCase().split('-')[0].slice(0, 8)
      setLanguage(raw)
      const supported: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']
      setLang(supported.includes(raw as Lang) ? (raw as Lang) : 'en')
    }
  }, [])

  const t = COPY[lang]

  async function submit() {
    if (status.kind === 'submitting') return
    if (!authorName.trim())                  return setStatus({ kind: 'error', message: t.errName })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authorEmail.trim())) return setStatus({ kind: 'error', message: t.errEmail })
    if (rating < 1 || rating > 5)            return setStatus({ kind: 'error', message: t.errRating })
    if (!content.trim())                     return setStatus({ kind: 'error', message: t.errReview })

    setStatus({ kind: 'submitting' })

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          author_name: authorName.trim(),
          author_email: authorEmail.trim(),
          rating,
          content: content.trim(),
          language,
        }),
      })

      if (res.status === 404) return setStatus({ kind: 'not-found' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return setStatus({ kind: 'error', message: j?.error || t.errGeneric })
      }
      setStatus({ kind: 'done' })
    } catch {
      setStatus({ kind: 'error', message: t.errNetwork })
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', fontFamily: 'system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Header — only thing public about the owner is the slug. */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            {t.leaveReview}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
            @{slug}
          </h1>
        </div>

        {status.kind === 'not-found' && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '20px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t.pageNotFound}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
              {t.pageNotFoundSub}
            </div>
          </div>
        )}

        {status.kind === 'done' && (
          <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 14, padding: '24px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t.thankYou}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              {t.thankYouSub}
            </div>
          </div>
        )}

        {status.kind !== 'done' && status.kind !== 'not-found' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>

            {/* Rating */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.ratingLabel}
              </label>
              <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHoverRating(0)}>
                {[1, 2, 3, 4, 5].map(n => {
                  const filled = n <= (hoverRating || rating)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      aria-label={t.starLabel(n)}
                      style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', fontSize: 32, color: filled ? GOLD : 'rgba(255,255,255,0.18)', transition: 'color 0.1s' }}
                    >
                      ★
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.nameLabel}
              </label>
              <input
                type="text"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                maxLength={80}
                placeholder={t.namePlaceholder}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.emailLabel}
              </label>
              <input
                type="email"
                value={authorEmail}
                onChange={e => setAuthorEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                {t.emailNote}
              </div>
            </div>

            {/* Review */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.reviewLabel}
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder={t.reviewPlaceholder}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, textAlign: 'right' }}>
                {content.length} / 2000
              </div>
            </div>

            {status.kind === 'error' && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>
                {status.message}
              </div>
            )}

            <button
              onClick={submit}
              disabled={status.kind === 'submitting'}
              style={{ width: '100%', background: BLUE, color: '#fff', fontSize: 14, fontWeight: 700, padding: '14px', borderRadius: 10, border: 'none', cursor: status.kind === 'submitting' ? 'wait' : 'pointer', opacity: status.kind === 'submitting' ? 0.6 : 1 }}
            >
              {status.kind === 'submitting' ? t.submittingBtn : t.submitBtn}
            </button>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
              {t.disclaimer}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
