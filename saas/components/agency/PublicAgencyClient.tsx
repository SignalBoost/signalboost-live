'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { AgencyCopy } from '@/lib/i18n/agencyCopy'

export const FREE_ORGANIC_MODE = true
export const ENTERPRISE_READY = true

type CheckoutResponse = {
  selectedBudget: number
  processingFee: number
  totalCharged: number
  currency: 'USD'
  status: 'CHECKOUT_READY' | 'STRIPE_CHECKOUT_READY'
  stripeCheckoutUrl?: string
  stripeConfigured?: boolean
}

type OrganicAssets = {
  youtubeTitle: string
  youtubeDescription: string
  youtubeCommunityPost: string
  linkedinCompanyPost: string
  linkedinFounderPost: string
  pressReleaseSubject: string
  pressReleaseBody: string
}

type OrganicResponse = {
  ok: boolean
  error?: string
  assets?: OrganicAssets
}

type TenantCampaignProfile = {
  plan?: 'free' | 'starter' | 'pro' | 'enterprise'
  sponsoredEnterprise?: boolean
  corporateSponsored?: boolean
}

type PublicAgencyClientProps = {
  copy: AgencyCopy['client']
  tenantProfile?: TenantCampaignProfile
}

type Mode = 'download' | 'managed'
type ChannelMode = 'FREE_ORGANIC_MODE' | 'PROGRAMMATIC_ENTERPRISE'

