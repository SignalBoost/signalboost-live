'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'

type StatItem = {
  value: number
  suffix: string
  label: string
  decimals?: number
}

const languages = [
  ['🇺🇸', 'English'],
  ['🇧🇷', 'Português'],
  ['🇲🇽', 'Español'],
  ['🇵🇱', 'Polski'],
  ['🇷🇺', 'Русский'],
  ['🇫🇷', 'Français'],
  ['🇩🇪', 'Deutsch'],
  ['🇮🇹', 'Italiano'],
  ['🇯🇵', '日本語'],
  ['🇰🇷', '한국어'],
] as const

const modules = [
  {
    eyebrow: 'Intelligence layer',
    title: 'Audit Cockpit',
    description: 'Scan public websites, surface conversion friction, and turn findings into an ordered action plan.',
    icon: '◎',
    href: '/website/audit',
    accent: '#f6c453',
    metrics: ['SEO signal map', 'Accessibility checks', 'Conversion priorities'],
  },
  {
    eyebrow: 'Risk visibility',
    title: 'Cybersecurity Station',
    description: 'Review public security signals, exposure indicators, headers, cookies, and HTTPS posture without intrusive access.',
    icon: '◇',
    href: '/website/cybersecurity',
    accent: '#8b8cff',
    metrics: ['Exposure scan', 'Header analysis', 'Security brief'],
  },
  {
    eyebrow: 'Growth orchestration',
    title: 'Campaign Studio',
    description: 'Coordinate localized campaigns, channel assets, optimization workflows, and approval-ready launch packages.',
    icon: '✦',
    href: '/website/optimization',
    accent: '#e7a93f',
    metrics: ['Localized assets', 'Channel planning', 'Launch controls'],
  },
] as const

const stats: readonly StatItem[] = [
  { value: 9726, suffix: '', label: 'total workflows' },
  { value: 2.4, suffix: 'M', label: 'successful actions', decimals: 1 },
  { value: 148, suffix: '', label: 'connected markets' },
  { value: 99.97, suffix: '%', label: 'system availability', decimals: 2 },
]

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

