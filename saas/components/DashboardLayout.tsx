// saas/components/DashboardLayout.tsx
'use client';

import React from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: LayoutProps) {
  return (
    <div className="flex bg-slate-50 min-h-screen text-slate-900">
      {/* Structural Sidebar component */}
      <Sidebar />
      
      {/* Main Execution Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="text-sm font-medium text-slate-500">
            Welcome back, System Operator
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Database Online
            </span>
          </div>
        </header>
        
        {/* Render Page Content inside here */}
        <main className="p-8 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
