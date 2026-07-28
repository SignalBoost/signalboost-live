// saas/app/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PreviewProjects } from '@/components/home/PreviewProjects'
import { t } from '@/lib/i18n/t'
import { listPublicPortableProducts } from '@/lib/portable-products'

const LINKS = {
  siteReview: '/dashboard/audit',
  securityCheck: '/cybersecurity-check',
  improveYourSite: '/dashboard/improve',
  agency: '/agency',
  licenseEmail: 'partners@signalboostapp.com',
}

const LANGUAGES = [
  ['🇺🇸', 'en'],
  ['🇲🇽', 'es'],
  ['🇧🇷', 'pt'],
  ['🇵🇱', 'pl'],
  ['🇷🇺', 'ru'],
] as const

const PUBLIC_TOOLS = [
  { key: 'audit', icon: '◎', href: LINKS.siteReview, accent: '#f6c453', status: 'free' },
  { key: 'security', icon: '◇', href: LINKS.securityCheck, accent: '#8b8cff', status: 'free' },
  { key: 'optimization', icon: '✦', href: LINKS.improveYourSite, accent: '#e7a93f', status: 'live' },
] as const

type PortableRuntimeStatus = 'active' | 'idle' | 'unreachable' | 'no_live_source'
type SystemStatus = 'active' | 'idle' | 'degraded' | 'unreachable'
type Copy = (path: string) => string

type PortableRuntime = {
  productId: string
  status: PortableRuntimeStatus
  totalRows: number
  lastActivityAt: string | null
}

type LiveActivityResponse = {
  generatedAt: string
  status: SystemStatus
  totalRows: number
  activePortables: number
  portables: PortableRuntime[]
}

