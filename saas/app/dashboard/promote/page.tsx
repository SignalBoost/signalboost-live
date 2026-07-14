'use client'

import { useRef, useState } from 'react'
import { PromoteCampaignConfigurator, type PromoteCampaignRequest } from '@/components/enterprise/PromoteCampaignConfigurator'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

type Campaign = {
  headline?: string
  website?: { title?: string; body?: string; cta?: string }
  social?: { facebook?: string; instagram?: string; tiktok?: string }
  email?: { subject?: string; body?: string }
  video?: { hook?: string; script?: string; cta?: string }
  reviewFollowUp?: string
  languageIdeas?: string[]
}

const UI: Record<string, Record<string, string>> = {
  en: { success: 'Campaign ready.', working: 'SignalBoost is creating your campaign…', reset: 'Reset', website: 'Website', socialPosts: 'Social posts', email: 'Email', video: 'Video', reviewFollowUp: 'Review follow-up', languageIdeas: 'Language ideas', copy: 'Copy', copied: 'Copied!', noContent: 'No content for this channel.', title: 'Title', body: 'Body', cta: 'CTA', subject: 'Subject', hook: 'Hook', script: 'Script', message: 'Message', idea: 'Idea' },
  es: { success: 'Campaña lista.', working: 'SignalBoost está creando tu campaña…', reset: 'Restablecer', website: 'Sitio web', socialPosts: 'Publicaciones sociales', email: 'Email', video: 'Video', reviewFollowUp: 'Seguimiento de reseñas', languageIdeas: 'Ideas por idioma', copy: 'Copiar', copied: '¡Copiado!', noContent: 'Sin contenido para este canal.', title: 'Título', body: 'Cuerpo', cta: 'CTA', subject: 'Asunto', hook: 'Gancho', script: 'Guion', message: 'Mensaje', idea: 'Idea' },
  pt: { success: 'Campanha pronta.', working: 'SignalBoost está criando sua campanha…', reset: 'Limpar', website: 'Site', socialPosts: 'Posts sociais', email: 'Email', video: 'Vídeo', reviewFollowUp: 'Pedido de avaliação', languageIdeas: 'Ideias por idioma', copy: 'Copiar', copied: 'Copiado!', noContent: 'Sem conteúdo para este canal.', title: 'Título', body: 'Corpo', cta: 'CTA', subject: 'Assunto', hook: 'Gancho', script: 'Roteiro', message: 'Mensagem', idea: 'Ideia' },
  pl: { success: 'Kampania gotowa.', working: 'SignalBoost tworzy kampanię…', reset: 'Reset', website: 'Strona', socialPosts: 'Posty społecznościowe', email: 'Email', video: 'Wideo', reviewFollowUp: 'Prośba o opinię', languageIdeas: 'Pomysły językowe', copy: 'Kopiuj', copied: 'Skopiowano!', noContent: 'Brak treści dla tego kanału.', title: 'Tytuł', body: 'Treść', cta: 'CTA', subject: 'Temat', hook: 'Haczyk', script: 'Skrypt', message: 'Wiadomość', idea: 'Pomysł' },
  ru: { success: 'Кампания готова.', working: 'SignalBoost создает кампанию…', reset: 'Сбросить', website: 'Сайт', socialPosts: 'Соцсети', email: 'Email', video: 'Видео', reviewFollowUp: 'Запрос отзыва', languageIdeas: 'Идеи по языкам', copy: 'Копировать', copied: 'Скопировано!', noContent: 'Нет контента для этого канала.', title: 'Заголовок', body: 'Текст', cta: 'CTA', subject: 'Тема', hook: 'Зацепка', script: 'Сценарий', message: 'Сообщение', idea: 'Идея' },
}

function CopyButton({ text, ui }: { text: string; ui: Record<string, string> }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={ui.copy}
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })}
      style={ghostButton}
    >
      {copied ? `✓ ${ui.copied}` : ui.copy}
    </button>
  )
}

