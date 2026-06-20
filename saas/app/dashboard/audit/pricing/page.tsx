'use client'

// saas/app/dashboard/audit/pricing/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Isolated Audit Project pricing page.
// Uses AUDIT_TIERS from saas/lib/audit/pricingConfig.ts and
// AUDIT_PRICING_COPY from saas/lib/i18n/auditPricingCopy.ts.
//
// Does NOT touch core SaaS plans (Launch / Growth / Command),
// platformCopy.ts, credits.ts, or the webhook handler.
//
// Checkout flow: POST /api/checkout with { plan: tier.key, stripePriceId: tier.stripePriceId }
// If stripePriceId is empty the button shows a "not yet configured" notice
// instead of hitting checkout — safe to ship before Stripe products exist.
//
// Design: dark navy/black gradient, gold + cyan accents, inline styles only,
// fluid heights (height: auto, maxHeight caps), 80px navbar offset respected.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { AUDIT_TIERS } from '@/lib/audit/pricingConfig'
import type { AuditTier } from '@/lib/audit/pricingConfig'
import { getAuditPricingCopy } from '@/lib/i18n/auditPricingCopy'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

// ── Shared style tokens ───────────────────────────────────────────────────────

const pageShell: React.CSSProperties = {
  minHeight: 'calc(100vh - 80px)',
  padding: '32px 20px 64px',
  color: '#fff',
  maxWidth: 1160,
  margin: '0 auto',
}

const glassCard: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
  border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 20,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: '0 24px 70px rgba(0,0,0,.6)',
  padding: 28,
  height: 'auto',
  display: 'flex',
  flexDirection: 'column' as const,
}

const popularCard: React.CSSProperties = {
  ...glassCard,
  border: `1px solid rgba(255,195,0,.45)`,
  background: 'linear-gradient(160deg, rgba(20,28,52,.95), rgba(8,12,24,.98))',
  boxShadow: `0 24px 70px rgba(0,0,0,.7), 0 0 0 1px rgba(255,195,0,.18)`,
}

const eyebrow: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '.1em',
  textTransform: 'uppercase' as const,
  color: 'rgba(255,255,255,.5)',
  display: 'block',
  marginBottom: 6,
}

const auditBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(26,240,255,.10)',
  border: '1px solid rgba(26,240,255,.30)',
  borderRadius: 999,
  padding: '5px 14px',
  fontSize: 13,
  fontWeight: 800,
  color: CYAN,
  marginTop: 14,
  marginBottom: 4,
}

// ── Tier card ─────────────────────────────────────────────────────────────────

type TierCardProps = {
  tier: AuditTier
  copy: ReturnType<typeof getAuditPricingCopy>
  loading: boolean
  onCheckout: (tier: AuditTier) => void
  stripePendingMsg: string
}