const ORGANIC_COPY: Record<string, {
  formTitle: string
  companyLabel: string
  companyPlaceholder: string
  announcementLabel: string
  announcementPlaceholder: string
  audienceLabel: string
  audiencePlaceholder: string
  websiteLabel: string
  generate: string
  generating: string
  resultsTitle: string
  copyBtn: string
  copied: string
  regenerate: string
  genError: string
  requiredError: string
  sections: { youtube: string; linkedin: string; press: string }
  labels: {
    youtubeTitle: string
    youtubeDescription: string
    youtubeCommunityPost: string
    linkedinCompanyPost: string
    linkedinFounderPost: string
    pressReleaseSubject: string
    pressReleaseBody: string
  }
}> = {
  en: {
    formTitle: 'Generate your free organic campaign',
    companyLabel: 'Company or brand name',
    companyPlaceholder: 'e.g. Acme Analytics',
    announcementLabel: 'What are you announcing or promoting?',
    announcementPlaceholder: 'e.g. Launching our new AI reporting dashboard for small agencies',
    audienceLabel: 'Target audience (optional)',
    audiencePlaceholder: 'e.g. Marketing directors at mid-size agencies',
    websiteLabel: 'Website or CTA link (optional)',
    generate: 'Generate organic campaign assets',
    generating: 'Generating campaign assets…',
    resultsTitle: 'Your organic campaign assets',
    copyBtn: 'Copy',
    copied: 'Copied',
    regenerate: 'Regenerate',
    genError: 'Generation failed. Please try again in a moment.',
    requiredError: 'Enter your company name and what you are announcing.',
    sections: { youtube: 'YouTube organic', linkedin: 'LinkedIn organic', press: 'Press release email' },
    labels: {
      youtubeTitle: 'Video title',
      youtubeDescription: 'Video description',
      youtubeCommunityPost: 'Community post',
      linkedinCompanyPost: 'Company page post',
      linkedinFounderPost: 'Founder post',
      pressReleaseSubject: 'Email subject',
      pressReleaseBody: 'Email body',
    },
  },
  es: {
    formTitle: 'Genera tu campaña orgánica gratis',
    companyLabel: 'Nombre de la empresa o marca',
    companyPlaceholder: 'ej. Acme Analytics',
    announcementLabel: '¿Qué estás anunciando o promocionando?',
    announcementPlaceholder: 'ej. Lanzamos nuestro nuevo dashboard de reportes con IA para agencias pequeñas',
    audienceLabel: 'Audiencia objetivo (opcional)',
    audiencePlaceholder: 'ej. Directores de marketing en agencias medianas',
    websiteLabel: 'Sitio web o enlace CTA (opcional)',
    generate: 'Generar activos de campaña orgánica',
    generating: 'Generando activos de campaña…',
    resultsTitle: 'Tus activos de campaña orgánica',
    copyBtn: 'Copiar',
    copied: 'Copiado',
    regenerate: 'Regenerar',
    genError: 'La generación falló. Inténtalo de nuevo en un momento.',
    requiredError: 'Ingresa el nombre de tu empresa y qué estás anunciando.',
    sections: { youtube: 'YouTube orgánico', linkedin: 'LinkedIn orgánico', press: 'Email de press release' },
    labels: {
      youtubeTitle: 'Título del video',
      youtubeDescription: 'Descripción del video',
      youtubeCommunityPost: 'Post de comunidad',
      linkedinCompanyPost: 'Post de página de empresa',
      linkedinFounderPost: 'Post del fundador',
      pressReleaseSubject: 'Asunto del email',
      pressReleaseBody: 'Cuerpo del email',
    },
  },
  pt: {
    formTitle: 'Gere sua campanha orgânica gratuita',
    companyLabel: 'Nome da empresa ou marca',
    companyPlaceholder: 'ex. Acme Analytics',
    announcementLabel: 'O que você está anunciando ou promovendo?',
    announcementPlaceholder: 'ex. Lançamento do nosso novo dashboard de relatórios com IA para agências pequenas',
    audienceLabel: 'Público-alvo (opcional)',
    audiencePlaceholder: 'ex. Diretores de marketing em agências de médio porte',
    websiteLabel: 'Site ou link de CTA (opcional)',
    generate: 'Gerar ativos de campanha orgânica',
    generating: 'Gerando ativos de campanha…',
    resultsTitle: 'Seus ativos de campanha orgânica',
    copyBtn: 'Copiar',
    copied: 'Copiado',
    regenerate: 'Gerar novamente',
    genError: 'A geração falhou. Tente novamente em instantes.',
    requiredError: 'Informe o nome da empresa e o que você está anunciando.',
    sections: { youtube: 'YouTube orgânico', linkedin: 'LinkedIn orgânico', press: 'E-mail de press release' },
    labels: {
      youtubeTitle: 'Título do vídeo',
      youtubeDescription: 'Descrição do vídeo',
      youtubeCommunityPost: 'Post de comunidade',
      linkedinCompanyPost: 'Post da página da empresa',
      linkedinFounderPost: 'Post do fundador',
      pressReleaseSubject: 'Assunto do e-mail',
      pressReleaseBody: 'Corpo do e-mail',
    },
  },
  pl: {
    formTitle: 'Wygeneruj darmową kampanię organiczną',
    companyLabel: 'Nazwa firmy lub marki',
    companyPlaceholder: 'np. Acme Analytics',
    announcementLabel: 'Co ogłaszasz lub promujesz?',
    announcementPlaceholder: 'np. Premiera naszego nowego dashboardu raportów AI dla małych agencji',
    audienceLabel: 'Grupa docelowa (opcjonalnie)',
    audiencePlaceholder: 'np. Dyrektorzy marketingu w średnich agencjach',
    websiteLabel: 'Strona lub link CTA (opcjonalnie)',
    generate: 'Wygeneruj materiały kampanii organicznej',
    generating: 'Generowanie materiałów kampanii…',
    resultsTitle: 'Twoje materiały kampanii organicznej',
    copyBtn: 'Kopiuj',
    copied: 'Skopiowano',
    regenerate: 'Wygeneruj ponownie',
    genError: 'Generowanie nie powiodło się. Spróbuj ponownie za chwilę.',
    requiredError: 'Podaj nazwę firmy i co ogłaszasz.',
    sections: { youtube: 'YouTube organicznie', linkedin: 'LinkedIn organicznie', press: 'E-mail press release' },
    labels: {
      youtubeTitle: 'Tytuł wideo',
      youtubeDescription: 'Opis wideo',
      youtubeCommunityPost: 'Post społeczności',
      linkedinCompanyPost: 'Post strony firmowej',
      linkedinFounderPost: 'Post założyciela',
      pressReleaseSubject: 'Temat e-maila',
      pressReleaseBody: 'Treść e-maila',
    },
  },
  ru: {
    formTitle: 'Сгенерируйте бесплатную organic-кампанию',
    companyLabel: 'Название компании или бренда',
    companyPlaceholder: 'напр. Acme Analytics',
    announcementLabel: 'Что вы анонсируете или продвигаете?',
    announcementPlaceholder: 'напр. Запуск нового AI-дашборда отчетов для небольших агентств',
    audienceLabel: 'Целевая аудитория (необязательно)',
    audiencePlaceholder: 'напр. Директора по маркетингу в средних агентствах',
    websiteLabel: 'Сайт или CTA-ссылка (необязательно)',
    generate: 'Сгенерировать материалы organic-кампании',
    generating: 'Генерация материалов кампании…',
    resultsTitle: 'Ваши материалы organic-кампании',
    copyBtn: 'Копировать',
    copied: 'Скопировано',
    regenerate: 'Сгенерировать заново',
    genError: 'Генерация не удалась. Попробуйте снова через минуту.',
    requiredError: 'Укажите название компании и что вы анонсируете.',
    sections: { youtube: 'YouTube organic', linkedin: 'LinkedIn organic', press: 'Press release e-mail' },
    labels: {
      youtubeTitle: 'Название видео',
      youtubeDescription: 'Описание видео',
      youtubeCommunityPost: 'Пост сообщества',
      linkedinCompanyPost: 'Пост страницы компании',
      linkedinFounderPost: 'Пост основателя',
      pressReleaseSubject: 'Тема письма',
      pressReleaseBody: 'Текст письма',
    },
  },
}

