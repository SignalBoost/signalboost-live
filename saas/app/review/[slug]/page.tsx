'use client'

import { useEffect, useMemo, useState, use, type CSSProperties, type ReactNode } from 'react'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'
const COPY = {
  en: { leave: 'Leave a review for', notFound: 'Page not found', notFoundBody: "This review link doesn't exist or has been removed.", thanks: 'Thank you', thanksBody: 'Your review has been submitted and routed to the right review queue.', rating: 'Your rating', name: 'Your name', email: 'Your email', privacy: "Only shared with the person you're reviewing. Never shown publicly.", review: 'Your review', media: 'Photo or video proof (optional)', submit: 'Submit review', submitting: 'Submitting…', honest: 'By submitting, you confirm this is your honest experience.', nameError: 'Please enter your name.', emailError: 'Please enter a valid email.', ratingError: 'Please choose a rating from 1 to 5.', contentError: 'Please write your review.', genericError: 'Something went wrong.', networkError: 'Network error. Please try again.', placeholder: 'Tell others about your experience…' },
  es: { leave: 'Deja una reseña para', notFound: 'Página no encontrada', notFoundBody: 'Este enlace de reseña no existe o fue eliminado.', thanks: 'Gracias', thanksBody: 'Tu reseña fue enviada y enviada a la cola correcta.', rating: 'Tu calificación', name: 'Tu nombre', email: 'Tu email', privacy: 'Solo se comparte con la persona que reseñas. Nunca se muestra públicamente.', review: 'Tu reseña', media: 'Foto o video (opcional)', submit: 'Enviar reseña', submitting: 'Enviando…', honest: 'Al enviar, confirmas que esta es tu experiencia honesta.', nameError: 'Escribe tu nombre.', emailError: 'Escribe un email válido.', ratingError: 'Elige una calificación de 1 a 5.', contentError: 'Escribe tu reseña.', genericError: 'Algo salió mal.', networkError: 'Error de red. Inténtalo de nuevo.', placeholder: 'Cuéntales a otros sobre tu experiencia…' },
  pt: { leave: 'Deixe uma avaliação para', notFound: 'Página não encontrada', notFoundBody: 'Este link de avaliação não existe ou foi removido.', thanks: 'Obrigado', thanksBody: 'Sua avaliação foi enviada para a fila correta.', rating: 'Sua nota', name: 'Seu nome', email: 'Seu email', privacy: 'Compartilhado apenas com a pessoa avaliada. Nunca aparece publicamente.', review: 'Sua avaliação', media: 'Foto ou vídeo (opcional)', submit: 'Enviar avaliação', submitting: 'Enviando…', honest: 'Ao enviar, você confirma que esta é sua experiência honesta.', nameError: 'Informe seu nome.', emailError: 'Informe um email válido.', ratingError: 'Escolha uma nota de 1 a 5.', contentError: 'Escreva sua avaliação.', genericError: 'Algo deu errado.', networkError: 'Erro de rede. Tente novamente.', placeholder: 'Conte para outras pessoas sobre sua experiência…' },
  pl: { leave: 'Zostaw opinię dla', notFound: 'Nie znaleziono strony', notFoundBody: 'Ten link opinii nie istnieje albo został usunięty.', thanks: 'Dziękujemy', thanksBody: 'Twoja opinia została wysłana do właściwej kolejki.', rating: 'Twoja ocena', name: 'Twoje imię', email: 'Twój email', privacy: 'Udostępniane tylko osobie ocenianej. Nigdy publicznie.', review: 'Twoja opinia', media: 'Zdjęcie lub wideo (opcjonalnie)', submit: 'Wyślij opinię', submitting: 'Wysyłanie…', honest: 'Wysyłając, potwierdzasz, że to Twoje szczere doświadczenie.', nameError: 'Podaj imię.', emailError: 'Podaj prawidłowy email.', ratingError: 'Wybierz ocenę od 1 do 5.', contentError: 'Napisz opinię.', genericError: 'Coś poszło nie tak.', networkError: 'Błąd sieci. Spróbuj ponownie.', placeholder: 'Opowiedz innym o swoim doświadczeniu…' },
  ru: { leave: 'Оставьте отзыв для', notFound: 'Страница не найдена', notFoundBody: 'Эта ссылка для отзыва не существует или удалена.', thanks: 'Спасибо', thanksBody: 'Ваш отзыв отправлен в правильную очередь.', rating: 'Ваша оценка', name: 'Ваше имя', email: 'Ваш email', privacy: 'Доступно только получателю отзыва. Публично не показывается.', review: 'Ваш отзыв', media: 'Фото или видео (необязательно)', submit: 'Отправить отзыв', submitting: 'Отправка…', honest: 'Отправляя, вы подтверждаете, что это ваш честный опыт.', nameError: 'Введите имя.', emailError: 'Введите корректный email.', ratingError: 'Выберите оценку от 1 до 5.', contentError: 'Напишите отзыв.', genericError: 'Что-то пошло не так.', networkError: 'Ошибка сети. Попробуйте снова.', placeholder: 'Расскажите другим о вашем опыте…' },
} as const

