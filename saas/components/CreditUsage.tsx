"use client";

type Lang = "en" | "es" | "pt" | "pl" | "ru";

const COPY: Record<Lang, {
  title: string;
  used: (used: number, total: number) => string;
  warning: string;
  autoTopUp: string;
  limitReached: string;
}> = {
  en: {
    title: "Credit Usage",
    used: (u, t) => `${u} / ${t} credits used`,
    warning: "Over 80% used. Consider upgrading.",
    autoTopUp: "Auto top-up will add more credits.",
    limitReached: "Credit limit reached.",
  },
  es: {
    title: "Uso de créditos",
    used: (u, t) => `${u} / ${t} créditos usados`,
    warning: "Más del 80% usado. Considera actualizar tu plan.",
    autoTopUp: "La recarga automática añadirá más créditos.",
    limitReached: "Límite de créditos alcanzado.",
  },
  pt: {
    title: "Uso de créditos",
    used: (u, t) => `${u} / ${t} créditos usados`,
    warning: "Mais de 80% usado. Considere fazer upgrade.",
    autoTopUp: "A recarga automática adicionará mais créditos.",
    limitReached: "Limite de créditos atingido.",
  },
  pl: {
    title: "Zużycie kredytów",
    used: (u, t) => `${u} / ${t} kredytów użyto`,
    warning: "Ponad 80% wykorzystano. Rozważ aktualizację planu.",
    autoTopUp: "Automatyczne doładowanie doda więcej kredytów.",
    limitReached: "Osiągnięto limit kredytów.",
  },
  ru: {
    title: "Использование кредитов",
    used: (u, t) => `${u} / ${t} кредитов использовано`,
    warning: "Использовано более 80%. Рассмотрите обновление плана.",
    autoTopUp: "Автопополнение добавит больше кредитов.",
    limitReached: "Лимит кредитов исчерпан.",
  },
};

function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const l = navigator.language?.slice(0, 2);
  if (l === "es") return "es";
  if (l === "pt") return "pt";
  if (l === "pl") return "pl";
  if (l === "ru") return "ru";
  return "en";
}

interface Props {
  usedCredits: number;
  totalCredits: number;
  autoTopUpEnabled?: boolean;
}

export default function CreditUsage({
  usedCredits,
  totalCredits,
  autoTopUpEnabled = false,
}: Props) {
  const lang = detectLang();
  const c = COPY[lang];

  const percent =
    totalCredits > 0 ? Math.min((usedCredits / totalCredits) * 100, 100) : 0;

  const isWarning = percent >= 80 && percent < 100;
  const isCritical = percent >= 100;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-4">
      <h3 className="mb-2 text-sm font-black text-yellow-400">{c.title}</h3>

      <div className="h-3 w-full rounded-full bg-gray-800">
        <div
          className={`h-3 rounded-full ${
            isCritical
              ? "bg-red-500"
              : isWarning
              ? "bg-orange-400"
              : "bg-yellow-400"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-gray-300">
        {c.used(usedCredits, totalCredits)}
      </p>

      {isWarning && (
        <p className="mt-2 text-xs text-orange-400">{c.warning}</p>
      )}

      {isCritical && (
        <p className="mt-2 text-xs font-bold text-red-400">
          {autoTopUpEnabled ? c.autoTopUp : c.limitReached}
        </p>
      )}
    </div>
  );
}
