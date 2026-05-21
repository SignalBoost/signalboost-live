'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

type Channel = {
  id: string
  icon: string
  title: string
  description: string
}

type Campaign = {
  headline?: string
  website?: {
    title?: string
    body?: string
    cta?: string
  }
  social?: {
    facebook?: string
    instagram?: string
    tiktok?: string
  }
  email?: {
    subject?: string
    body?: string
  }
  video?: {
    hook?: string
    script?: string
    cta?: string
  }
  reviewFollowUp?: string
  languageIdeas?: string[]
}

export default function PromotePage() {
  const { dict } = useI18n()

  const [businessName, setBusinessName] = useState('')
  const [promotion, setPromotion] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('friendly')
  const [generated, setGenerated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [campaign, setCampaign] = useState<Campaign | null>(null)

  const channels: Channel[] = useMemo(
    () => [
      {
        id: 'website',
        icon: '🌐',
        title: t(dict, 'promote_page.channels.website.title', 'Website update'),
        description: t(
          dict,
          'promote_page.channels.website.description',
          'Turn your offer into a homepage banner or landing section.'
        ),
      },
      {
        id: 'social',
        icon: '📱',
        title: t(dict, 'promote_page.channels.social.title', 'Social posts'),
        description: t(
          dict,
          'promote_page.channels.social.description',
          'Create captions for Facebook, Instagram, TikTok and more.'
        ),
      },
      {
        id: 'email',
        icon: '✉️',
        title: t(dict, 'promote_page.channels.email.title', 'Email campaign'),
        description: t(
          dict,
          'promote_page.channels.email.description',
          'Generate a short email your customers can understand quickly.'
        ),
      },
      {
        id: 'video',
        icon: '🎬',
        title: t(dict, 'promote_page.channels.video.title', 'Video idea'),
        description: t(
          dict,
          'promote_page.channels.video.description',
          'Create a short video script for reels, shorts or ads.'
        ),
      },
      {
        id: 'languages',
        icon: '🌍',
        title: t(dict, 'promote_page.channels.languages.title', 'Native languages'),
        description: t(
          dict,
          'promote_page.channels.languages.description',
          'Adapt your message so it feels natural in each language.'
        ),
      },
      {
        id: 'reviews',
        icon: '⭐',
        title: t(dict, 'promote_page.channels.reviews.title', 'Review follow-up'),
        description: t(
          dict,
          'promote_page.channels.reviews.description',
          'Ask happy customers to leave a review after the promotion.'
        ),
      },
    ],
    [dict]
  )

  async function handleGenerate() {
    try {
      if (!promotion.trim()) {
        alert('Please enter what you want to promote.')
        return
      }

      setLoading(true)
      setGenerated(false)
      setCampaign(null)

      const response = await fetch('/api/promote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessName,
          promotion,
          audience,
          tone,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Generation failed')
      }

      setCampaign(data.campaign)
      setGenerated(true)
    } catch (err) {
      console.error(err)

      alert(
        err instanceof Error
          ? err.message
          : 'Could not generate campaign'
      )
    } finally {
      setLoading(false)
    }
  }

  const sampleHeadline =
    campaign?.headline ||
    (promotion.trim().length > 0
      ? promotion.trim()
      : t(
          dict,
          'promote_page.preview.sampleHeadline',
          'Weekend special for new and returning customers'
        ))

  const sampleBusiness =
    businessName.trim().length > 0
      ? businessName.trim()
      : t(dict, 'promote_page.preview.sampleBusiness', 'Your business')

  return (
    <main
      style={{
        minHeight: 'calc(100vh - 120px)',
        padding: '42px 24px 80px',
        background:
          'radial-gradient(circle at top left, rgba(255,195,0,.10), transparent 32%), radial-gradient(circle at top right, rgba(59,130,246,.10), transparent 30%)',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
        }}
      >
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, .9fr)',
            gap: 24,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              border: '1px solid var(--border-soft)',
              background: 'rgba(255,255,255,.045)',
              borderRadius: 28,
              padding: 30,
              boxShadow: '0 24px 80px rgba(0,0,0,.28)',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                borderRadius: 999,
                background: 'rgba(255,195,0,.10)',
                border: '1px solid rgba(255,195,0,.25)',
                color: GOLD,
                fontWeight: 800,
                fontSize: 12,
                marginBottom: 18,
              }}
            >
              📣 {t(dict, 'promote_page.badge', 'Promote My Business')}
            </div>

            <h1
              style={{
                fontSize: 'clamp(34px, 5vw, 64px)',
                lineHeight: 1,
                letterSpacing: '-.05em',
                margin: 0,
                color: '#fff',
              }}
            >
              {t(
                dict,
                'promote_page.title',
                'Create one promotion. Turn it into a full campaign.'
              )}
            </h1>

            <p
              style={{
                marginTop: 18,
                maxWidth: 680,
                color: 'var(--text-secondary)',
                fontSize: 17,
                lineHeight: 1.7,
              }}
            >
              {t(
                dict,
                'promote_page.subtitle',
                'Tell SignalBoost what you want to promote. We will help turn it into website copy, social posts, email text, video ideas and native language versions.'
              )}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
                marginTop: 26,
              }}
            >
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>
                  {t(dict, 'promote_page.businessName', 'Business name')}
                </span>
                <input
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder={t(
                    dict,
                    'promote_page.businessPlaceholder',
                    'Example: Luna Travel'
                  )}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>
                  {t(dict, 'promote_page.audience', 'Audience')}
                </span>
                <input
                  value={audience}
                  onChange={e => setAudience(e.target.value)}
                  placeholder={t(
                    dict,
                    'promote_page.audiencePlaceholder',
                    'Example: families, travelers, local customers'
                  )}
                  style={inputStyle}
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>
                {t(dict, 'promote_page.offer', 'What do you want to promote?')}
              </span>
              <textarea
                value={promotion}
                onChange={e => setPromotion(e.target.value)}
                placeholder={t(
                  dict,
                  'promote_page.offerPlaceholder',
                  'Example: 20% off weekend travel packages to Cancun. Limited spots available.'
                )}
                style={{
                  ...inputStyle,
                  minHeight: 150,
                  resize: 'vertical',
                  lineHeight: 1.6,
                }}
              />
            </label>

            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: 16,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {t(dict, 'promote_page.tone', 'Tone')}
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  style={{
                    ...inputStyle,
                    width: 'auto',
                    padding: '10px 12px',
                  }}
                >
                  <option value="friendly">
                    {t(dict, 'promote_page.tones.friendly', 'Friendly')}
                  </option>
                  <option value="premium">
                    {t(dict, 'promote_page.tones.premium', 'Premium')}
                  </option>
                  <option value="urgent">
                    {t(dict, 'promote_page.tones.urgent', 'Urgent')}
                  </option>
                  <option value="local">
                    {t(dict, 'promote_page.tones.local', 'Local')}
                  </option>
                </select>
              </label>

              <button
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  marginLeft: 'auto',
                  border: 'none',
                  borderRadius: 999,
                  padding: '13px 20px',
                  background: GOLD,
                  color: '#000',
                  fontWeight: 900,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  boxShadow: '0 18px 40px rgba(255,195,0,.20)',
                }}
              >
                {loading
                  ? 'Generating...'
                  : t(dict, 'promote_page.generate', 'Generate campaign')}
              </button>
            </div>
          </div>

          <aside
            style={{
              border: '1px solid rgba(255,195,0,.22)',
              background:
                'linear-gradient(180deg, rgba(255,195,0,.10), rgba(255,255,255,.04))',
              borderRadius: 28,
              padding: 24,
              minHeight: 420,
            }}
          >
            <div
              style={{
                color: GOLD,
                fontSize: 12,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '.12em',
              }}
            >
              {t(dict, 'promote_page.preview.title', 'Campaign preview')}
            </div>

            <div
              style={{
                marginTop: 18,
                borderRadius: 24,
                background: 'rgba(0,0,0,.28)',
                border: '1px solid var(--border-soft)',
                padding: 20,
              }}
            >
              <div style={{ fontSize: 34 }}>📣</div>

              <h2
                style={{
                  margin: '16px 0 8px',
                  color: '#fff',
                  fontSize: 26,
                  lineHeight: 1.1,
                }}
              >
                {sampleHeadline}
              </h2>

              <p
                style={{
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {campaign?.website?.body ||
                  t(dict, 'promote_page.preview.copyPrefix', 'A ready-to-adapt campaign for')}{' '}
                {!campaign?.website?.body && (
                  <>
                    <strong style={{ color: '#fff' }}>{sampleBusiness}</strong>
                    {audience.trim()
                      ? ` ${t(dict, 'promote_page.preview.forAudience', 'for')} ${audience.trim()}.`
                      : '.'}
                  </>
                )}
              </p>

              {campaign?.website?.cta && (
                <div
                  style={{
                    marginTop: 16,
                    display: 'inline-flex',
                    borderRadius: 999,
                    padding: '9px 14px',
                    background: GOLD,
                    color: '#000',
                    fontWeight: 900,
                    fontSize: 13,
                  }}
                >
                  {campaign.website.cta}
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  marginTop: 20,
                }}
              >
                {[
                  t(dict, 'promote_page.preview.item1', 'Website banner'),
                  t(dict, 'promote_page.preview.item2', 'Social media captions'),
                  t(dict, 'promote_page.preview.item3', 'Email text'),
                  t(dict, 'promote_page.preview.item4', 'Short video idea'),
                  t(dict, 'promote_page.preview.item5', 'Native language versions'),
                ].map(item => (
                  <div
                    key={item}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: GOLD }}>✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {loading && (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 20,
                  padding: 16,
                  background: 'rgba(255,195,0,.10)',
                  border: '1px solid rgba(255,195,0,.25)',
                  color: '#fff7cc',
                  lineHeight: 1.5,
                  fontSize: 14,
                }}
              >
                SignalBoost is creating your campaign...
              </div>
            )}

            {generated && campaign && (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 20,
                  padding: 16,
                  background: 'rgba(16,185,129,.10)',
                  border: '1px solid rgba(16,185,129,.25)',
                  color: '#d1fae5',
                  lineHeight: 1.5,
                  fontSize: 14,
                }}
              >
                Campaign generated successfully.
              </div>
            )}
          </aside>
        </section>

        {campaign && (
          <section
            style={{
              marginTop: 26,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            <CampaignCard
              icon="🌐"
              title="Website"
              items={[
                campaign.website?.title,
                campaign.website?.body,
                campaign.website?.cta,
              ]}
            />

            <CampaignCard
              icon="📱"
              title="Social posts"
              items={[
                campaign.social?.facebook,
                campaign.social?.instagram,
                campaign.social?.tiktok,
              ]}
            />

            <CampaignCard
              icon="✉️"
              title="Email"
              items={[
                campaign.email?.subject,
                campaign.email?.body,
              ]}
            />

            <CampaignCard
              icon="🎬"
              title="Video"
              items={[
                campaign.video?.hook,
                campaign.video?.script,
                campaign.video?.cta,
              ]}
            />

            <CampaignCard
              icon="⭐"
              title="Review follow-up"
              items={[campaign.reviewFollowUp]}
            />

            <CampaignCard
              icon="🌍"
              title="Language ideas"
              items={campaign.languageIdeas || []}
            />
          </section>
        )}

        {!campaign && (
          <section
            style={{
              marginTop: 26,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {channels.map(channel => (
              <div
                key={channel.id}
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 22,
                  padding: 18,
                  background: 'rgba(255,255,255,.04)',
                }}
              >
                <div style={{ fontSize: 28 }}>{channel.icon}</div>
                <h3
                  style={{
                    color: '#fff',
                    margin: '12px 0 6px',
                    fontSize: 17,
                  }}
                >
                  {channel.title}
                </h3>
                <p
                  style={{
                    color: 'var(--text-muted)',
                    margin: 0,
                    lineHeight: 1.55,
                    fontSize: 14,
                  }}
                >
                  {channel.description}
                </p>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}

function CampaignCard({
  icon,
  title,
  items,
}: {
  icon: string
  title: string
  items: Array<string | undefined>
}) {
  const cleanItems = items.filter(Boolean)

  if (cleanItems.length === 0) return null

  return (
    <div
      style={{
        border: '1px solid var(--border-soft)',
        borderRadius: 22,
        padding: 18,
        background: 'rgba(255,255,255,.04)',
      }}
    >
      <div style={{ fontSize: 28 }}>{icon}</div>

      <h3
        style={{
          color: '#fff',
          margin: '12px 0 10px',
          fontSize: 17,
        }}
      >
        {title}
      </h3>

      <div
        style={{
          display: 'grid',
          gap: 10,
        }}
      >
        {cleanItems.map((item, index) => (
          <p
            key={`${title}-${index}`}
            style={{
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 1.55,
              fontSize: 14,
              whiteSpace: 'pre-wrap',
            }}
          >
            {item}
          </p>
        ))}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 16,
  border: '1px solid var(--border-soft)',
  background: 'rgba(0,0,0,.22)',
  color: '#fff',
  padding: '13px 14px',
  outline: 'none',
}
