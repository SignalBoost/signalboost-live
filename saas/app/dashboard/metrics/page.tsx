// saas/app/dashboard/metrics/page.tsx
'use client';

import React, { useState } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change: string;
  isPositive: boolean;
}

function MetricCard({ title, value, change, isPositive }: MetricCardProps) {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-3xl font-bold text-slate-900 tracking-tight">{value}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isPositive ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
        }`}>
          {change}
        </span>
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const [credits, setCredits] = useState(750);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const simulateSync = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Metrics & Credits Control</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor real-time infrastructure processing data and account balance states.</p>
        </div>
        <button 
          onClick={simulateSync}
          disabled={isRefreshing}
          className="inline-flex items-center justify-center px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
        >
          {isRefreshing ? 'Syncing Framework...' : 'Refresh Metrics'}
        </button>
      </div>

      {/* Analytics Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Network Clicks" value="5,235" change="+12.3%" isPositive={true} />
        <MetricCard title="System Conversions" value="243" change="+8.1%" isPositive={true} />
        <MetricCard title="Conversion Rate" value="4.64%" change="-0.2%" isPositive={false} />
        <MetricCard title="Gross Generated Revenue" value="$3,035.75" change="+24.5%" isPositive={true} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Token Logic Box */}
        <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 to-blue-950 text-white p-6 rounded-xl border border-slate-800 shadow-md flex flex-col justify-between min-h-[240px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">Account Access Tier</span>
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs font-semibold rounded border border-blue-500/30">Developer Pro</span>
            </div>
            <h3 className="text-lg font-bold mt-4 text-slate-100">SaaS Compute Units</h3>
            <p className="text-xs text-slate-400 mt-1">Tokens consumed whenever translation modules or voice generation engines run.</p>
          </div>
          
          <div className="mt-6">
            <div className="text-sm text-slate-400">Remaining Balance</div>
            <div className="text-4xl font-extrabold tracking-tight font-mono text-white mt-1">{credits} <span className="text-sm font-normal text-blue-400">Credits</span></div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Next Auto-Refill: 2026-06-01</span>
            <button className="text-blue-400 font-semibold hover:text-blue-300 transition-colors">Add Top-up</button>
          </div>
        </div>

        {/* Ledger Log Stream */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Recent Infrastructure Logs</h3>
          </div>
          <div className="divide-y divide-slate-100 text-sm">
            <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <p className="font-medium text-slate-900">OpenAI Voice Synthesis Deducted</p>
                <p className="text-xs text-slate-400 mt-0.5">Project ID: #SummerTravelDeal • Voice Model: Alloy</p>
              </div>
              <span className="font-mono text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-1 rounded">-15 Credits</span>
            </div>
            <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <p className="font-medium text-slate-900">OpenAI Voice Synthesis Deducted</p>
                <p className="text-xs text-slate-400 mt-0.5">Project ID: #MarketplaceProduct • Voice Model: Echo</p>
              </div>
              <span className="font-mono text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-1 rounded">-10 Credits</span>
            </div>
            <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div>
                <p className="font-medium text-slate-900">System Account Activation Bonus</p>
                <p className="text-xs text-slate-400 mt-0.5">Database Sign-up Allocation Trigger</p>
              </div>
              <span className="font-mono text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded">+500 Credits</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