function ResultPanel({ campaign, ui }: { campaign: Campaign; ui: Record<string, string> }) {
  const [active, setActive] = useState('website')
  const tabs = [
    { id: 'website', icon: '🌐', label: ui.website },
    { id: 'social', icon: '📱', label: ui.socialPosts },
    { id: 'email', icon: '✉️', label: ui.email },
    { id: 'video', icon: '🎬', label: ui.video },
    { id: 'reviews', icon: '⭐', label: ui.reviewFollowUp },
    { id: 'language', icon: '🌍', label: ui.languageIdeas },
  ]
  const content: Record<string, { label: string; value: string }[]> = {
    website: [
      { label: ui.title, value: campaign.website?.title || '' },
      { label: ui.body, value: campaign.website?.body || '' },
      { label: ui.cta, value: campaign.website?.cta || '' },
    ],
    social: [
      { label: 'Facebook', value: campaign.social?.facebook || '' },
      { label: 'Instagram', value: campaign.social?.instagram || '' },
      { label: 'TikTok', value: campaign.social?.tiktok || '' },
    ],
    email: [
      { label: ui.subject, value: campaign.email?.subject || '' },
      { label: ui.body, value: campaign.email?.body || '' },
    ],
    video: [
      { label: ui.hook, value: campaign.video?.hook || '' },
      { label: ui.script, value: campaign.video?.script || '' },
      { label: ui.cta, value: campaign.video?.cta || '' },
    ],
    reviews: [{ label: ui.message, value: campaign.reviewFollowUp || '' }],
    language: (campaign.languageIdeas || []).map((value, index) => ({ label: `${ui.idea} ${index + 1}`, value })),
  }
  const items = (content[active] || []).filter((item) => item.value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}>
      <div role="tablist" aria-label="Campaign channels" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            style={{ ...tabButton, background: active === tab.id ? GOLD : 'rgba(255,255,255,.06)', color: active === tab.id ? '#000' : 'rgba(255,255,255,.65)' }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ display: 'grid', gap: 12 }}>
        {items.length === 0 && <p style={{ color: 'rgba(255,255,255,.45)' }}>{ui.noContent}</p>}
        {items.map((item) => (
          <article key={`${active}-${item.label}`} style={resultCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ color: GOLD, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>{item.label}</strong>
              <CopyButton text={item.value} ui={ui} />
            </div>
            <p style={{ color: '#fff', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>{item.value}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

export default function PromotePage() {
  const { dict, lang } = useI18n()
  const ui = UI[lang] || UI.en
  const [loading, setLoading] = useState(false)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [error, setError] = useState('')
  const resultRef = useRef<HTMLElement>(null)

  async function handleGenerate(request: PromoteCampaignRequest) {
    setLoading(true)
    setError('')
    setCampaign(null)
    try {
      const formData = new FormData()
      formData.append('businessName', request.businessName)
      formData.append('promotion', request.promotion)
      formData.append('audience', request.audience)
      formData.append('tone', request.tone)
      formData.append('lang', lang)
      formData.append('websiteUrl', request.websiteUrl)
      formData.append('pastedContext', '')

      const response = await fetch('/api/promote', { method: 'POST', body: formData })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Generation failed')
      setCampaign(payload.campaign)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not generate campaign')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setCampaign(null)
    setError('')
  }

  return (
    <main style={{ maxWidth: 1240, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12, marginBottom: 18 }}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>📣 {t(dict, 'promote_page.badge', 'Promote My Business')}</p>
          <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', margin: '4px 0 0', color: '#fff' }}>{t(dict, 'promote_page.title', 'Create a full campaign')}</h1>
        </div>
        <span className="sb-chip" aria-live="polite">{loading ? '…' : campaign ? `✓ ${ui.success}` : 'IDLE'}</span>
      </header>

      <div className="promote-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, alignItems: 'start' }}>
        <section aria-label="Enterprise campaign brief">
          <PromoteCampaignConfigurator busy={loading} language={lang} onSubmit={handleGenerate} onReset={reset} />
          {error && <p role="alert" style={{ marginTop: 12, color: '#f87171', fontSize: 13 }}>{error}</p>}
        </section>

        <section ref={resultRef} aria-label="Campaign preview" style={{ borderLeft: campaign ? '2px solid rgba(255,195,0,.55)' : '1px solid rgba(255,255,255,.08)', paddingLeft: 20, minHeight: 480 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <strong style={{ color: GOLD, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>
              {campaign ? `✅ ${ui.success}` : t(dict, 'promote_page.preview.title', 'Campaign preview')}
            </strong>
            {campaign && <button type="button" onClick={reset} style={ghostButton}>{ui.reset}</button>}
          </div>
          {loading && <div aria-live="polite" style={emptyState}><div style={{ fontSize: 40 }}>📣</div><p>{ui.working}</p></div>}
          {!loading && !campaign && <div style={emptyState}><div style={{ fontSize: 48 }}>📣</div><p>{t(dict, 'promote_page.subtitle', 'Analyze a source, review the structured brief, and approve it to create the campaign.')}</p></div>}
          {!loading && campaign && <ResultPanel campaign={campaign} ui={ui} />}
        </section>
      </div>

      <style>{`@media (max-width: 860px) { .promote-grid { grid-template-columns: 1fr !important; } }`}</style>
    </main>
  )
}

const ghostButton: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.15)',
  borderRadius: 10,
  padding: '6px 10px',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}

const tabButton: React.CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '7px 11px',
  fontWeight: 800,
  cursor: 'pointer',
}

const resultCard: React.CSSProperties = {
  background: 'rgba(0,0,0,.25)',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.08)',
  padding: '14px 16px',
}

const emptyState: React.CSSProperties = {
  minHeight: 360,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  gap: 12,
}
