// saas/components/Topbar.tsx
"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.ts";
import { useI18n } from "@/components/i18n/I18nProvider";
import { t } from "@/lib/i18n/t";
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const PLAN_STYLES: Record<string, { labelKey: string; fallback: string; bg: string; color: string }> = {
  free:     { labelKey: "plan.free", fallback: uiCopy('u_a96e2af89fc18ffb'), bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" },
  starter:  { labelKey: "plan.starter", fallback: uiCopy('u_3989bde0c654ce39'), bg: "rgba(59,130,246,0.18)",  color: "#7ab8ff" },
  pro:      { labelKey: "plan.pro", fallback: uiCopy('u_1354560c854a6841'), bg: "rgba(255,195,0,0.18)",   color: "#ffc300" },
  business: { labelKey: "plan.business", fallback: uiCopy('u_82cb271d997e9cfd'), bg: "rgba(74,222,128,0.18)",  color: "#4ade80" },
};

export default function Topbar() {
  const { dict } = useI18n();
  const [name, setName] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [credits, setCredits] = useState<number>(0);
  const [signedIn, setSignedIn] = useState<boolean>(false);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setSignedIn(true);
      try {
        const res = await fetch("/api/credits");
        const data = await res.json();
        if (typeof data.credits === "number") setCredits(data.credits);
        if (data.plan) setPlan(data.plan);
        if (data.name) setName(data.name);
        else setName(user.email ?? null);
      } catch {
        setName(user.email ?? null);
      }
    };
    fetchUser();
  }, []);

  if (!signedIn) return null;

  const planStyle = PLAN_STYLES[plan] || PLAN_STYLES.free;

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 16,
        padding: "10px 20px",
        background: "rgba(10, 14, 26, 0.6)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,195,0,0.95)", fontFamily: "monospace" }}>
        ⚡ {credits} {credits === 1 ? t(dict, "topbar.credit", uiCopy('u_f3cd72c0b69b4e11')) : t(dict, "topbar.credits", uiCopy('u_3fa5152b241b271f'))}
      </span>

      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.06em",
          padding: "4px 10px",
          borderRadius: 999,
          background: planStyle.bg,
          color: planStyle.color,
          fontFamily: "monospace",
        }}
      >
        {t(dict, planStyle.labelKey, planStyle.fallback)}
      </span>

      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
        {name ?? t(dict, "topbar.account", uiCopy('u_bac23feca0cc78a3'))}
      </span>
    </header>
  );
}
