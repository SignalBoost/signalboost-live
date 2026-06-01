'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  free: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' },
  starter: { bg: 'rgba(59,130,246,0.18)', color: '#7ab8ff' },
  pro: { bg: 'rgba(255,195,0,0.18)', color: '#ffc300' },
  business: { bg: 'rgba(74,222,128,0.18)', color: '#4ade80' },
}

const COWORK_LINKS = [
  { icon: '⭐', key: 'reviews', href: '/dashboard/reviews', fallback: 'Reviews', desc: 'Collect, route, and moderate customer trust signals.' },
  { icon: '📅', key: 'calendar', href: '/dashboard/calendar', fallback: 'Calendar', desc: 'Plan launches, reminders, and customer follow-ups.' },
  { icon: '📊', key: 'spreadsheets', href: '/dashboard/spreadsheets', fallback: 'Spreadsheets', desc: 'Import lists and coordinate CRM-ready rows.' },
  { icon: '📡', key: 'outreach', href: '/dashboard/outreach/outreach', fallback: 'Outreach', desc: 'Turn leads into approved multilingual campaigns.' },
]

const AI_STUDIO_LINKS = [
  { icon: '🎙', key: 'audio', href: '/dashboard/audio', fallback: 'Generate Audio', desc: 'Create voice assets from scripts and briefs.' },
  { icon: '🎥', key: 'video', href: '/dashboard/video', fallback: 'Create Videos', desc: 'Generate social-ready video concepts and clips.' },
  { icon: '🖥', key: 'improve', href: '/dashboard/improve', fallback: 'Improve Website', desc: 'Audit SEO, clarity, accessibility, and conversion.' },
  { icon: '🎧', key: 'podcastStudio', href: '/dashboard/podcast/studio', fallback: 'Optimize Podcast Studio', desc: 'Improve episodes, transcripts, clips, and metadata.' },
  { icon: '🧪', key: 'lab', href: '/dashboard/lab', fallback: 'Lab', desc: 'Experiment with emerging AI production workflows.' },
  { icon: '👨‍🎓', key: 'apprentice', href: '/dashboard/apprentice', fallback: 'Workshop Apprentice', desc: 'Learn each workspace with guided tutorials.' },
]

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pathname = usePathname()
  const { lang, setLang, dict } = useI18n()
  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState<number>(0)
  const [plan, setPlan] = useState<string>('free')
  const [userName, setUserName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null
      setUser(u)
      if (u) { fetchCredits(); checkAdminRole(u) } else setIsAdmin(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) { fetchCredits(); checkAdminRole(u) } else setIsAdmin(false)
    })
    return () => { listener.subscription.unsubscribe() }
  }, [])

  async function checkAdminRole(u: any) {
    const metadataRole = u?.user_metadata?.role
    if (metadataRole === 'owner' || metadataRole === 'admin') { setIsAdmin(true); return }
    try {
      const { data } = await supabase.from('team_members').select('role,status,owner_id,member_id').or(`member_id.eq.${u.id},owner_id.eq.${u.id}`)
      setIsAdmin(!!data?.some((m: any) => (m.status === 'active' || m.owner_id === u.id) && (m.role === 'owner' || m.role === 'admin' || m.owner_id === u.id)))
    } catch { setIsAdmin(false) }
  }

  async function fetchCredits() {
    try {
      const res = await fetch('/api/credits')
      const data = await res.json()
      if (typeof data.credits === 'number') setCredits(data.credits)
      if (data.plan) setPlan(data.plan)
      if (data.name) setUserName(data.name)
    } catch {}
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 40, H = 40
    canvas.width = W; canvas.height = H
    const cx = W / 2, cy = H - 8
    let rings: { r: number; alpha: number }[] = []
    let last = 0, raf: number
    function draw(ts: number) {
      ctx.clearRect(0, 0, W, H)
      if (!last || ts - last > 2000) { rings.push({ r: 0, alpha: 1 }); last = ts }
      rings = rings.filter(r => r.alpha > 0.01)
      for (const r of rings) {
        r.r += 0.8; r.alpha -= 0.012
        ctx.globalAlpha = Math.max(0, r.alpha)
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(cx, cy, r.r, Math.PI, 0); ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = GOLD
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  async function handleLogout() {
    sessionStorage.removeItem('greetingDismissed')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const planStyle = PLAN_STYLES[plan] || PLAN_STYLES.free
  const planLabel = t(dict, `plan.${plan}`, plan.charAt(0).toUpperCase() + plan.slice(1))
  const cockpitMode = pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin')

  function navLink(href: string, label: string, icon?: string) {
    const active = pathname === href || (href !== '/' && pathname?.startsWith(href))
    return <Link className={active ? 'sb-nav-link sb-nav-link--active' : 'sb-nav-link'} href={href} onClick={() => setMobileOpen(false)}>{icon && <span>{icon}</span>}{label}</Link>
  }

  function dropdown(label: string, items: typeof COWORK_LINKS, icon: string) {
    return (
      <div className="sb-nav-dropdown">
        <button type="button" className="sb-nav-link sb-nav-trigger">{icon} {label} <span aria-hidden="true">▾</span></button>
        <div className="sb-nav-menu">
          {items.map(item => (
            <Link key={item.href} href={item.href} className="sb-nav-menu-item" onClick={() => setMobileOpen(false)}>
              <span className="sb-nav-menu-icon">{item.icon}</span>
              <span><strong>{t(dict, `navGroups.${item.key}`, item.fallback)}</strong><small>{item.desc}</small></span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <nav className="sb-fathom-nav">
        <Link href="/" className="sb-nav-brand" onClick={() => setMobileOpen(false)}>
          <canvas ref={canvasRef} />
          <span>signal<b>boost</b></span>
        </Link>

        <button className="sb-mobile-toggle" type="button" onClick={() => setMobileOpen(open => !open)} aria-expanded={mobileOpen} aria-label={t(dict, 'nav.openMenu', 'Open menu')}>☰</button>

        <div className={mobileOpen ? 'sb-nav-content sb-nav-content--open' : 'sb-nav-content'}>
          <div className="sb-nav-primary">
            {dropdown(t(dict, 'navGroups.cowork', 'Cowork'), COWORK_LINKS, '✦')}
            {dropdown(t(dict, 'navGroups.aiStudio', 'AI Studio'), AI_STUDIO_LINKS, '◈')}
            {navLink('/', t(dict, 'nav.marketplace', 'Marketplace'), '🛰️')}
            {navLink('/pricing', t(dict, 'pricing', 'Pricing'), '💳')}
            {navLink('/support', t(dict, 'support.help', 'Help'), '❔')}
            {cockpitMode && isAdmin && navLink('/admin', t(dict, 'aiNav.admin', 'Admin'), '🛡️')}
          </div>

          <div className="sb-nav-actions">
            <select value={lang} onChange={e => setLang(e.target.value)} className="sb-language-select" aria-label={t(dict, 'nav.language', 'Language')}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>

            {user && (
              <div className="sb-account-chip" aria-label={t(dict, 'topbar.account', 'Account')}>
                <span>⚡ {credits}</span>
                <b style={{ background: planStyle.bg, color: planStyle.color }}>{planLabel}</b>
                <small>{userName ?? t(dict, 'topbar.account', 'Account')}</small>
              </div>
            )}

            {user ? (
              <button onClick={handleLogout} className="sb-logout-button">{t(dict, 'logout', 'Log out')}</button>
            ) : (
              <button onClick={() => setShowAuth(true)} className="sb-get-started-button">{t(dict, 'getStarted', 'Get started')}</button>
            )}
          </div>
        </div>
      </nav>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
