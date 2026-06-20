'use client';

/**
 * saas/app/dashboard/audit/pricing/page.tsx
 * Audit Pricing page — fully self-contained, defensive TypeScript.
 * No imports from platform plan types, infra-pr, or prRedact.
 */

import React from "react";
import { AUDIT_PRICING_CONFIG, getStripePriceId, formatAuditCount, AuditTier } from "@/lib/audit/pricingConfig";
import { getAuditPricingCopy, AuditLocale, AuditPageCopy, AuditTierCopy } from "@/lib/i18n/auditPricingCopy";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardProps {
  tier: AuditTier;
  copy: AuditTierCopy;
  pageCopy: AuditPageCopy;
}

interface PageState {
  locale: AuditLocale;
  loadingTierId: string | null;
  noticeTierId: string | null;
  errorTierId: string | null;
}

// ─── Tier Card ────────────────────────────────────────────────────────────────

function AuditTierCard({ tier, copy, pageCopy }: CardProps): React.ReactElement {
  const [loading, setLoading] = React.useState<boolean>(false);
  const [showNotice, setShowNotice] = React.useState<boolean>(false);
  const [showError, setShowError] = React.useState<boolean>(false);

  const isPopular: boolean = tier.isPopular;
  const isEnterprise: boolean = tier.isEnterprise;
  const auditLabel: string = formatAuditCount(tier.auditCount);

  async function handleClick(): Promise<void> {
    if (isEnterprise) return;
    const priceId: string = getStripePriceId(tier.stripePriceEnvKey);
    if (!priceId) {
      setShowNotice(true);
      return;
    }
    setLoading(true);
    setShowNotice(false);
    setShowError(false);
    try {
      const res: Response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data: { url?: string } = (await res.json()) as { url?: string };
      const url: string | undefined = data?.url;
      if (url && typeof window !== "undefined") {
        window.location.href = url;
      } else {
        setShowError(true);
      }
    } catch (_err: unknown) {
      setShowError(true);
    } finally {
      setLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    background: isPopular
      ? "linear-gradient(160deg, rgba(26,240,255,0.08), rgba(255,195,0,0.06))"
      : "linear-gradient(160deg, rgba(15,23,42,0.92), rgba(3,7,18,0.96))",
    border: isPopular ? "1px solid rgba(26,240,255,0.35)" : "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: "32px 28px",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: isPopular
      ? "0 24px 70px rgba(26,240,255,0.12), 0 8px 32px rgba(0,0,0,0.5)"
      : "0 24px 70px rgba(0,0,0,0.6)",
    minWidth: 0,
    flex: "1 1 260px",
    maxWidth: 340,
  };

  const popularBadgeStyle: React.CSSProperties = {
    position: "absolute",
    top: -14,
    left: "50%",
    transform: "translateX(-50%)",
    background: "linear-gradient(90deg, #ffc300, #1af0ff)",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.08em",
    padding: "4px 16px",
    borderRadius: 99,
    whiteSpace: "nowrap",
  };

  const auditBadgeStyle: React.CSSProperties = {
    display: "inline-block",
    background: "rgba(26,240,255,0.12)",
    border: "1px solid rgba(26,240,255,0.25)",
    color: "#1af0ff",
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 12px",
    borderRadius: 99,
    marginBottom: 16,
  };

  const priceStyle: React.CSSProperties = {
    fontSize: 48,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1,
    marginBottom: 4,
  };

  const perMonthStyle: React.CSSProperties = {
    fontSize: 16,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 20,
  };

  const featureListStyle: React.CSSProperties = {
    listStyle: "none",
    padding: 0,
    margin: "0 0 24px 0",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
  };

  const featureItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 1.5,
  };

  const checkStyle: React.CSSProperties = {
    color: "#1af0ff",
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  };

  const ctaStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "13px 0",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 15,
    textAlign: "center",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
    border: "none",
    background: isPopular
      ? "linear-gradient(90deg, #ffc300, #1af0ff)"
      : "rgba(255,255,255,0.08)",
    color: isPopular ? "#0f172a" : "#ffffff",
    textDecoration: "none",
    transition: "opacity 0.2s",
  };

  const noticeStyle: React.CSSProperties = {
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(255,195,0,0.08)",
    border: "1px solid rgba(255,195,0,0.25)",
    borderRadius: 10,
    color: "#ffc300",
    fontSize: 13,
    lineHeight: 1.5,
  };

  const errorStyle: React.CSSProperties = {
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(255,80,80,0.08)",
    border: "1px solid rgba(255,80,80,0.25)",
    borderRadius: 10,
    color: "#ff5050",
    fontSize: 13,
    lineHeight: 1.5,
  };

  return (
    <div style={cardStyle}>
      {isPopular && copy.popular && (
        <div style={popularBadgeStyle}>{copy.popular}</div>
      )}
      <div style={auditBadgeStyle}>{auditLabel}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>
        {copy.name}
      </div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20, lineHeight: 1.5 }}>
        {copy.description}
      </div>
      <div style={priceStyle}>{copy.priceLabel}</div>
      <div style={perMonthStyle}>{copy.perMonth}</div>
      <ul style={featureListStyle}>
        {copy.features.map((feature: string, i: number) => (
          <li key={i} style={featureItemStyle}>
            <span style={checkStyle}>✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {isEnterprise ? (
        <a href={pageCopy.enterpriseCtaHref} style={ctaStyle}>
          {copy.ctaLabel}
        </a>
      ) : (
        <button
          onClick={handleClick}
          disabled={loading}
          style={ctaStyle}
          type="button"
        >
          {loading ? pageCopy.loadingLabel : copy.ctaLabel}
        </button>
      )}
      {showNotice && !showError && (
        <div style={noticeStyle}>{pageCopy.notConfigured}</div>
      )}
      {showError && (
        <div style={errorStyle}>{pageCopy.errorLabel}</div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPricingPage(): React.ReactElement {
  const [locale, setLocale] = React.useState<AuditLocale>("en");
  const copy: AuditPageCopy = getAuditPricingCopy(locale);

  const locales: AuditLocale[] = ["en", "es", "pt", "pl", "ru"];

  const pageStyle: React.CSSProperties = {
    minHeight: "calc(100vh - 80px)",
    background: "linear-gradient(160deg, rgba(15,23,42,1) 0%, rgba(3,7,18,1) 100%)",
    padding: "60px 24px 80px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const headerStyle: React.CSSProperties = {
    textAlign: "center",
    marginBottom: 56,
    maxWidth: 640,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 40,
    fontWeight: 800,
    color: "#ffffff",
    marginBottom: 16,
    lineHeight: 1.15,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: 17,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.6,
  };

  const localeSwitcherStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
    marginBottom: 48,
    flexWrap: "wrap",
    justifyContent: "center",
  };

  const gridStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 24,
    justifyContent: "center",
    width: "100%",
    maxWidth: 1280,
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>{copy.pageTitle}</h1>
        <p style={subtitleStyle}>{copy.pageSubtitle}</p>
      </div>

      <div style={localeSwitcherStyle}>
        {locales.map((l: AuditLocale) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            type="button"
            style={{
              padding: "6px 16px",
              borderRadius: 99,
              border: locale === l ? "1px solid #1af0ff" : "1px solid rgba(255,255,255,0.12)",
              background: locale === l ? "rgba(26,240,255,0.12)" : "transparent",
              color: locale === l ? "#1af0ff" : "rgba(255,255,255,0.5)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <div style={gridStyle}>
        {AUDIT_PRICING_CONFIG.tiers.map((tier: AuditTier) => {
          const tierCopy: AuditTierCopy = copy.tiers[tier.id];
          return (
            <AuditTierCard
              key={tier.id}
              tier={tier}
              copy={tierCopy}
              pageCopy={copy}
            />
          );
        })}
      </div>
    </div>
  );
}
