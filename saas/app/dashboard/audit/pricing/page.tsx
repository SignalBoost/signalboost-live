'use client';

/**
 * Audit Project — Pricing Page
 * Route: /dashboard/audit/pricing
 *
 * Completely self-contained. Imports ONLY from:
 *   - react
 *   - @/lib/audit/pricingConfig  (new file on this branch)
 *   - @/lib/i18n/auditPricingCopy (new file on this branch)
 *
 * Zero imports from core SaaS plan system, infra-pr, prRedact, or any
 * other existing platform file.
 */

import React, { useState } from 'react';
import {
  AUDIT_PRICING_CONFIG,
  AuditTier,
  formatAuditCount,
} from '@/lib/audit/pricingConfig';
import {
  getAuditPricingCopy,
  AuditPageCopy,
  AuditTierCopy,
} from '@/lib/i18n/auditPricingCopy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NoticeState {
  tierId: string;
  message: string;
}

interface CardProps {
  tier: AuditTier;
  copy: AuditTierCopy;
  popularBadge: string;
  onSelect: (tier: AuditTier) => void;
  notice: NoticeState | null;
  isLoading: boolean;
  activeTierId: string | null;
}

// ---------------------------------------------------------------------------
// Styles (all inline — no Tailwind utility classes)
// ---------------------------------------------------------------------------

const S: {
  page: React.CSSProperties;
  header: React.CSSProperties;
  eyebrow: React.CSSProperties;
  title: React.CSSProperties;
  subtitle: React.CSSProperties;
  grid: React.CSSProperties;
  popularBadge: React.CSSProperties;
  tierName: React.CSSProperties;
  priceRow: React.CSSProperties;
  priceAmount: React.CSSProperties;
  pricePeriod: React.CSSProperties;
  auditBadge: React.CSSProperties;
  description: React.CSSProperties;
  divider: React.CSSProperties;
  featureList: React.CSSProperties;
  featureItem: React.CSSProperties;
  featureDot: React.CSSProperties;
  noticeBox: React.CSSProperties;
  enterpriseLink: React.CSSProperties;
} = {
  page: {
    minHeight: 'calc(100vh - 80px)',
    background: 'linear-gradient(160deg, rgba(15,23,42,1) 0%, rgba(3,7,18,1) 100%)',
    padding: '60px 24px 80px',
    fontFamily: 'inherit',
  },
  header: {
    textAlign: 'center',
    marginBottom: '56px',
  },
  eyebrow: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#1af0ff',
    marginBottom: '16px',
  },
  title: {
    fontSize: 'clamp(28px, 4vw, 44px)',
    fontWeight: 800,
    color: '#ffffff',
    margin: '0 0 16px',
    lineHeight: 1.15,
  },
  subtitle: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.55)',
    margin: '0 auto',
    maxWidth: '520px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '24px',
    maxWidth: '1160px',
    margin: '0 auto',
  },
  popularBadge: {
    position: 'absolute',
    top: '-14px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'linear-gradient(90deg, #ffc300, #1af0ff)',
    color: 'rgba(3,7,18,1)',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '5px 18px',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  },
  tierName: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: '8px',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginBottom: '4px',
  },
  priceAmount: {
    fontSize: '48px',
    fontWeight: 800,
    color: '#ffffff',
    lineHeight: 1,
  },
  pricePeriod: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.45)',
    fontWeight: 400,
  },
  auditBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(26,240,255,0.1)',
    border: '1px solid rgba(26,240,255,0.2)',
    borderRadius: '999px',
    padding: '4px 14px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#1af0ff',
    marginBottom: '16px',
    marginTop: '8px',
    width: 'fit-content',
  },
  description: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.6,
    marginBottom: '24px',
    marginTop: '0',
  },
  divider: {
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    margin: '0 0 20px',
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flexGrow: 1,
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 1.5,
  },
  featureDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#1af0ff',
    flexShrink: 0,
    marginTop: '6px',
  },
  noticeBox: {
    marginTop: '14px',
    padding: '12px 16px',
    background: 'rgba(255,195,0,0.08)',
    border: '1px solid rgba(255,195,0,0.2)',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#ffc300',
    lineHeight: 1.5,
  },
  enterpriseLink: {
    display: 'block',
    width: '100%',
    padding: '14px 24px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 700,
    textAlign: 'center',
    textDecoration: 'none',
    cursor: 'pointer',
    letterSpacing: '0.02em',
    boxSizing: 'border-box',
  },
};

function cardStyle(isPopular: boolean): React.CSSProperties {
  return {
    background: isPopular
      ? 'linear-gradient(160deg, rgba(26,240,255,0.07) 0%, rgba(255,195,0,0.05) 100%)'
      : 'linear-gradient(160deg, rgba(15,23,42,0.92) 0%, rgba(3,7,18,0.96) 100%)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: isPopular
      ? '1px solid rgba(26,240,255,0.25)'
      : '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px',
    padding: '36px 28px 32px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    boxShadow: isPopular
      ? '0 24px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(26,240,255,0.1)'
      : '0 24px 70px rgba(0,0,0,0.4)',
    height: 'auto',
    minWidth: 0,
  };
}

