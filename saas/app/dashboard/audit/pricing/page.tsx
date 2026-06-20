"use client";

/**
 * saas/app/dashboard/audit/pricing/page.tsx
 * Audit Project — standalone pricing page.
 * Route: /dashboard/audit/pricing
 *
 * Self-contained: imports ONLY from our two new audit modules.
 * Zero dependency on core SaaS plan types, credits engine, or webhook system.
 * Defensive TypeScript: every prop, state, and handler is explicitly typed.
 * Layout: fluid glassmorphic grid — no fixed heights, 80px navbar respected.
 */

import React, { useState } from "react";
import {
  getAuditPricingConfig,
  formatAuditCount,
  AuditTier,
  AuditCount,
} from "@/lib/audit/pricingConfig";
import {
  getAuditPricingCopy,
  AuditLocale,
  AuditPageCopy,
  AuditTierCopy,
} from "@/lib/i18n/auditPricingCopy";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
}

interface AuditCardProps {
  tier: AuditTier;
  copy: AuditTierCopy;
  perMonth: string;
  notConfiguredMsg: string;
  contactSalesLabel: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PopularBadge({ label }: BadgeProps): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 12px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        background: "linear-gradient(90deg, #ffc300, #1af0ff)",
        color: "#0f172a",
        marginBottom: 12,
      }}
    >
      {label}
    </span>
  );
}

function AuditCountBadge({ count }: { count: AuditCount }): React.ReactElement {
  const label: string = formatAuditCount(count);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 20,
        background: "rgba(26,240,255,0.10)",
        border: "1px solid rgba(26,240,255,0.25)",
        color: "#1af0ff",
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 20,
      }}
    >
      <span style={{ fontSize: 16 }}>✦</span>
      {label}
    </div>
  );
}

function AuditCard({
  tier,
  copy,
  perMonth,
  notConfiguredMsg,
  contactSalesLabel,
}: AuditCardProps): React.ReactElement {
  const [loading, setLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<string>("");

  const isEnterprise: boolean = tier.id === "audit_enterprise";
  const isPopular: boolean = tier.isPopular;

  async function handleClick(): Promise<void> {
    if (isEnterprise) {
      window.location.href = "mailto:sales@signalboostapp.com";
      return;
    }
    if (!tier.stripePriceId) {
      setNotice(notConfiguredMsg);
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: tier.stripePriceId }),
      });
      const data: { url?: string } = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setNotice(notConfiguredMsg);
      }
    } catch (_err: unknown) {
      setNotice(notConfiguredMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        padding: "32px 28px",
        background: isPopular
          ? "linear-gradient(160deg, rgba(255,195,0,0.08), rgba(26,240,255,0.06))"
          : "linear-gradient(160deg, rgba(15,23,42,0.92), rgba(3,7,18,0.96))",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: isPopular
          ? "1px solid rgba(255,195,0,0.35)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column" as const,
        gap: 0,
        minWidth: 0,
        height: "auto",
      }}
    >
      {/* Popular badge */}
      {isPopular && copy.popularBadge ? (
        <PopularBadge label={copy.popularBadge} />
      ) : (
        <div style={{ height: 28 }} />
      )}

      {/* Tier name */}
      <h3
        style={{
          margin: "0 0 6px",
          fontSize: 20,
          fontWeight: 700,
          color: isPopular ? "#ffc300" : "#ffffff",
          letterSpacing: "-0.01em",
        }}
      >
        {copy.name}
      </h3>

      {/* Description */}
      <p
        style={{
          margin: "0 0 20px",
          fontSize: 14,
          color: "rgba(255,255,255,0.55)",
          lineHeight: 1.5,
          minHeight: 42,
        }}
      >
        {copy.description}
      </p>

      {/* Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 16 }}>
        <span
          style={{
            fontSize: 42,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {tier.priceDisplay}
        </span>
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.45)" }}>{perMonth}</span>
      </div>

      {/* Audit count badge */}
      <AuditCountBadge count={tier.auditCount} />

      {/* Feature list */}
      <ul
        style={{
          listStyle: "none",
          margin: "0 0 28px",
          padding: 0,
          display: "flex",
          flexDirection: "column" as const,
          gap: 10,
          flex: 1,
        }}
      >
        {copy.features.map(
          (feature: string): React.ReactElement => (
            <li
              key={feature}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 13,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1.45,
              }}
            >
              <span style={{ color: "#1af0ff", flexShrink: 0, marginTop: 1 }}>✓</span>
              {feature}
            </li>
          )
        )}
      </ul>

      {/* CTA */}
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: "100%",
          padding: "13px 0",
          borderRadius: 12,
          border: isPopular ? "none" : "1px solid rgba(255,255,255,0.15)",
          background: isPopular
            ? "linear-gradient(90deg, #ffc300, #1af0ff)"
            : "rgba(255,255,255,0.06)",
          color: isPopular ? "#0f172a" : "#ffffff",
          fontSize: 15,
          fontWeight: 700,
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1,
          transition: "opacity 0.2s",
          letterSpacing: "0.01em",
        }}
      >
        {loading ? "…" : isEnterprise ? contactSalesLabel : copy.ctaLabel}
      </button>

      {/* Notice */}
      {notice ? (
        <p
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "rgba(255,195,0,0.85)",
            textAlign: "center" as const,
            lineHeight: 1.4,
          }}
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}