function Stat({ value, suffix, label, decimals = 0 }: StatItem) {
  const count = useCountUp(value, decimals)
  return (
    <div className="stat">
      <strong>
        {count.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
        {suffix}
      </strong>
      <span>{label}</span>
    </div>
  )
}

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0)
  const ribbonItems = useMemo(() => [...languages, ...languages], [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % modules.length)
    }, 5200)
    return () => window.clearInterval(timer)
  }, [])

  const move = (direction: number) => {
    setActiveIndex((current) => (current + direction + modules.length) % modules.length)
  }

  return (
    <main className="command-page">
      <div className="cosmic-bg" aria-hidden="true" />
      <div className="waves" aria-hidden="true">
        <svg className="wave wave-gold" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-120 390C180 160 390 560 720 330S1230 80 1720 330V700H-120Z" fill="url(#goldGradient)" />
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#f5c451" stopOpacity="0" />
              <stop offset="0.48" stopColor="#f5c451" stopOpacity="0.85" />
              <stop offset="1" stopColor="#9f6b13" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <svg className="wave wave-indigo" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-180 260C160 570 450 70 800 350s650 160 980-110V700H-180Z" fill="url(#indigoGradient)" />
          <defs>
            <linearGradient id="indigoGradient" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#5f5bd8" stopOpacity="0" />
              <stop offset="0.5" stopColor="#7772ff" stopOpacity="0.72" />
              <stop offset="1" stopColor="#332d82" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <section className="shell" aria-label="SignalBoost Command Center">
        <header className="topbar">
          <Link href="/" className="brand"><span className="brand-mark">S</span><span>SignalBoost</span></Link>
          <div className="system-status"><i /> Systems operational</div>
          <Link href="/dashboard" className="workspace-link">Open workspace →</Link>
        </header>

        <div className="language-ribbon" aria-label="Supported languages">
          <div className="ribbon-track">
            {ribbonItems.map(([flag, name], index) => <span key={`${name}-${index}`}><b>{flag}</b>{name}</span>)}
          </div>
        </div>

        <div className="intro">
          <span className="kicker">AI operations command center</span>
          <h1>One screen. Every growth signal.</h1>
          <p>Launch the right SignalBoost module, inspect live operational signals, and move from insight to action without a long marketing scroll.</p>
        </div>

        <div className="carousel" aria-live="polite">
          <button className="nav-button left" onClick={() => move(-1)} aria-label="Previous module">‹</button>
          <div className="card-stage">
            {modules.map((module, index) => {
              const offset = (index - activeIndex + modules.length) % modules.length
              const position = offset === 0 ? 'active' : offset === 1 ? 'next' : 'previous'
              return (
                <article key={module.title} className={`module-card ${position}`} style={{ '--accent': module.accent } as CSSProperties}>
                  <div className="card-head"><div className="module-icon">{module.icon}</div><span className="live-pill"><i /> Live</span></div>
                  <span className="module-eyebrow">{module.eyebrow}</span>
                  <h2>{module.title}</h2>
                  <p>{module.description}</p>
                  <div className="signal-list">{module.metrics.map((metric) => <span key={metric}>✓ {metric}</span>)}</div>
                  <div className="card-actions">
                    <Link href="/dashboard" className="primary-action">Enter module</Link>
                    <Link href={module.href} className="public-action">Public Page ↗</Link>
                  </div>
                </article>
              )
            })}
          </div>
          <button className="nav-button right" onClick={() => move(1)} aria-label="Next module">›</button>
        </div>

        <div className="dots">{modules.map((module, index) => <button key={module.title} className={index === activeIndex ? 'selected' : ''} onClick={() => setActiveIndex(index)} aria-label={`Show ${module.title}`} />)}</div>
        <div className="stats-row">{stats.map((stat) => <Stat key={stat.label} {...stat} />)}</div>
      </section>

      <style jsx>{`
        .command-page{position:relative;min-height:100svh;overflow:hidden;background:#030611;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.cosmic-bg{position:absolute;inset:0;z-index:-20;background:#030611 radial-gradient(circle at 50% -10%,rgba(255,199,44,.1),transparent 58%)}.waves{position:absolute;inset:0;z-index:-10;overflow:hidden;opacity:.22;pointer-events:none}.wave{position:absolute;width:120%;height:78%;left:-10%;filter:blur(3px);animation:driftWaves 18s ease-in-out infinite alternate}.wave-gold{bottom:-20%;opacity:.78}.wave-indigo{top:4%;opacity:.62;animation-duration:23s;animation-direction:alternate-reverse}@keyframes driftWaves{0%{transform:translate3d(-2%,1%,0) scale(1.02)}50%{transform:translate3d(3%,-2%,0) scale(1.06)}100%{transform:translate3d(-1%,2%,0) scale(1.03)}}.shell{width:min(1180px,calc(100% - 32px));min-height:100svh;margin:0 auto;padding:18px 0 22px;display:grid;grid-template-rows:auto auto auto minmax(300px,1fr) auto auto;align-items:center}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:750}.brand-mark{display:grid;place-items:center;width:32px;height:32px;border:1px solid rgba(246,196,83,.48);border-radius:10px;background:rgba(246,196,83,.14);color:#ffd978}.system-status,.live-pill{display:flex;align-items:center;gap:8px;color:#aeb6c9;font-size:12px}.system-status i,.live-pill i{width:7px;height:7px;border-radius:50%;background:#47dfab;box-shadow:0 0 12px #47dfab}.workspace-link,.primary-action,.public-action{color:#fff;text-decoration:none}.language-ribbon{margin-top:14px;overflow:hidden;border-block:1px solid rgba(255,255,255,.075)}.ribbon-track{display:flex;width:max-content;gap:34px;padding:9px 0;animation:ribbonScroll 34s linear infinite}.ribbon-track span{display:flex;align-items:center;gap:8px;color:#949eb3;font-size:11px;white-space:nowrap;text-transform:uppercase;letter-spacing:.12em}@keyframes ribbonScroll{to{transform:translateX(-50%)}}.intro{text-align:center;padding:20px 12px 12px}.kicker{font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#e8bd59}.intro h1{margin:8px 0;font-size:clamp(30px,4.4vw,58px);letter-spacing:-.045em}.intro p{max-width:680px;margin:auto;color:#929cb1;font-size:14px;line-height:1.65}.carousel{position:relative;display:flex;align-items:center;justify-content:center;min-height:330px}.card-stage{position:relative;width:min(780px,calc(100% - 84px));height:310px;perspective:1300px}.module-card{position:absolute;inset:0;margin:auto;width:min(620px,88%);height:286px;padding:24px 26px;border:1px solid color-mix(in srgb,var(--accent) 34%,transparent);border-radius:24px;background:linear-gradient(145deg,rgba(18,23,39,.9),rgba(7,10,20,.8));backdrop-filter:blur(22px);transition:.7s;display:flex;flex-direction:column}.module-card.active{z-index:3;opacity:1}.module-card.next{z-index:2;opacity:.3;transform:translateX(44%) scale(.86)}.module-card.previous{z-index:1;opacity:.26;transform:translateX(-44%) scale(.86)}.card-head{display:flex;justify-content:space-between}.module-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;border:1px solid var(--accent);color:var(--accent)}.module-eyebrow{margin-top:17px;color:var(--accent);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.18em}.module-card h2{font-size:27px;margin:7px 0}.module-card p{margin:0;color:#9aa4b9;font-size:13px;line-height:1.55}.signal-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.signal-list span{font-size:10px;padding:6px 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px}.card-actions{margin-top:auto;display:flex;gap:10px}.primary-action,.public-action{font-size:12px;font-weight:700;border-radius:10px;padding:10px 13px}.primary-action{background:var(--accent);color:#090b11}.public-action{border:1px solid rgba(255,255,255,.12)}.nav-button{position:absolute;z-index:8;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:#080b14;color:#fff;font-size:26px}.left{left:3%}.right{right:3%}.dots{display:flex;justify-content:center;gap:7px}.dots button{width:6px;height:6px;border:0;border-radius:999px;background:#4c5362}.dots .selected{width:26px;background:#e7bd5c}.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px;padding:13px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(9,12,22,.5)}.stat{text-align:center}.stat strong{display:block;font-size:19px}.stat span{font-size:9px;color:#7f899e;text-transform:uppercase;letter-spacing:.13em}@media(max-width:760px){.command-page{overflow:auto}.shell{grid-template-rows:auto auto auto auto auto auto}.system-status{display:none}.carousel{min-height:390px}.card-stage{width:100%;height:370px}.module-card{width:calc(100% - 20px);height:340px}.module-card.next,.module-card.previous{opacity:0}.stats-row{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </main>
  )
}