function ctaButtonStyle(isPopular: boolean, disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '14px 24px',
    borderRadius: '12px',
    border: isPopular ? 'none' : '1px solid rgba(255,255,255,0.15)',
    background: isPopular
      ? 'linear-gradient(90deg, #ffc300, #1af0ff)'
      : 'rgba(255,255,255,0.06)',
    color: isPopular ? 'rgba(3,7,18,1)' : '#ffffff',
    fontSize: '15px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'opacity 0.2s ease',
    letterSpacing: '0.02em',
  };
}

// ---------------------------------------------------------------------------
// AuditTierCard component
// ---------------------------------------------------------------------------

function AuditTierCard({
  tier,
  copy,
  popularBadge,
  onSelect,
  notice,
  isLoading,
  activeTierId,
}: CardProps): React.ReactElement {
  const isPopular: boolean = tier.isPopular;
  const isEnterprise: boolean = tier.isEnterprise;
  const isThisLoading: boolean = isLoading && activeTierId === tier.id;
  const showNotice: boolean = notice !== null && notice.tierId === tier.id;

  // formatAuditCount is imported and used here for the audit badge display
  const auditDisplay: string = formatAuditCount(tier.audits);

  return (
    <div style={cardStyle(isPopular)}>
      {isPopular && (
        <div style={S.popularBadge}>{popularBadge}</div>
      )}

      <div style={S.tierName}>{copy.name}</div>

      <div style={S.priceRow}>
        <span style={S.priceAmount}>{copy.priceLabel}</span>
        <span style={S.pricePeriod}>{copy.perPeriod}</span>
      </div>

      <div style={S.auditBadge}>
        <span aria-hidden="true">◈</span>
        <span>{auditDisplay} {copy.auditLabel.replace(/^[\d\w]+ /, '')}</span>
      </div>

      <p style={S.description}>{copy.description}</p>

      <hr style={S.divider} />

      <ul style={S.featureList}>
        {copy.features.map((feature: string, idx: number) => (
          <li key={idx} style={S.featureItem}>
            <span style={S.featureDot} aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isEnterprise ? (
        <a
          href="mailto:sales@signalboostapp.com"
          style={S.enterpriseLink}
        >
          {copy.ctaLabel}
        </a>
      ) : (
        <button
          style={ctaButtonStyle(isPopular, isThisLoading)}
          disabled={isThisLoading}
          onClick={(): void => { onSelect(tier); }}
          type="button"
        >
          {isThisLoading ? '...' : copy.ctaLabel}
        </button>
      )}

      {showNotice && notice !== null && (
        <div style={S.noticeBox} role="alert">{notice.message}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component (default export — Next.js App Router compliant)
// ---------------------------------------------------------------------------

export default function AuditPricingPage(): React.ReactElement {
  const [locale] = useState<string>('en');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTierId, setActiveTierId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const copy: AuditPageCopy = getAuditPricingCopy(locale);

  async function handleSelectTier(tier: AuditTier): Promise<void> {
    if (tier.isEnterprise) return;

    setIsLoading(true);
    setActiveTierId(tier.id);
    setNotice(null);

    try {
      const res = await fetch('/api/audit/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId: tier.id }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(
          (): { error?: string } => ({})
        );
        setNotice({
          tierId: tier.id,
          message: data.error ?? copy.errorGeneric,
        });
        return;
      }

      const data: { url?: string } = await res.json().catch(
        (): { url?: string } => ({})
      );

      if (data.url !== undefined && data.url.length > 0) {
        window.location.href = data.url;
      } else {
        setNotice({
          tierId: tier.id,
          message: copy.notConfiguredNotice,
        });
      }
    } catch (_err: unknown) {
      setNotice({
        tierId: tier.id,
        message: copy.errorGeneric,
      });
    } finally {
      setIsLoading(false);
      setActiveTierId(null);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span style={S.eyebrow}>Audit Project</span>
        <h1 style={S.title}>{copy.pageTitle}</h1>
        <p style={S.subtitle}>{copy.pageSubtitle}</p>
      </div>

      <div style={S.grid}>
        {AUDIT_PRICING_CONFIG.tiers.map((tier: AuditTier) => {
          const tierCopy: AuditTierCopy = copy.tiers[tier.id];
          return (
            <AuditTierCard
              key={tier.id}
              tier={tier}
              copy={tierCopy}
              popularBadge={copy.popularBadge}
              onSelect={handleSelectTier}
              notice={notice}
              isLoading={isLoading}
              activeTierId={activeTierId}
            />
          );
        })}
      </div>
    </div>
  );
}
