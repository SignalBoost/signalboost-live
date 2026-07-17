'use client'

import Link from 'next/link'

const mainModules = [
  {
    title: 'Audit Cockpit',
    description: 'Review public websites and turn findings into an ordered business action plan.',
    items: ['Compliance checks', 'Manual data review', 'Risk scoring'],
    href: 'https://saas.signalboostapp.com/dashboard/audit',
  },
  {
    title: 'Cybersecurity Station',
    description: 'Inspect public-facing security signals without intrusive access.',
    items: ['Threat analysis', 'Manual patching guidance', 'Security insights'],
    href: 'https://saas.signalboostapp.com/website-optimizer',
  },
  {
    title: 'Optimization Hub',
    description: 'Improve workflows, efficiency, and resource use with guided recommendations.',
    items: ['Workflow tuning', 'Efficiency tips', 'Resource management'],
    href: 'https://saas.signalboostapp.com/website-optimizer',
  },
] as const

const portables = [
  {
    title: 'Campaign Studio',
    summary: 'Campaign planning and asset creation for agencies and marketing teams.',
    href: '/agency',
    available: true,
  },
  {
    title: 'Render Engine',
    summary: 'Portable voice, video, caption, and creative-rendering capabilities.',
    href: '/dashboard',
    available: true,
  },
  {
    title: 'Console Hub',
    summary: 'Enterprise controls for providers, approvals, monitoring, and operations.',
    href: '/dashboard',
    available: true,
  },
  {
    title: 'Marketing & Sales',
    summary: 'Reusable campaign, outreach, audience, and sales workflow capabilities.',
    href: '/dashboard',
    available: true,
  },
  {
    title: 'Executive COS',
    summary: 'Human-monitored executive guidance, briefings, recommendations, and actions.',
    href: '/dashboard',
    available: true,
  },
] as const

