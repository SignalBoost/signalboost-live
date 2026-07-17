'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Live tool + licensing inbox (same address as the Campaign Studio public page).
const AGENCY = '/agency'
const LICENSE_CONTACT =
  'mailto:partners@signalboostapp.com?subject=Licensing%20SignalBoost%20modules'

// The platform ships in exactly these 5 languages.
const LANGUAGES = [
  ['🇺🇸', 'English'],
  ['🇲🇽', 'Español'],
  ['🇧🇷', 'Português'],
  ['🇵🇱', 'Polski'],
  ['🇷🇺', 'Русский'],
] as const

// Public-face modules — pages anyone can view.
const MODULES = [
  { title: 'Audit Cockpit', desc: 'Scan public sites, surface conversion friction, get an ordered action plan.', icon: '◎', href: '/website/audit', accent: '#f6c453' },
  { title: 'Cybersecurity Station', desc: 'Review exposure signals, headers, cookies, and HTTPS posture — no intrusive access.', icon: '◇', href: '/website/cybersecurity', accent: '#8b8cff' },
  { title: 'Optimization Hub', desc: 'Localized channel assets, optimization workflows, and approval-ready launch packages.', icon: '✦', href: '/website/optimization', accent: '#e7a93f' },
] as const

// Portable, sellable engines — outcome one-liners only, no mechanics exposed.
const PORTABLES = [
  { glyph: '✦', name: 'Campaign Studio', desc: 'One brief in — a finished, branded campaign: script, voiceover, video.', tag: 'live', href: AGENCY },
  { glyph: '◍', name: 'Render Engine', desc: 'Portable voiceover + branded video rendering, prepaid-credit safe.', tag: 'live', href: '' },
  { glyph: '◈', name: 'Console Hub', desc: 'Operator console: encrypted key vault, webhooks, logs, deployments, audit.', tag: 'live', href: '' },
  { glyph: '◎', name: 'Marketing + Sales', desc: 'Campaign orchestration and sales workflows as one embeddable module.', tag: 'live', href: '' },
  { glyph: '❖', name: 'Chief-of-Staff Engine', desc: 'An AI operator that plans and executes — always under human approval.', tag: 'preview', href: '' },
  { glyph: '◇', name: 'Browser Runtime', desc: 'Bounded, verifiable browser automation with approval checkpoints.', tag: 'preview', href: '' },
] as const

const STATS = [
  { value: 9726, suffix: '', label: 'workflows' },
  { value: 2.4, suffix: 'M', label: 'actions', decimals: 1 },
  { value: 148, suffix: '', label: 'markets' },
  { value: 99.97, suffix: '%', label: 'uptime', decimals: 2 },
] as const

function useCountUp(target: number, decimals = 0, duration = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let frame = 0
    const startedAt = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Number((target * eased).toFixed(decimals)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [decimals, duration, target])
  return value
}

