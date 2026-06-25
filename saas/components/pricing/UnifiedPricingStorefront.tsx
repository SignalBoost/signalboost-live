'use client'

// saas/components/pricing/UnifiedPricingStorefront.tsx
// Single source of truth for the public Audit / Cybersecurity pricing storefront.
// Rendered by BOTH /pricing and /dashboard/audit/pricing so the two routes can
// never drift. All copy (kicker, tier matrices, disclaimer) is localized via
// getAuditPricingCopy(lang) across en/es/pt/pl/ru — no hardcoded English in view.
//
// Tiers come from AUDIT_PRICING_CONFIG (single source of truth). The Starter
// tier is filtered out of the PUBLIC grid by owner decision; the lineup shown is
// Growth / Pro ($199) / Enterprise ($599). Paid tiers POST to /api/stripe/checkout;
// Enterprise renders a mailto CTA.

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

// Tiers hidden from the public storefront (still purchasable via direct link /
// API, just not shown as a column here).
const HIDDEN_PUBLIC_TIERS = new Set(['starter'])

// ─── Design-system class tokens ──────────────────────────────────────────────
const PRIMARY_BTN =
  'w-full inline-flex items-center justify-center rounded-md border border-accent bg-accent text-bg px-3 py-2 text-sm font-semibold transition-fast hover:brightness-110 disabled:opacity-60'
const SECONDARY_BTN =
  'w-full inline-flex items-center justify-center rounded-md border border-border bg-bg text-text px-3 py-2 text-sm transition-fast hover:bg-surface disabled:opacity-60'

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
  const popular = tier.isPopular

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

  const cardClass = [
    'relative flex flex-col rounded-md border bg-surface p-6',
    'flex-1 min-w-[240px] max-w-[320px] box-border',
    popular ? 'border-accent ring-1 ring-accent' : 'border-border',
  ].join(' ')

  return (
    <div className={cardClass}>
      {/* MOST POPULAR badge */}
      {copy.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-bg">
          {copy.popular}
        </div>
      )}

      {/* Tier name */}
      <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${popular ? 'text-accent' : 'text-text-muted'}`}>
        {copy.name}
      </div>

      {/* Description */}
      <p className="mb-4 min-h-[38px] text-sm leading-relaxed text-text-muted">
        {copy.description}
      </p>

      {/* Price */}
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold leading-none tracking-tight text-text">{copy.priceLabel}</span>
        <span className="text-sm font-medium text-text-muted">{copy.perMonth}</span>
      </div>

      {/* Audit count sub-label */}
      <div className="mb-4 text-xs text-text-muted">{formatAuditCount(tier.auditCount)}</div>

      {/* Credits pill */}
      <div className={`flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 ${copy.topupLabel ? 'mb-2' : 'mb-4'}`}>
        <span className="text-sm text-accent" aria-hidden>⚡</span>
        <span className="text-xs font-semibold leading-snug text-accent">{copy.creditsLabel}</span>
      </div>

      {/* Top-up label */}
      {copy.topupLabel && (
        <div className="mb-4 pl-0.5 text-xs font-medium text-text-muted">{copy.topupLabel}</div>
      )}

      {/* Feature list — mark-aware: a leading ✓/❌ in the string overrides the
          default check (so "❌ Read-only reports…" renders a danger ✕). */}
      <ul className="mb-6 flex list-none flex-col gap-2.5 p-0">
        {copy.features.map((feat, i) => {
          const negative = feat.trimStart().startsWith('❌')
          const text = feat.replace(/^\s*[✓❌]\s*/, '')
          return (
            <li key={i} className="flex items-start gap-2 text-sm leading-snug text-text-muted">
              <span className={`mt-0.5 flex-shrink-0 font-semibold ${negative ? 'text-danger' : 'text-accent'}`} aria-hidden>
                {negative ? '✕' : '✓'}
              </span>
              <span className={negative ? 'text-text-muted' : 'text-text'}>{text}</span>
            </li>
          )
        })}
      </ul>

      {/* Spacer pushes CTA to bottom */}
      <div className="flex-1" />

      {/* CTA */}
      {isEnterprise ? (
        <a href={pageCopy.enterpriseCtaHref} className={SECONDARY_BTN}>
          {copy.ctaLabel}
        </a>
      ) : !priceId ? (
        // Vercel env safeguard: when NEXT_PUBLIC_STRIPE_PRICE_AUDIT_* is unset the
        // card shows the localized "pricing not configured" notice instead of a
        // dead button. Intact across all 5 languages (pageCopy.notConfigured).
        <div className="rounded-md border border-border bg-bg px-3 py-2.5 text-center text-xs leading-relaxed text-text-muted">
          {pageCopy.notConfigured}
        </div>
      ) : (
        <>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className={popular ? PRIMARY_BTN : SECONDARY_BTN}
          >
            {loading ? pageCopy.loadingLabel : copy.ctaLabel}
          </button>
          {error && (
            <div className="mt-2.5 text-center text-xs leading-snug text-danger">{error}</div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Storefront ───────────────────────────────────────────────────────────────
export default function UnifiedPricingStorefront() {
  const { lang } = useI18n()
  const pageCopy: AuditPageCopy = getAuditPricingCopy(lang as AuditLocale)

  // Public lineup: Growth / Pro ($199) / Enterprise ($599). Starter is filtered.
  const publicTiers = AUDIT_PRICING_CONFIG.tiers.filter(t => t.id !== 'starter')

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-10 font-sans text-text">
      {/* Page header */}
      <div className="mb-12 text-center">
        <div className="mb-3.5 inline-block rounded-full border border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {pageCopy.pageKicker}
        </div>
        <h1 className="mb-3 text-[clamp(28px,5vw,44px)] font-semibold leading-tight tracking-tight text-text">
          {pageCopy.pageTitle}
        </h1>
        <p className="mx-auto max-w-[560px] text-md leading-relaxed text-text-muted">
          {pageCopy.pageSubtitle}
        </p>
      </div>

      {/* Tier cards grid — Starter filtered out of the public storefront */}
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-stretch justify-center gap-5">
        {publicTiers.map(tier => {
          const copy = pageCopy.tiers[tier.id]
          if (!copy) return null
          return <TierCard key={tier.id} tier={tier} copy={copy} pageCopy={pageCopy} />
        })}
      </div>

      {/* Compliance safeguard — bottom-center of the pricing layout. Localized. */}
      <p className="mx-auto mt-12 max-w-[760px] text-center text-xs leading-relaxed text-text-muted">
        {pageCopy.complianceDisclaimer}
      </p>
    </main>
  )
}
