// saas/app/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import SignUpForm from '@/components/auth/SignUpForm';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 font-sans selection:bg-blue-500/30">
      {/* Navigation Header */}
      <header className="border-b border-slate-800/60 bg-[#0B0F19]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black tracking-tight text-white">SignalBoost</span>
          <span className="text-[10px] uppercase font-bold tracking-widest bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">SaaS</span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#languages" className="hover:text-white transition-colors">Languages</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
            Sign In
          </Link>
          <Link href="/dashboard" className="px-4 py-2 bg-[#FFC700] hover:bg-[#E5B300] active:scale-95 text-slate-950 text-sm font-semibold rounded-lg transition-all shadow-lg shadow-yellow-500/10">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 pt-20 pb-32 text-center space-y-8">
        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Build Native Multi-Language <br />
            Platforms <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">From Scratch with AI</span>
          </h1>
          <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
            Not just simple translation layers. Completely build, design, and manage entire landing pages, media assets, localized scripts, and user engagement reviews in 5 native structures simultaneously.
          </p>
        </div>

        {/* Primary Operational Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link href="/dashboard/video" className="w-full sm:w-auto px-6 py-3 bg-[#FFC700] hover:bg-[#E5B300] active:scale-95 text-slate-950 font-semibold rounded-lg text-sm transition-all shadow-lg shadow-yellow-500/10 text-center">
            Launch AI Website Generator
          </Link>
          <Link href="/dashboard" className="w-full sm:w-auto px-6 py-3 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium rounded-lg text-sm transition-all text-center">
            View Dashboard
          </Link>
        </div>

        {/* Feature Grid Visualizer */}
        <div id="features" className="pt-24 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="bg-[#111726] p-6 rounded-xl border border-slate-800/80 shadow-sm">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/20 mb-4">
              <span className="text-blue-400 text-lg">💻</span>
            </div>
            <h3 className="text-base font-bold text-white mb-2">Native Web Architecture</h3>
            <p className="text-xs text-slate-400 leading-relaxed">Generate semantic HTML/CSS visual frameworks completely optimized for lightning-fast speeds, skipping restrictive iframe elements.</p>
          </div>

          <div className="bg-[#111726] p-6 rounded-xl border border-slate-800/80 shadow-sm">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/20 mb-4">
              <span className="text-blue-400 text-lg">🎙️</span>
            </div>
            <h3 className="text-base font-bold text-white mb-2">Synchronized Media Generation</h3>
            <p className="text-xs text-slate-400 leading-relaxed">Create voice tracks and video advertisements completely synchronized inside the app dashboard, powered by multi-language neural logic.</p>
          </div>

          <div className="bg-[#111726] p-6 rounded-xl border border-slate-800/80 shadow-sm">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/20 mb-4">
              <span className="text-blue-400 text-lg">📊</span>
            </div>
            <h3 className="text-base font-bold text-white mb-2">Review Management</h3>
            <p className="text-xs text-slate-400 leading-relaxed">Analyze public client remarks and auto-generate promotional graphic structures to turn customer reviews into conversions.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
