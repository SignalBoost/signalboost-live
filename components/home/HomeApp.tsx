"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import ConciergeHero from "./ConciergeHero";
import ModuleGrid from "@/components/ModuleGrid";
import useTranslation from "@/components/i18n/useTranslation";
import partners from "@/partners.json";

interface HomeAppProps {
  lang?: string;
  regionName?: string;
  afterHero?: React.ReactNode;
}

type HomepagePartner = {
  id: string;
  name: string;
  logo?: string;
  description?: string;
  category_key?: string;
  category_label?: string;
  category?: string;
  network?: string;
  featured?: boolean;
};

// Live tool + licensing inbox (same as the Campaign Studio public page).
const CAMPAIGN_STUDIO = "/campaign-studio";
const LICENSE_CONTACT =
  "mailto:partners@signalboostapp.com?subject=Licensing%20SignalBoost%20modules";

// Portable, sellable engines. Outcome one-liners only — no mechanics exposed.
// `tag`: 'live' = shipped, 'preview' = available by request.
type Portable = {
  key: string;
  glyph: string;
  name: string;
  desc: string;
  tag: "live" | "preview";
  href?: string; // only Campaign Studio has a public product page today
};

const PORTABLES: Portable[] = [
  {
    key: "campaignStudio",
    glyph: "✦",
    name: "Campaign Studio",
    desc: "One brief in — a finished, branded campaign out: script, voiceover, and video.",
    tag: "live",
    href: CAMPAIGN_STUDIO,
  },
  {
    key: "render",
    glyph: "◍",
    name: "Render Engine",
    desc: "Portable voiceover and branded video rendering with prepaid-credit safety built in.",
    tag: "live",
  },
  {
    key: "console",
    glyph: "◈",
    name: "Console Hub",
    desc: "Operator console with an encrypted key vault, webhooks, logs, deployments, and audit.",
    tag: "live",
  },
  {
    key: "marketingSales",
    glyph: "◎",
    name: "Marketing + Sales",
    desc: "Campaign orchestration and sales workflows as one embeddable module.",
    tag: "live",
  },
  {
    key: "chiefOfStaff",
    glyph: "❖",
    name: "Chief-of-Staff Engine",
    desc: "An AI operator that observes, plans, and executes — always under human approval.",
    tag: "preview",
  },
  {
    key: "browserRuntime",
    glyph: "◇",
    name: "Browser Runtime",
    desc: "Bounded, verifiable browser automation with mandatory approval checkpoints.",
    tag: "preview",
  },
];

function fallbackText(value: string, fallback: string) {
  return /^[a-zA-Z][\w$]*(\.[\w$]+)+$/.test(value) ? fallback : value;
}

// Reusable Fathom-style floating panel. Every homepage section is wrapped in
// one so the whole page reads as a stack of embedded cards on a soft surface.
function Panel({ children }: { children: React.ReactNode }) {
  return <section style={styles.panel}>{children}</section>;
}

