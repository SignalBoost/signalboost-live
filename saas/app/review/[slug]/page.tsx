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
import { uiText } from '@/lib/i18n/uiText'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
    leaveReview: uiText('generatedUi.u_c52d5e6ddad7a60b'),
    pageNotFound: uiText('generatedUi.u_a469ab4ca4e55bf5'),
    pageNotFoundSub: uiText('generatedUi.u_2b45b9ca90fa2a58'),
    thankYou: uiText('generatedUi.u_268bc1833e83306f'),
    thankYouSub: uiText('generatedUi.u_5d5b8afd972f3139'),
    ratingLabel: uiText('generatedUi.u_68548b47e72ee1a5'),
    starLabel: (n) => `${n} star${n > 1 ? 's' : ''}`,
    nameLabel: uiText('generatedUi.u_2c6b2e253c01fb2e'),
    namePlaceholder: uiText('generatedUi.u_01332c876518a793'),
    emailLabel: uiText('generatedUi.u_33fe95ce02091218'),
    emailPlaceholder: uiText('generatedUi.u_8c87b489ce35cf2e'),
    emailNote: uiText('generatedUi.u_70bd825a6905a917'),
    reviewLabel: uiText('generatedUi.u_44237ef936d0a92c'),
    reviewPlaceholder: uiText('generatedUi.u_f6679b3065ec0062'),
    submitBtn: uiText('generatedUi.u_cb81e6b1cd1a3f98'),
    submittingBtn: uiText('generatedUi.u_49195f559e4a9f5b'),
    disclaimer: uiText('generatedUi.u_6c57a7561ee74ab6'),
    errName: uiText('generatedUi.u_f9b561ae22951d84'),
    errEmail: uiText('generatedUi.u_a76e25f9ec97e69f'),
    errRating: uiText('generatedUi.u_4cf9d15dd9974f62'),
    errReview: uiText('generatedUi.u_a64ae8f7198dfb64'),
    errGeneric: uiText('generatedUi.u_0c953ab32c603ec4'),
    errNetwork: uiText('generatedUi.u_9ff8cfaf7d943153'),
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
  de: {
    leaveReview: 'Bewertung abgeben für',
    pageNotFound: 'Seite nicht gefunden',
    pageNotFoundSub: 'Dieser Prüfungslink existiert nicht oder wurde entfernt.',
    thankYou: 'Vielen Dank',
    thankYouSub: 'Ihre Bewertung wurde eingereicht. Sie wird öffentlich angezeigt, sobald der Inhaber sie geprüft hat.',
    ratingLabel: 'Ihre Bewertung',
    starLabel: (n) => `${n} Stern${n > 1 ? 's' : ''}`,
    nameLabel: 'Ihr Name',
    namePlaceholder: 'Max Mustermann',
    emailLabel: 'Ihre E-Mail-Adresse',
    emailPlaceholder: 'jane@example.com',
    emailNote: 'Wird nur mit der Person geteilt, die Sie bewerten. Niemals öffentlich angezeigt.',
    reviewLabel: 'Ihre Bewertung',
    reviewPlaceholder: 'Erzählen Sie anderen von Ihrer Erfahrung…',
    submitBtn: 'Bewertung absenden',
    submittingBtn: 'Wird gesendet…',
    disclaimer: 'Mit dem Absenden bestätigen Sie, dass dies Ihre ehrliche Erfahrung ist.',
    errName: 'Bitte geben Sie Ihren Namen ein.',
    errEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
    errRating: 'Bitte wählen Sie eine Bewertung von 1 bis 5.',
    errReview: 'Bitte schreiben Sie Ihre Bewertung.',
    errGeneric: 'Etwas ist schiefgelaufen.',
    errNetwork: 'Netzwerkfehler. Bitte versuchen Sie es erneut.',
  },
  fr: {
    leaveReview: 'Laisser un avis pour',
    pageNotFound: 'Page introuvable',
    pageNotFoundSub: 'Ce lien de révision n\'existe pas ou a été supprimé.',
    thankYou: 'Merci',
    thankYouSub: 'Votre avis a été envoyé. Il sera publié dès que le propriétaire l’aura examiné.',
    ratingLabel: 'Votre note',
    starLabel: (n) => `${n} étoile${n > 1 ? 's' : ''}`,
    nameLabel: 'Votre nom',
    namePlaceholder: 'Jean Dupont',
    emailLabel: 'Votre e-mail',
    emailPlaceholder: 'jane@example.com',
    emailNote: 'Partagé uniquement avec la personne que vous évaluez. Jamais affiché publiquement.',
    reviewLabel: 'Votre avis',
    reviewPlaceholder: 'Parlez de votre expérience aux autres…',
    submitBtn: 'Envoyer l’avis',
    submittingBtn: 'Envoi…',
    disclaimer: 'En envoyant, vous confirmez qu\'il s\'agit de votre expérience sincère.',
    errName: 'Veuillez saisir votre nom.',
    errEmail: 'Veuillez saisir une adresse e-mail valide.',
    errRating: 'Veuillez choisir une note de 1 à 5.',
    errReview: 'Veuillez rédiger votre avis.',
    errGeneric: 'Une erreur s\'est produite.',
    errNetwork: 'Erreur réseau. Veuillez réessayer.',
  },
  it: {
    leaveReview: 'Lascia una recensione per',
    pageNotFound: 'Pagina non trovata',
    pageNotFoundSub: 'Questo link di revisione non esiste o è stato rimosso.',
    thankYou: 'Grazie',
    thankYouSub: 'La tua recensione è stata inviata. Sarà visibile pubblicamente non appena il proprietario la esaminerà.',
    ratingLabel: 'La tua valutazione',
    starLabel: (n) => `${n} stella${n > 1 ? 's' : ''}`,
    nameLabel: 'Il tuo nome',
    namePlaceholder: 'Mario Rossi',
    emailLabel: 'La tua email',
    emailPlaceholder: 'jane@example.com',
    emailNote: 'Condiviso solo con la persona che stai recensendo. Mai mostrato pubblicamente.',
    reviewLabel: 'La tua recensione',
    reviewPlaceholder: 'Racconta agli altri la tua esperienza…',
    submitBtn: 'Invia recensione',
    submittingBtn: 'Invio in corso…',
    disclaimer: 'Inviando, confermi che questa è la tua esperienza sincera.',
    errName: 'Inserisci il tuo nome.',
    errEmail: 'Inserisci un indirizzo email valido.',
    errRating: 'Scegli una valutazione da 1 a 5.',
    errReview: 'Scrivi la tua recensione.',
    errGeneric: 'Si è verificato un problema.',
    errNetwork: 'Errore di rete. Riprova.',
  },
  ja: {
    leaveReview: 'レビューを投稿：',
    pageNotFound: 'ページが見つかりません',
    pageNotFoundSub: 'このレビューリンクは存在しないか、削除されました。',
    thankYou: 'ありがとうございます',
    thankYouSub: 'レビューが送信されました。オーナーが確認すると公開されます。',
    ratingLabel: 'あなたの評価',
    starLabel: (n) => `${n}つ星${n > 1 ? 's' : ''}`,
    nameLabel: 'お名前',
    namePlaceholder: '山田 花子',
    emailLabel: 'メールアドレス',
    emailPlaceholder: 'jane@example.com',
    emailNote: 'レビュー対象の人にのみ共有されます。公開されることはありません。',
    reviewLabel: 'あなたのレビュー',
    reviewPlaceholder: 'あなたの体験を共有してください…',
    submitBtn: 'レビューを送信',
    submittingBtn: '送信中…',
    disclaimer: '送信することで、これがあなたの正直な体験であることを確認したものとみなされます。',
    errName: 'お名前を入力してください。',
    errEmail: '有効なメールアドレスを入力してください。',
    errRating: '1〜5 の評価を選択してください。',
    errReview: 'レビューを入力してください。',
    errGeneric: '問題が発生しました。',
    errNetwork: 'ネットワークエラーです。もう一度お試しください。',
  },
  ko: {
    leaveReview: '리뷰 남기기:',
    pageNotFound: '페이지를 찾을 수 없습니다',
    pageNotFoundSub: '이 검토 링크는 존재하지 않거나 삭제되었습니다.',
    thankYou: '감사합니다',
    thankYouSub: '리뷰가 제출되었습니다. 소유자가 검토하면 공개됩니다.',
    ratingLabel: '내 평점',
    starLabel: (n) => `별 ${n}개${n > 1 ? 's' : ''}`,
    nameLabel: '이름',
    namePlaceholder: '홍길동',
    emailLabel: '이메일',
    emailPlaceholder: 'jane@example.com',
    emailNote: '리뷰 대상자에게만 공유됩니다. 공개적으로 표시되지 않습니다.',
    reviewLabel: '내 리뷰',
    reviewPlaceholder: '다른 사람들에게 경험을 알려 주세요…',
    submitBtn: '리뷰 제출',
    submittingBtn: '제출 중…',
    disclaimer: '제출하면 이것이 본인의 솔직한 경험임을 확인하는 것입니다.',
    errName: '이름을 입력하세요.',
    errEmail: '유효한 이메일을 입력하세요.',
    errRating: '1~5점 중에서 평점을 선택하세요.',
    errReview: '리뷰를 작성하세요.',
    errGeneric: '문제가 발생했습니다.',
    errNetwork: '네트워크 오류입니다. 다시 시도하세요.',
  },
  ar: {
    leaveReview: 'اترك مراجعة لـ',
    pageNotFound: 'الصفحة غير موجودة',
    pageNotFoundSub: 'رابط المراجعة هذا غير موجود أو تمت إزالته.',
    thankYou: 'شكرًا لك',
    thankYouSub: 'تم إرسال مراجعتك. وستظهر للعامة بمجرد أن يراجعها المالك.',
    ratingLabel: 'تقييمك',
    starLabel: (n) => `${n} نجمة${n > 1 ? 's' : ''}`,
    nameLabel: 'اسمك',
    namePlaceholder: 'فلان الفلاني',
    emailLabel: 'بريدك الإلكتروني',
    emailPlaceholder: 'jane@example.com',
    emailNote: 'تُشارَك فقط مع الشخص الذي تراجعه. لا تُعرض علنًا أبدًا.',
    reviewLabel: 'مراجعتك',
    reviewPlaceholder: 'أخبر الآخرين عن تجربتك…',
    submitBtn: 'إرسال المراجعة',
    submittingBtn: 'جارٍ الإرسال…',
    disclaimer: 'بالإرسال، تؤكد أن هذه تجربتك الصادقة.',
    errName: 'يرجى إدخال اسمك.',
    errEmail: 'يُرجى إدخال بريد إلكتروني صالح.',
    errRating: 'يرجى اختيار تقييم من 1 إلى 5.',
    errReview: 'يُرجى كتابة مراجعتك.',
    errGeneric: 'حدث خطأ ما.',
    errNetwork: 'خطأ في الشبكة. يُرجى المحاولة مرة أخرى.',
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
      const supported: Lang[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']
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
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, textAlign: 'end' }}>
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
