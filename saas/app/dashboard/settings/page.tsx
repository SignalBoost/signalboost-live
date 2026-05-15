// saas/app/dashboard/settings/page.tsx
'use client';

import React, { useState } from 'react';

export default function SettingsPage() {
  const [platformName, setPlatformName] = useState('SignalBoost Live System');
  const [webhookUrl, setWebhookUrl] = useState('https://api.signalboost.live/v1/webhook/ingest');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoRefill, setAutoRefill] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    setTimeout(() => {
      setIsSaving(false);
      alert('System configurations saved successfully!');
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure account options, data sync webhooks, and routing rules.</p>
      </div>

      <div className="max-w-2xl bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSaveSettings} className="divide-y divide-slate-200">
          
          {/* Section 1: Project Metadata */}
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">General Workspace Settings</h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Platform Instance Label</label>
              <input
                type="text"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>
          </div>

          {/* Section 2: Webhooks & Endpoints */}
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Data Ingestion Channels</h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Affiliate Ingest Webhook Target</label>
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
              <p className="text-xs text-slate-400 mt-1">Direct destination address for processing traffic hooks from third-party travel and marketplace systems.</p>
            </div>
          </div>

          {/* Section 3: Notification Toggles */}
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Automation & Triggers</h2>
            
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-900 block">Email Generation Summaries</label>
                <span className="text-xs text-slate-500">Receive automated activity logs whenever video assets complete processing.</span>
              </div>
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <label className="text-sm font-medium text-slate-900 block">Automatic Compute Top-up</label>
                <span className="text-xs text-slate-500">Automatically reload system balance credits when balance falls below 50 units.</span>
              </div>
              <input
                type="checkbox"
                checked={autoRefill}
                onChange={(e) => setAutoRefill(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Save Action Bar */}
          <div className="px-6 py-4 bg-slate-50 flex items-center justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isSaving ? 'Updating Rules...' : 'Save Configuration'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