type Locale = keyof typeof COPY
type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'done' } | { kind: 'error'; message: string } | { kind: 'not-found' }

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function PublicReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [authorName, setAuthorName] = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [language, setLanguage] = useState<Locale>('en')
  const [files, setFiles] = useState<File[]>([])
  const copy = useMemo(() => COPY[language] || COPY.en, [language])

  useEffect(() => {
    const code = (navigator.language || 'en').toLowerCase().split('-')[0]
    if (code in COPY) setLanguage(code as Locale)
  }, [])

  async function submit() {
    if (status.kind === 'submitting') return
    if (!authorName.trim()) return setStatus({ kind: 'error', message: copy.nameError })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authorEmail.trim())) return setStatus({ kind: 'error', message: copy.emailError })
    if (rating < 1 || rating > 5) return setStatus({ kind: 'error', message: copy.ratingError })
    if (!content.trim()) return setStatus({ kind: 'error', message: copy.contentError })
    setStatus({ kind: 'submitting' })
    try {
      const media_data_urls = await Promise.all(files.slice(0, 4).map(toDataUrl))
      const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, author_name: authorName.trim(), author_email: authorEmail.trim(), rating, content: content.trim(), language, media_data_urls }) })
      if (res.status === 404) return setStatus({ kind: 'not-found' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return setStatus({ kind: 'error', message: j?.error || copy.genericError })
      }
      setStatus({ kind: 'done' })
    } catch { setStatus({ kind: 'error', message: copy.networkError }) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', fontFamily: 'system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}><select value={language} onChange={e => setLanguage(e.target.value as Locale)} style={{ float: 'right', borderRadius: 999, padding: '8px 10px', background: '#111827', color: '#fff', border: '1px solid rgba(255,255,255,.15)' }}>{Object.keys(COPY).map(locale => <option key={locale} value={locale}>{locale.toUpperCase()}</option>)}</select><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{copy.leave}</div><h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>@{slug}</h1></div>
        {status.kind === 'not-found' && <Notice danger title={copy.notFound} body={copy.notFoundBody} />}
        {status.kind === 'done' && <Notice title={`✓ ${copy.thanks}`} body={copy.thanksBody} />}
        {status.kind !== 'done' && status.kind !== 'not-found' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
            <Field label={copy.rating}><div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHoverRating(0)}>{[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHoverRating(n)} aria-label={`${n} star`} style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', fontSize: 32, color: n <= (hoverRating || rating) ? GOLD : 'rgba(255,255,255,0.18)' }}>★</button>)}</div></Field>
            <Field label={copy.name}><input value={authorName} onChange={e => setAuthorName(e.target.value)} maxLength={80} placeholder="Jane Doe" style={inputStyle} /></Field>
            <Field label={copy.email}><input type="email" value={authorEmail} onChange={e => setAuthorEmail(e.target.value)} placeholder="jane@example.com" style={inputStyle} /><div style={hintStyle}>{copy.privacy}</div></Field>
            <Field label={copy.review}><textarea value={content} onChange={e => setContent(e.target.value)} maxLength={2000} rows={5} placeholder={copy.placeholder} style={{ ...inputStyle, resize: 'vertical' }} /><div style={{ ...hintStyle, textAlign: 'right' }}>{content.length} / 2000</div></Field>
            <Field label={copy.media}><input type="file" accept="image/*,video/*" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 4))} /></Field>
            {status.kind === 'error' && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>{status.message}</div>}
            <button onClick={submit} disabled={status.kind === 'submitting'} style={{ width: '100%', background: BLUE, color: '#fff', fontSize: 14, fontWeight: 700, padding: 14, borderRadius: 10, border: 'none', cursor: status.kind === 'submitting' ? 'wait' : 'pointer', opacity: status.kind === 'submitting' ? 0.6 : 1 }}>{status.kind === 'submitting' ? copy.submitting : copy.submit}</button>
            <div style={{ ...hintStyle, marginTop: 14, textAlign: 'center' }}>{copy.honest}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Notice({ title, body, danger = false }: { title: string; body: string; danger?: boolean }) {
  return <div style={{ background: danger ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)', border: `1px solid ${danger ? 'rgba(239,68,68,0.25)' : 'rgba(74,222,128,0.25)'}`, borderRadius: 14, padding: '24px 22px', textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{body}</div></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div style={{ marginBottom: 16 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>{children}</div>
}

const inputStyle: CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }
const hintStyle: CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }
