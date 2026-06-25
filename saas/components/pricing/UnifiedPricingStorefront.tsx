'use client'

// saas/components/pricing/UnifiedPricingStorefront.tsx
// Single tabbed storefront for all three product lanes (Audit, Core Platform,
// Podcast Suite). Rendered by BOTH /pricing and /dashboard/audit/pricing so the
// routes can never drift. Every visible string comes from getUnifiedPricingCopy()
// (no hardcoded English); every price/plan/endpoint/payload comes from
// UNIFIED_PRICING_CATALOG via buildCheckoutRequest() (no inline payloads).

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  UNIFIED_PRICING_CATALOG,
  PRODUCT_LINES,
  publicTiers,
  buildCheckoutRequest,
  SALES_EMAIL,
  ProductLine,
  UnifiedTier,
} from '@/lib/config/unifiedPricing'
import {
  getUnifiedPricingCopy,
  SharedCopy,
  TierCopy,
} from '@/lib/i18n/unifiedPricingCopy'

// ─── Design-system class tokens ──────────────────────────────────────────────
const PRIMARY_BTN =
  'w-full inline-flex items-center justify-center rounded-md border border-accent bg-accent text-bg px-3 py-2 text-sm font-semibold transition-fast hover:brightness-110 disabled:opacity-60'
const SECONDARY_BTN =
  'w-full inline-flex items-center justify-center rounded-md border border-border bg-bg text-text px-3 py-2 text-sm transition-fast hover:bg-surface disabled:opacity-60'

