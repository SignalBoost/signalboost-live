// saas/app/dashboard/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-6 text-slate-100">
      {/* Header Section */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">System Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Welcome back. Here is the operational status of your marketing platforms.</p>
      </div>

      {/* Main Grid Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Panel 1: Fast Navigation Station */}
        <div className="bg-[#111726] p-6 rounded-xl border border-slate-800 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Quick Actions</h2>
            <p className="text-xs text-slate-400 mt-0.5">Jump directly to your modular control networks.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Link href="/dashboard/video" className="p-4 bg-[#0B0F19] hover:bg-blue-950/40 border border-slate-800 rounded-lg group transition-all">
              <span className="text-lg block mb-1">🎙️</span>
              <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">Video Generator</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Synthesize neural voice audio copy.</p>
            </Link>

            <Link href="/dashboard/feeds" className="p-4 bg-[#0B0F19] hover:bg-blue-950/40 border border-slate-800 rounded-lg group transition-all">
              <span className="text-lg block mb-1">📰</span>
              <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">Feeds & Affiliates</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Track active marketing campaigns.</p>
            </Link>
          </div>
        </div>

        {/* Panel 2: Live Metrics Snapshot */}
        <div className="bg-[#111726] p-6 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Account Balance Status</h2>
            <p className="text-xs text-slate-400 mt-0.5">Live token calculations for processing tasks.</p>
          </div>

          <div className="my-4">
            <div className="text-xs text-slate-500">Remaining Balance</div>
            <div className="text-4xl font-black text-white tracking-tight font-mono mt-1">
              750 <span className="text-sm font-medium text-blue-400">Credits</span>
            </div>
          </div>

          <Link href="/dashboard/metrics" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            View full analytic ledgers &rarr;
          </Link>
        </div>

      </div>

      {/* System Warning Banner (Until Supabase connects) */}
      <div className="bg-blue-950/20 border border-blue-900/50 p-4 rounded-xl flex items-start gap-3">
        <span className="text-base text-blue-400 mt-0.5">💡</span>
        <div>
          <h4 className="text-xs font-bold text-blue-300">Sandbox Environment Active</h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            The frontend layout nodes are working correctly. Next up, we can wire these components directly to your database once you are back at your main workspace computer.
          </p>
        </div>
      </div>
    </div>
  );
}