function Stat({ value, suffix, label, decimals = 0 }: { value: number; suffix: string; label: string; decimals?: number }) {
  const count = useCountUp(value, decimals)
  return (
    <div className="stat">
      <strong>{count.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</strong>
      <span>{label}</span>
    </div>
  )
}

export default function Home() {
  return (
    <main className="home">
      <div className="cosmic-bg" aria-hidden="true" />
      <div className="waves" aria-hidden="true">
        <svg className="wave wave-gold" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-120 390C180 160 390 560 720 330S1230 80 1720 330V700H-120Z" fill="url(#gg)" />
          <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f5c451" stopOpacity="0" /><stop offset="0.48" stopColor="#f5c451" stopOpacity="0.85" /><stop offset="1" stopColor="#9f6b13" stopOpacity="0" /></linearGradient></defs>
        </svg>
        <svg className="wave wave-indigo" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-180 260C160 570 450 70 800 350s650 160 980-110V700H-180Z" fill="url(#ig)" />
          <defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#5f5bd8" stopOpacity="0" /><stop offset="0.5" stopColor="#7772ff" stopOpacity="0.72" /><stop offset="1" stopColor="#332d82" stopOpacity="0" /></linearGradient></defs>
        </svg>
      </div>

      <div className="content">
        {/* hero */}
        <header className="hero">
          <div className="hero-left">
            <span className="kicker">AI-driven · Human-monitored</span>
            <h1>One console. Every growth signal.</h1>
          </div>
          <div className="hero-right">
            <div className="langs" aria-label="Available in 5 languages">
              {LANGUAGES.map(([flag, name]) => <span key={name} className="lang"><b>{flag}</b>{name}</span>)}
            </div>
            <div className="stats">{STATS.map((s) => <Stat key={s.label} {...s} />)}</div>
          </div>
        </header>

        {/* public modules */}
        <section className="zone" aria-label="Public modules">
          <div className="zone-head"><span className="zone-label">Public modules</span></div>
          <div className="grid grid-3">
            {MODULES.map((m) => (
              <article key={m.title} className="mcard" style={{ ['--accent' as string]: m.accent }}>
                <div className="mcard-top"><span className="mcard-icon">{m.icon}</span><span className="live-pill"><i /> Live</span></div>
                <h2>{m.title}</h2>
                <p>{m.desc}</p>
                <div className="mcard-actions">
                  <Link href="/dashboard" className="a-primary">Enter</Link>
                  <Link href={m.href} className="a-ghost">Public page ↗</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* portable engines */}
        <section className="zone zone-grow" aria-label="Portable engines">
          <div className="zone-head">
            <span className="zone-label">Portable engines — license the engines behind SignalBoost</span>
            <div className="zone-cta">
              <a className="license-btn" href={LICENSE_CONTACT}>License →</a>
              <Link href={AGENCY} className="studio-btn">Campaign Studio</Link>
            </div>
          </div>
          <div className="grid grid-6">
            {PORTABLES.map((p) => {
              const inner = (
                <>
                  <div className="qcard-top"><span className="qcard-icon">{p.glyph}</span><span className={p.tag === 'live' ? 'tag-live' : 'tag-preview'}>{p.tag === 'live' ? 'Live' : 'Preview'}</span></div>
                  <h3>{p.name}</h3>
                  <p>{p.desc}</p>
                </>
              )
              return p.href
                ? <Link key={p.name} href={p.href} className="qcard is-link">{inner}</Link>
                : <div key={p.name} className="qcard">{inner}</div>
            })}
          </div>
        </section>
      </div>

      <style jsx>{`
        .home{position:relative;height:100svh;overflow:hidden;background:#030611;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .cosmic-bg{position:absolute;inset:0;z-index:0;background:#030611 radial-gradient(circle at 50% -10%,rgba(255,199,44,.1),transparent 58%)}
        .waves{position:absolute;inset:0;z-index:0;overflow:hidden;opacity:.2;pointer-events:none}
        .wave{position:absolute;width:120%;height:78%;left:-10%;filter:blur(3px);animation:drift 18s ease-in-out infinite alternate}
        .wave-gold{bottom:-20%;opacity:.78}.wave-indigo{top:4%;opacity:.6;animation-duration:23s;animation-direction:alternate-reverse}
        @keyframes drift{0%{transform:translate3d(-2%,1%,0) scale(1.02)}50%{transform:translate3d(3%,-2%,0) scale(1.06)}100%{transform:translate3d(-1%,2%,0) scale(1.03)}}
        @media (prefers-reduced-motion:reduce){.wave{animation:none}}

        .content{position:relative;z-index:1;height:100%;width:min(1240px,calc(100% - 40px));margin:0 auto;padding:clamp(14px,2.4vh,26px) 0;display:flex;flex-direction:column;gap:clamp(10px,1.8vh,20px)}

        .hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
        .kicker{font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#e8bd59}
        .hero-left h1{margin:6px 0 0;font-size:clamp(24px,3.4vw,42px);letter-spacing:-.04em;line-height:1.02}
        .hero-right{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
        .langs{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
        .lang{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#c3ccdf;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 10px}
        .lang b{font-size:12px}
        .stats{display:flex;gap:16px}
        .stat{text-align:right}.stat strong{display:block;font-size:16px;color:#fff}.stat span{font-size:9px;color:#7f899e;text-transform:uppercase;letter-spacing:.12em}

        .zone{display:flex;flex-direction:column;gap:clamp(8px,1.2vh,14px)}
        .zone-grow{flex:1;min-height:0}
        .zone-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .zone-label{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9aa4b9}
        .zone-cta{display:flex;gap:8px}
        .license-btn,.studio-btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 16px;border-radius:999px;font-weight:800;font-size:12px;text-decoration:none}
        .license-btn{color:#0b0b10;background:linear-gradient(180deg,#f5c451,#e2a233);border:1px solid rgba(231,189,92,.5)}
        .studio-btn{color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}

        .grid{display:grid;gap:12px}
        .grid-3{grid-template-columns:repeat(3,1fr)}
        .grid-6{grid-template-columns:repeat(3,1fr);grid-auto-rows:1fr;height:100%}

        .mcard{display:flex;flex-direction:column;gap:6px;padding:16px 18px;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:18px;background:linear-gradient(145deg,rgba(18,23,39,.9),rgba(7,10,20,.8));backdrop-filter:blur(18px)}
        .mcard-top{display:flex;align-items:center;justify-content:space-between}
        .mcard-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;border:1px solid var(--accent);color:var(--accent);font-size:16px}
        .live-pill{display:flex;align-items:center;gap:6px;color:#aeb6c9;font-size:11px}
        .live-pill i{width:6px;height:6px;border-radius:50%;background:#47dfab;box-shadow:0 0 10px #47dfab}
        .mcard h2{margin:2px 0 0;font-size:17px}
        .mcard p{margin:0;color:#9aa4b9;font-size:12px;line-height:1.45}
        .mcard-actions{margin-top:auto;display:flex;gap:8px;padding-top:8px}
        .a-primary,.a-ghost{font-size:11px;font-weight:700;border-radius:9px;padding:8px 12px;text-decoration:none;color:#fff}
        .a-primary{background:var(--accent);color:#090b11}
        .a-ghost{border:1px solid rgba(255,255,255,.14)}

        .qcard{display:flex;flex-direction:column;gap:5px;padding:14px 16px;min-height:0;border:1px solid rgba(246,196,83,.16);border-radius:16px;background:linear-gradient(145deg,rgba(18,23,39,.9),rgba(7,10,20,.8));backdrop-filter:blur(16px);text-decoration:none;color:#fff;transition:transform .18s,border-color .18s}
        .qcard.is-link:hover{transform:translateY(-3px);border-color:#f5c451}
        .qcard-top{display:flex;align-items:center;justify-content:space-between}
        .qcard-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;border:1px solid rgba(246,196,83,.4);color:#f5c542;font-size:15px}
        .tag-live{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#0b0b10;background:#e7bd5c;border-radius:999px;padding:3px 8px}
        .tag-preview{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#aeb6c9;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:2px 7px}
        .qcard h3{margin:2px 0 0;font-size:14.5px}
        .qcard p{margin:0;color:#9aa4b9;font-size:11.5px;line-height:1.4}

        @media(max-width:900px){
          .home{height:auto;overflow:auto}
          .grid-3,.grid-6{grid-template-columns:repeat(2,1fr)}
          .grid-6{height:auto}
          .hero{align-items:flex-start}.hero-right{align-items:flex-start}.langs{justify-content:flex-start}
        }
        @media(max-width:560px){.grid-3,.grid-6{grid-template-columns:1fr}.stats{flex-wrap:wrap}}
      `}</style>
    </main>
  )
}
