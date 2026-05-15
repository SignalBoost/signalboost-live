// saas/app/dashboard/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-6 text-slate-100">
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">System Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Welcome back. Here is the operational status of your marketing platforms.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111726] p-6 rounded-xl border border-slate-800 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/dashboard/video" className="p-4 bg-black/20 hover:bg-white/[0.04] border border-white/[0.05] rounded-lg block">
              <span className="text-lg block mb-1">🎙️</span>
              <span className="text-xs font-bold text-white">Video Generator</span>
            </Link>
            <Link href="/dashboard/feeds" className="p-4 bg-black/20 hover:bg-white/[0.04] border border-white/[0.05] rounded-lg block">
              <span className="text-lg block mb-1">📰</span>
              <span className="text-xs font-bold text-white">Feeds & Affiliates</span>
            </Link>
          </div>
        </div>

        <div className="bg-[#111726] p-6 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Account Balance Status</h2>
          <div className="text-4xl font-black text-white tracking-tight font-mono my-4">750 Credits</div>
          <Link href="/dashboard/metrics" className="text-xs font-medium text-blue-400 hover:text-blue-300">
            View full analytic ledgers &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
