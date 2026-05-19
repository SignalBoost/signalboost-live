'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = 40, H = 40
    canvas.width = W
    canvas.height = H
    const cx = W / 2
    const cy = H - 8
    let rings: { r: number; alpha: number }[] = []
    let last = 0
    let raf: number

    function draw(ts: number) {
      ctx.clearRect(0, 0, W, H)
      if (!last || ts - last > 2000) {
        rings.push({ r: 0, alpha: 1 })
        last = ts
      }
      rings = rings.filter(r => r.alpha > 0.01)
      for (const r of rings) {
        r.r += 0.8
        r.alpha -= 0.012
        const arcs   = [1, 0.65]
        const widths = [1.2, 0.8]
        const alphas = [0.9, 0.5]
        for (let i = 0; i < 2; i++) {
          if (r.r * arcs[i] < 3) continue
          ctx.globalAlpha = Math.max(0, r.alpha * alphas[i])
          ctx.strokeStyle = '#ffc300'
          ctx.lineWidth = widths[i]
          ctx.beginPath()
          ctx.arc(cx, cy, r.r * arcs[i], Math.PI, 0)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffc300'
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0a0a0f'
      ctx.beginPath()
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2)
      ctx.fill()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function openLogin() { setAuthMode('login'); setShowAuth(true) }
  function openSignup() { setAuthMode('signup'); setShowAuth(true) }

  // Main nav links. "Dashboard" is hidden when user is logged in
  // because they already have a prominent Dashboard button next to their email.
  const navLinks = [
    { label: 'Home',       href: '/' },
    { label: 'Podcasters', href: '/podcasters' },
    ...(user ? [] : [{ label: 'Dashboard', href: '/dashboard' }]),
    { label: 'Pricing',    href: '/pricing' },
    { label: 'Docs',       href: '/docs' },
  ]
    return (
    <>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 17, color: '#fff', letterSpacing: '-0.02em' }}>
            signal<span style={{ color: '#ffc300' }}>boost</span>
          </span>
        </Link>

        <div style={{ display: 'flex', gap: 24 }}>
          {navLinks.map(item => (
            <Link key={item.label} href={item.href}
              style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}>
              {item.label}
            </Link>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user ? (
            <>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
              <Link href="/dashboard">
                <button style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                  Dashboard
                </button>
              </Link>
              <button onClick={handleLogout}
                style={{ background: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button onClick={openLogin}
                style={{ background: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                Log in
              </button>
              <button onClick={openSignup}
                style={{ background: '#ffc300', color: '#000', fontSize: 13, fontWeight: 800, padding: '9px 22px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Get started
              </button>
            </>
          )}
        </div>
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