function useCountUp(target: number, decimals = 0, duration = 900) {
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

function Stat({ value, label, locale }: { value: number; label: string; locale: string }) {
  const count = useCountUp(value)
  return <div className="stat"><strong>{count.toLocaleString(locale)}</strong><span>{label}</span></div>
}

function relativeTime(value: string | null, locale: string, copy: Copy): string {
  if (!value) return copy('activity.none')
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return copy('activity.unavailable')

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
  if (seconds < 60) return formatter.format(-seconds, 'second')

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return formatter.format(-minutes, 'minute')

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return formatter.format(-hours, 'hour')

  return formatter.format(-Math.floor(hours / 24), 'day')
}

export default function Home() {
  const { dict, lang } = useI18n()
  const copy: Copy = (path) => t(dict, `homepage.${path}`)
  const [live, setLive] = useState<LiveActivityResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/portable-products/live', { cache: 'no-store' })
        if (!response.ok) throw new Error(`live activity request failed: ${response.status}`)
        const payload = await response.json() as LiveActivityResponse
        if (!cancelled) setLive(payload)
      } catch {
        if (!cancelled) setLive(null)
      }
    }
    void load()
    const timer = window.setInterval(load, 30_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  const activityByProduct = useMemo(
    () => new Map((live?.portables ?? []).map((item) => [item.productId, item])),
    [live],
  )
  const licenseHref = `mailto:${LINKS.licenseEmail}?subject=${encodeURIComponent(copy('licenseEmailSubject'))}`
  const systemStatus = live ? copy(`system.${live.status}`) : copy('system.loading')

  return (
    <main className="home">
      <div className="cosmic-bg" aria-hidden="true" />
      <div className="waves" aria-hidden="true">
        <svg className="wave wave-gold" viewBox="0 0 1600 620" preserveAspectRatio="none"><path d="M-120 390C180 160 390 560 720 330S1230 80 1720 330V700H-120Z" fill="url(#gg)" /><defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f5c451" stopOpacity="0" /><stop offset="0.48" stopColor="#f5c451" stopOpacity="0.85" /><stop offset="1" stopColor="#9f6b13" stopOpacity="0" /></linearGradient></defs></svg>
        <svg className="wave wave-indigo" viewBox="0 0 1600 620" preserveAspectRatio="none"><path d="M-180 260C160 570 450 70 800 350s650 160 980-110V700H-180Z" fill="url(#ig)" /><defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#5f5bd8" stopOpacity="0" /><stop offset="0.5" stopColor="#7772ff" stopOpacity="0.72" /><stop offset="1" stopColor="#332d82" stopOpacity="0" /></linearGradient></defs></svg>
      </div>

      <div className="content">
        <header className="hero">
          <div className="hero-left"><span className="kicker">{copy('kicker')}</span><h1>{copy('title')}</h1></div>
          <div className="hero-right">
            <div className="langs" aria-label={copy('languagesAria')}>{LANGUAGES.map(([flag, code]) => <span key={code} className="lang"><b>{flag}</b>{copy(`languages.${code}`)}</span>)}</div>
            <div className="stats" aria-label={copy('stats.aria')}>
              <Stat value={live?.activePortables ?? 0} label={copy('stats.activePortables')} locale={lang} />
              <Stat value={live?.totalRows ?? 0} label={copy('stats.verifiedRows')} locale={lang} />
              <div className="stat"><strong className={`system-${live?.status ?? 'unreachable'}`}>{systemStatus}</strong><span>{copy('stats.systemStatus')}</span></div>
            </div>
          </div>
        </header>

        <section className="zone">
          <span className="zone-label">{copy('publicModules')}</span>
          <div className="grid grid-3">
            {PUBLIC_TOOLS.map((tool) => {
              const title = copy(`modules.${tool.key}.title`)
              const desc = copy(`modules.${tool.key}.desc`)
              const status = copy(`toolStatus.${tool.status}`)
              return <Link key={tool.key} href={tool.href} className="mcard" style={{ ['--accent' as string]: tool.accent }}><div className="mcard-top"><span className="mcard-icon">{tool.icon}</span><span className={tool.status === 'free' ? 'free-pill' : 'live-pill'}>{tool.status === 'live' ? <i /> : null} {status}</span></div><h2>{title}</h2><p>{desc}</p><span className="mcard-open">{copy('open')} ↗</span></Link>
            })}
          </div>
        </section>

        <section className="zone">
          <div className="zone-head"><span className="zone-label">{copy('portableEngines')}</span><div className="zone-cta"><a className="license-btn" href={licenseHref}>{copy('license')} →</a><Link href={LINKS.agency} className="studio-btn">{copy('campaignStudio')}</Link></div></div>
          <div className="grid grid-portables">
            {listPublicPortableProducts().map((p) => {
              const name = copy(`portables.${p.localizationKey}.name`)
              const desc = copy(`portables.${p.localizationKey}.desc`)
              const runtime = activityByProduct.get(p.manifest.productId)
              const status = runtime?.status ?? 'unreachable'
              const inner = <><div className="qcard-top"><span className="qcard-icon">{p.glyph}</span><span className={`maturity-tag maturity-${p.manifest.status}`}>{copy(`portableMaturity.${p.manifest.status}`)}</span></div><h3>{name}</h3><p>{desc}</p><div className="runtime-metrics"><strong>{runtime ? runtime.totalRows.toLocaleString(lang) : '—'}</strong><span>{copy('stats.verifiedRows')}</span><small><span className={`runtime-dot runtime-${status}`}><i /></span>{copy(`runtime.${status}`)}{runtime ? ` · ${relativeTime(runtime.lastActivityAt, lang, copy)}` : ''}</small></div></>
              return p.route ? <Link key={p.manifest.productId} href={p.route} className="qcard is-link">{inner}</Link> : <div key={p.manifest.productId} className="qcard">{inner}</div>
            })}
          </div>
        </section>

        <PreviewProjects />
      </div>

      <style jsx>{`
        .home{position:relative;min-height:calc(100svh - 150px);background:#030611;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.cosmic-bg{position:absolute;inset:0;z-index:0;background:#030611 radial-gradient(circle at 50% -10%,rgba(255,199,44,.1),transparent 58%)}.waves{position:absolute;inset:0;z-index:0;overflow:hidden;opacity:.2;pointer-events:none}.wave{position:absolute;width:120%;height:78%;left:-10%;filter:blur(3px);animation:drift 18s ease-in-out infinite alternate}.wave-gold{bottom:-20%;opacity:.78}.wave-indigo{top:4%;opacity:.6;animation-duration:23s;animation-direction:alternate-reverse}@keyframes drift{0%{transform:translate3d(-2%,1%,0) scale(1.02)}50%{transform:translate3d(3%,-2%,0) scale(1.06)}100%{transform:translate3d(-1%,2%,0) scale(1.03)}}@media (prefers-reduced-motion:reduce){.wave{animation:none}}.content{position:relative;z-index:1;width:min(1240px,calc(100% - 40px));margin:0 auto;padding:16px 0 20px;display:flex;flex-direction:column;gap:16px}.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}.kicker{font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#e8bd59}.hero-left h1{margin:6px 0 0;font-size:clamp(22px,3.2vw,40px);letter-spacing:-.04em;line-height:1.02}.hero-right{display:flex;flex-direction:column;align-items:flex-end;gap:9px}.langs{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.lang{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#c3ccdf;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 10px}.stats{display:flex;gap:16px}.stat{text-align:right}.stat strong{display:block;font-size:15px;color:#fff;text-transform:capitalize}.stat span{font-size:9px;color:#7f899e;text-transform:uppercase;letter-spacing:.12em}.system-active{color:#47dfab!important}.system-degraded,.system-unreachable{color:#ffb65c!important}.zone{display:flex;flex-direction:column;gap:10px}.zone-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.zone-label{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9aa4b9}.zone-cta{display:flex;gap:8px}.license-btn,.studio-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 15px;border-radius:999px;font-weight:800;font-size:12px;text-decoration:none}.license-btn{color:#0b0b10;background:linear-gradient(180deg,#f5c451,#e2a233);border:1px solid rgba(231,189,92,.5)}.studio-btn{color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}.grid{display:grid;gap:12px}.grid-3{grid-template-columns:repeat(3,1fr)}.grid-portables{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.mcard,.qcard{display:flex;flex-direction:column;border-radius:16px;background:linear-gradient(145deg,rgba(18,23,39,.9),rgba(7,10,20,.8));backdrop-filter:blur(16px);text-decoration:none;color:#fff}.mcard{gap:5px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);transition:transform .18s,border-color .18s}.mcard:hover{transform:translateY(-3px)}.mcard-top,.qcard-top{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap}.mcard-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;border:1px solid var(--accent);color:var(--accent);font-size:16px}.live-pill{display:flex;align-items:center;gap:6px;color:#aeb6c9;font-size:11px}.live-pill i,.runtime-tag i{width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}.free-pill{color:#0b0b10;background:#f5c451;border-radius:999px;padding:3px 7px;font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.mcard h2{margin:2px 0 0;font-size:16px}.mcard p{margin:0;color:#9aa4b9;font-size:12px;line-height:1.4}.mcard-open{margin-top:auto;padding-top:6px;font-size:11px;font-weight:800;color:var(--accent)}.qcard{gap:5px;padding:13px;border:1px solid rgba(246,196,83,.16);transition:transform .16s,border-color .16s;min-width:0}.qcard.is-link:hover{transform:translateY(-3px);border-color:#f5c451}.qcard-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;border:1px solid rgba(246,196,83,.4);color:#f5c542;font-size:14px}.qcard h3{margin:2px 0 0;font-size:13.5px}.qcard p{margin:0;color:#9aa4b9;font-size:11px;line-height:1.35}.runtime-tag{display:inline-flex;align-items:center;gap:6px;font-size:8.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;border-radius:999px;padding:3px 7px;border:1px solid currentColor}.maturity-tag{display:inline-flex;align-items:center;font-size:8.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;border-radius:999px;padding:3px 7px;border:1px solid currentColor}.maturity-live{color:#47dfab}.maturity-preview{color:#f5c451}.maturity-deprecated{color:#ff8b8b}.runtime-dot{display:inline-flex;margin-right:5px}.runtime-dot i{width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}.runtime-active{color:#47dfab}.runtime-idle{color:#f5c451}.runtime-unreachable{color:#ff8b8b}.runtime-no_live_source{color:#9aa4b9}.runtime-metrics{margin-top:auto;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:auto 1fr;column-gap:7px;align-items:baseline}.runtime-metrics strong{font-size:16px}.runtime-metrics span{font-size:9px;color:#8f9bb0;text-transform:uppercase;letter-spacing:.1em}.runtime-metrics small{grid-column:1/-1;margin-top:3px;color:#aeb6c9;font-size:10px}@media(max-width:1180px){.home{min-height:auto;overflow:visible}}@media(max-width:820px){.grid-3{grid-template-columns:repeat(2,1fr)}.hero{align-items:flex-start}.hero-right{align-items:flex-start}.langs{justify-content:flex-start}}@media(max-width:560px){.grid-3,.grid-portables{grid-template-columns:1fr}.stats{flex-wrap:wrap}}
      `}</style>
    </main>
  )
}