export default function Home() {
  return (
    <main className="page">
      <div className="cosmic-bg" aria-hidden="true" />
      <div className="waves" aria-hidden="true">
        <svg className="wave wave-gold" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-120 390C180 160 390 560 720 330S1230 80 1720 330V700H-120Z" fill="url(#goldGradient)" />
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#f5c451" stopOpacity="0" />
              <stop offset="0.48" stopColor="#f5c451" stopOpacity="0.62" />
              <stop offset="1" stopColor="#9f6b13" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <svg className="wave wave-indigo" viewBox="0 0 1600 620" preserveAspectRatio="none">
          <path d="M-180 260C160 570 450 70 800 350s650 160 980-110V700H-180Z" fill="url(#indigoGradient)" />
          <defs>
            <linearGradient id="indigoGradient" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#5f5bd8" stopOpacity="0" />
              <stop offset="0.5" stopColor="#7772ff" stopOpacity="0.5" />
              <stop offset="1" stopColor="#332d82" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand" aria-label="SignalBoost home">
            <span className="brand-mark">S</span>
            <span className="brand-copy"><strong>signalboost</strong><small>CLIENT SUITE</small></span>
          </Link>

          <nav className="nav" aria-label="Primary navigation">
            <Link href="/">Home</Link>
            <Link href="/agency">Campaign Studio</Link>
            <Link href="/dashboard">Console Hub</Link>
            <Link href="/dashboard">SaaS Station</Link>
            <Link href="/dashboard">Marketing Studio</Link>
          </nav>

          <div className="top-actions">
            <span className="languages">EN · ES · PT · PL · RU</span>
            <Link href="/login" className="logout">Log in</Link>
          </div>
        </header>

        <section className="hero section-block">
          <div className="section-label"><span /> Hero Section <span /></div>
          <h1><strong>SignalBoost</strong> — AI-Driven Architecture with Human Monitoring</h1>
          <p>Manual-mode SaaS platform with COS guidance across all public modules.</p>
          <p className="availability">Available in five languages: EN, ES, PT, PL, RU</p>
          <div className="hero-actions">
            <Link href="/login" className="button primary">Login</Link>
            <Link href="/support" className="button secondary">Contact Support</Link>
          </div>
        </section>

        <section className="section-block modules-section">
          <div className="section-label"><span /> Main Modules <span /></div>
          <div className="module-grid">
            {mainModules.map((module) => (
              <article className="module-card" key={module.title}>
                <div className="module-title">{module.title}</div>
                <p>{module.description}</p>
                <ul>
                  {module.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <Link href={module.href}>Open module →</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block portables-section" id="portables">
          <div className="section-label"><span /> <strong>Portables Suite</strong> — Premium Add-Ons <span /></div>
          <p className="section-copy">Human-monitored portable products available for SaaS use, enterprise integration, white labeling, or licensing.</p>

          <div className="platform-node">SignalBoost Platform</div>
          <div className="connector-line" aria-hidden="true" />
          <div className="portable-grid">
            {portables.map((portable) => (
              <Link href={portable.href} className="portable-card" key={portable.title}>
                <span className="portable-status">Available</span>
                <strong>{portable.title}</strong>
                <small>{portable.summary}</small>
                <span className="portable-action">Explore →</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="closing section-block">
          <p><strong>AI-driven architecture, human-monitored</strong> — multilingual: EN · ES · PT · PL · RU</p>
          <Link href="/support" className="button secondary wide">Contact Support to Purchase Portables</Link>
        </section>

        <footer>
          <Link href="/about">About</Link>
          <span>•</span>
          <Link href="/docs">Docs</Link>
          <span>•</span>
          <Link href="/support">Support</Link>
          <span>•</span>
          <Link href="/privacy">Privacy</Link>
          <span>•</span>
          <Link href="/terms">Terms</Link>
          <span>•</span>
          <Link href="/contact">Contact</Link>
        </footer>
      </div>

      <style jsx>{`
        *{box-sizing:border-box}.page{position:relative;min-height:100svh;padding:22px;background:#030611;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.cosmic-bg{position:fixed;inset:0;z-index:0;background:#030611 radial-gradient(circle at 50% -10%,rgba(255,199,44,.09),transparent 58%)}.waves{position:fixed;inset:0;z-index:0;overflow:hidden;opacity:.18;pointer-events:none}.wave{position:absolute;width:120%;height:78%;left:-10%;filter:blur(4px);animation:driftWaves 18s ease-in-out infinite alternate}.wave-gold{bottom:-24%}.wave-indigo{top:8%;animation-duration:23s;animation-direction:alternate-reverse}@keyframes driftWaves{0%{transform:translate3d(-2%,1%,0) scale(1.02)}50%{transform:translate3d(3%,-2%,0) scale(1.06)}100%{transform:translate3d(-1%,2%,0) scale(1.03)}}.shell{position:relative;z-index:1;width:min(1180px,100%);margin:0 auto;border:1px solid rgba(255,255,255,.14);border-radius:26px;background:rgba(7,10,18,.82);box-shadow:0 35px 100px rgba(0,0,0,.55);backdrop-filter:blur(18px);overflow:hidden}.topbar{min-height:66px;padding:10px 18px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:20px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.025)}.brand{display:flex;align-items:center;gap:9px;color:#fff;text-decoration:none}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid rgba(246,196,83,.6);border-radius:50%;background:rgba(246,196,83,.12);color:#f6c453;font-weight:900}.brand-copy{display:flex;flex-direction:column;line-height:1}.brand-copy strong{font-size:13px}.brand-copy small{font-size:7px;letter-spacing:.16em;color:#8f99ad;margin-top:3px}.nav{display:flex;justify-content:center;gap:20px;flex-wrap:wrap}.nav a,.top-actions a{color:#c8cfdd;text-decoration:none;font-size:11px;font-weight:700}.nav a:hover,.top-actions a:hover{color:#f6c453}.top-actions{display:flex;align-items:center;gap:12px}.languages{font-size:9px;color:#9aa4b7;white-space:nowrap}.logout{padding:8px 13px;border:1px solid rgba(255,255,255,.17);border-radius:999px}.section-block{padding:34px clamp(20px,5vw,64px);border-bottom:1px solid rgba(255,255,255,.1)}.section-label{display:flex;align-items:center;justify-content:center;gap:12px;color:#818b9e;font-size:12px;letter-spacing:.04em;margin-bottom:22px}.section-label span{height:1px;flex:1;max-width:230px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.3))}.section-label span:last-child{background:linear-gradient(90deg,rgba(255,255,255,.3),transparent)}.hero{text-align:center;padding-top:42px;padding-bottom:44px}.hero h1{font-size:clamp(25px,3.2vw,42px);letter-spacing:-.04em;margin:0 auto 10px;max-width:920px}.hero h1 strong{color:#f5c451}.hero p{margin:4px auto;color:#a8b1c2;font-size:14px}.availability{font-size:11px!important;color:#d9b65e!important}.hero-actions{display:flex;justify-content:center;gap:12px;margin-top:24px}.button{display:inline-flex;justify-content:center;align-items:center;min-height:42px;padding:0 22px;border-radius:10px;text-decoration:none;font-size:12px;font-weight:800}.primary{background:#f5c451;color:#090b11}.secondary{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);color:#fff}.module-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.module-card{display:flex;flex-direction:column;min-height:250px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:linear-gradient(160deg,rgba(19,25,40,.88),rgba(7,10,18,.92));overflow:hidden}.module-title{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12);font-weight:900;color:#fff;background:rgba(255,255,255,.035)}.module-card p{padding:14px 16px 0;margin:0;color:#8f99ac;font-size:12px;line-height:1.55}.module-card ul{margin:14px 16px;padding-left:18px;color:#c5ccda;font-size:12px;line-height:1.8}.module-card a{margin:auto 16px 16px;color:#f5c451;text-decoration:none;font-size:11px;font-weight:800}.portables-section{text-align:center}.section-copy{max-width:760px;margin:-8px auto 28px;color:#929caf;font-size:13px;line-height:1.6}.platform-node{display:inline-flex;align-items:center;justify-content:center;padding:11px 20px;border:1px solid rgba(245,196,81,.48);border-radius:10px;background:rgba(245,196,81,.1);color:#ffe092;font-size:12px;font-weight:900}.connector-line{width:1px;height:28px;margin:0 auto;background:linear-gradient(#f5c451,rgba(245,196,81,.12))}.portable-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.portable-card{position:relative;display:flex;flex-direction:column;min-height:185px;padding:18px 15px;border:1px solid rgba(245,196,81,.25);border-radius:14px;background:linear-gradient(180deg,rgba(245,196,81,.08),rgba(12,15,25,.82));text-align:left;text-decoration:none;color:#fff;transition:transform .18s,border-color .18s}.portable-card:hover{transform:translateY(-3px);border-color:rgba(245,196,81,.65)}.portable-status{align-self:flex-start;margin-bottom:18px;padding:4px 7px;border-radius:999px;background:rgba(73,222,171,.1);border:1px solid rgba(73,222,171,.25);color:#65e3b5;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.portable-card strong{font-size:14px}.portable-card small{display:block;margin-top:8px;color:#919bad;font-size:10px;line-height:1.5}.portable-action{margin-top:auto;padding-top:14px;color:#f5c451;font-size:10px;font-weight:900}.closing{text-align:center}.closing p{font-size:12px;color:#b4bdcc;margin:0 0 18px}.wide{min-width:min(390px,100%)}footer{display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap;padding:18px;color:#737e91;font-size:10px}footer a{color:#8d97aa;text-decoration:none}@media(max-width:900px){.topbar{grid-template-columns:1fr auto}.nav{grid-column:1/-1;grid-row:2}.module-grid{grid-template-columns:1fr}.portable-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.page{padding:8px}.shell{border-radius:18px}.topbar{grid-template-columns:1fr}.top-actions{justify-content:space-between}.nav{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}.section-block{padding:28px 16px}.hero-actions{flex-direction:column}.module-grid,.portable-grid{grid-template-columns:1fr}.section-label{font-size:10px}.languages{white-space:normal}}
      `}</style>
    </main>
  )
}
