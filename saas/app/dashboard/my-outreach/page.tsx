'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY = {
  eyebrow:     { en: uiText('generatedUi.u_b97dc5270c1705f5'), es: 'Crecer', pt: 'Crescer', pl: 'Rozwój', ru: 'Рост', de: 'Wachsen', fr: 'Croître', it: 'Cresci', ja: '成長', ko: '성장', ar: 'النمو' },
  title:       { en: uiText('generatedUi.u_04c411dc1ee0d29f'), es: 'Mi prospección', pt: 'Minha prospecção', pl: 'Mój outreach', ru: 'Мой аутрич', de: 'Meine Outreach', fr: 'Ma prospection', it: 'Il mio outreach', ja: 'マイアウトリーチ', ko: '내 아웃리치', ar: 'تواصلي' },
  subtitle:    { en: uiText('generatedUi.u_722149143a688b7e'), es: 'Crea mensajes de prospección de calidad IA para tu negocio, revísalos y envíalos desde tu propio correo.', pt: 'Crie mensagens de prospecção com qualidade de IA para o seu negócio, revise e envie do seu próprio e-mail.', pl: 'Twórz wiadomości outreach jakości AI dla swojej firmy, sprawdzaj je i wysyłaj z własnej poczty.', ru: 'Создавайте аутрич-сообщения уровня ИИ для вашего бизнеса, проверяйте и отправляйте со своей почты.', de: 'Erstellen Sie Outreach-Nachrichten in KI-Qualität für Ihr Unternehmen, prüfen Sie sie und senden Sie sie von Ihrer eigenen E-Mail-Adresse.', fr: 'Créez des messages de prospection de qualité IA pour votre entreprise, relisez-les et envoyez-les depuis votre propre adresse e-mail.', it: 'Crea messaggi di outreach di qualità AI per la tua attività, rivedili e inviali dalla tua email.', ja: 'ビジネス向けに AI 品質のアウトリーチメッセージを作成し、確認してから自分のメールアドレスで送信できます。', ko: '비즈니스를 위한 AI 품질의 아웃리치 메시지를 만들고, 검토한 뒤 본인 이메일로 보내세요.', ar: 'أنشئ رسائل تواصل بجودة الذكاء الاصطناعي لنشاطك التجاري، وراجعها، وأرسلها من بريدك الإلكتروني الخاص.' },
  tip:         { en: uiText('generatedUi.u_9455a2506cbad568'), es: '💡 Consejo: pide al Concierge que escriba borradores — p. ej. "Redacta un mensaje de prospección a un hotel local para mi negocio".', pt: '💡 Dica: peça ao Concierge para escrever rascunhos — ex. "Redija uma mensagem de prospecção para um hotel local para o meu negócio".', pl: '💡 Wskazówka: poproś Concierge o napisanie szkiców — np. "Napisz wiadomość outreach do lokalnego hotelu dla mojej firmy".', ru: '💡 Совет: попросите Консьержа написать черновики — напр. «Составь аутрич-сообщение местному отелю для моего бизнеса».', de: '💡 Tipp: Bitten Sie den Concierge, Entwürfe für Sie zu schreiben – z. B. „Entwirf eine Outreach-Nachricht an ein lokales Hotel für mein Unternehmen“.', fr: '💡 Astuce : demandez au Concierge de rédiger des brouillons pour vous — par ex. « Rédige un message de prospection à un hôtel local pour mon entreprise ».', it: '💡 Suggerimento: chiedi al Concierge di scrivere bozze per te, ad es. "Scrivi una bozza di messaggio di outreach a un hotel locale per la mia attività".', ja: '💡 ヒント：コンシェルジュに下書きを依頼しましょう。例：「自分のビジネスから地元のホテルへのアウトリーチメッセージを下書きして」。', ko: '💡 팁: 컨시어지에게 초안 작성을 요청하세요. 예: "내 비즈니스를 위해 지역 호텔에 보낼 아웃리치 메시지 초안을 작성해 줘".', ar: '💡 نصيحة: اطلب من الكونسيرج كتابة مسودات لك — مثلًا: "اكتب مسودة رسالة تواصل إلى فندق محلي لنشاطي التجاري".' },
  upgradeTitle:{ en: uiText('generatedUi.u_417cb998be01d968'), es: 'La prospección es una función de Growth y Command', pt: 'A prospecção é um recurso dos planos Growth e Command', pl: 'Outreach to funkcja planów Growth i Command', ru: 'Аутрич доступен на планах Growth и Command', de: 'Outreach ist eine Funktion von Growth & Command', fr: 'La prospection est une fonctionnalité Growth & Command', it: 'L’outreach è una funzionalità Growth & Command', ja: 'アウトリーチは Growth & Command の機能です', ko: '아웃리치는 Growth & Command 기능입니다', ar: 'التواصل ميزة ضمن Growth & Command' },
  upgradeBody: { en: uiText('generatedUi.u_79352022ab344a76'), es: 'Mejora tu plan para que la IA de SignalBoost escriba, gestione y haga seguimiento de tu prospección.', pt: 'Faça upgrade do plano para que a IA do SignalBoost escreva, gerencie e acompanhe sua prospecção.', pl: 'Ulepsz plan, aby AI SignalBoost pisała, zarządzała i śledziła Twój outreach.', ru: 'Обновите план, чтобы ИИ SignalBoost писал, управлял и отслеживал ваш аутрич.', de: 'Upgraden Sie Ihren Plan, damit SignalBoost AI die Outreach für Ihr Unternehmen schreiben, verwalten und nachverfolgen kann.', fr: 'Passez à un forfait supérieur pour permettre à SignalBoost AI de rédiger, gérer et suivre la prospection de votre entreprise.', it: 'Aggiorna il tuo piano per permettere a SignalBoost AI di scrivere, gestire e monitorare l\'outreach della tua attività.', ja: 'プランをアップグレードすると、SignalBoost AI がビジネスのアウトリーチを作成、管理、追跡できるようになります。', ko: '요금제를 업그레이드하면 SignalBoost AI가 비즈니스의 아웃리치를 작성, 관리 및 추적할 수 있습니다.', ar: 'قم بترقية خطتك للسماح لـ SignalBoost AI بكتابة رسائل التواصل لنشاطك التجاري وإدارتها وتتبّعها.' },
  upgradeCta:  { en: uiText('generatedUi.u_a72e2bd3e148c05e'), es: 'Ver planes', pt: 'Ver planos', pl: 'Zobacz plany', ru: 'Смотреть планы', de: 'Tarife anzeigen', fr: 'Voir les forfaits', it: 'Vedi i piani', ja: 'プランを見る', ko: '요금제 보기', ar: 'عرض الخطط' },
  newDraft:    { en: uiText('generatedUi.u_1f2c17331a7383f3'), es: 'Nuevo borrador', pt: 'Novo rascunho', pl: 'Nowy szkic', ru: 'Новый черновик', de: 'Neuer Entwurf', fr: 'Nouveau brouillon', it: 'Nuova bozza', ja: '新規下書き', ko: '새 초안', ar: 'مسودة جديدة' },
  bizName:     { en: uiText('generatedUi.u_f3869bb155251d39'), es: 'Nombre del negocio objetivo', pt: 'Nome do negócio-alvo', pl: 'Nazwa firmy docelowej', ru: 'Название целевой компании', de: 'Name des Zielunternehmens', fr: 'Nom de l\'entreprise cible', it: 'Nome dell\'azienda target', ja: '対象企業名', ko: '대상 비즈니스 이름', ar: 'اسم النشاط التجاري المستهدف' },
  bizUrl:      { en: uiText('generatedUi.u_a3ed39057034ba7d'), es: 'Sitio web objetivo (https://…)', pt: 'Site-alvo (https://…)', pl: 'Strona docelowa (https://…)', ru: 'Сайт цели (https://…)', de: 'Ziel-Website (https://…)', fr: 'Site web cible (https://…)', it: 'Sito web di destinazione (https://…)', ja: '対象ウェブサイト (https://…)', ko: '대상 웹사이트(https://…)', ar: 'الموقع المستهدف (https://…)' },
  message:     { en: uiText('generatedUi.u_00b8561daef5fc2a'), es: 'Tu mensaje (40–2.400 caracteres)', pt: 'Sua mensagem (40–2.400 caracteres)', pl: 'Twoja wiadomość (40–2400 znaków)', ru: 'Ваше сообщение (40–2400 символов)', de: 'Ihre Outreach-Nachricht (40–2.400 Zeichen)', fr: 'Votre message de prospection (40 à 2 400 caractères)', it: 'Il tuo messaggio di outreach (40–2.400 caratteri)', ja: 'アウトリーチメッセージ（40～2,400 文字）', ko: '아웃리치 메시지(40~2,400자)', ar: 'رسالة التواصل الخاصة بك (40–2,400 حرف)' },
  create:      { en: uiText('generatedUi.u_07d07af207607fd0'), es: 'Crear borrador', pt: 'Criar rascunho', pl: 'Utwórz szkic', ru: 'Создать черновик', de: 'Entwurf erstellen', fr: 'Créer un brouillon', it: 'Crea bozza', ja: '下書きを作成', ko: '초안 만들기', ar: 'إنشاء مسودة' },
  creating:    { en: uiText('generatedUi.u_c79ed9492e3c1719'), es: 'Creando…', pt: 'Criando…', pl: 'Tworzenie…', ru: 'Создание…', de: 'Wird erstellt…', fr: 'Création…', it: 'Creazione…', ja: '作成中…', ko: '생성 중…', ar: 'جارٍ الإنشاء…' },
  empty:       { en: uiText('generatedUi.u_39df5c2fbe55f5cf'), es: 'Aún no hay borradores. Crea uno abajo o pide al Concierge.', pt: 'Ainda não há rascunhos. Crie um abaixo ou peça ao Concierge.', pl: 'Brak szkiców. Utwórz poniżej lub poproś Concierge.', ru: 'Черновиков пока нет. Создайте ниже или попросите Консьержа.', de: 'Noch keine Entwürfe. Erstellen Sie unten einen oder fragen Sie den Concierge.', fr: 'Aucun brouillon pour l’instant. Créez-en un ci-dessous ou demandez au Concierge.', it: 'Ancora nessuna bozza. Creane una qui sotto o chiedi al Concierge.', ja: '下書きはまだありません。下で作成するか、コンシェルジュに依頼してください。', ko: '아직 초안이 없습니다. 아래에서 만들거나 컨시어지에게 요청하세요.', ar: 'لا توجد مسودات بعد. أنشئ واحدة أدناه أو اطلب من الكونسيرج.' },
  approve:     { en: uiText('generatedUi.u_6007acbe30b2cd98'), es: 'Aprobar', pt: 'Aprovar', pl: 'Zatwierdź', ru: 'Одобрить', de: 'Genehmigen', fr: 'Approuver', it: 'Approva', ja: '承認', ko: '승인', ar: 'موافقة' },
  reject:      { en: uiText('generatedUi.u_ab604a360777735f'), es: 'Rechazar', pt: 'Rejeitar', pl: 'Odrzuć', ru: 'Отклонить', de: 'Ablehnen', fr: 'Rejeter', it: 'Rifiuta', ja: '却下', ko: '거부', ar: 'رفض' },
  openEmail:   { en: uiText('generatedUi.u_8c8b417f26b87ee8'), es: '✉️ Abrir en tu correo', pt: '✉️ Abrir no e-mail', pl: '✉️ Otwórz w poczcie', ru: '✉️ Открыть в почте', de: '✉️ In E-Mail-App öffnen', fr: '✉️ Ouvrir dans l’application de messagerie', it: '✉️ Apri nell’app email', ja: '✉️ メールアプリで開く', ko: '✉️ 이메일 앱에서 열기', ar: '✉️ فتح في تطبيق البريد الإلكتروني' },
  copyMsg:     { en: uiText('generatedUi.u_51be5db87b562ccd'), es: '📋 Copiar mensaje', pt: '📋 Copiar mensagem', pl: '📋 Kopiuj wiadomość', ru: '📋 Копировать', de: '📋 Nachricht kopieren', fr: '📋 Copier le message', it: '📋 Copia messaggio', ja: '📋 メッセージをコピー', ko: '📋 메시지 복사', ar: '📋 نسخ الرسالة' },
  copied:      { en: uiText('generatedUi.u_ea61bc15688d1e48'), es: '¡Copiado!', pt: 'Copiado!', pl: 'Skopiowano!', ru: 'Скопировано!', de: 'Kopiert!', fr: 'Copié !', it: 'Copiato!', ja: 'コピーしました！', ko: '복사됨!', ar: 'تم النسخ!' },
  usage:       { en: uiText('generatedUi.u_ebfe4c0262bfe7bb'), es: 'borradores hoy', pt: 'rascunhos hoje', pl: 'szkice dzisiaj', ru: 'черновиков сегодня', de: 'Entwürfe heute', fr: 'brouillons aujourd’hui', it: 'bozze oggi', ja: '件の下書き（本日）', ko: '개 초안(오늘)', ar: 'مسودات اليوم' },
  loadError:   { en: uiText('generatedUi.u_0321e8bb7664807f'), es: 'No se pudieron cargar tus borradores.', pt: 'Não foi possível carregar seus rascunhos.', pl: 'Nie udało się załadować szkiców.', ru: 'Не удалось загрузить черновики.', de: 'Ihre Entwürfe konnten nicht geladen werden.', fr: 'Impossible de charger vos brouillons.', it: 'Impossibile caricare le tue bozze.', ja: '下書きを読み込めませんでした。', ko: '초안을 불러올 수 없습니다.', ar: 'تعذّر تحميل مسوداتك.' },
  statuses: {
    pending:  { en: uiText('generatedUi.u_331551b0de4157c9'),  es: 'Pendiente', pt: 'Pendente', pl: 'Oczekuje', ru: 'Ожидает', de: 'Ausstehend', fr: 'En attente', it: 'In sospeso', ja: '保留中', ko: '대기 중', ar: 'قيد الانتظار' },
    approved: { en: uiText('generatedUi.u_87b42e40c2a290e0'), es: 'Aprobado',  pt: 'Aprovado', pl: 'Zatwierdzony', ru: 'Одобрен', de: 'Genehmigt', fr: 'Approuvé', it: 'Approvato', ja: '承認済み', ko: '승인됨', ar: 'تمت الموافقة' },
    rejected: { en: uiText('generatedUi.u_aea4a04a80426ed8'), es: 'Rechazado', pt: 'Rejeitado', pl: 'Odrzucony', ru: 'Отклонён', de: 'Abgelehnt', fr: 'Rejeté', it: 'Rifiutato', ja: '却下済み', ko: '거부됨', ar: 'مرفوض' },
  },
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#fde68a',
  approved: '#86efac',
  rejected: '#fca5a5',
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