export default function HomeApp({ afterHero }: HomeAppProps) {
  const { t } = useTranslation();

  const categories = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const partner of partners as HomepagePartner[]) {
      const key = partner.category_key || partner.category || "other";
      const label = partner.category_label || partner.category || "Other";
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, label, count: 1 });
    }
    return Array.from(map.values());
  }, []);

  const partnerSingular = fallbackText(t("home.partnerSingular"), "partner");
  const partnerPlural = fallbackText(t("home.partnerPlural"), "partners");

  return (
    <main style={styles.mainCanvas}>
      <div style={styles.bgGlow} aria-hidden="true" />
      <div style={styles.bgGrain} aria-hidden="true" />

      <div style={styles.pageStack}>
        {/* Hero (already a self-contained panel) */}
        <ConciergeHero />

        {afterHero}

        {/* ---- Browse by category ---- */}
        <Panel>
          <div style={styles.sectionHeaderZone}>
            <span style={styles.sectionBadge}>{fallbackText(t("home.marketplaceBadge"), "Partner marketplace")}</span>
            <h2 style={styles.sectionHeading}>{fallbackText(t("home.marketplaceHeading"), "Browse trusted partners by category")}</h2>
          </div>

          <div style={styles.categoryGrid}>
            {categories.map((category) => (
              <Link key={category.key}
                href={`/marketplace?category=${category.key}`}
                style={styles.categoryCard}
                aria-label={fallbackText(t("home.browseCategoryAria"), `Browse ${category.label} partners`).replace("{label}", fallbackText(t(`categories.${category.key}`), category.label))}
              >
                <span style={styles.categoryCardCopy}>
                  <span style={styles.categoryName}>{fallbackText(t(`categories.${category.key}`), category.label)}</span>
                  <span style={styles.categoryMeta}>
                    {category.count} {category.count === 1 ? partnerSingular : partnerPlural}
                  </span>
                </span>
                <span style={styles.categoryArrow} aria-hidden="true">→</span>
              </Link>
            ))}
          </div>

          <div style={styles.browseAllRow}>
            <Link href="/marketplace" style={styles.browseAllButton}>
              {fallbackText(t("home.viewFullMarketplace"), "View the full marketplace")}
            </Link>
          </div>
        </Panel>

        {/* ---- Workspace modules ---- */}
        <Panel>
          <div style={styles.sectionHeaderZone}>
            <span style={styles.sectionBadge}>{fallbackText(t("home.modulesBadge"), "Workspace modules")}</span>
            <h2 style={styles.sectionHeading}>{fallbackText(t("home.modulesHeading"), "Promote, assist, price, and report after the hero flow")}</h2>
          </div>
          <ModuleGrid />
        </Panel>

        {/* ---- License the engines (portable modules for sale) ---- */}
        <Panel>
          <div style={styles.sectionHeaderZone}>
            <span style={styles.sectionBadge}>{fallbackText(t("home.portablesBadge"), "Portable engines")}</span>
            <h2 style={styles.sectionHeading}>{fallbackText(t("home.portablesHeading"), "License the engines behind SignalBoost")}</h2>
            <p style={styles.portablesSub}>
              {fallbackText(
                t("home.portablesSub"),
                "Self-contained, AI-driven and human-monitored modules you can license and embed in your own stack.",
              )}
            </p>
          </div>

          <div style={styles.portablesGrid}>
            {PORTABLES.map((p) => {
              const desc = fallbackText(t(`portables.${p.key}`), p.desc);
              const tagLabel =
                p.tag === "live"
                  ? fallbackText(t("home.portableLive"), "Live")
                  : fallbackText(t("home.portablePreview"), "Preview");
              const inner = (
                <>
                  <div style={styles.portableTop}>
                    <span style={styles.portableIcon} aria-hidden="true">{p.glyph}</span>
                    <span style={p.tag === "live" ? styles.tagLive : styles.tagPreview}>{tagLabel}</span>
                  </div>
                  <span style={styles.portableName}>{p.name}</span>
                  <span style={styles.portableDesc}>{desc}</span>
                  {p.href ? <span style={styles.portableLink} aria-hidden="true">{fallbackText(t("home.portableSeeLive"), "See it live")} →</span> : null}
                </>
              );
              return p.href ? (
                <Link key={p.key} href={p.href} style={styles.portableCard}>{inner}</Link>
              ) : (
                <div key={p.key} style={styles.portableCard}>{inner}</div>
              );
            })}
          </div>

          <div style={styles.portablesCtaRow}>
            <a style={styles.licenseButton} href={LICENSE_CONTACT}>
              {fallbackText(t("home.portablesLicenseCta"), "License the engines")} →
            </a>
            <Link href={CAMPAIGN_STUDIO} style={styles.browseAllButton}>
              {fallbackText(t("home.portablesStudioCta"), "See Campaign Studio live")}
            </Link>
          </div>
        </Panel>

        {/* ---- How it works ---- */}
        <Panel>
          <div style={styles.sectionHeaderZone}>
            <span style={styles.sectionBadge}>{fallbackText(t("home.howBadge"), "How it works")}</span>
            <h2 style={styles.sectionHeading}>{fallbackText(t("home.howHeading"), "From discovery to booking in four steps")}</h2>
          </div>

          <div style={styles.stepsGrid}>
            <div style={styles.stepGlassCard}>
              <div style={styles.stepNumberBadge}>01</div>
              <p style={styles.stepBodyText}>{fallbackText(t("home.step1"), "Search or describe what you need.")}</p>
            </div>
            <div style={styles.stepGlassCard}>
              <div style={styles.stepNumberBadge}>02</div>
              <p style={styles.stepBodyText}>{fallbackText(t("home.step2"), "We match you with trusted partners in your region.")}</p>
            </div>
            <div style={styles.stepGlassCard}>
              <div style={styles.stepNumberBadge}>03</div>
              <p style={styles.stepBodyText}>{fallbackText(t("home.step3"), "Compare options and pick the partner that fits.")}</p>
            </div>
            <div style={styles.stepGlassCard}>
              <div style={styles.stepNumberBadge}>04</div>
              <p style={styles.stepBodyText}>{fallbackText(t("home.step4"), "Click through and book directly with the partner.")}</p>
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  mainCanvas: { position: "relative", backgroundColor: "#06060a", minHeight: "100vh", overflowX: "hidden" },

  bgGlow: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(60vw 50vh at 22% -5%, rgba(245,197,66,.10), transparent 60%), radial-gradient(50vw 46vh at 88% 8%, rgba(34,211,238,.06), transparent 60%), linear-gradient(180deg,#06060a,#08080f)",
  },
  bgGrain: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    opacity: 0.025,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  },

  pageStack: {
    position: "relative",
    zIndex: 1,
    maxWidth: "100%",
    margin: "0 auto",
    padding: "0 0 80px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },

  panel: {
    position: "relative",
    borderRadius: "28px",
    border: "1px solid rgba(255,255,255,.08)",
    background: "linear-gradient(180deg, rgba(17,17,24,.72), rgba(9,9,15,.72))",
    backdropFilter: "saturate(140%) blur(14px)",
    WebkitBackdropFilter: "saturate(140%) blur(14px)",
    boxShadow: "0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.05)",
    padding: "clamp(28px, 4vw, 56px)",
  },

  sectionHeaderZone: { textAlign: "center", marginBottom: "36px" },
  sectionBadge: { fontSize: "11px", fontWeight: 700, color: "#dfa837", letterSpacing: "0.2em", textTransform: "uppercase" },
  sectionHeading: { fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 600, color: "#ffffff", marginTop: "8px", letterSpacing: "-0.02em" },

  categoryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "14px" },
  categoryCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    backgroundColor: "rgba(15, 15, 22, 0.6)",
    border: "1px solid rgba(245, 197, 66, 0.14)",
    borderRadius: "18px",
    padding: "18px 20px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
    textDecoration: "none",
    minHeight: "84px",
  },
  categoryCardCopy: { display: "flex", flexDirection: "column", minWidth: 0 },
  categoryName: { fontSize: "16px", fontWeight: 800, color: "#f8fafc" },
  categoryMeta: { fontSize: "12px", color: "#dfa837", fontWeight: 800, marginTop: "4px" },
  categoryArrow: { color: "#f5c542", fontSize: "18px", fontWeight: 900, flexShrink: 0 },

  browseAllRow: { display: "flex", justifyContent: "center", marginTop: "36px" },
  browseAllButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,.14)",
    background: "rgba(255,255,255,.06)",
    color: "#fff",
    minHeight: "48px",
    padding: "0 26px",
    fontWeight: 900,
    fontSize: "14px",
    textDecoration: "none",
  },

  // ---- Portable engines ----
  portablesSub: {
    maxWidth: "640px",
    margin: "12px auto 0",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#94a3b8",
    fontWeight: 500,
  },
  portablesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" },
  portableCard: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: "rgba(15, 15, 22, 0.6)",
    border: "1px solid rgba(245, 197, 66, 0.14)",
    borderRadius: "20px",
    padding: "22px 22px 24px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
    textDecoration: "none",
    minHeight: "150px",
  },
  portableTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  portableIcon: {
    display: "grid",
    placeItems: "center",
    width: "38px",
    height: "38px",
    borderRadius: "12px",
    border: "1px solid rgba(245,197,66,.4)",
    color: "#f5c542",
    fontSize: "18px",
  },
  tagLive: {
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#0b0b10",
    background: "#e7bd5c",
    borderRadius: "999px",
    padding: "4px 10px",
  },
  tagPreview: {
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#aeb6c9",
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: "999px",
    padding: "3px 9px",
  },
  portableName: { fontSize: "18px", fontWeight: 800, color: "#f8fafc", marginTop: "4px" },
  portableDesc: { fontSize: "13.5px", lineHeight: 1.55, color: "#9aa4b9", fontWeight: 500 },
  portableLink: { marginTop: "auto", fontSize: "12px", fontWeight: 800, color: "#f5c542", letterSpacing: "0.02em" },

  portablesCtaRow: { display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "36px" },
  licenseButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    border: "1px solid rgba(231,189,92,.5)",
    background: "linear-gradient(180deg,#f5c451,#e2a233)",
    color: "#0b0b10",
    minHeight: "48px",
    padding: "0 28px",
    fontWeight: 900,
    fontSize: "14px",
    textDecoration: "none",
  },

  stepsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" },
  stepGlassCard: {
    backgroundColor: "rgba(10, 10, 15, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    padding: "30px 24px",
    borderRadius: "18px",
    textAlign: "left",
  },
  stepNumberBadge: {
    width: "32px",
    height: "32px",
    backgroundColor: "rgba(223, 168, 55, 0.08)",
    border: "1px solid rgba(223, 168, 55, 0.25)",
    color: "#dfa837",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "13px",
    marginBottom: "20px",
  },
  stepBodyText: { fontSize: "15px", color: "#94a3b8", fontWeight: 500, margin: 0, lineHeight: "1.6" },
};
