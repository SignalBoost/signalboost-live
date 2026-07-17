'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'

const languages = [
  ['🇺🇸', 'English'], ['🇧🇷', 'Português'], ['🇲🇽', 'Español'], ['🇵🇱', 'Polski'], ['🇷🇺', 'Русский'],
  ['🇫🇷', 'Français'], ['🇩🇪', 'Deutsch'], ['🇮🇹', 'Italiano'], ['🇯🇵', '日本語'], ['🇰🇷', '한국어'],
] as const

const products = [
  {
    eyebrow: 'Portable campaign product',
    title: 'Campaign Studio',
    description: 'Create localized, approval-ready campaign packages from a guided agency workflow.',
    icon: '✦',
    href: '/agency',
    accent: '#e7a93f',
    status: 'Available',
    metrics: ['Agency workflow', 'BYOK providers', 'Portable licensing'],
  },
  {
    eyebrow: 'Portable creative engine',
    title: 'Render Engine',
    description: 'Reusable voice, video, caption, and media rendering for SignalBoost or white-label products.',
    icon: '◉',
    href: '/dashboard',
    accent: '#6fd3ff',
    status: 'Enterprise',
    metrics: ['Voice production', 'Video rendering', 'White-label ready'],
  },
  {
    eyebrow: 'Portable operations platform',
    title: 'Console Hub',
    description: 'A secure command center for providers, keys, approvals, monitoring, and enterprise controls.',
    icon: '⌘',
    href: '/dashboard',
    accent: '#a78bfa',
    status: 'Enterprise',
    metrics: ['Provider control', 'Approval governance', 'Operational visibility'],
  },
  {
    eyebrow: 'Portable growth system',
    title: 'Marketing & Sales Engine',
    description: 'Coordinate campaign planning, outreach, sales workflows, and performance intelligence.',
    icon: '↗',
    href: '/dashboard',
    accent: '#56d6a8',
    status: 'Enterprise',
    metrics: ['Campaign planning', 'Sales workflows', 'Performance intelligence'],
  },
  {
    eyebrow: 'Portable executive platform',
    title: 'Executive COS',
    description: 'Bring executive briefings, recommendations, approvals, and next actions into one controlled workspace.',
    icon: '◆',
    href: '/dashboard',
    accent: '#f58ca8',
    status: 'Enterprise',
    metrics: ['Executive briefings', 'Decision support', 'Controlled actions'],
  },
] as const

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0)
  const ribbonItems = useMemo(() => [...languages, ...languages], [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % products.length)
    }, 5200)
    return () => window.clearInterval(timer)
  }, [])

  const move = (direction: number) => {
    setActiveIndex((current) => (current + direction + products.length) % products.length)
  }

  return (
    <main className="command-page">
      <div className="cosmic-bg" aria-hidden="true" />
      <div className="waves" aria-hidden="true">
        <svg className="wave wave-gold" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-120 390C180 160 390 560 720 330S1230 80 1720 330V700H-120Z" fill="url(#goldGradient)" />
          <defs><linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f5c451" stopOpacity="0" /><stop offset="0.48" stopColor="#f5c451" stopOpacity="0.85" /><stop offset="1" stopColor="#9f6b13" stopOpacity="0" /></linearGradient></defs>
        </svg>
        <svg className="wave wave-indigo" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-180 260C160 570 450 70 800 350s650 160 980-110V700H-180Z" fill="url(#indigoGradient)" />
          <defs><linearGradient id="indigoGradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#5f5bd8" stopOpacity="0" /><stop offset="0.5" stopColor="#7772ff" stopOpacity="0.72" /><stop offset="1" stopColor="#332d82" stopOpacity="0" /></linearGradient></defs>
        </svg>
      </div>

      <section className="shell" aria-label="SignalBoost portable product portfolio">
        <header className="topbar">
          <Link href="/" className="brand"><span className="brand-mark">S</span><span>SignalBoost</span></Link>
          <div className="system-status"><i /> Systems operational</div>
          <Link href="/dashboard" className="workspace-link">Open workspace →</Link>
        </header>

        <div className="language-ribbon" aria-label="Supported languages">
          <div className="ribbon-track">{ribbonItems.map(([flag, name], index) => <span key={`${name}-${index}`}><b>{flag}</b>{name}</span>)}</div>
        </div>

        <div className="intro">
          <span className="kicker">SignalBoost portable products</span>
          <h1>Use the products. License the engines.</h1>
          <p>Explore SignalBoost products available as SaaS, enterprise deployments, or white-label licensing. Proprietary orchestration and internal intelligence remain protected.</p>
        </div>

        <div className="carousel" aria-live="polite">
          <button className="nav-button left" onClick={() => move(-1)} aria-label="Previous product">‹</button>
          <div className="card-stage">
            {products.map((product, index) => {
              const offset = (index - activeIndex + products.length) % products.length
              const position = offset === 0 ? 'active' : offset === 1 ? 'next' : 'previous'
              return (
                <article key={product.title} className={`product-card ${position}`} style={{ '--accent': product.accent } as CSSProperties}>
                  <div className="card-head"><div className="product-icon">{product.icon}</div><span className="status-pill"><i /> {product.status}</span></div>
                  <span className="product-eyebrow">{product.eyebrow}</span>
                  <h2>{product.title}</h2>
                  <p>{product.description}</p>
                  <div className="signal-list">{product.metrics.map((metric) => <span key={metric}>✓ {metric}</span>)}</div>
                  <div className="card-actions">
                    <Link href={product.href} className="primary-action">Open product</Link>
                    <Link href="mailto:sales@signalboostapp.com" className="public-action">License / Sales</Link>
                  </div>
                </article>
              )
            })}
          </div>
          <button className="nav-button right" onClick={() => move(1)} aria-label="Next product">›</button>
        </div>

        <div className="dots">{products.map((product, index) => <button key={product.title} className={index === activeIndex ? 'selected' : ''} onClick={() => setActiveIndex(index)} aria-label={`Show ${product.title}`} />)}</div>
        <div className="license-row"><span>SaaS</span><span>Enterprise</span><span>White Label</span><span>Portable Licensing</span></div>
      </section>

      <style jsx>{`
        .command-page{position:relative;min-height:100svh;overflow:hidden;background:#030611;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.cosmic-bg{position:absolute;inset:0;z-index:-20;background:#030611 radial-gradient(circle at 50% -10%,rgba(255,199,44,.1),transparent 58%)}.waves{position:absolute;inset:0;z-index:-10;overflow:hidden;opacity:.22;pointer-events:none}.wave{position:absolute;width:120%;height:78%;left:-10%;filter:blur(3px);animation:driftWaves 18s ease-in-out infinite alternate}.wave-gold{bottom:-20%;opacity:.78}.wave-indigo{top:4%;opacity:.62;animation-duration:23s;animation-direction:alternate-reverse}@keyframes driftWaves{0%{transform:translate3d(-2%,1%,0) scale(1.02)}50%{transform:translate3d(3%,-2%,0) scale(1.06)}100%{transform:translate3d(-1%,2%,0) scale(1.03)}}.shell{width:min(1180px,calc(100% - 32px));min-height:100svh;margin:0 auto;padding:18px 0 22px;display:grid;grid-template-rows:auto auto auto minmax(330px,1fr) auto auto;align-items:center}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:750}.brand-mark{display:grid;place-items:center;width:32px;height:32px;border:1px solid rgba(246,196,83,.48);border-radius:10px;background:rgba(246,196,83,.14);color:#ffd978}.system-status,.status-pill{display:flex;align-items:center;gap:8px;color:#aeb6c9;font-size:12px}.system-status i,.status-pill i{width:7px;height:7px;border-radius:50%;background:#47dfab;box-shadow:0 0 12px #47dfab}.workspace-link,.primary-action,.public-action{color:#fff;text-decoration:none}.language-ribbon{margin-top:14px;overflow:hidden;border-block:1px solid rgba(255,255,255,.075)}.ribbon-track{display:flex;width:max-content;gap:34px;padding:9px 0;animation:ribbonScroll 34s linear infinite}.ribbon-track span{display:flex;align-items:center;gap:8px;color:#949eb3;font-size:11px;white-space:nowrap;text-transform:uppercase;letter-spacing:.12em}@keyframes ribbonScroll{to{transform:translateX(-50%)}}.intro{text-align:center;padding:20px 12px 12px}.kicker{font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#e8bd59}.intro h1{margin:8px 0;font-size:clamp(30px,4.4vw,58px);letter-spacing:-.045em}.intro p{max-width:760px;margin:auto;color:#929cb1;font-size:14px;line-height:1.65}.carousel{position:relative;display:flex;align-items:center;justify-content:center;min-height:350px}.card-stage{position:relative;width:min(820px,calc(100% - 84px));height:320px;perspective:1300px}.product-card{position:absolute;inset:0;margin:auto;width:min(650px,88%);height:295px;padding:24px 26px;border:1px solid color-mix(in srgb,var(--accent) 34%,transparent);border-radius:24px;background:linear-gradient(145deg,rgba(18,23,39,.92),rgba(7,10,20,.84));backdrop-filter:blur(22px);transition:.7s;display:flex;flex-direction:column}.product-card.active{z-index:3;opacity:1}.product-card.next{z-index:2;opacity:.3;transform:translateX(44%) scale(.86)}.product-card.previous{z-index:1;opacity:.26;transform:translateX(-44%) scale(.86)}.card-head{display:flex;justify-content:space-between}.product-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;border:1px solid var(--accent);color:var(--accent)}.product-eyebrow{margin-top:17px;color:var(--accent);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.18em}.product-card h2{font-size:27px;margin:7px 0}.product-card p{margin:0;color:#9aa4b9;font-size:13px;line-height:1.55}.signal-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.signal-list span{font-size:10px;padding:6px 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px}.card-actions{margin-top:auto;display:flex;gap:10px}.primary-action,.public-action{font-size:12px;font-weight:700;border-radius:10px;padding:10px 13px}.primary-action{background:var(--accent);color:#090b11}.public-action{border:1px solid rgba(255,255,255,.12)}.nav-button{position:absolute;z-index:8;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:#080b14;color:#fff;font-size:26px}.left{left:3%}.right{right:3%}.dots{display:flex;justify-content:center;gap:7px}.dots button{width:6px;height:6px;border:0;border-radius:999px;background:#4c5362}.dots .selected{width:26px;background:#e7bd5c}.license-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px;padding:13px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(9,12,22,.5)}.license-row span{text-align:center;font-size:10px;color:#b9c2d4;text-transform:uppercase;letter-spacing:.13em}@media(max-width:760px){.command-page{overflow:auto}.shell{grid-template-rows:auto auto auto minmax(390px,1fr) auto auto}.system-status{display:none}.intro{padding-top:28px}.card-stage{width:calc(100% - 38px);height:360px}.product-card{width:88%;height:330px;padding:20px}.product-card.next{transform:translateX(20%) scale(.88)}.product-card.previous{transform:translateX(-20%) scale(.88)}.nav-button{display:none}.license-row{grid-template-columns:repeat(2,1fr)}.card-actions{flex-wrap:wrap}}@media(prefers-reduced-motion:reduce){.wave,.ribbon-track{animation:none}.product-card{transition:none}}
      `}</style>
    </main>
  )
}
