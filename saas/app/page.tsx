'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { listPublicPortableProducts } from '@/lib/portable-products'

const LINKS = {
  siteReview: '/dashboard/audit',
  securityCheck: '/cybersecurity-check',
  improveYourSite: '/dashboard/improve',
  agency: '/agency',
  license: 'mailto:partners@signalboostapp.com?subject=Licensing%20SignalBoost%20modules',
}

const LANGUAGES = [
  ['🇺🇸', 'English'],
  ['🇲🇽', 'Español'],
  ['🇧🇷', 'Português'],
  ['🇵🇱', 'Polski'],
  ['🇷🇺', 'Русский'],
] as const

const PUBLIC_TOOLS = [
  { key: 'siteReview', icon: '◎', href: LINKS.siteReview, accent: '#f6c453', status: 'free' },
  { key: 'securityCheck', icon: '◇', href: LINKS.securityCheck, accent: '#8b8cff', status: 'free' },
  { key: 'improveYourSite', icon: '✦', href: LINKS.improveYourSite, accent: '#e7a93f', status: 'live' },
] as const

const STATS = [
  { value: 9726, suffix: '', key: 'workflows' },
  { value: 2.4, suffix: 'M', key: 'actions', decimals: 1 },
  { value: 148, suffix: '', key: 'markets' },
  { value: 99.97, suffix: '%', key: 'uptime', decimals: 2 },
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
  const { dict } = useI18n()
  const copy = (path: string, fallback: string) => t(dict, `homepage.${path}`, fallback)

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
        <header className="hero">
          <div className="hero-left">
            <span className="kicker">{copy('kicker', 'AI powered · People in control')}</span>
            <h1>{copy('title', 'One place for every growth task.')}</h1>
          </div>
          <div className="hero-right">
            <div className="langs" aria-label={copy('languagesAria', 'Available in five languages')}>
              {LANGUAGES.map(([flag, name]) => <span key={name} className="lang"><b>{flag}</b>{name}</span>)}
            </div>
            <div className="stats">
              {STATS.map((s) => (
                <Stat
                  key={s.key}
                  {...s}
                  label={copy(`stats.${s.key}`, s.key)}
                />
              ))}
            </div>
          </div>
        </header>

        <section className="zone">
          <span className="zone-label">{t(dict, 'home.publicTools.label', 'Public Tools')}</span>
          <div className="grid grid-3">
            {PUBLIC_TOOLS.map((tool) => {
              const title = t(dict, `home.publicTools.${tool.key}.title`, tool.key)
              const desc = t(dict, `home.publicTools.${tool.key}.description`, '')
              const status = t(dict, `home.publicTools.status.${tool.status}`, tool.status)
              return (
                <Link key={tool.key} href={tool.href} className="mcard" style={{ ['--accent' as string]: tool.accent }}>
                  <div className="mcard-top"><span className="mcard-icon">{tool.icon}</span><span className={tool.status === 'free' ? 'free-pill' : 'live-pill'}>{tool.status === 'live' ? <i /> : null} {status}</span></div>
                  <h2>{title}</h2>
                  <p>{desc}</p>
                  <span className="mcard-open">{copy('open', 'Open')} ↗</span>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="zone">
          <div className="zone-head">
            <span className="zone-label">{copy('portableEngines', 'Portable tools — license the tools behind SignalBoost')}</span>
            <div className="zone-cta">
              <a className="license-btn" href={LINKS.license}>{copy('license', 'License')} →</a>
              <Link href={LINKS.agency} className="studio-btn">{copy('campaignStudio', 'Campaign Studio')}</Link>
            </div>
          </div>
          <div className="grid grid-portables">
            {listPublicPortableProducts().map((p) => {
              const name = copy(`portables.${p.localizationKey}.name`, p.fallbackName)
              const desc = copy(`portables.${p.localizationKey}.desc`, p.fallbackDescription)
              const inner = (
                <>
                  <div className="qcard-top"><span className="qcard-icon">{p.glyph}</span><span className={p.status === 'live' ? 'tag-live' : 'tag-preview'}>{p.status === 'live' ? copy('live', 'Live') : copy('preview', 'Preview')}</span></div>
                  <h3>{name}</h3>
                  <p>{desc}</p>
                </>
              )
              return p.route
                ? <Link key={p.productId} href={p.route} className="qcard is-link">{inner}</Link>
                : <div key={p.productId} className="qcard">{inner}</div>
            })}
          </div>
        </section>
      </div>

      <style jsx>{`
        .home{position:relative;min-height:calc(100svh - 150px);background:#030611;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .cosmic-bg{position:absolute;inset:0;z-index:0;background:#030611 radial-gradient(circle at 50% -10%,rgba(255,199,44,.1),transparent 58%)}
        .waves{position:absolute;inset:0;z-index:0;overflow:hidden;opacity:.2;pointer-events:none}
        .wave{position:absolute;width:120%;height:78%;left:-10%;filter:blur(3px);animation:drift 18s ease-in-out infinite alternate}
        .wave-gold{bottom:-20%;opacity:.78}.wave-indigo{top:4%;opacity:.6;animation-duration:23s;animation-direction:alternate-reverse}
        @keyframes drift{0%{transform:translate3d(-2%,1%,0) scale(1.02)}50%{transform:translate3d(3%,-2%,0) scale(1.06)}100%{transform:translate3d(-1%,2%,0) scale(1.03)}}
        @media (prefers-reduced-motion:reduce){.wave{animation:none}}
        .content{position:relative;z-index:1;width:min(1240px,calc(100% - 40px));margin:0 auto;padding:16px 0 20px;display:flex;flex-direction:column;gap:16px}
        .hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
        .kicker{font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#e8bd59}
        .hero-left h1{margin:6px 0 0;font-size:clamp(22px,3.2vw,40px);letter-spacing:-.04em;line-height:1.02}
        .hero-right{display:flex;flex-direction:column;align-items:flex-end;gap:9px}
        .langs{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
        .lang{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#c3ccdf;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 10px}
        .stats{display:flex;gap:16px}
        .stat{text-align:right}.stat strong{display:block;font-size:15px;color:#fff}.stat span{font-size:9px;color:#7f899e;text-transform:uppercase;letter-spacing:.12em}
        .zone{display:flex;flex-direction:column;gap:10px}
        .zone-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .zone-label{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9aa4b9}
        .zone-cta{display:flex;gap:8px}
        .license-btn,.studio-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 15px;border-radius:999px;font-weight:800;font-size:12px;text-decoration:none}
        .license-btn{color:#0b0b10;background:linear-gradient(180deg,#f5c451,#e2a233);border:1px solid rgba(231,189,92,.5)}
        .studio-btn{color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
        .grid{display:grid;gap:12px}
        .grid-3{grid-template-columns:repeat(3,1fr)}
        .grid-portables{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
        .mcard{display:flex;flex-direction:column;gap:5px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:16px;background:linear-gradient(145deg,rgba(18,23,39,.9),rgba(7,10,20,.8));backdrop-filter:blur(16px);text-decoration:none;color:#fff;transition:transform .18s,border-color .18s}
        .mcard:hover{transform:translateY(-3px)}
        .mcard-top{display:flex;align-items:center;justify-content:space-between}
        .mcard-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;border:1px solid var(--accent);color:var(--accent);font-size:16px}
        .live-pill{display:flex;align-items:center;gap:6px;color:#aeb6c9;font-size:11px}
        .live-pill i{width:6px;height:6px;border-radius:50%;background:#47dfab;box-shadow:0 0 10px #47dfab}
        .free-pill{color:#0b0b10;background:#f5c451;border-radius:999px;padding:3px 7px;font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
        .mcard h2{margin:2px 0 0;font-size:16px}
        .mcard p{margin:0;color:#9aa4b9;font-size:12px;line-height:1.4}
        .mcard-open{margin-top:auto;padding-top:6px;font-size:11px;font-weight:800;color:var(--accent)}
        .qcard{display:flex;flex-direction:column;gap:4px;padding:12px 13px;border:1px solid rgba(246,196,83,.16);border-radius:14px;background:linear-gradient(145deg,rgba(18,23,39,.9),rgba(7,10,20,.8));backdrop-filter:blur(14px);text-decoration:none;color:#fff;transition:transform .16s,border-color .16s;min-width:0}
        .qcard.is-link:hover{transform:translateY(-3px);border-color:#f5c451}
        .qcard-top{display:flex;align-items:center;justify-content:space-between}
        .qcard-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;border:1px solid rgba(246,196,83,.4);color:#f5c542;font-size:14px}
        .tag-live{font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0b0b10;background:#e7bd5c;border-radius:999px;padding:3px 7px}
        .tag-preview{font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#aeb6c9;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:2px 6px}
        .qcard h3{margin:2px 0 0;font-size:13.5px}
        .qcard p{margin:0;color:#9aa4b9;font-size:11px;line-height:1.35}
        @media(max-width:1180px){.home{min-height:auto;overflow:visible}}
        @media(max-width:820px){.grid-3{grid-template-columns:repeat(2,1fr)}.hero{align-items:flex-start}.hero-right{align-items:flex-start}.langs{justify-content:flex-start}}
        @media(max-width:560px){.grid-3,.grid-portables{grid-template-columns:1fr}.stats{flex-wrap:wrap}}
      `}</style>
    </main>
  )
}