function TierCard({ tier, copy, loading, onCheckout, stripePendingMsg }: TierCardProps) {
  const tierCopy = copy.tiers[tier.key]
  const isPopular = tier.popular
  const hasStripe = !!tier.stripePriceId
  const [showPending, setShowPending] = useState(false)

  function handleClick() {
    if (!hasStripe) { setShowPending(true); return }
    onCheckout(tier)
  }

  return (
    <article style={isPopular ? popularCard : glassCard}>
      {isPopular && (
        <span style={{
          alignSelf: 'flex-start',
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: '.06em',
          textTransform: 'uppercase' as const,
          color: '#0a0e17',
          background: GOLD,
          borderRadius: 999,
          padding: '3px 12px',
          marginBottom: 14,
        }}>
          {copy.popular}
        </span>
      )}

      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-.02em' }}>
        {tierCopy.name}
      </h2>

      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,.6)', lineHeight: 1.5, flexGrow: 1 }}>
        {tierCopy.description}
      </p>

      {/* Price */}
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 36, fontWeight: 950, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '-.04em', color: '#fff' }}>
          {tier.priceDisplay}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>
          {copy.perMonth}
        </span>
      </div>

      {/* Audit count badge */}
      <div style={auditBadge}>
        <span style={{ fontSize: 16 }}>🔍</span>
        {tier.audits === 'unlimited'
          ? copy.auditsUnlimited
          : `${tier.audits} ${copy.auditsLabel}`}
      </div>

      {/* Feature list */}
      <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 8 }}>
        {tierCopy.features.map((feature) => (
          <li key={feature} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,.80)', lineHeight: 1.45 }}>
            <span style={{ color: isPopular ? GOLD : CYAN, fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>✦</span>
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          marginTop: 22,
          width: '100%',
          borderRadius: 12,
          padding: '12px 20px',
          fontSize: 14,
          fontWeight: 800,
          cursor: loading ? 'default' : 'pointer',
          border: 'none',
          color: isPopular ? '#0a0e17' : CYAN,
          background: isPopular
            ? (loading ? 'rgba(255,195,0,.4)' : `linear-gradient(135deg, ${GOLD}, #ffb000)`)
            : 'transparent',
          outline: isPopular ? 'none' : `1px solid rgba(26,240,255,.45)`,
          transition: 'opacity .2s',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? copy.redirecting : (tier.key === 'audit_enterprise' ? copy.ctaContact : copy.ctaUpgrade)}
      </button>

      {/* Stripe not-yet-configured notice */}
      {showPending && (
        <p style={{ marginTop: 10, fontSize: 11.5, color: 'rgba(255,195,0,.85)', lineHeight: 1.5 }}>
          {stripePendingMsg}
        </p>
      )}
    </article>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditPricingPage() {
  const { lang } = useI18n()
  const copy = getAuditPricingCopy(lang)

  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  async function handleCheckout(tier: AuditTier) {
    // Enterprise: redirect to contact instead of Stripe
    if (tier.key === 'audit_enterprise') {
      window.location.href = 'mailto:support@signalboostapp.com?subject=Audit%20Enterprise%20Enquiry'
      return
    }

    try {
      setCheckoutError(null)
      setLoadingTier(tier.key)

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          plan: tier.key,
          stripePriceId: tier.stripePriceId,
        }),
      })

      const data = await res.json().catch(() => null)

      if (data?.url) {
        window.location.href = data.url
      } else {
        setCheckoutError(data?.error || copy.errorGeneric)
      }
    } catch {
      setCheckoutError(copy.errorNetwork)
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <main style={pageShell}>
      {/* Error toast */}
      {checkoutError && (
        <div role="alert" style={{
          position: 'fixed',
          top: 96,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          maxWidth: 480,
          width: 'calc(100% - 32px)',
          padding: '12px 16px',
          borderRadius: 12,
          background: 'rgba(255,59,48,.12)',
          border: '1px solid rgba(255,107,107,.45)',
          color: '#ffb3b3',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}>
          <span style={{ flex: 1 }}>{checkoutError}</span>
          <button
            onClick={() => setCheckoutError(null)}
            aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: '#ffb3b3', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}
          >×</button>
        </div>
      )}

      {/* Header */}
      <section style={{ textAlign: 'center', marginBottom: 40 }}>
        <span style={eyebrow}>{copy.kicker}</span>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 950, letterSpacing: '-.035em', lineHeight: 1.1 }}>
          {copy.title}
        </h1>
        <p style={{ maxWidth: 620, margin: '12px auto 0', fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>
          {copy.subtitle}
        </p>
      </section>

      {/* Tier grid */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 20,
        alignItems: 'start',
      }}>
        {AUDIT_TIERS.map((tier) => (
          <TierCard
            key={tier.key}
            tier={tier}
            copy={copy}
            loading={loadingTier === tier.key}
            onCheckout={handleCheckout}
            stripePendingMsg={copy.stripePending}
          />
        ))}
      </section>

      {/* Comparison note */}
      <section style={{ marginTop: 48 }}>
        <div style={{
          ...glassCard,
          padding: 24,
          borderLeft: `3px solid rgba(255,195,0,.6)`,
          borderRadius: 16,
        }}>
          <span style={eyebrow}>How audit tiers work</span>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginTop: 12,
          }}>
            {AUDIT_TIERS.map((tier) => (
              <div key={tier.key} style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
                  {copy.tiers[tier.key].name}
                </span>
                <strong style={{ display: 'block', fontSize: 22, color: '#fff', marginTop: 6, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {tier.priceDisplay}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.45)' }}>{copy.perMonth}</span>
                </strong>
                <span style={{ display: 'block', marginTop: 4, fontSize: 12.5, color: CYAN, fontWeight: 700 }}>
                  {tier.audits === 'unlimited' ? copy.auditsUnlimited : `${tier.audits} ${copy.auditsLabel}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Back link */}
      <div style={{ marginTop: 36, textAlign: 'center' }}>
        <Link
          href="/dashboard/audit"
          style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none', fontWeight: 700, letterSpacing: '.04em' }}
        >
          ← Back to Audit Workspace
        </Link>
      </div>
    </main>
  )
}
