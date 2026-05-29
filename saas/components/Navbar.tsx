'use client'

// saas/components/Navbar.tsx
// Topbar (credits/plan/name) merged into the tool pills bar.
// The separate Topbar component is no longer needed in dashboard layout.

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
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  free:     { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' },
  starter:  { bg: 'rgba(59,130,246,0.18)',  color: '#7ab8ff' },
  pro:      { bg: 'rgba(255,195,0,0.18)',   color: '#ffc300' },
  business: { bg: 'rgba(74,222,128,0.18)',  color: '#4ade80' },
}

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pathname  = usePathname()
  const { lang, setLang, dict } = useI18n()

  const [showAuth, setShowAuth]   = useState(false)
  const [user, setUser]           = useState<any>(null)
  const [credits, setCredits]     = useState<number>(0)
  const [plan, setPlan]           = useState<string>('free')
  const [userName, setUserName]   = useState<string | null>(null)

  // Auth + credits
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null
      setUser(u)
      if (u) fetchCredits()
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchCredits()
    })
    return () => { listener.subscription.unsubscribe() }
  }, [])

  async function fetchCredits() {
    try {
      const res  = await fetch('/api/credits')
      const data = await res.json()
      if (typeof data.credits === 'number') setCredits(data.credits)
      if (data.plan)  setPlan(data.plan)
      if (data.name)  setUserName(data.name)
    } catch { /* silent */ }
  }

  // Signal animation
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

  const navLinks = [
    { label: t(dict, 'home', 'Home'),           href: '/' },
    { label: t(dict, 'podcasters', 'Podcasters'), href: '/podcasters' },
    { label: t(dict, 'dashboard', 'Dashboard'), href: '/dashboard' },
    { label: t(dict, 'pricing', 'Pricing'),     href: '/pricing' },
    { label: t(dict, 'docs', 'Docs'),            href: '/docs' },
  ]

  const toolLinks = [
    { icon: '📣', label: t(dict, 'promoteBusiness', 'Promote business'), href: '/dashboard/promote',    featured: true },
    { icon: '🌐', label: t(dict, 'buildWebsite', 'Build a website'),      href: '/dashboard/builder',   featured: false },
    { icon: '⭐', label: t(dict, 'collectReviews', 'Collect reviews'),    href: '/dashboard/reviews',    featured: false },
    { icon: '🎙️', label: t(dict, 'generateAudio', 'Generate audio'),     href: '/dashboard/audio',      featured: false },
    { icon: '🎬', label: t(dict, 'createVideos', 'Create videos'),        href: '/dashboard/video',      featured: false },
    { icon: '🧪', label: typeof dict?.lab === 'string' ? dict.lab : 'Lab', href: '/dashboard/lab',      featured: false },
    { icon: '🛠️', label: t(dict, 'navbar.workshopApprentice', 'Workshop Apprentice'), href: '/dashboard/apprentice', featured: false },
  ]

  const planStyle = PLAN_STYLES[plan] || PLAN_STYLES.free
  const planLabel = t(dict, `plan.${plan}`, plan.charAt(0).toUpperCase() + plan.slice(1))

  return (
    <>
      {/* ── Main nav bar ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        background: 'rgba(10,10,15,.88)',
        borderBottom: user ? 'none' : '1px solid var(--border-soft)',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <canvas ref={canvasRef} style={{ width: 40, height: 40 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>
            signal<span style={{ color: GOLD }}>boost</span>
          </span>
        </Link>

        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {navLinks.map(item => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} style={{
                textDecoration: 'none',
                color: isActive ? '#fff' : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 500,
                transition: 'all 0.15s',
              }}>
                {item.label}
              </Link>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={lang} onChange={e => setLang(e.target.value)} style={{
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-medium)', borderRadius: 999,
            padding: '8px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>

          <details style={{ position: 'relative' }}>
            <summary style={{ listStyle: 'none', cursor: 'pointer', color: 'var(--text-muted)', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700 }}>
              {t(dict, 'support.help', 'Help')} ▾
            </summary>
            <div style={{ position: 'absolute', right: 0, top: 42, minWidth: 210, padding: 10, borderRadius: 14, background: 'rgba(10,10,15,.98)', border: '1px solid var(--border-soft)', boxShadow: '0 18px 50px rgba(0,0,0,.35)', display: 'grid', gap: 6 }}>
              <Link href="/faq" style={{ color: '#fff', textDecoration: 'none', padding: '8px 10px', borderRadius: 10 }}>❓ {t(dict, 'support.faq', 'FAQ')}</Link>
              <Link href="/support" style={{ color: '#fff', textDecoration: 'none', padding: '8px 10px', borderRadius: 10 }}>✉️ {t(dict, 'support.contact', 'Contact Support')}</Link>
              <Link href="/docs" style={{ color: '#fff', textDecoration: 'none', padding: '8px 10px', borderRadius: 10 }}>📖 {t(dict, 'support.documentation', 'Documentation')}</Link>
            </div>
          </details>

          {user ? (
            <button onClick={handleLogout} style={{
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border-soft)', borderRadius: 999,
              padding: '8px 14px', cursor: 'pointer',
            }}>
              {t(dict, 'logout', 'Log out')}
            </button>
          ) : (
            <button onClick={() => setShowAuth(true)} style={{
              background: GOLD, color: '#000', border: 'none', borderRadius: 999,
              padding: '9px 22px', fontWeight: 800, cursor: 'pointer',
            }}>
              {t(dict, 'getStarted', 'Get started')}
            </button>
          )}
        </div>
      </nav>

      {/* ── Tool pills + account info (replaces separate Topbar) ── */}
      {user && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 24px', flexWrap: 'wrap', gap: 8,
          background: 'rgba(10,10,15,.88)',
          borderBottom: '1px solid var(--border-soft)',
          position: 'sticky', top: 73, zIndex: 99,
          backdropFilter: 'blur(12px)',
        }}>
          {/* Tool pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {toolLinks.map(tool => {
              const isActive = pathname === tool.href || pathname?.startsWith(tool.href + '/')
              return (
                <Link key={tool.href} href={tool.href} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: tool.featured ? '7px 16px' : '6px 14px',
                  borderRadius: 999, textDecoration: 'none',
                  fontSize: 12, fontWeight: 800,
                  background: tool.featured
                    ? isActive ? 'rgba(255,195,0,.18)' : 'rgba(255,195,0,.10)'
                    : isActive ? 'rgba(59,130,246,.15)' : 'var(--surface-1)',
                  border: `1px solid ${tool.featured
                    ? 'rgba(255,195,0,.36)'
                    : isActive ? 'rgba(59,130,246,.4)' : 'var(--border-soft)'}`,
                  color: tool.featured ? GOLD : isActive ? '#fff' : 'var(--text-muted)',
                  boxShadow: tool.featured ? '0 10px 24px rgba(255,195,0,.10)' : 'none',
                }}>
                  <span>{tool.icon}</span>
                  <span>{tool.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Account info — right side of pills bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,195,0,0.95)', fontFamily: 'monospace' }}>
              ⚡ {credits} {credits === 1 ? t(dict, 'topbar.credit', 'credit') : t(dict, 'topbar.credits', 'credits')}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 999,
              background: planStyle.bg, color: planStyle.color, fontFamily: 'monospace',
            }}>
              {planLabel}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
              {userName ?? t(dict, 'topbar.account', 'Account')}
            </span>
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
