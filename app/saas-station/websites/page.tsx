'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import type { WebsiteAuditResult, WebsiteOptimizerResult, WebsiteRebuildResult } from '@/lib/websites/types'

type Recommendation = WebsiteAuditResult['recommendations'][number]
const sections = ['hero', 'about', 'services', 'pricing', 'footer', 'contact']
const scoreKeys = ['performance', 'seo', 'accessibility', 'mobile', 'conversion', 'security'] as const

function scoreColor(score: number) { return score >= 80 ? 'text-emerald-300' : score >= 60 ? 'text-yellow-300' : 'text-red-300' }
function downloadJson(filename: string, payload: unknown) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url) }

export default function WebsitesPage() {
  const { dict, lang, setLang } = useI18n()
  const [url, setUrl] = useState('')
  const [section, setSection] = useState('hero')
  const [currentContent, setCurrentContent] = useState('')
  const [audit, setAudit] = useState<WebsiteAuditResult | null>(null)
  const [audits, setAudits] = useState<WebsiteAuditResult[]>([])
  const [optimized, setOptimized] = useState<WebsiteOptimizerResult | null>(null)
  const [rebuild, setRebuild] = useState<WebsiteRebuildResult | null>(null)
  const [status, setStatus] = useState(t(dict, 'websites.footer.ready', 'Ready'))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<'analyze' | 'optimize' | 'rebuild' | ''>('')
  const weakSite = useMemo(() => audit ? audit.performance < 60 || audit.mobile < 60 || audit.conversion < 60 : false, [audit])

  async function analyze() {
    setLoading('analyze'); setError(''); setStatus(t(dict, 'websites.footer.syncing', 'Syncing'))
    try { const res = await fetch('/api/websites/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Audit failed'); setAudit(data); setAudits(prev => [data, ...prev.filter(item => item.normalized_url !== data.normalized_url)].slice(0, 5)); setStatus(t(dict, 'websites.footer.synced', 'Synced')) } catch (err) { setError(err instanceof Error ? err.message : 'Audit failed'); setStatus(t(dict, 'websites.footer.error', 'Needs attention')) } finally { setLoading('') }
  }
  async function optimize(recommendation?: Recommendation) {
    setLoading('optimize'); setError('')
    const content = recommendation ? `${recommendation.recommendation}\n${JSON.stringify(recommendation.suggested_fix)}` : currentContent
    try { const res = await fetch('/api/websites/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url || audit?.normalized_url, section, current_content: content, language: lang }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Optimization failed'); setOptimized(data); setCurrentContent(content); setStatus(t(dict, 'websites.footer.synced', 'Synced')) } catch (err) { setError(err instanceof Error ? err.message : 'Optimization failed') } finally { setLoading('') }
  }
  async function generateRebuild() {
    setLoading('rebuild'); setError('')
    try { const res = await fetch('/api/websites/rebuild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_url: url || audit?.normalized_url, language: lang }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Rebuild failed'); setRebuild(data); setStatus(t(dict, 'websites.footer.synced', 'Synced')) } catch (err) { setError(err instanceof Error ? err.message : 'Rebuild failed') } finally { setLoading('') }
  }

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/70 px-5 py-4 backdrop-blur">
        <Link href="/" className="text-2xl font-black text-[#FFD700] no-underline">SignalBoost</Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/dashboard/calendar" className="rounded-full px-3 py-2 text-white/70 no-underline hover:bg-white/10">{t(dict, 'nav.calendar', 'Calendar')}</Link>
          <Link href="/dashboard/spreadsheets" className="rounded-full px-3 py-2 text-white/70 no-underline hover:bg-white/10">{t(dict, 'nav.spreadsheets', 'Spreadsheets')}</Link>
          <Link href="/dashboard/promote" className="rounded-full px-3 py-2 text-white/70 no-underline hover:bg-white/10">{t(dict, 'nav.promote', 'Promote')}</Link>
          <Link href="/saas-station/websites" className="rounded-full bg-[#FFD700]/15 px-3 py-2 text-[#FFD700] no-underline">{t(dict, 'nav.websites', 'Websites')}</Link>
          <Link href="/pricing" className="rounded-full px-3 py-2 text-white/70 no-underline hover:bg-white/10">{t(dict, 'nav.pricing', 'Pricing')}</Link>
          <Link href="/admin" className="rounded-full px-3 py-2 text-white/70 no-underline hover:bg-white/10">{t(dict, 'nav.admin', 'Admin')}</Link>
          <select aria-label={t(dict, 'websites.language', 'Language')} value={lang} onChange={event => setLang(event.target.value)} className="rounded-full border border-white/10 bg-black px-3 py-2 text-white">
            {['en','es','pt','pl','ru'].map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
          </select>
          <Link href="/login" className="rounded-full bg-[#FFD700] px-4 py-2 font-bold text-black no-underline">{t(dict, 'nav.getStarted', 'Get Started')}</Link>
        </div>
      </nav>

      <section className="p-5 md:p-8">
        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,215,0,.24),transparent_35%),linear-gradient(135deg,#101827,#05070b)] p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-[#FFD700]">{t(dict, 'websites.kicker', 'SaaS Station')}</p>
          <h1 className="mt-4 text-4xl font-black md:text-6xl">{t(dict, 'websites.title', 'Website Optimization System')}</h1>
          <p className="mt-4 max-w-3xl text-white/70">{t(dict, 'websites.subtitle', 'Analyze, optimize, and rebuild websites with multilingual SEO, accessibility, conversion, mobile, performance, and security checks.')}</p>
        </div>
        {error && <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">{error}</div>}

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[.04] p-6">
            <h2 className="text-2xl font-bold">{t(dict, 'websites.analyzer.title', 'Website Analyzer')}</h2>
            <div className="mt-5 flex flex-col gap-3 md:flex-row">
              <input value={url} onChange={event => setUrl(event.target.value)} placeholder={t(dict, 'websites.analyzer.urlPlaceholder', 'https://example.com')} className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-[#FFD700]" />
              <button onClick={analyze} disabled={loading === 'analyze' || !url.trim()} className="rounded-2xl bg-[#FFD700] px-6 py-3 font-black text-black disabled:opacity-50">{loading === 'analyze' ? t(dict, 'websites.analyzer.analyzing', 'Analyzing…') : t(dict, 'websites.analyzer.analyze', 'Analyze')}</button>
            </div>
            {audit && <div className="mt-6 grid gap-3 md:grid-cols-3">{scoreKeys.map(key => <div key={key} className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-sm capitalize text-white/50">{t(dict, `websites.scores.${key}`, key)}</p><p className={`mt-2 text-4xl font-black ${scoreColor(audit[key])}`}>{audit[key]}</p></div>)}</div>}
            {audit && <div className="mt-6"><h3 className="text-xl font-bold">{t(dict, 'websites.recommendations.title', 'Recommendations')}</h3><div className="mt-3 grid gap-3">{audit.recommendations.map((item, index) => <div key={`${item.category}-${index}`} className="rounded-2xl border border-white/10 bg-black/30 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-bold capitalize text-[#FFD700]">{item.category} · {item.priority}</p><button onClick={() => optimize(item)} className="rounded-full border border-[#FFD700]/40 px-3 py-2 text-sm text-[#FFD700]">{t(dict, 'websites.recommendations.apply', 'Apply via Optimizer')}</button></div><p className="mt-2 text-white/70">{item.recommendation}</p></div>)}</div></div>}
          </div>
          <aside className="rounded-3xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-2xl font-bold">{t(dict, 'websites.analyzer.lastAudits', 'Last audits')}</h2>
            <div className="mt-4 space-y-3">{audits.length ? audits.map(item => <button key={`${item.normalized_url}-${item.fetched_at}`} onClick={() => setAudit(item)} className="w-full rounded-2xl border border-white/10 bg-white/[.03] p-4 text-left text-white/70"><span className="block truncate text-white">{item.normalized_url}</span><span>{item.performance}/{item.seo}/{item.mobile}</span></button>) : <p className="text-white/50">{t(dict, 'websites.analyzer.noAudits', 'No audits yet.')}</p>}</div>
          </aside>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[.04] p-6">
            <h2 className="text-2xl font-bold">{t(dict, 'websites.optimizer.title', 'Website Optimizer')}</h2>
            <label className="mt-5 block text-sm text-white/60">{t(dict, 'websites.optimizer.section', 'Section')}</label>
            <select value={section} onChange={event => setSection(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black p-3 text-white">{sections.map(item => <option key={item} value={item}>{t(dict, `websites.sections.${item}`, item)}</option>)}</select>
            <label className="mt-5 block text-sm text-white/60">{t(dict, 'websites.optimizer.currentContent', 'Current content')}</label>
            <textarea value={currentContent} onChange={event => setCurrentContent(event.target.value)} className="mt-2 min-h-36 w-full rounded-2xl border border-white/10 bg-black/40 p-4 text-white outline-none focus:border-[#FFD700]" />
            <button onClick={() => optimize()} disabled={loading === 'optimize'} className="mt-4 rounded-2xl bg-[#FFD700] px-6 py-3 font-black text-black disabled:opacity-50">{t(dict, 'websites.optimizer.optimize', 'Optimize content')}</button>
          </div>
          <div className="rounded-3xl border border-[#FFD700]/20 bg-black/50 p-6">
            <h3 className="text-xl font-bold text-[#FFD700]">{t(dict, 'websites.optimizer.aiOptimized', 'AI-optimized content')}</h3>
            {optimized ? <div className="mt-4 space-y-4 text-white/70"><p className="text-2xl font-black text-white">{optimized.headline}</p><p>{optimized.subheadline}</p><p>{optimized.body}</p><p className="font-bold text-[#FFD700]">{optimized.cta}</p><pre className="overflow-auto rounded-2xl bg-white/[.04] p-4 text-xs">{JSON.stringify(optimized.seo, null, 2)}</pre><button onClick={() => setCurrentContent(JSON.stringify(optimized, null, 2))} className="rounded-full border border-[#FFD700]/50 px-4 py-2 text-[#FFD700]">{t(dict, 'websites.optimizer.applyChanges', 'Apply changes')}</button></div> : <p className="mt-4 text-white/50">{t(dict, 'websites.optimizer.empty', 'Optimization output will appear here.')}</p>}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[.04] p-6">
          <h2 className="text-2xl font-bold">{t(dict, 'websites.rebuild.title', 'Rebuild Engine')}</h2>
          {weakSite && <div className="mt-4 rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-4 text-yellow-100">{t(dict, 'websites.rebuild.banner', 'This site is slow, outdated, or conversion-limited. A rebuild is recommended.')}</div>}
          <button onClick={generateRebuild} disabled={loading === 'rebuild' || !(url || audit?.normalized_url)} className="mt-5 rounded-2xl bg-[#FFD700] px-6 py-3 font-black text-black disabled:opacity-50">{t(dict, 'websites.rebuild.generate', 'Generate rebuild')}</button>
          {rebuild && <div className="mt-6 grid gap-6 lg:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-bold">{t(dict, 'websites.rebuild.siteMap', 'Site map')}</h3>{rebuild.structure.pages.map(page => <p key={page.slug} className="mt-2 text-white/70">/{page.slug} — {page.title}</p>)}</div><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-bold">{t(dict, 'websites.rebuild.sections', 'Sections')}</h3><p className="mt-2 text-white/70">{rebuild.structure.pages.flatMap(page => page.sections).slice(0, 18).join(' · ')}</p></div><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><h3 className="font-bold">{t(dict, 'websites.rebuild.copy', 'Copy preview')}</h3><pre className="mt-2 max-h-64 overflow-auto text-xs text-white/70">{JSON.stringify(rebuild.content.home, null, 2)}</pre></div><button onClick={() => downloadJson('signalboost-website-rebuild.json', rebuild)} className="rounded-full border border-[#FFD700]/50 px-4 py-2 text-[#FFD700]">{t(dict, 'websites.rebuild.downloadJson', 'Download JSON')}</button></div>}
        </section>
        <footer className="mt-8 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/60">{t(dict, 'websites.footer.status', 'Status')}: {status} · {t(dict, 'websites.footer.health', 'Sync health')}: {error ? t(dict, 'websites.footer.error', 'Needs attention') : t(dict, 'websites.footer.ok', 'Healthy')}</footer>
      </section>
    </main>
  )
}
