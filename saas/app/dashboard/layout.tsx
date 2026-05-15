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
  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 antialiased relative overflow-x-hidden flex flex-col md:flex-row">
      
      {/* Premium Ambient Background Lighting (Glow behind the glass) */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none z-0 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-purple-600/5 blur-[100px] pointer-events-none z-0" />

      {/* 1. Fathom Frosted Glass Sidebar */}
      <aside className="w-full md:w-64 bg-[#111726]/30 backdrop-blur-xl border-b md:border-b-0 md:border-r border-white/[0.06] flex flex-col shrink-0 z-10 shadow-2xl shadow-black/40">
        
        {/* Brand Banner */}
        <div className="p-6 border-b border-white/[0.06] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-lg font-black tracking-tight text-white group-hover:text-blue-400 transition-colors">SignalBoost</span>
            <span className="text-[9px] uppercase font-bold tracking-widest bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 backdrop-blur-sm">Live</span>
          </Link>
        </div>

        {/* Glassmorphic Navigation Menu Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <Link 
            href="/dashboard" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
              isActive('/dashboard') 
                ? 'bg-blue-600/80 text-white font-semibold border-blue-400/30 shadow-lg shadow-blue-600/20 backdrop-blur-md' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-white hover:border-white/[0.05]'
            }`}
          >
            <span className="opacity-80">📊</span> Overview
          </Link>

          <Link 
            href="/dashboard/feeds" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
              isActive('/dashboard/feeds') 
                ? 'bg-blue-600/80 text-white font-semibold border-blue-400/30 shadow-lg shadow-blue-600/20 backdrop-blur-md' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-white hover:border-white/[0.05]'
            }`}
          >
            <span className="opacity-80">📰</span> Feeds & Affiliates
          </Link>

          <Link 
            href="/dashboard/video" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
              isActive('/dashboard/video') 
                ? 'bg-blue-600/80 text-white font-semibold border-blue-400/30 shadow-lg shadow-blue-600/20 backdrop-blur-md' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-white hover:border-white/[0.05]'
            }`}
          >
            <span className="opacity-80">🎙️</span> Video Generator
          </Link>

          <Link 
            href="/dashboard/metrics" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
              isActive('/dashboard/metrics') 
                ? 'bg-blue-600/80 text-white font-semibold border-blue-400/30 shadow-lg shadow-blue-600/20 backdrop-blur-md' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-white hover:border-white/[0.05]'
            }`}
          >
            <span className="opacity-80">🪙</span> Metrics & Credits
          </Link>

          <Link 
            href="/dashboard/settings" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border ${
              isActive('/dashboard/settings') 
                ? 'bg-blue-600/80 text-white font-semibold border-blue-400/30 shadow-lg shadow-blue-600/20 backdrop-blur-md' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-white hover:border-white/[0.05]'
            }`}
          >
            <span className="opacity-80">⚙️</span> Settings
          </Link>
        </nav>

        {/* Glass Status Widget */}
        <div className="p-4 border-t border-white/[0.06] bg-white/[0.01] text-center backdrop-blur-sm">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">System Node Status</p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full shadow-lg shadow-green-500/50 animate-pulse" />
            <span className="text-xs text-slate-400 font-medium tracking-wide">Production Online</span>
          </div>
        </div>
      </aside>

      {/* 2. Main Workspace Display Ingestion Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full overflow-y-auto z-10 relative">
        {children}
      </main>

    </div>
  );
}