type Draft = {
  id: string
  business_name: string | null
  business_url: string | null
  outreach_message: string | null
  status: string
  source_platform: string
  created_at: string
}

export default function MyOutreachPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang

  const [drafts, setDrafts]       = useState<Draft[]>([])
  const [loading, setLoading]     = useState(true)
  const [planGated, setPlanGated] = useState(false)
  const [notice, setNotice]       = useState('')
  const [usedToday, setUsedToday] = useState(0)
  const [dailyCap, setDailyCap]   = useState(10)
  const [copiedId, setCopiedId]   = useState('')

  const [bizName, setBizName]     = useState('')
  const [bizUrl, setBizUrl]       = useState('')
  const [message, setMessage]     = useState('')
  const [creating, setCreating]   = useState(false)

  async function load() {
    setLoading(true); setNotice('')
    try {
      const res = await fetch('/api/my-outreach')
      const data = await res.json()
      if (res.status === 403 && data?.reason === 'plan') { setPlanGated(true); return }
      if (!res.ok) { setNotice(String(data?.error || c(COPY.loadError, l))); return }
      setDrafts(Array.isArray(data?.drafts) ? data.drafts : [])
      setUsedToday(Number(data?.usedToday || 0))
      setDailyCap(Number(data?.dailyCap || 10))
    } catch {
      setNotice(c(COPY.loadError, l))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function createDraft() {
    if (creating) return
    setCreating(true); setNotice('')
    try {
      const res = await fetch('/api/my-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: bizName, businessUrl: bizUrl, message }),
      })
      const data = await res.json()
      if (!res.ok) { setNotice(String(data?.error || "Error")); return }
      setBizName(''); setBizUrl(''); setMessage('')
      await load()
    } catch {
      setNotice("Error")
    } finally {
      setCreating(false)
    }
  }

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    try {
      const res = await fetch('/api/my-outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) { setNotice(String(data?.error || "Error")); return }
      setNotice('')
      setDrafts(prev => prev.map(d => (d.id === id ? { ...d, status } : d)))
    } catch {
      setNotice("Error")
    }
  }

  function mailtoHref(d: Draft): string {
    const subject = encodeURIComponent(`Partnership idea for ${d.business_name || 'your business'}`)
    const body = encodeURIComponent(String(d.outreach_message || ''))
    return `mailto:?subject=${subject}&body=${body}`
  }

  async function copyMessage(d: Draft) {
    try {
      await navigator.clipboard.writeText(String(d.outreach_message || ''))
      setCopiedId(d.id)
      setTimeout(() => setCopiedId(''), 1500)
    } catch { /* clipboard unavailable */ }
  }

  if (planGated) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', textAlign: 'center', color: 'var(--text-primary)', padding: '0 16px' }}>
        <div style={{ fontSize: 44 }}>🛸</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.03em', margin: '10px 0' }}>{c(COPY.upgradeTitle, l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.7 }}>{c(COPY.upgradeBody, l)}</p>
        <Link href="/pricing" className="sb-button-primary" style={{ display: 'inline-block', marginTop: 16, padding: '12px 26px', borderRadius: 14, textDecoration: 'none' }}>
          {c(COPY.upgradeCta, l)}
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 0', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.14), transparent 22rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.2)', borderRadius: 24, padding: '20px 24px', marginBottom: 14 }}>
        <p className="sb-eyebrow">🛸 {c(COPY.eyebrow, l)}</p>
        <h1 style={{ fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '6px 0 6px' }}>{c(COPY.title, l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 620 }}>{c(COPY.subtitle, l)}</p>
        <p style={{ color: 'rgba(26,240,255,.75)', fontSize: 12.5, lineHeight: 1.6, margin: '10px 0 0' }}>{c(COPY.tip, l)}</p>
      </div>

      {notice && (
        <div style={{ border: '1px solid rgba(252,165,165,.4)', background: 'rgba(252,165,165,.07)', color: '#fca5a5', borderRadius: 14, padding: '10px 16px', fontSize: 13, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      {/* Create form */}
      <div style={{ border: '1px solid rgba(255,255,255,.12)', background: 'linear-gradient(145deg, rgba(15,23,42,.8), rgba(3,7,18,.7))', borderRadius: 18, padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>＋ {c(COPY.newDraft, l)}</h2>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{usedToday}/{dailyCap} {c(COPY.usage, l)}</span>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="sb-input" value={bizName} onChange={e => setBizName(e.target.value)} placeholder={c(COPY.bizName, l)} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 13 }} />
            <input className="sb-input" value={bizUrl} onChange={e => setBizUrl(e.target.value)} placeholder={c(COPY.bizUrl, l)} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 13 }} />
          </div>
          <textarea className="sb-input" value={message} onChange={e => setMessage(e.target.value)} placeholder={c(COPY.message, l)} rows={4} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 13, resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: message.length > 2400 ? '#fca5a5' : 'rgba(255,255,255,.4)', fontFamily: 'ui-monospace, Menlo, monospace' }}>{message.length} / 2400</span>
            <button onClick={createDraft} disabled={creating || !bizName.trim() || !bizUrl.trim() || message.trim().length < 40 || message.length > 2400} className="sb-button-primary" style={{ padding: '10px 22px', borderRadius: 12, fontSize: 13, opacity: creating ? 0.6 : 1 }}>
              {creating ? c(COPY.creating, l) : c(COPY.create, l)}
            </button>
          </div>
        </div>
      </div>

      {loading && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>…</p>}

      {!loading && drafts.length === 0 && (
        <div style={{ border: '1px dashed rgba(255,255,255,.18)', borderRadius: 18, padding: '32px 24px', textAlign: 'center', color: 'rgba(255,255,255,.55)', fontSize: 14 }}>
          🛸 {c(COPY.empty, l)}
        </div>
      )}

      <section style={{ display: 'grid', gap: 12 }}>
        {drafts.map(d => {
          const status = d.status || 'pending'
          return (
            <article key={d.id} style={{ border: '1px solid rgba(255,255,255,.1)', borderLeft: `2px solid ${STATUS_COLOR[status] || 'rgba(255,255,255,.2)'}`, borderRadius: 14, padding: '14px 16px', background: 'rgba(8,12,22,.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{d.business_name || '—'}</h3>
                  {d.business_url ? (
                    <a href={d.business_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7dd3fc', textDecoration: 'none', wordBreak: 'break-all' }}>{d.business_url}</a>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {d.source_platform === 'concierge' ? (
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#c4b5fd', border: '1px solid rgba(196,181,253,.5)', borderRadius: 999, padding: '3px 9px' }}>{uiText('generatedUi.u_72d4bf2725543fcf')}</span>
                  ) : null}
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {new Date(d.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: STATUS_COLOR[status] || '#fff', border: `1px solid ${STATUS_COLOR[status] || '#fff'}`, borderRadius: 999, padding: '3px 10px' }}>
                    {c(COPY.statuses[status as keyof typeof COPY.statuses] || COPY.statuses.pending, l)}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '10px 0', color: 'rgba(255,255,255,.85)' }}>
                {d.outreach_message}
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {status !== 'approved' && (
                  <button onClick={() => setStatus(d.id, 'approved')} className="sb-button-primary" style={{ fontSize: 12, padding: '7px 14px', borderRadius: 10 }}>✓ {c(COPY.approve, l)}</button>
                )}
                {status !== 'rejected' && (
                  <button onClick={() => setStatus(d.id, 'rejected')} className="sb-button-secondary" style={{ fontSize: 12, padding: '7px 14px', borderRadius: 10 }}>× {c(COPY.reject, l)}</button>
                )}
                {status === 'approved' && (
                  <>
                    <a href={mailtoHref(d)} className="sb-button-secondary" style={{ fontSize: 12, padding: '7px 14px', borderRadius: 10, textDecoration: 'none' }}>{c(COPY.openEmail, l)}</a>
                    <button onClick={() => copyMessage(d)} className="sb-button-secondary" style={{ fontSize: 12, padding: '7px 14px', borderRadius: 10 }}>
                      {copiedId === d.id ? c(COPY.copied, l) : c(COPY.copyMsg, l)}
                    </button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
