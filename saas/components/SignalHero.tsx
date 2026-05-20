'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'

const GOLD = '#ffc300'
const BLUE = '#3b82f6'

export default function SignalHero() {
  const { dict, lang } = useI18n()

  const features = [
    dict.buildWebsite || 'Build a website',
    dict.collectReviews || 'Collect reviews',
    dict.generateAudio || 'Generate audio',
    dict.createVideos || 'Create videos',
    dict.aiAssistant || 'AI assistant',
    dict.multilingualContent || 'Multilingual content',
  ]

  return (
    <section
      style={{
        padding: '90px 24px 80px',
        color: '#fff',
        fontFamily: 'system-ui',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--border-medium)',
            background: 'var(--surface-1)',
            borderRadius: 999,
            padding: '7px 16px',
            color: 'var(--text-muted)',
            fontSize: 13,
            marginBottom: 22,
          }}
        >
          🌎 {dict.languageBadge || `Native experience • ${lang.toUpperCase()}`}
        </div>

        <h1
          style={{
            fontSize: 'clamp(42px, 7vw, 82px)',
            lineHeight: 1,
            fontWeight: 950,
            letterSpacing: '-0.06em',
            margin: '0 auto 20px',
            maxWidth: 900,
          }}
        >
          {dict.heroTitle || 'Build your brand'}
          <br />
          <span style={{ color: GOLD }}>
            {dict.heroTitleAccent || 'in every language'}
          </span>
        </h1>

        <p
          style={{
            maxWidth: 650,
            margin: '0 auto 34px',
            color: 'var(--text-secondary)',
            fontSize: 18,
            lineHeight: 1.7,
          }}
        >
          {dict.heroSubtitle ||
            'Create websites, reviews, audio and video content that feels native — not translated.'}
        </p>

        <div
          style={{
            display: 'flex',
            gap: 14,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 46,
          }}
        >
          <Link
            href="/dashboard"
            style={{
              background: GOLD,
              color: '#000',
              padding: '14px 28px',
              borderRadius: 999,
              fontWeight: 900,
              textDecoration: 'none',
              boxShadow: '0 10px 35px rgba(255,195,0,.22)',
            }}
          >
            {dict.getStarted || 'Get started'}
          </Link>

          <Link
            href="/docs"
            style={{
              background: 'var(--surface-2)',
              color: '#fff',
              padding: '14px 28px',
              borderRadius: 999,
              border: '1px solid var(--border-medium)',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {dict.watchDemo || 'Watch demo'}
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
            maxWidth: 860,
            margin: '0 auto',
          }}
        >
          {features.map(item => (
            <div
              key={item}
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border-medium)',
                borderRadius: 16,
                padding: '18px 16px',
                color: 'var(--text-secondary)',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
