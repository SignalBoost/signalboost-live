'use client'

// saas/app/dashboard/audit/pricing/page.tsx
// Audit pricing storefront — four tier cards, fathom-glass aesthetic, inline styles only.
// Credits pill driven by pricingConfig (single source of truth).
// Paid tiers POST to /api/stripe/checkout; enterprise renders a mailto CTA.

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  AUDIT_PRICING_CONFIG,
  getStripePriceId,
  formatAuditCount,
  AuditTier,
} from '@/lib/audit/pricingConfig'
import {
  getAuditPricingCopy,
  AuditLocale,
  AuditPageCopy,
  AuditTierCopy,
} from '@/lib/i18n/auditPricingCopy'

// ─── Design tokens ────────────────────────────────────────────────────────────
const GOLD = '#ffc300'
const CYAN = '#1af0ff'

const cardBase: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
  border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 20,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: '0 24px 70px rgba(0,0,0,.6)',
  padding: '28px 24px 24px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 0,
  position: 'relative' as const,
  flex: '1 1 260px',
  minWidth: 240,
  maxWidth: 320,
  boxSizing: 'border-box' as const,
}

const popularCard: React.CSSProperties = {
  ...cardBase,
  border: `1px solid ${GOLD}55`,
  boxShadow: `0 24px 70px rgba(0,0,0,.6), 0 0 0 1px ${GOLD}22`,
}

// ─── Tier card ────────────────────────────────────────────────────────────────
function TierCard({
  tier,
  copy,
  pageCopy,
}: {
  tier: AuditTier
  copy: AuditTierCopy
  pageCopy: AuditPageCopy
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priceId = getStripePriceId(tier.stripePriceEnvKey)
  const isEnterprise = tier.isEnterprise || tier.id === 'enterprise'

  async function handleUpgrade() {
    if (!priceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        setError(data?.error || pageCopy.errorLabel)
        return
      }
      window.location.href = data.url
    } catch {
      setError(pageCopy.errorLabel)
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = tier.isPopular ? popularCard : cardBase

  return (
    <div style={cardStyle}>
      {/* Popular badge */}
      {copy.popular && (
        <div style={{
          position: 'absolute',
          top: -13,
          left: '50%',
          transform: 'translateX(-50%)',
          background: `linear-gradient(135deg, ${GOLD}, #ffb000)`,
          color: '#0a0e17',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          borderRadius: 999,
          padding: '4px 14px',
          whiteSpace: 'nowrap',
        }}>
          {copy.popular}
        </div>
      )}

      {/* Tier name */}
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: tier.isPopular ? GOLD : 'rgba(255,255,255,.5)',
        marginBottom: 6,
      }}>
        {copy.name}
      </div>

      {/* Description */}
      <p style={{
        margin: '0 0 18px',
        fontSize: 13,
        lineHeight: 1.5,
        color: 'rgba(255,255,255,.6)',
        minHeight: 38,
      }}>
        {copy.description}
      </p>

      {/* Price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.03em' }}>
          {copy.priceLabel}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', fontWeight: 600 }}>
          {copy.perMonth}
        </span>
      </div>

      {/* Audit count sub-label */}
      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.4)', marginBottom: 16 }}>
        {formatAuditCount(tier.auditCount)}
      </div>

      {/* Credits pill — prominent, gold-tinted */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        background: 'rgba(255,195,0,.08)',
        border: '1px solid rgba(255,195,0,.22)',
        borderRadius: 10,
        padding: '8px 12px',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        marginBottom: copy.topupLabel ? 8 : 18,
      }}>
        <span style={{ fontSize: 14 }}>⚡</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, lineHeight: 1.35 }}>
          {copy.creditsLabel}
        </span>
      </div>

      {/* Top-up label — cyan, only when tier supports it */}
      {copy.topupLabel && (
        <div style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: CYAN,
          marginBottom: 18,
          paddingLeft: 2,
        }}>
          {copy.topupLabel}
        </div>
      )}

      {/* Feature list */}
      <ul style={{ margin: '0 0 24px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {copy.features.map((feat, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'rgba(255,255,255,.82)', lineHeight: 1.45 }}>
            <span style={{ color: CYAN, fontWeight: 900, flexShrink: 0, marginTop: 1 }}>✓</span>
            {feat}
          </li>
        ))}
      </ul>

      {/* Spacer pushes CTA to bottom */}
      <div style={{ flex: 1 }} />

      {/* CTA */}
      {isEnterprise ? (
        <a
          href={pageCopy.enterpriseCtaHref}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '12px 20px',
            borderRadius: 12,
            border: `1px solid ${GOLD}55`,
            background: 'rgba(255,195,0,.08)',
            color: GOLD,
            fontWeight: 800,
            fontSize: 14,
            textDecoration: 'none',
            letterSpacing: '.02em',
            transition: 'background .15s',
          }}
        >
          {copy.ctaLabel}
        </a>
      ) : !priceId ? (
        <div style={{
          fontSize: 12,
          color: 'rgba(255,255,255,.4)',
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 10,
          padding: '11px 14px',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          {pageCopy.notConfigured}
        </div>
      ) : (
        <>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 12,
              border: tier.isPopular ? 'none' : `1px solid ${GOLD}55`,
              background: tier.isPopular
                ? `linear-gradient(135deg, ${GOLD}, #ffb000)`
                : loading
                ? 'rgba(255,195,0,.14)'
                : 'rgba(255,195,0,.10)',
              color: tier.isPopular ? '#0a0e17' : loading ? GOLD : GOLD,
              fontWeight: 800,
              fontSize: 14,
              cursor: loading ? 'default' : 'pointer',
              letterSpacing: '.02em',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? pageCopy.loadingLabel : copy.ctaLabel}
          </button>
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#fca5a5', textAlign: 'center', lineHeight: 1.4 }}>
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AuditPricingPage() {
  const { lang } = useI18n()
  const pageCopy: AuditPageCopy = getAuditPricingCopy(lang as AuditLocale)

  return (
    <main style={{
      minHeight: 'calc(100vh - 80px)',
      color: '#fff',
      padding: '40px 24px 60px',
      boxSizing: 'border-box',
    }}>
      {/* Page header */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          display: 'inline-block',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: GOLD,
          border: `1px solid ${GOLD}44`,
          borderRadius: 999,
          padding: '4px 14px',
          marginBottom: 14,
        }}>
          Audit
        </div>
        <h1 style={{
          margin: '0 0 12px',
          fontSize: 'clamp(28px, 5vw, 44px)',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}>
          {pageCopy.pageTitle}
        </h1>
        <p style={{
          margin: '0 auto',
          maxWidth: 560,
          fontSize: 15,
          lineHeight: 1.6,
          color: 'rgba(255,255,255,.55)',
        }}>
          {pageCopy.pageSubtitle}
        </p>
      </div>

      {/* Tier cards grid */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        justifyContent: 'center',
        alignItems: 'stretch',
        maxWidth: 1200,
        margin: '0 auto',
      }}>
        {AUDIT_PRICING_CONFIG.tiers.map(tier => {
          const copy = pageCopy.tiers[tier.id]
          if (!copy) return null
          return (
            <TierCard
              key={tier.id}
              tier={tier}
              copy={copy}
              pageCopy={pageCopy}
            />
          )
        })}
      </div>
    </main>
  )
}
