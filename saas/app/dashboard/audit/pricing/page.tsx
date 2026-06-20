'use client';

import React, { useState } from 'react';
import { AUDIT_PRICING_CONFIG, resolveStripePriceId, formatAuditCount } from '@/lib/audit/pricingConfig';
import { getAuditPricingCopy } from '@/lib/i18n/auditPricingCopy';
import type { AuditTier } from '@/lib/audit/pricingConfig';
import type { AuditPageCopy, AuditTierCopy } from '@/lib/i18n/auditPricingCopy';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface CardProps {
  tier: AuditTier;
  copy: AuditTierCopy;
  pageCopy: AuditPageCopy;
  onSelect: (tier: AuditTier) => void;
  loadingId: string | null;
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const S = {
  page: {
    minHeight: 'calc(100vh - 80px)',
    background: 'linear-gradient(160deg, rgba(15,23,42,1) 0%, rgba(3,7,18,1) 100%)',
    padding: '48px 24px 80px',
    boxSizing: 'border-box' as const,
  },
  inner: {
    maxWidth: 1100,
    margin: '0 auto',
  },
  eyebrow: {
    display: 'block',
    textAlign: 'center' as const,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: '#1af0ff',
    marginBottom: 12,
  },
  title: {
    textAlign: 'center' as const,
    fontSize: 'clamp(28px, 4vw, 42px)',
    fontWeight: 800,
    color: '#fff',
    margin: '0 0 12px',
    lineHeight: 1.15,
  },
  subtitle: {
    textAlign: 'center' as const,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    margin: '0 auto 52px',
    maxWidth: 560,
    lineHeight: 1.6,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 24,
    alignItems: 'start',
  },
  card: (highlighted: boolean): React.CSSProperties => ({
    background: highlighted
      ? 'linear-gradient(160deg, rgba(26,240,255,0.08), rgba(255,195,0,0.06))'
      : 'linear-gradient(160deg, rgba(15,23,42,0.92), rgba(3,7,18,0.96))',
    border: highlighted ? '1px solid rgba(26,240,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '32px 28px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    height: 'auto',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: highlighted ? '0 24px 70px rgba(26,240,255,0.12)' : '0 24px 70px rgba(0,0,0,0.6)',
    position: 'relative' as const,
    overflow: 'visible',
  }),
  popularBadge: {
    position: 'absolute' as const,
    top: -14,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'linear-gradient(90deg, #ffc300, #1af0ff)',
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    padding: '4px 16px',
    borderRadius: 99,
    whiteSpace: 'nowrap' as const,
  },
  auditBadge: {
    display: 'inline-block',
    background: 'rgba(26,240,255,0.12)',
    color: '#1af0ff',
    fontSize: 12,
    fontWeight: 700,
    padding: '4px 12px',
    borderRadius: 99,
    marginBottom: 16,
    border: '1px solid rgba(26,240,255,0.2)',
  },
  tierName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: 6,
  },
  price: {
    fontSize: 44,
    fontWeight: 900,
    color: '#fff',
    lineHeight: 1,
    marginBottom: 2,
  },
  billingNote: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 14,
  },
  description: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.6,
    marginBottom: 22,
    minHeight: 44,
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.07)',
    margin: '0 0 20px',
    border: 'none',
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 28px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  featureItem: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    lineHeight: 1.4,
  },
  featureCheck: {
    color: '#1af0ff',
    fontSize: 14,
    flexShrink: 0,
    marginTop: 1,
  },
  ctaButton: (highlighted: boolean, isLoading: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '13px 0',
    borderRadius: 12,
    border: 'none',
    fontSize: 15,
    fontWeight: 700,
    cursor: isLoading ? 'wait' : 'pointer',
    background: highlighted
      ? 'linear-gradient(90deg, #ffc300, #1af0ff)'
      : 'rgba(255,255,255,0.07)',
    color: highlighted ? '#0f172a' : '#fff',
    transition: 'opacity 0.2s',
    opacity: isLoading ? 0.6 : 1,
    marginTop: 'auto',
  }),
  notice: {
    marginTop: 16,
    padding: '12px 16px',
    background: 'rgba(255,195,0,0.08)',
    border: '1px solid rgba(255,195,0,0.2)',
    borderRadius: 10,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.5,
    textAlign: 'center' as const,
  },
  enterpriseLink: {
    display: 'block',
    width: '100%',
    padding: '13px 0',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    background: 'transparent',
    color: '#fff',
    textAlign: 'center' as const,
    textDecoration: 'none',
    marginTop: 'auto',
    boxSizing: 'border-box' as const,
  },
};

