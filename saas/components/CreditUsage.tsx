"use client";

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
  const percent =
    totalCredits > 0 ? Math.min((usedCredits / totalCredits) * 100, 100) : 0;

  const isWarning = percent >= 80 && percent < 100;
  const isCritical = percent >= 100;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111722]/80 p-4">
      <h3 className="mb-2 text-sm font-black text-yellow-400">Credit Usage</h3>

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
        {usedCredits} / {totalCredits} credits used
      </p>

      {isWarning && (
        <p className="mt-2 text-xs text-orange-400">
          Over 80% used. Consider upgrading.
        </p>
      )}

      {isCritical && (
        <p className="mt-2 text-xs font-bold text-red-400">
          {autoTopUpEnabled
            ? "Auto top-up will add more credits."
            : "Credit limit reached."}
        </p>
      )}
    </div>
  );
}
