'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY = {
  eyebrow:     { en: 'Grow', es: 'Crecer', pt: 'Crescer', pl: 'Rozwój', ru: 'Рост' },
  title:       { en: 'My Outreach', es: 'Mi prospección', pt: 'Minha prospecção', pl: 'Mój outreach', ru: 'Мой аутрич' },
  subtitle:    { en: 'Create AI-quality outreach messages for your business, review them, and send from your own email.', es: 'Crea mensajes de prospección de calidad IA para tu negocio, revísalos y envíalos desde tu propio correo.', pt: 'Crie mensagens de prospecção com qualidade de IA para o seu negócio, revise e envie do seu próprio e-mail.', pl: 'Twórz wiadomości outreach jakości AI dla swojej firmy, sprawdzaj je i wysyłaj z własnej poczty.', ru: 'Создавайте аутрич-сообщения уровня ИИ для вашего бизнеса, проверяйте и отправляйте со своей почты.' },
  tip:         { en: '💡 Tip: ask the Concierge to write drafts for you — e.g. "Draft an outreach message to a local hotel for my business".', es: '💡 Consejo: pide al Concierge que escriba borradores — p. ej. "Redacta un mensaje de prospección a un hotel local para mi negocio".', pt: '💡 Dica: peça ao Concierge para escrever rascunhos — ex. "Redija uma mensagem de prospecção para um hotel local para o meu negócio".', pl: '💡 Wskazówka: poproś Concierge o napisanie szkiców — np. "Napisz wiadomość outreach do lokalnego hotelu dla mojej firmy".', ru: '💡 Совет: попросите Консьержа написать черновики — напр. «Составь аутрич-сообщение местному отелю для моего бизнеса».' },
  upgradeTitle:{ en: 'Outreach is a Growth & Command feature', es: 'La prospección es una función de Growth y Command', pt: 'A prospecção é um recurso dos planos Growth e Command', pl: 'Outreach to funkcja planów Growth i Command', ru: 'Аутрич доступен на планах Growth и Command' },
  upgradeBody: { en: 'Upgrade your plan to let SignalBoost AI write, manage, and track outreach for your business.', es: 'Mejora tu plan para que la IA de SignalBoost escriba, gestione y haga seguimiento de tu prospección.', pt: 'Faça upgrade do plano para que a IA do SignalBoost escreva, gerencie e acompanhe sua prospecção.', pl: 'Ulepsz plan, aby AI SignalBoost pisała, zarządzała i śledziła Twój outreach.', ru: 'Обновите план, чтобы ИИ SignalBoost писал, управлял и отслеживал ваш аутрич.' },
  upgradeCta:  { en: 'View plans', es: 'Ver planes', pt: 'Ver planos', pl: 'Zobacz plany', ru: 'Смотреть планы' },
  newDraft:    { en: 'New draft', es: 'Nuevo borrador', pt: 'Novo rascunho', pl: 'Nowy szkic', ru: 'Новый черновик' },
  bizName:     { en: 'Target business name', es: 'Nombre del negocio objetivo', pt: 'Nome do negócio-alvo', pl: 'Nazwa firmy docelowej', ru: 'Название целевой компании' },
  bizUrl:      { en: 'Target website (https://…)', es: 'Sitio web objetivo (https://…)', pt: 'Site-alvo (https://…)', pl: 'Strona docelowa (https://…)', ru: 'Сайт цели (https://…)' },
  message:     { en: 'Your outreach message (40–2,400 characters)', es: 'Tu mensaje (40–2.400 caracteres)', pt: 'Sua mensagem (40–2.400 caracteres)', pl: 'Twoja wiadomość (40–2400 znaków)', ru: 'Ваше сообщение (40–2400 символов)' },
  create:      { en: 'Create draft', es: 'Crear borrador', pt: 'Criar rascunho', pl: 'Utwórz szkic', ru: 'Создать черновик' },
  creating:    { en: 'Creating…', es: 'Creando…', pt: 'Criando…', pl: 'Tworzenie…', ru: 'Создание…' },
  empty:       { en: 'No drafts yet. Create one below or ask the Concierge.', es: 'Aún no hay borradores. Crea uno abajo o pide al Concierge.', pt: 'Ainda não há rascunhos. Crie um abaixo ou peça ao Concierge.', pl: 'Brak szkiców. Utwórz poniżej lub poproś Concierge.', ru: 'Черновиков пока нет. Создайте ниже или попросите Консьержа.' },
  approve:     { en: 'Approve', es: 'Aprobar', pt: 'Aprovar', pl: 'Zatwierdź', ru: 'Одобрить' },
  reject:      { en: 'Reject', es: 'Rechazar', pt: 'Rejeitar', pl: 'Odrzuć', ru: 'Отклонить' },
  openEmail:   { en: '✉️ Open in email app', es: '✉️ Abrir en tu correo', pt: '✉️ Abrir no e-mail', pl: '✉️ Otwórz w poczcie', ru: '✉️ Открыть в почте' },
  copyMsg:     { en: '📋 Copy message', es: '📋 Copiar mensaje', pt: '📋 Copiar mensagem', pl: '📋 Kopiuj wiadomość', ru: '📋 Копировать' },
  copied:      { en: 'Copied!', es: '¡Copiado!', pt: 'Copiado!', pl: 'Skopiowano!', ru: 'Скопировано!' },
  usage:       { en: 'drafts today', es: 'borradores hoy', pt: 'rascunhos hoje', pl: 'szkice dzisiaj', ru: 'черновиков сегодня' },
  loadError:   { en: 'Could not load your drafts.', es: 'No se pudieron cargar tus borradores.', pt: 'Não foi possível carregar seus rascunhos.', pl: 'Nie udało się załadować szkiców.', ru: 'Не удалось загрузить черновики.' },
  statuses: {
    pending:  { en: 'Pending',  es: 'Pendiente', pt: 'Pendente', pl: 'Oczekuje', ru: 'Ожидает' },
    approved: { en: 'Approved', es: 'Aprobado',  pt: 'Aprovado', pl: 'Zatwierdzony', ru: 'Одобрен' },
    rejected: { en: 'Rejected', es: 'Rechazado', pt: 'Rejeitado', pl: 'Odrzucony', ru: 'Отклонён' },
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
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

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
      if (!res.ok) { setNotice(String(data?.error || 'Error')); return }
      setBizName(''); setBizUrl(''); setMessage('')
      await load()
    } catch {
      setNotice('Error')
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
      if (!res.ok) { setNotice(String(data?.error || 'Error')); return }
      setNotice('')
      setDrafts(prev => prev.map(d => (d.id === id ? { ...d, status } : d)))
    } catch {
      setNotice('Error')
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
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#c4b5fd', border: '1px solid rgba(196,181,253,.5)', borderRadius: 999, padding: '3px 9px' }}>🤖 Concierge</span>
                  ) : null}
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {new Date(d.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
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
