// saas/app/dashboard/layout.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Utility to highlight the active menu item dynamically
  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-[#0B0F19] flex flex-col md:flex-row text-slate-100 antialiased">
      
      {/* 1. Left Fixed Navigation Sidebar */}
      <aside className="w-full md:w-64 bg-[#111726] border-b md:border-b-0 md:border-r border-slate-800/80 flex flex-col shrink-0">
        {/* Brand Banner */}
        <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-lg font-black tracking-tight text-white group-hover:text-blue-400 transition-colors">SignalBoost</span>
            <span className="text-[9px] uppercase font-bold tracking-widest bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">Live</span>
          </Link>
        </div>

        {/* Navigation Routing Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <Link 
            href="/dashboard" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive('/dashboard') 
                ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/10' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <span>📊</span> Overview
          </Link>

          <Link 
            href="/dashboard/feeds" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive('/dashboard/feeds') 
                ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/10' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <span>📰</span> Feeds & Affiliates
          </Link>

          <Link 
            href="/dashboard/video" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive('/dashboard/video') 
                ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/10' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <span>🎙️</span> Video Generator
          </Link>

          <Link 
            href="/dashboard/metrics" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive('/dashboard/metrics') 
                ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/10' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <span>🪙</span> Metrics & Credits
          </Link>

          <Link 
            href="/dashboard/settings" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive('/dashboard/settings') 
                ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/10' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <span>⚙️</span> Settings
          </Link>
        </nav>

        {/* Workspace Footprint Info */}
        <div className="p-4 border-t border-slate-800/60 bg-[#0E1320] text-center">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">System Node Status</p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-slate-400 font-medium">Production Online</span>
          </div>
        </div>
      </aside>

      {/* 2. Main Injected Dashboard Content Display Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full overflow-y-auto">
        {children}
      </main>

    </div>
  );
}
