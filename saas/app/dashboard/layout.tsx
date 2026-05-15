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
    <div className="min-h-screen bg-[#060913] text-slate-100 antialiased relative flex flex-col md:flex-row overflow-x-hidden">
      
      {/* 1. Ambient Backdrop Glows (Fathom-style background depth) */}
      <div 
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          filter: 'blur(120px)',
          pointerEvents: 'none',
          zIndex: 0
        }} 
      />
      
      <div 
        style={{
          position: 'absolute',
          bottom: '10%',
          right: '-10%',
          width: '45vw',
          height: '45vw',
          borderRadius: '50%',
          backgroundColor: 'rgba(147, 51, 234, 0.04)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
          zIndex: 0
        }} 
      />

      {/* 2. Real Fathom-Style Glassmorphism Sidebar Panel */}
      <aside 
        style={{
          backgroundColor: 'rgba(10, 15, 28, 0.35)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          zIndex: 10
        }}
        className="w-full md:w-64 border-b md:border-b-0 flex flex-col shrink-0 shadow-2xl shadow-black/80"
      >
        {/* Brand Banner */}
        <div className="p-6 border-b border-white/[0.05] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-lg font-black tracking-tight text-white group-hover:text-blue-400 transition-colors">SignalBoost</span>
            <span className="text-[9px] uppercase font-bold tracking-widest bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">Live</span>
          </Link>
        </div>

        {/* Menu Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <Link 
            href="/dashboard" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              isActive('/dashboard') 
                ? 'bg-blue-600 text-white font-semibold border-blue-400/20 shadow-lg' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.03] hover:text-white'
            }`}
          >
            <span>📊</span> Overview
          </Link>

          <Link 
            href="/dashboard/feeds" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              isActive('/dashboard/feeds') 
                ? 'bg-blue-600 text-white font-semibold border-blue-400/20 shadow-lg' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.03] hover:text-white'
            }`}
          >
            <span>📰</span> Feeds & Affiliates
          </Link>

          <Link 
            href="/dashboard/video" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              isActive('/dashboard/video') 
                ? 'bg-blue-600 text-white font-semibold border-blue-400/20 shadow-lg' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.03] hover:text-white'
            }`}
          >
            <span>🎙️</span> Video Generator
          </Link>

          <Link 
            href="/dashboard/metrics" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              isActive('/dashboard/metrics') 
                ? 'bg-blue-600 text-white font-semibold border-blue-400/20 shadow-lg' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.03] hover:text-white'
            }`}
          >
            <span>🪙</span> Metrics & Credits
          </Link>

          <Link 
            href="/dashboard/settings" 
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              isActive('/dashboard/settings') 
                ? 'bg-blue-600 text-white font-semibold border-blue-400/20 shadow-lg' 
                : 'text-slate-400 border-transparent hover:bg-white/[0.03] hover:text-white'
            }`}
          >
            <span>⚙️</span> Settings
          </Link>
        </nav>

        {/* Status Widget */}
        <div className="p-4 border-t border-white/[0.05] bg-white/[0.01] text-center">
          <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">System Node Status</p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full shadow-lg shadow-green-500/50 animate-pulse" />
            <span className="text-xs text-slate-400 font-medium">Production Online</span>
          </div>
        </div>
      </aside>

      {/* 3. Main Workspace Display Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full overflow-y-auto z-10 relative">
        {children}
      </main>

    </div>
  );
}