// ─── Locale selector ──────────────────────────────────────────────────────────

const LOCALES: { code: AuditLocale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt", label: "PT" },
  { code: "pl", label: "PL" },
  { code: "ru", label: "RU" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPricingPage(): React.ReactElement {
  const [locale, setLocale] = useState<AuditLocale>("en");

  const copy: AuditPageCopy = getAuditPricingCopy(locale);
  const { tiers } = getAuditPricingConfig();

  return (
    <div
      style={{
        minHeight: "calc(100vh - 80px)",
        background: "linear-gradient(160deg, rgba(15,23,42,1) 0%, rgba(3,7,18,1) 100%)",
        padding: "48px 24px 80px",
        boxSizing: "border-box" as const,
      }}
    >
      {/* Locale switcher */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginBottom: 40,
          maxWidth: 1100,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {LOCALES.map(
          (loc: { code: AuditLocale; label: string }): React.ReactElement => (
            <button
              key={loc.code}
              onClick={(): void => setLocale(loc.code)}
              style={{
                padding: "5px 14px",
                borderRadius: 8,
                border:
                  locale === loc.code
                    ? "1px solid #1af0ff"
                    : "1px solid rgba(255,255,255,0.12)",
                background:
                  locale === loc.code ? "rgba(26,240,255,0.12)" : "transparent",
                color: locale === loc.code ? "#1af0ff" : "rgba(255,255,255,0.5)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.06em",
                transition: "all 0.15s",
              }}
            >
              {loc.label}
            </button>
          )
        )}
      </div>

      {/* Header */}
      <div
        style={{
          textAlign: "center" as const,
          marginBottom: 56,
          maxWidth: 600,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <h1
          style={{
            fontSize: 38,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            margin: "0 0 14px",
            lineHeight: 1.15,
          }}
        >
          {copy.pageTitle}
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.55)",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {copy.pageSubtitle}
        </p>
      </div>

      {/* Tier grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 24,
          maxWidth: 1100,
          marginLeft: "auto",
          marginRight: "auto",
          alignItems: "start",
        }}
      >
        {tiers.map(
          (tier: AuditTier): React.ReactElement => (
            <AuditCard
              key={tier.id}
              tier={tier}
              copy={copy.tiers[tier.id]}
              perMonth={copy.perMonth}
              notConfiguredMsg={copy.notConfigured}
              contactSalesLabel={copy.contactSales}
            />
          )
        )}
      </div>
    </div>
  );
}