// ─── Tier card ────────────────────────────────────────────────────────────────
function TierCard({
  tier,
  copy,
  shared,
}: {
  tier: UnifiedTier
  copy: TierCopy
  shared: SharedCopy
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const popular = !!tier.popular
  const req = buildCheckoutRequest(tier)

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(req.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(req.body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        setError(data?.error || shared.error)
        return
      }
      window.location.href = data.url
    } catch {
      setError(shared.error)
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
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-bg">
          {shared.popular}
        </div>
      )}

      <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${popular ? 'text-accent' : 'text-text-muted'}`}>
        {tier.name}
      </div>

      <p className="mb-4 min-h-[38px] text-sm leading-relaxed text-text-muted">
        {copy.description}
      </p>

      <div className="mb-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold leading-none tracking-tight text-text">{tier.fallbackPrice}</span>
        <span className="text-sm font-medium text-text-muted">{shared.perMonth}</span>
      </div>

      {/* Optional emphasised line (audit credits pill) */}
      {copy.highlight && (
        <div className={`flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 ${copy.topup ? 'mb-2' : 'mb-4'}`}>
          <span className="text-sm text-accent" aria-hidden>⚡</span>
          <span className="text-xs font-semibold leading-snug text-accent">{copy.highlight}</span>
        </div>
      )}
      {copy.topup && (
        <div className="mb-4 pl-0.5 text-xs font-medium text-text-muted">{copy.topup}</div>
      )}

      {/* Feature list — mark-aware: a leading ✓/❌ overrides the default check. */}
      {copy.features.length > 0 && (
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
      )}

      <div className="flex-1" />

      {/* CTA — contact-sales (mailto), checkout button, or "not configured" notice */}
      {tier.contactSales ? (
        <a href={`mailto:${SALES_EMAIL}`} className={SECONDARY_BTN}>
          {shared.contactSales}
        </a>
      ) : req.missingPrice ? (
        <div className="rounded-md border border-border bg-bg px-3 py-2.5 text-center text-xs leading-relaxed text-text-muted">
          {shared.notConfigured}
        </div>
      ) : (
        <>
          <button onClick={handleCheckout} disabled={loading} className={popular ? PRIMARY_BTN : SECONDARY_BTN}>
            {loading ? shared.loading : shared.cta}
          </button>
          {error && (
            <div className="mt-2.5 text-center text-xs leading-snug text-danger">{error}</div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({
  active,
  onChange,
  labels,
}: {
  active: ProductLine
  onChange: (line: ProductLine) => void
  labels: Record<ProductLine, string>
}) {
  return (
    <div role="tablist" aria-label={labels[active]} className="mx-auto mb-10 flex max-w-[640px] flex-wrap items-center justify-center gap-2">
      {PRODUCT_LINES.map((line) => {
        const selected = line === active
        return (
          <button
            key={line}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(line)}
            className={[
              'rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-fast',
              selected ? 'border-accent bg-accent text-bg' : 'border-border bg-bg text-text-muted hover:bg-surface',
            ].join(' ')}
          >
            {labels[line]}
          </button>
        )
      })}
    </div>
  )
}

// ─── Storefront ───────────────────────────────────────────────────────────────
export default function UnifiedPricingStorefront() {
  const { lang } = useI18n()
  const copy = getUnifiedPricingCopy(lang)
  const [activeTab, setActiveTab] = useState<ProductLine>('audit')

  const tiers = publicTiers(activeTab)
  const laneCopy = copy.lanes[activeTab]

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-10 font-sans text-text">
      <div className="mb-10 text-center">
        <div className="mb-3.5 inline-block rounded-full border border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {copy.shared.kicker}
        </div>
        <h1 className="mb-3 text-[clamp(28px,5vw,44px)] font-semibold leading-tight tracking-tight text-text">
          {copy.shared.pageTitle}
        </h1>
        <p className="mx-auto max-w-[560px] text-md leading-relaxed text-text-muted">
          {copy.shared.pageSubtitle}
        </p>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} labels={copy.shared.tabs} />

      <div className="mx-auto flex max-w-[1200px] flex-wrap items-stretch justify-center gap-5">
        {tiers.map((tier) => {
          const tierCopy = laneCopy.tiers[tier.id]
          if (!tierCopy) return null
          return <TierCard key={`${activeTab}:${tier.id}`} tier={tier} copy={tierCopy} shared={copy.shared} />
        })}
      </div>

      {/* Compliance safeguard — bottom-center of the pricing layout. Localized. */}
      <p className="mx-auto mt-12 max-w-[760px] text-center text-xs leading-relaxed text-text-muted">
        {copy.shared.disclaimer}
      </p>
    </main>
  )
}

'use client'

// saas/components/pricing/UnifiedPricingStorefront.tsx
// Single tabbed storefront for all three product lanes (Audit, Core Platform,
// Podcast Suite). Rendered by BOTH /pricing and /dashboard/audit/pricing so the
// routes can never drift. Every visible string comes from getUnifiedPricingCopy()
// (no hardcoded English); every price/plan/endpoint/payload comes from
// UNIFIED_PRICING_CATALOG via buildCheckoutRequest() (no inline payloads).

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  UNIFIED_PRICING_CATALOG,
  PRODUCT_LINES,
  publicTiers,
  buildCheckoutRequest,
  SALES_EMAIL,
  ProductLine,
  UnifiedTier,
} from '@/lib/config/unifiedPricing'
import {
  getUnifiedPricingCopy,
  SharedCopy,
  TierCopy,
} from '@/lib/i18n/unifiedPricingCopy'

// ─── Design-system class tokens ──────────────────────────────────────────────
const PRIMARY_BTN =
  'w-full inline-flex items-center justify-center rounded-md border border-accent bg-accent text-bg px-3 py-2 text-sm font-semibold transition-fast hover:brightness-110 disabled:opacity-60'
const SECONDARY_BTN =
  'w-full inline-flex items-center justify-center rounded-md border border-border bg-bg text-text px-3 py-2 text-sm transition-fast hover:bg-surface disabled:opacity-60'

// ─── Tier card ────────────────────────────────────────────────────────────────
function TierCard({
  tier,
  copy,
  shared,
}: {
  tier: UnifiedTier
  copy: TierCopy
  shared: SharedCopy
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const popular = !!tier.popular
  const req = buildCheckoutRequest(tier)

  async function handleCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(req.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(req.body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        setError(data?.error || shared.error)
        return
      }
      window.location.href = data.url
    } catch {
      setError(shared.error)
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
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-bg">
          {shared.popular}
        </div>
      )}

      <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${popular ? 'text-accent' : 'text-text-muted'}`}>
        {tier.name}
      </div>

      <p className="mb-4 min-h-[38px] text-sm leading-relaxed text-text-muted">
        {copy.description}
      </p>

      <div className="mb-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold leading-none tracking-tight text-text">{tier.fallbackPrice}</span>
        <span className="text-sm font-medium text-text-muted">{shared.perMonth}</span>
      </div>

      {/* Optional emphasised line (audit credits pill) */}
      {copy.highlight && (
        <div className={`flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 ${copy.topup ? 'mb-2' : 'mb-4'}`}>
          <span className="text-sm text-accent" aria-hidden>⚡</span>
          <span className="text-xs font-semibold leading-snug text-accent">{copy.highlight}</span>
        </div>
      )}
      {copy.topup && (
        <div className="mb-4 pl-0.5 text-xs font-medium text-text-muted">{copy.topup}</div>
      )}

      {/* Feature list — mark-aware: a leading ✓/❌ overrides the default check. */}
      {copy.features.length > 0 && (
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
      )}

      <div className="flex-1" />

      {/* CTA — contact-sales (mailto), checkout button, or "not configured" notice */}
      {tier.contactSales ? (
        <a href={`mailto:${SALES_EMAIL}`} className={SECONDARY_BTN}>
          {shared.contactSales}
        </a>
      ) : req.missingPrice ? (
        <div className="rounded-md border border-border bg-bg px-3 py-2.5 text-center text-xs leading-relaxed text-text-muted">
          {shared.notConfigured}
        </div>
      ) : (
        <>
          <button onClick={handleCheckout} disabled={loading} className={popular ? PRIMARY_BTN : SECONDARY_BTN}>
            {loading ? shared.loading : shared.cta}
          </button>
          {error && (
            <div className="mt-2.5 text-center text-xs leading-snug text-danger">{error}</div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({
  active,
  onChange,
  labels,
}: {
  active: ProductLine
  onChange: (line: ProductLine) => void
  labels: Record<ProductLine, string>
}) {
  return (
    <div role="tablist" aria-label={labels[active]} className="mx-auto mb-10 flex max-w-[640px] flex-wrap items-center justify-center gap-2">
      {PRODUCT_LINES.map((line) => {
        const selected = line === active
        return (
          <button
            key={line}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(line)}
            className={[
              'rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-fast',
              selected ? 'border-accent bg-accent text-bg' : 'border-border bg-bg text-text-muted hover:bg-surface',
            ].join(' ')}
          >
            {labels[line]}
          </button>
        )
      })}
    </div>
  )
}

// ─── Storefront ───────────────────────────────────────────────────────────────
export default function UnifiedPricingStorefront() {
  const { lang } = useI18n()
  const copy = getUnifiedPricingCopy(lang)
  const [activeTab, setActiveTab] = useState<ProductLine>('audit')

  const tiers = publicTiers(activeTab)
  const laneCopy = copy.lanes[activeTab]

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-10 font-sans text-text">
      <div className="mb-10 text-center">
        <div className="mb-3.5 inline-block rounded-full border border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {copy.shared.kicker}
        </div>
        <h1 className="mb-3 text-[clamp(28px,5vw,44px)] font-semibold leading-tight tracking-tight text-text">
          {copy.shared.pageTitle}
        </h1>
        <p className="mx-auto max-w-[560px] text-md leading-relaxed text-text-muted">
          {copy.shared.pageSubtitle}
        </p>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} labels={copy.shared.tabs} />

      <div className="mx-auto flex max-w-[1200px] flex-wrap items-stretch justify-center gap-5">
        {tiers.map((tier) => {
          const tierCopy = laneCopy.tiers[tier.id]
          if (!tierCopy) return null
          return <TierCard key={`${activeTab}:${tier.id}`} tier={tier} copy={tierCopy} shared={copy.shared} />
        })}
      </div>

      {/* Compliance safeguard — bottom-center of the pricing layout. Localized. */}
      <p className="mx-auto mt-12 max-w-[760px] text-center text-xs leading-relaxed text-text-muted">
        {copy.shared.disclaimer}
      </p>
    </main>
  )
}


