'use client'

import { Dot, LANGS, c, labelStyle, type HubData, type Lang } from '../hub/shared'
import type { CommandPage } from './types'

type MissionBarProps = {
  activePage: CommandPage
  lang: Lang
  data: HubData | null
  loading: boolean
  onLanguageChange: (lang: Lang) => void
  onRefresh: () => void
}

export default function MissionBar({ activePage, lang, data, loading, onLanguageChange, onRefresh }: MissionBarProps) {
  const supaOk = !!data?.supabase.ok
  const stripeOk = !!data?.stripe.ok
  const vercelConfigured = !!data?.vercel.configured
  const vercelOk = !!data?.vercel.ok

  return (
    <header className="mission-bar" style={{ borderRadius: 22, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(15,23,42,.74)', boxShadow: '0 20px 70px rgba(0,0,0,.24)', padding: '13px 15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', flexShrink: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...labelStyle, color: '#1af0ff' }}>{activePage.eyebrow}</div>
        <h1 style={{ margin: '2px 0 2px', fontSize: 'clamp(20px, 2.2vw, 28px)', fontWeight: 950, letterSpacing: '-.025em' }}>{activePage.icon} {activePage.title}</h1>
        <p style={{ margin: 0, color: 'rgba(255,255,255,.52)', fontSize: 12.5 }}>{activePage.description}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
          <span style={labelStyle}>Environment</span>
          <strong style={{ color: '#ffc300', fontSize: 12.5 }}>Production</strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
          <span style={labelStyle}>{c('systemHealth', lang)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}><Dot tone={loading ? 'yellow' : supaOk ? 'green' : 'red'} /> Supabase</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}><Dot tone={loading ? 'yellow' : stripeOk ? 'green' : 'red'} /> Stripe</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}><Dot tone={loading ? 'yellow' : !vercelConfigured ? 'yellow' : vercelOk ? 'green' : 'red'} /> Vercel</span>
        </div>

        <div style={{ display: 'flex', gap: 5 }}>
          {LANGS.map(l => (
            <button key={l} onClick={() => onLanguageChange(l)} className="hub-chip" style={{ padding: '5px 8px', borderRadius: 8, fontSize: 11.5, fontWeight: 850, textTransform: 'uppercase', background: lang === l ? 'rgba(26,240,255,.16)' : 'rgba(255,255,255,.04)', border: lang === l ? '1px solid rgba(26,240,255,.5)' : '1px solid rgba(255,255,255,.12)', color: lang === l ? '#1af0ff' : 'rgba(255,255,255,.6)' }}>{l}</button>
          ))}
        </div>

        <button onClick={onRefresh} className="hub-btn" style={{ padding: '8px 13px', borderRadius: 11, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.1)', color: '#1af0ff', fontSize: 12.5, fontWeight: 900 }}>{loading ? '…' : '↻ ' + c('refresh', lang)}</button>
      </div>
    </header>
  )
}
