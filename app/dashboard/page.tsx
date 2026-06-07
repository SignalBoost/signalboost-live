import Link from "next/link";
import { signalBoostModules } from "@/lib/platform/unifiedPlatform";
import { adminTelemetrySummary } from "@/lib/admin/saasTelemetry";
import { formatSubscription } from "@/lib/account/plan";

const onboardingChecklist = [
  { label: "Confirm business profile", detail: "Add brand name, service area, and primary customer segment.", href: "/dashboard/brand", done: true, owner: "Brand" },
  { label: "Plan first promotion", detail: "Choose an offer, language, and launch window.", href: "/dashboard/promote", done: false, owner: "Growth" },
  { label: "Import lead or customer list", detail: "Prepare CSV rows for Outreach and review requests.", href: "/dashboard/spreadsheets", done: false, owner: "Data" },
  { label: "Schedule follow-up rhythm", detail: "Block review asks, partner check-ins, and campaign reporting.", href: "/dashboard/calendar", done: false, owner: "Ops" },
];

export default function DashboardPage({ user }) {
  const subscription = user.subscription;
  const completedItems = onboardingChecklist.filter((item) => item.done).length;
  const completion = Math.round((completedItems / onboardingChecklist.length) * 100);
  const nextChecklistItem = onboardingChecklist.find((item) => !item.done);

  return (
    <main className="min-h-screen text-white">
      {/* Hero + subscription badge */}
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.2),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-5 shadow-2xl md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">SignalBoost operations cockpit</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
              Run promotions, reviews, outreach, and local growth from one workspace.
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-white/70">
              Start with a focused onboarding path, then move work through Calendar, Spreadsheets, Reviews, Outreach, Promote Business, and Concierge AI.
            </p>
          </div>
          <div className="rounded-3xl border border-[#FFD700]/25 bg-black/35 p-5 xl:w-80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-white/50">Onboarding progress</p>
                <p className="mt-2 text-4xl font-black text-[#FFD700]">{completion}%</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/60">Foundation</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#FFD700]" style={{ width: `${completion}%` }} />
            </div>
            <p className="mt-3 text-sm text-white/60">{completedItems} of {onboardingChecklist.length} setup steps complete.</p>
            {nextChecklistItem ? (
              <Link href={nextChecklistItem.href} className="mt-4 block rounded-full bg-[#FFD700] px-4 py-2 text-center text-sm font-bold text-black no-underline">
                Next: {nextChecklistItem.label}
              </Link>
            ) : null}
            <p className="mt-4 text-sm text-white/70">{formatSubscription(subscription)}</p>
          </div>
        </div>
      </section>

      {/* Other sections remain unchanged (metrics, quick actions, activity, modules, admin telemetry) */}
      {/* ... keep your existing code from the uploaded document here ... */}
    </main>
  );
}
