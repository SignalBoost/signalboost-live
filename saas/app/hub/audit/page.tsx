'use client'

// saas/app/hub/audit/page.tsx
// Audit Center landing — indexes the five readiness reports. Pure navigation,
// no data fetch. Every label resolves through t('audit.center.*'); links point
// at the live report pages under /hub/audit/*.

import type { CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

const glass: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.55), rgba(7,11,20,.65))',
  border: '1px solid rgba(255,255,255,.10)', borderRadius: 16,
  backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
}

type ReportCard = { key: string; href: string; accent: string }

const REPORTS: ReportCard[] = [
  { key: 'executive',   href: '/hub/audit/executive',   accent: GOLD },
  { key: 'identity',    href: '/hub/audit/identity',    accent: CYAN },
  { key: 'providers',   href: '/hub/audit/providers',   accent: GOLD },
  { key: 'secrets',     href: '/hub/audit/secrets',     accent: CYAN },
  { key: 'remediation', href: '/hub/audit/remediation', accent: GOLD },
  { key: 'usage',       href: '/hub/audit/usage',        accent: CYAN },
  { key: 'history',     href: '/hub/audit/history',     accent: GOLD },
  { key: 'github',      href: '/hub/audit/github',      accent: CYAN },
  { key: 'supabase',    href: '/hub/audit/supabase',    accent: GOLD },
  { key: 'stripe',      href: '/hub/audit/stripe',      accent: CYAN },
  { key: 'vercel',      href: '/hub/audit/vercel',      accent: GOLD },
  { key: 'activity',    href: '/hub/audit/activity',    accent: CYAN },
  { key: 'compliance',  href: '/hub/audit/compliance',  accent: GOLD },
]

export default function AuditCenterPage() {
  const { t } = useTranslation()

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {t('audit.center.title', 'Audit Center')} <span style={{ color: GOLD }}>·</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,.62)', maxWidth: 680, lineHeight: 1.5 }}>
          {t('audit.center.subtitle', 'Operational readiness reports across identity, providers, secrets, and remediation — scored deterministically.')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {REPORTS.map(r => (
          <a
            key={r.key}
            href={r.href}
            style={{
              ...glass, padding: 18, textDecoration: 'none', color: '#fff',
              display: 'flex', flexDirection: 'column', gap: 8,
              borderLeft: `3px solid ${r.accent}`,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {t(`audit.center.${r.key}.title`, r.key)}
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.66)', lineHeight: 1.5, flex: 1 }}>
              {t(`audit.center.${r.key}.desc`, '')}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: r.accent, marginTop: 4 }}>
              {t('audit.center.open', 'Open report')} →
            </div>
          </a>
        ))}
      </div>
    </main>
  )
}