const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const fieldStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.08)',
  color: '#fff',
  padding: '12px 14px',
  fontFamily: 'inherit',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

function hasEnterpriseAccess(tenantProfile?: TenantCampaignProfile) {
  return Boolean(tenantProfile?.sponsoredEnterprise || tenantProfile?.corporateSponsored || tenantProfile?.plan === 'enterprise')
}

function AssetBlock({ label, value, copyBtn, copied }: { label: string; value: string; copyBtn: string; copied: string }) {
  const [done, setDone] = useState(false)

  async function copyText() {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <h4 className="sb-h3" style={{ margin: 0, fontSize: 15 }}>{label}</h4>
        <button
          type="button"
          className="sb-button-secondary"
          onClick={copyText}
          style={{ padding: '6px 14px', fontSize: 12, color: done ? '#86efac' : undefined }}
        >
          {done ? copied : copyBtn}
        </button>
      </div>
      <p className="sb-body" style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{value}</p>
    </article>
  )
}

export default function PublicAgencyClient({ copy, tenantProfile }: PublicAgencyClientProps) {
  const { lang } = useI18n()
  const oc = ORGANIC_COPY[lang] || ORGANIC_COPY.en

  const [selectedBudget, setSelectedBudget] = useState('5000')
  const [mode, setMode] = useState<Mode>('download')
  const [consent, setConsent] = useState(false)
  const [summary, setSummary] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [company, setCompany] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [audience, setAudience] = useState('')
  const [website, setWebsite] = useState('')
  const [organicLoading, setOrganicLoading] = useState(false)
  const [organicError, setOrganicError] = useState('')
  const [assets, setAssets] = useState<OrganicAssets | null>(null)

  const enterpriseEnabled = ENTERPRISE_READY && hasEnterpriseAccess(tenantProfile)
  const channelMode: ChannelMode = enterpriseEnabled ? 'PROGRAMMATIC_ENTERPRISE' : 'FREE_ORGANIC_MODE'
  const organicChannels = Object.values(copy.organicChannels)
  const enterpriseChannels = Object.values(copy.enterpriseChannels)

  async function generateOrganic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setOrganicError('')

    if (!company.trim() || !announcement.trim()) {
      setOrganicError(oc.requiredError)
      return
    }

    setOrganicLoading(true)
    setAssets(null)

    try {
      const response = await fetch('/api/agency/organic-workflow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company, announcement, audience, website, lang }),
      })

      const data = await response.json().catch(() => null) as OrganicResponse | null

      if (!response.ok || !data || !data.ok || !data.assets) {
        setOrganicError(oc.genError)
        setOrganicLoading(false)
        return
      }

      setAssets(data.assets)
    } catch {
      setOrganicError(oc.genError)
    }

    setOrganicLoading(false)
  }

  async function requestCheckout(createStripeSession: boolean) {
    if (!enterpriseEnabled) {
      setError(copy.error)
      return
    }

    setLoading(true)
    setError('')
    setSummary(null)

    const budget = Number(selectedBudget)
    if (!Number.isFinite(budget) || budget <= 0 || (mode === 'managed' && !consent)) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const response = await fetch('/api/agency/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedBudget: budget, createStripeSession, mode, enterpriseReady: enterpriseEnabled, channelMode }),
    })

    if (!response.ok) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const data = await response.json() as CheckoutResponse
    setSummary(data)
    setLoading(false)

    if (createStripeSession && data.stripeCheckoutUrl) {
      window.location.href = data.stripeCheckoutUrl
    }
  }

  return (
    <section className="sb-page-shell sb-section" aria-label={copy.title} data-channel-mode={channelMode}>
      <div className="fathom-glass sb-glass" style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div>
          <div className="sb-cta-row" style={{ marginBottom: 12 }}>
            <span className="sb-eyebrow">{copy.freeModeBadge}</span>
            <span className="sb-caption" style={{ color: enterpriseEnabled ? '#86efac' : '#fbbf24' }}>{copy.enterpriseReadyBadge}</span>
          </div>
          <h2 className="sb-h2">{copy.title}</h2>
          <p className="sb-body" style={{ maxWidth: 820 }}>{copy.body}</p>
        </div>

        <section className="sb-card" style={{ padding: 20 }}>
          <span className="sb-eyebrow">{copy.organicModeTitle}</span>
          <p className="sb-body">{copy.organicModeBody}</p>
          <h3 className="sb-h3">{copy.organicChannelsTitle}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {organicChannels.map((channel) => (
              <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
              </article>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 14 }}>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.hmiApprovalTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.hmiApprovalBody}</p>
            </article>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.marketingAlertsTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.marketingAlertsBody}</p>
            </article>
          </div>

          <form onSubmit={generateOrganic} style={{ display: 'grid', gap: 12, marginTop: 18, maxWidth: 720 }}>
            <h3 className="sb-h3" style={{ margin: 0 }}>{oc.formTitle}</h3>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="sb-caption">{oc.companyLabel}</span>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={oc.companyPlaceholder} maxLength={120} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="sb-caption">{oc.announcementLabel}</span>
              <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder={oc.announcementPlaceholder} maxLength={1200} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="sb-caption">{oc.audienceLabel}</span>
                <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={oc.audiencePlaceholder} maxLength={300} style={fieldStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="sb-caption">{oc.websiteLabel}</span>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" maxLength={200} style={fieldStyle} />
              </label>
            </div>
            <div className="sb-cta-row">
              <button className="sb-button-primary" type="submit" disabled={organicLoading}>
                {organicLoading ? oc.generating : (assets ? oc.regenerate : oc.generate)}
              </button>
            </div>
            {organicError ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{organicError}</p> : null}
          </form>

          {assets ? (
            <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
              <h3 className="sb-h3" style={{ margin: 0, color: '#86efac' }}>{oc.resultsTitle}</h3>

              <span className="sb-eyebrow">{oc.sections.youtube}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.youtubeTitle} value={assets.youtubeTitle} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.youtubeDescription} value={assets.youtubeDescription} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.youtubeCommunityPost} value={assets.youtubeCommunityPost} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <span className="sb-eyebrow">{oc.sections.linkedin}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.linkedinCompanyPost} value={assets.linkedinCompanyPost} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.linkedinFounderPost} value={assets.linkedinFounderPost} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <span className="sb-eyebrow">{oc.sections.press}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.pressReleaseSubject} value={assets.pressReleaseSubject} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.pressReleaseBody} value={assets.pressReleaseBody} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>
            </div>
          ) : null}
        </section>

        {enterpriseEnabled ? (
          <section className="sb-card" style={{ padding: 20 }}>
            <span className="sb-eyebrow">{copy.enterpriseModeTitle}</span>
            <p className="sb-body">{copy.enterpriseModeBody}</p>
            <h3 className="sb-h3">{copy.enterpriseChannelsTitle}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {enterpriseChannels.map((channel) => (
                <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                  <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                  <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
                </article>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <span className="sb-caption">{copy.modeLabel}</span>
              <div className="sb-cta-row">
                <button type="button" className={mode === 'download' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('download')}>{copy.downloadMode}</button>
                <button type="button" className={mode === 'managed' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('managed')}>{copy.publishMode}</button>
              </div>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); requestCheckout(false) }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 14 }}>
              <label style={{ display: 'grid', gap: 8, minWidth: 240 }}>
                <span className="sb-caption">{copy.budgetLabel}</span>
                <input
                  value={selectedBudget}
                  onChange={(event) => setSelectedBudget(event.target.value)}
                  type="number"
                  min="1"
                  step="0.01"
                  style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)', color: '#fff', padding: '12px 14px' }}
                />
              </label>
              <button className="sb-button-primary" type="submit" disabled={loading}>{copy.submit}</button>
            </form>

            {mode === 'managed' ? (
              <label className="sb-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '14px 0 0' }}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{copy.consentLabel}</span>
              </label>
            ) : null}
          </section>
        ) : (
          <section className="sb-card" style={{ padding: 20, borderColor: 'rgba(251,191,36,.28)' }}>
            <span className="sb-eyebrow">{copy.enterpriseReadyBadge}</span>
            <h3 className="sb-h3">{copy.enterpriseLockedTitle}</h3>
            <p className="sb-body" style={{ margin: 0 }}>{copy.enterpriseLockedBody}</p>
          </section>
        )}

        {error ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{error}</p> : null}
        {summary ? (
          <div className="sb-card" style={{ padding: 20 }}>
            <h3 className="sb-h3">{copy.summaryTitle}</h3>
            <p className="sb-body">{summary.status === 'STRIPE_CHECKOUT_READY' ? copy.paymentReady : copy.ready}</p>
            <p className="sb-caption">{copy.noBrokerDispatch}</p>
            {!summary.stripeConfigured ? <p className="sb-caption">{copy.stripeUnavailable}</p> : null}
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: 0 }}>
              <div><dt className="sb-caption">{copy.selectedBudget}</dt><dd>{formatUsd(summary.selectedBudget)}</dd></div>
              <div><dt className="sb-caption">{copy.processingFee}</dt><dd>{formatUsd(summary.processingFee)}</dd></div>
              <div><dt className="sb-caption">{copy.totalCharged}</dt><dd>{formatUsd(summary.totalCharged)}</dd></div>
            </dl>
            {enterpriseEnabled && mode === 'managed' ? <button className="sb-button-secondary" type="button" disabled={loading || !consent} onClick={() => requestCheckout(true)} style={{ marginTop: 16 }}>{copy.paymentSubmit}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