/* ─── Tier Card ──────────────────────────────────────────────────────────── */

function AuditTierCard({ tier, copy, pageCopy, onSelect, loadingId }: CardProps): React.ReactElement {
  const isLoading: boolean = loadingId === tier.id;
  const isEnterprise: boolean = tier.id === 'enterprise';
  const showPopular: boolean = tier.highlighted && copy.popularBadge.length > 0;

  return (
    <div style={S.card(tier.highlighted)}>
      {showPopular && <span style={S.popularBadge}>{copy.popularBadge}</span>}

      <span style={S.auditBadge}>{copy.auditBadge}</span>
      <div style={S.tierName}>{copy.name}</div>

      <div style={S.price}>
        {copy.priceLabel}
        <span style={{ fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>
          {copy.billingNote}
        </span>
      </div>

      <div style={S.billingNote}>
        {formatAuditCount(tier.auditsPerMonth)} audits included
      </div>

      <p style={S.description}>{copy.description}</p>

      <hr style={S.divider} />

      <ul style={S.featureList}>
        {copy.features.map((feature: string, idx: number) => (
          <li key={idx} style={S.featureItem}>
            <span style={S.featureCheck}>✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isEnterprise ? (
        <a
          href={pageCopy.enterpriseCtaHref}
          style={S.enterpriseLink}
        >
          {copy.ctaLabel}
        </a>
      ) : (
        <button
          style={S.ctaButton(tier.highlighted, isLoading)}
          onClick={() => onSelect(tier)}
          disabled={isLoading}
          type="button"
        >
          {isLoading ? pageCopy.loadingLabel : copy.ctaLabel}
        </button>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function AuditPricingPage(): React.ReactElement {
  const [locale] = useState<string>('en');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [noticeId, setNoticeId] = useState<string | null>(null);

  const pageCopy: AuditPageCopy = getAuditPricingCopy(locale);

  async function handleSelect(tier: AuditTier): Promise<void> {
    const priceId: string | null = resolveStripePriceId(tier);

    if (!priceId) {
      setNoticeId(tier.id);
      return;
    }

    setLoadingId(tier.id);
    setNoticeId(null);

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, tierType: 'audit', tierId: tier.id }),
      });

      if (!res.ok) {
        throw new Error(`Checkout request failed with status ${res.status}`);
      }

      const data: { url?: string } = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setNoticeId(tier.id);
      }
    } catch (_err: unknown) {
      setNoticeId(tier.id);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <span style={S.eyebrow}>Audit Project</span>
        <h1 style={S.title}>{pageCopy.pageTitle}</h1>
        <p style={S.subtitle}>{pageCopy.pageSubtitle}</p>

        <div style={S.grid}>
          {AUDIT_PRICING_CONFIG.tiers.map((tier: AuditTier) => {
            const tierCopy = pageCopy.tiers[tier.id];
            return (
              <div key={tier.id}>
                <AuditTierCard
                  tier={tier}
                  copy={tierCopy}
                  pageCopy={pageCopy}
                  onSelect={handleSelect}
                  loadingId={loadingId}
                />
                {noticeId === tier.id && (
                  <div style={S.notice}>{pageCopy.stripeNotConfigured}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
