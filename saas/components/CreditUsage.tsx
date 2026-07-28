"use client";

import { useTranslation } from "@/components/i18n/useTranslation";
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
  const { t } = useTranslation();
  const percent =
    totalCredits > 0 ? Math.min((usedCredits / totalCredits) * 100, 100) : 0;

  const isWarning = percent >= 80 && percent < 100;
  const isCritical = percent >= 100;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-4">
      <h3 className="mb-2 text-sm font-black text-yellow-400">{t('credits.usage.title', uiCopy('u_5e88e5a79ce5d6ea'))}</h3>

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
        {usedCredits} / {totalCredits} {t('credits.usage.used', uiCopy('u_81eff03d1a01f54f'))}
      </p>

      {isWarning && (
        <p className="mt-2 text-xs text-orange-400">
          {t('credits.usage.warning', uiCopy('u_f5d75f283453a5fa'))}
        </p>
      )}

      {isCritical && (
        <p className="mt-2 text-xs font-bold text-red-400">
          {autoTopUpEnabled
            ? t('credits.usage.autoTopup', uiCopy('u_7187c2a332734c92'))
            : t('credits.usage.limitReached', uiCopy('u_6bc31bcf3271ce87'))}
        </p>
      )}
    </div>
  );
}
