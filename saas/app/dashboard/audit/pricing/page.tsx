'use client'

// saas/app/dashboard/audit/pricing/page.tsx
// Audit Pricing Storefront — 4 commercial tiers, 5 locales.
// Copy sourced entirely from getAuditPricingCopy (auditPricingCopy.ts).
// Stripe price IDs read from NEXT_PUBLIC_STRIPE_PRICE_AUDIT_* env vars via
// getStripePriceId (pricingConfig.ts) — page degrades gracefully when not set.
// Fathom-glass aesthetic: inline backdropFilter pairs, gold/cyan accents.
// No hardcoded heights — height:auto + maxHeight + overflowY:auto throughout.
// Fixed overlay starts at top:80 (below the 80px navbar).

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { getAuditPricingCopy, type AuditPageCopy, type AuditTierCopy } from '@/lib/i18n/auditPricingCopy'
import { AUDIT_PRICING_CONFIG, getStripePriceId } from '@/lib/audit/pricingConfig'

// ── Brand tokens ──────────────────────────────────────────────────────────────
const GOLD  = '#ffc300'
const CYAN  = '#1af0ff'
const WHITE = '#ffffff'

// ── Shared style objects ──────────────────────────────────────────────────────
const pageWrap: React.CSSProperties = {
  minHeight: 'calc(100vh - 80px)',
  padding: '40px 24px 64px',
  color: WHITE,
  boxSizing: 'border-box',
}

const innerWrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
}

const glass: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
  border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 20,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: '0 24px 70px rgba(0,0,0,.6)',
}

const popularBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: '#0a0e17',
  background: GOLD,
  borderRadius: 999,
  padding: '3px 12px',
  marginBottom: 14,
}

const featureItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  fontSize: 13,
  color: 'rgba(255,255,255,.82)',
  lineHeight: 1.5,
  padding: '5px 0',
  borderBottom: '1px solid rgba(255,255,255,.06)',
}

const dot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: CYAN,
  flex: '0 0 auto',
  marginTop: 6,
}

// ── Tier card ─────────────────────────────────────────────────────────────────
function TierCard({
  tier,
  copy,
  priceId,
  onUpgrade,
}: {
  tier: AuditTierCopy & { id: string; monthlyPrice: number; isEnterprise: boolean }
  copy: AuditPageCopy
  priceId: string
  onUpgrade: (tierId: string, priceId: string, isEnterprise: boolean, enterpriseHref: string) => void
}) {
  const isPopular = !!tier.popular
  const cardStyle: React.CSSProperties = {
    ...glass,
    flex: '1 1 230px',
    minWidth: 220,
    maxWidth: 280,
    padding: '28px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    border: isPopular
      ? `1px solid rgba(255,195,0,.45)`
      : '1px solid rgba(255,255,255,.10)',
    boxShadow: isPopular
      ? '0 0 0 1px rgba(255,195,0,.18), 0 24px 70px rgba(0,0,0,.6)'
      : '0 24px 70px rgba(0,0,0,.6)',
  }

  return (
    <div style={cardStyle}>
      {isPopular && <span style={popularBadge}>{tier.popular}</span>}

      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em', marginBottom: 4 }}>
        {tier.name}
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', lineHeight: 1.5, marginBottom: 20, minHeight: 36 }}>
        {tier.description}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: isPopular ? GOLD : WHITE, lineHeight: 1 }}>
          {tier.priceLabel}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', fontWeight: 500 }}>
          {tier.perMonth}
        </span>
      </div>

      <div style={{ flex: 1, marginBottom: 24 }}>
        {tier.features.map((feat, i) => (
          <div key={i} style={{ ...featureItem, borderBottom: i < tier.features.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
            <span style={dot} />
            <span>{feat}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => onUpgrade(tier.id, priceId, tier.isEnterprise, copy.enterpriseCtaHref)}
        style={{
          width: '100%',
          padding: '12px 0',
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 800,
          cursor: 'pointer',
          border: isPopular ? 'none' : '1px solid rgba(255,255,255,.22)',
          background: isPopular
            ? 'linear-gradient(135deg, #ffc300, #ffb000)'
            : 'rgba(255,255,255,.06)',
          color: isPopular ? '#0a0e17' : WHITE,
          transition: 'opacity .15s ease',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '.85' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
      >
        {tier.isEnterprise ? (
          <a
            href={copy.enterpriseCtaHref}
            style={{ color: 'inherit', textDecoration: 'none', display: 'block', width: '100%' }}
          >
            {tier.ctaLabel}
          </a>
        ) : (
          tier.ctaLabel
        )}
      </button>
    </div>
  )
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
function UpgradeModal({
  copy,
  onClose,
}: {
  copy: AuditPageCopy
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 80,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: 'rgba(3,7,18,.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...glass,
          width: '100%',
          maxWidth: 480,
          padding: '32px 28px',
          height: 'auto',
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Sticky close */}
        <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'linear-gradient(160deg, rgba(15,23,42,.98), rgba(3,7,18,.99))', paddingBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,.2)',
              color: 'rgba(255,255,255,.8)',
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.75)', lineHeight: 1.65 }}>
          {copy.notConfigured}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AuditPricingPage() {
  const { lang } = useI18n()
  const copy: AuditPageCopy = getAuditPricingCopy(lang)

  const [modalOpen, setModalOpen] = useState(false)

  function handleUpgrade(tierId: string, priceId: string, isEnterprise: boolean, enterpriseHref: string) {
    if (isEnterprise) {
      // Enterprise CTA is an <a> inside the button — click propagates naturally.
      return
    }
    if (!priceId) {
      // Stripe not yet configured — show notice modal.
      setModalOpen(true)
      return
    }
    // TODO: wire to Stripe Checkout once NEXT_PUBLIC_STRIPE_PRICE_AUDIT_* env vars are set.
    // e.g. router.push(`/api/stripe/checkout?priceId=${priceId}`)
    setModalOpen(true)
  }

  return (
    <div style={pageWrap}>
      <div style={innerWrap}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            display: 'inline-block',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: CYAN,
            border: '1px solid rgba(26,240,255,.3)',
            borderRadius: 999,
            padding: '4px 14px',
            marginBottom: 18,
          }}>
            Audit Module
          </div>
          <h1 style={{ margin: '0 0 14px', fontSize: 38, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.15 }}>
            {copy.pageTitle}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: 'rgba(255,255,255,.6)', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.65 }}>
            {copy.pageSubtitle}
          </p>
        </div>

        {/* Tier grid */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          justifyContent: 'center',
          alignItems: 'stretch',
        }}>
          {AUDIT_PRICING_CONFIG.tiers.map(tier => {
            const tierCopy = copy.tiers[tier.id]
            if (!tierCopy) return null
            const priceId = getStripePriceId(tier.stripePriceEnvKey)
            return (
              <TierCard
                key={tier.id}
                tier={{
                  ...tierCopy,
                  id: tier.id,
                  monthlyPrice: tier.monthlyPrice,
                  isEnterprise: tier.isEnterprise,
                }}
                copy={copy}
                priceId={priceId}
                onUpgrade={handleUpgrade}
              />
            )
          })}
        </div>

        {/* Footer note */}
        <div style={{ textAlign: 'center', marginTop: 44 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.35)', lineHeight: 1.6 }}>
            {copy.notConfigured}
          </p>
        </div>

      </div>

      {/* Upgrade modal */}
      {modalOpen && (
        <UpgradeModal copy={copy} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
