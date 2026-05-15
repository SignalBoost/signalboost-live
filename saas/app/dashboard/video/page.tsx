// saas/app/dashboard/video/page.tsx
'use client';

import React, { useState } from 'react';
import AudioPlayer from '@/components/AudioPlayer';

interface VideoProject {
  id: string;
  title: string;
  language: string;
  voice: string;
  status: 'Completed' | 'Processing' | 'Failed';
  timestamp: string;
}

const INITIAL_PROJECTS: VideoProject[] = [
  { id: '1', title: 'Summer Travel Deal Promo', language: 'Spanish (es)', voice: 'Alloy', status: 'Completed', timestamp: '2026-05-15' },
  { id: '2', title: 'Marketplace Product Launch', language: 'English (en)', voice: 'Echo', status: 'Completed', timestamp: '2026-05-14' },
  { id: '3', title: 'SaaS Platform Onboarding Walkthrough', language: 'Russian (ru)', voice: 'Onyx', status: 'Processing', timestamp: '2026-05-15' },
];

export default function VideoGeneratorPage() {
  const [projects, setProjects] = useState<VideoProject[]>(INITIAL_PROJECTS);
  const [script, setScript] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedVoice, setSelectedVoice] = useState('alloy');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!script.trim()) return;

    setIsGenerating(true);
    
    setTimeout(() => {
      const newProject: VideoProject = {
        id: (projects.length + 1).toString(),
        title: script.split(' ').slice(0, 4).join(' ') + '...',
        language: selectedLanguage === 'en' ? 'English (en)' : selectedLanguage === 'es' ? 'Spanish (es)' : 'Portuguese (pt)',
        voice: selectedVoice.charAt(0).toUpperCase() + selectedVoice.slice(1),
        status: 'Processing',
        timestamp: new Date().toISOString().split('T')[0]
      };
      setProjects([newProject, ...projects]);
      setScript('');
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Video & Voice Generator</h1>
        <p className="text-sm text-slate-500 mt-1">Convert affiliate script copy into localized, speech-synthesized marketing assets.</p>
      </div>

      {/* Embedded Live Media Control Station */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Audio Monitor</h3>
        <AudioPlayer 
          audioUrl="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
          title="Latest Render: Summer Travel Deal Promo (es)" 
          voiceModel="Alloy Engine" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generator Controls */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <form onSubmit={handleGenerate} className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Asset Configuration</h2>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Language</label>
              <select 
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="en">English (en)</option>
                <option value="es">Spanish (es)</option>
                <option value="pt">Portuguese (pt)</option>
                <option value="pl">Polish (pl)</option>
                <option value="ru">Russian (ru)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">OpenAI Voice Engine</label>
              <select 
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="alloy">Alloy (Neutral / Balanced)</option>
                <option value="echo">Echo (Warm / Crisp)</option>
                <option value="onyx">Onyx (Deep / Professional)</option>
                <option value="shimmer">Shimmer (Bright / Dynamic)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Voiceover Script Text</label>
              <textarea
                rows={5}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Paste affiliate offer information or video text script here..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 shadow-sm"
            >
              {isGenerating ? 'Synthesizing Audio Engine...' : 'Generate Voice Track'}
            </button>
          </form>
        </div>

        {/* Generation Queue & History Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Production Queue History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="px-6 py-4">Generated Clip Content</th>
                  <th className="px-6 py-4">Locale</th>
                  <th className="px-6 py-4">Voice Model</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{project.title || 'Untitled Audio Generation'}</td>
                    <td className="px-6 py-4 text-xs font-mono">{project.language}</td>
                    <td className="px-6 py-4 text-slate-600">{project.voice}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        project.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">{project.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
