'use client'

// saas/app/dashboard/promote/page.tsx
// Campaign results appear in the RIGHT PANEL — same viewport as the form.
// No scrolling needed. Results replace the preview panel when generated.

import { useRef, useState, useMemo } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

const UI: Record<string, Record<string, string>> = {
  en: {
    attach: 'Attach document', attached: 'Attached',
    pasteContext: 'Paste extra context',
    pastePlaceholder: 'Paste a flyer, product description, menu, offer details, or notes here...',
    websiteUrl: 'Website URL', websitePlaceholder: 'https://yourbusiness.com',
    generating: 'Generating...', success: 'Campaign ready.',
    working: 'SignalBoost is creating your campaign...', reset: 'Reset',
    enterSomething: 'Please enter what you want to promote.',
    website: 'Website', socialPosts: 'Social posts', email: 'Email',
    video: 'Video', reviewFollowUp: 'Review follow-up', languageIdeas: 'Language ideas',
    copyBtn: 'Copy', copied: 'Copied!',
  },
  pt: {
    attach: 'Anexar documento', attached: 'Anexado',
    pasteContext: 'Colar contexto extra',
    pastePlaceholder: 'Cole um flyer, descrição de produto, menu, detalhes da oferta ou notas aqui...',
    websiteUrl: 'URL do site', websitePlaceholder: 'https://seudominio.com',
    generating: 'Gerando...', success: 'Campanha pronta.',
    working: 'SignalBoost está criando sua campanha...', reset: 'Limpar',
    enterSomething: 'Digite o que deseja promover.',
    website: 'Site', socialPosts: 'Posts sociais', email: 'Email',
    video: 'Vídeo', reviewFollowUp: 'Pedido de avaliação', languageIdeas: 'Ideias por idioma',
    copyBtn: 'Copiar', copied: 'Copiado!',
  },
  es: {
    attach: 'Adjuntar documento', attached: 'Adjunto',
    pasteContext: 'Pegar contexto extra',
    pastePlaceholder: 'Pega un flyer, descripción de producto, menú, detalles de la oferta o notas aquí...',
    websiteUrl: 'URL del sitio', websitePlaceholder: 'https://tunegocio.com',
    generating: 'Generando...', success: 'Campaña lista.',
    working: 'SignalBoost está creando tu campaña...', reset: 'Restablecer',
    enterSomething: 'Escribe lo que quieres promover.',
    website: 'Sitio web', socialPosts: 'Publicaciones sociales', email: 'Email',
    video: 'Video', reviewFollowUp: 'Seguimiento de reseñas', languageIdeas: 'Ideas por idioma',
    copyBtn: 'Copiar', copied: '¡Copiado!',
  },
  pl: {
    attach: 'Załącz dokument', attached: 'Załączono',
    pasteContext: 'Wklej dodatkowy kontekst',
    pastePlaceholder: 'Wklej ulotkę, opis produktu, menu, szczegóły oferty lub notatki...',
    websiteUrl: 'Adres strony', websitePlaceholder: 'https://twojafirma.com',
    generating: 'Generowanie...', success: 'Kampania gotowa.',
    working: 'SignalBoost tworzy kampanię...', reset: 'Reset',
    enterSomething: 'Wpisz co chcesz promować.',
    website: 'Strona', socialPosts: 'Posty społecznościowe', email: 'Email',
    video: 'Wideo', reviewFollowUp: 'Prośba o opinię', languageIdeas: 'Pomysły językowe',
    copyBtn: 'Kopiuj', copied: 'Skopiowano!',
  },
  ru: {
    attach: 'Прикрепить документ', attached: 'Прикреплено',
    pasteContext: 'Вставить контекст',
    pastePlaceholder: 'Вставьте флаер, описание продукта, меню, детали предложения или заметки...',
    websiteUrl: 'URL сайта', websitePlaceholder: 'https://вашбизнес.com',
    generating: 'Создание...', success: 'Кампания готова.',
    working: 'SignalBoost создает кампанию...', reset: 'Сбросить',
    enterSomething: 'Введите что хотите продвигать.',
    website: 'Сайт', socialPosts: 'Соцсети', email: 'Email',
    video: 'Видео', reviewFollowUp: 'Запрос отзыва', languageIdeas: 'Идеи по языкам',
    copyBtn: 'Копировать', copied: 'Скопировано!',
  },
}

type Campaign = {
  headline?: string
  website?: { title?: string; body?: string; cta?: string }
  social?: { facebook?: string; instagram?: string; tiktok?: string }
  email?: { subject?: string; body?: string }
  video?: { hook?: string; script?: string; cta?: string }
  reviewFollowUp?: string
  languageIdeas?: string[]
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      style={{
        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
        color: copied ? GOLD : 'rgba(255,255,255,0.5)', cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {copied ? '✓ ' + label.split('/')[1] : label.split('/')[0]}
    </button>
  )
}

function ResultPanel({ campaign, ui }: { campaign: Campaign; ui: Record<string, string> }) {
  const tabs = [
    { id: 'website',  icon: '🌐', label: ui.website },
    { id: 'social',   icon: '📱', label: ui.socialPosts },
    { id: 'email',    icon: '✉️', label: ui.email },
    { id: 'video',    icon: '🎬', label: ui.video },
    { id: 'reviews',  icon: '⭐', label: ui.reviewFollowUp },
    { id: 'language', icon: '🌍', label: ui.languageIdeas },
  ]
  const [active, setActive] = useState('website')

  const content: Record<string, { label: string; value: string }[]> = {
    website: [
      { label: 'Title', value: campaign.website?.title || '' },
      { label: 'Body', value: campaign.website?.body || '' },
      { label: 'CTA', value: campaign.website?.cta || '' },
    ],
    social: [
      { label: 'Facebook', value: campaign.social?.facebook || '' },
      { label: 'Instagram', value: campaign.social?.instagram || '' },
      { label: 'TikTok', value: campaign.social?.tiktok || '' },
    ],
    email: [
      { label: 'Subject', value: campaign.email?.subject || '' },
      { label: 'Body', value: campaign.email?.body || '' },
    ],
    video: [
      { label: 'Hook', value: campaign.video?.hook || '' },
      { label: 'Script', value: campaign.video?.script || '' },
      { label: 'CTA', value: campaign.video?.cta || '' },
    ],
    reviews: [
      { label: 'Message', value: campaign.reviewFollowUp || '' },
    ],
    language: (campaign.languageIdeas || []).map((idea, i) => ({
      label: `Idea ${i + 1}`,
      value: idea,
    })),
  }

  const items = (content[active] || []).filter(i => i.value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 480 }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16,
        paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={{
              padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: active === tab.id ? GOLD : 'rgba(255,255,255,0.06)',
              color: active === tab.id ? '#000' : 'rgba(255,255,255,0.55)',
              transition: 'all 0.2s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {items.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
            No content for this channel.
          </div>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(0,0,0,0.25)', borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD }}>
                {item.label}
              </span>
              <CopyButton text={item.value} label={`${ui.copyBtn}/${ui.copied}`} />
            </div>
            <p style={{ margin: 0, color: '#fff', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PromotePage() {
  const { dict, lang } = useI18n()
  const ui = UI[lang] || UI.en

  const [businessName, setBusinessName] = useState('')
  const [promotion, setPromotion]       = useState('')
  const [audience, setAudience]         = useState('')
  const [tone, setTone]                 = useState('friendly')
  const [websiteUrl, setWebsiteUrl]     = useState('')
  const [pastedContext, setPastedContext] = useState('')
  const [file, setFile]                 = useState<File | null>(null)
  const [loading, setLoading]           = useState(false)
  const [campaign, setCampaign]         = useState<Campaign | null>(null)
  const [error, setError]               = useState('')

  const resultRef = useRef<HTMLDivElement>(null)

  async function handleGenerate() {
    if (!promotion.trim() && !pastedContext.trim() && !websiteUrl.trim() && !file) {
      setError(ui.enterSomething); return
    }
    setLoading(true); setError(''); setCampaign(null)

    try {
      const formData = new FormData()
      formData.append('businessName', businessName)
      formData.append('promotion', promotion)
      formData.append('audience', audience)
      formData.append('tone', tone)
      formData.append('lang', lang)
      formData.append('websiteUrl', websiteUrl)
      formData.append('pastedContext', pastedContext)
      if (file) formData.append('file', file)

      const res  = await fetch('/api/promote', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data?.error || 'Generation failed')

      setCampaign(data.campaign)
      // Scroll right panel into view on mobile
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate campaign')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setBusinessName(''); setPromotion(''); setAudience(''); setTone('friendly')
    setWebsiteUrl(''); setPastedContext(''); setFile(null)
    setCampaign(null); setError('')
  }

  return (
    <main style={{ maxWidth: 1240, margin: '0 auto' }}>
      {/* Studio bar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>📣 {t(dict, 'promote_page.badge', 'Promote My Business')}</p>
          <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.15, margin: '4px 0 0', color: '#fff' }}>{t(dict, 'promote_page.title', 'Create a full campaign')}</h1>
        </div>
        <span className="sb-chip" style={campaign ? { borderColor: 'rgba(134,239,172,.3)', background: 'rgba(134,239,172,.08)', color: '#86efac' } : undefined}>{loading ? '...' : campaign ? '✓ ' + ui.success : 'IDLE'}</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 24, alignItems: 'start',
      }} className="promote-grid">

        {/* ── LEFT: Form (flat, sticky) ── */}
        <section style={{ position: 'sticky', top: 16 }}>

          {/* Business + Audience */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={labelStyle}>{t(dict, 'promote_page.businessName', 'Business name')}</span>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder={t(dict, 'promote_page.businessPlaceholder', 'e.g. Luna Travel')}
                style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={labelStyle}>{t(dict, 'promote_page.audience', 'Audience')}</span>
              <input value={audience} onChange={e => setAudience(e.target.value)}
                placeholder={t(dict, 'promote_page.audiencePlaceholder', 'e.g. local families')}
                style={inputStyle} />
            </label>
          </div>

          {/* Website + File */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={labelStyle}>{ui.websiteUrl}</span>
              <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                placeholder={ui.websitePlaceholder} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={labelStyle}>{ui.attach}</span>
              <input type="file" accept=".txt,.csv,.json,.md,.pdf,.doc,.docx"
                onChange={e => setFile(e.target.files?.[0] || null)}
                style={{ ...inputStyle, paddingTop: 9 }} />
              {file && <span style={{ color: GOLD, fontSize: 11, fontWeight: 800 }}>{ui.attached}: {file.name}</span>}
            </label>
          </div>

          {/* What to promote */}
          <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            <span style={labelStyle}>{t(dict, 'promote_page.offer', 'What do you want to promote?')}</span>
            <textarea value={promotion} onChange={e => setPromotion(e.target.value)}
              rows={4}
              placeholder={t(dict, 'promote_page.offerPlaceholder', 'e.g. 20% off weekend packages. Limited spots.')}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </label>

          {/* Paste context */}
          <label style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            <span style={labelStyle}>{ui.pasteContext}</span>
            <textarea value={pastedContext} onChange={e => setPastedContext(e.target.value)}
              rows={3}
              placeholder={ui.pastePlaceholder}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </label>

          {/* Tone + Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>
              {t(dict, 'promote_page.tone', 'Tone')}
              <select value={tone} onChange={e => setTone(e.target.value)}
                style={{ ...inputStyle, width: 'auto', padding: '8px 12px' }}>
                <option value="friendly">{t(dict, 'promote_page.tones.friendly', 'Friendly')}</option>
                <option value="premium">{t(dict, 'promote_page.tones.premium', 'Premium')}</option>
                <option value="urgent">{t(dict, 'promote_page.tones.urgent', 'Urgent')}</option>
                <option value="local">{t(dict, 'promote_page.tones.local', 'Local')}</option>
              </select>
            </label>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={handleReset} disabled={loading} style={ghostBtn}>
                {ui.reset}
              </button>
              <button onClick={handleGenerate} disabled={loading} style={{
                ...primaryBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer',
              }}>
                {loading ? ui.generating : t(dict, 'promote_page.generate', 'Generate campaign')}
              </button>
            </div>
          </div>

          {error && (
            <p style={{ marginTop: 12, color: '#f87171', fontSize: 13 }}>{error}</p>
          )}
        </section>

        {/* ── RIGHT: Results or placeholder ── */}
        <section ref={resultRef} style={{
          borderLeft: campaign ? '2px solid rgba(255,195,0,.55)' : '1px solid rgba(255,255,255,.08)',
          paddingLeft: 20,
          height: 'calc(100vh - 230px)',
          minHeight: 420,
          overflowY: 'auto',
          transition: 'border-color 0.3s ease',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD }}>
              {campaign ? `✅ ${ui.success}` : t(dict, 'promote_page.preview.title', 'Campaign preview')}
            </div>
            {campaign && (
              <button onClick={handleReset} style={{ ...ghostBtn, fontSize: 12, padding: '4px 10px' }}>
                {ui.reset}
              </button>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, gap: 16 }}>
              <div style={{ fontSize: 40, animation: 'pulse 1.5s ease-in-out infinite' }}>📣</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{ui.working}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !campaign && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, gap: 12 }}>
              <div style={{ fontSize: 48 }}>📣</div>
              <p style={{ color: 'var(--text-faint)', fontSize: 14, textAlign: 'center', maxWidth: 260 }}>
                {t(dict, 'promote_page.subtitle', 'Your campaign will appear here — website copy, social posts, email, video script and more.')}
              </p>
              {/* Channel pills preview */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                {['🌐 Website', '📱 Social', '✉️ Email', '🎬 Video', '⭐ Reviews', '🌍 Languages'].map(ch => (
                  <span key={ch} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Campaign results — tabbed, in panel */}
          {!loading && campaign && <ResultPanel campaign={campaign} ui={ui} />}
        </section>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .promote-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </main>
  )
}

const labelStyle: React.CSSProperties = {
  color: '#fff', fontWeight: 800, fontSize: 12,
}

const inputStyle: React.CSSProperties = {
  width: '100%', borderRadius: 12,
  border: '1px solid var(--border-soft)',
  background: 'rgba(0,0,0,.22)',
  color: '#fff', padding: '11px 14px',
  outline: 'none', fontSize: 13,
  boxSizing: 'border-box',
}

const primaryBtn: React.CSSProperties = {
  border: 'none', borderRadius: 12, padding: '11px 20px',
  background: GOLD, color: '#000', fontWeight: 900, fontSize: 14,
  cursor: 'pointer', boxShadow: '0 8px 24px rgba(255,195,0,.25)',
}

const ghostBtn: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.15)', borderRadius: 12, padding: '11px 16px',
  background: 'rgba(255,255,255,.06)', color: '#fff', fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
}
