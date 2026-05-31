'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { getMainAuthCallbackUrl } from '@/lib/auth/redirects'

const navLinks = [
  { label: 'Promote', href: '/dashboard/promote' },
  { label: 'Personal Assistant', href: '/dashboard/assistant' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Executive', href: '/admin' },
]

export default function MainNavbar() {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit() {
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: getMainAuthCallbackUrl('/dashboard/promote', window.location.origin),
        },
      })

      if (signUpError) {
        setError(signUpError.message)
      } else {
        setMessage('Check your email to confirm your SignalBoost account.')
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        setError(signInError.message)
      } else {
        setShowLogin(false)
        window.location.href = '/dashboard/promote'
      }
    }

    setLoading(false)
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setLoading(true)
    setError('')
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getMainAuthCallbackUrl('/dashboard/promote', window.location.origin),
      },
    })
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = '/'
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/85 px-6 py-4 text-white backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-2xl font-black text-[#FFD700] no-underline">
            SignalBoost
          </Link>

          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            {navLinks.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${isActive ? 'text-[#FFD700]' : 'text-white/70 hover:text-white'} no-underline transition`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {user ? (
            <button
              onClick={handleLogout}
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/80 transition hover:border-[#FFD700] hover:text-[#FFD700]"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={() => { setMode('login'); setShowLogin(true) }}
              className="rounded-full bg-[#FFD700] px-5 py-2 text-sm font-black text-black transition hover:bg-yellow-300"
            >
              Login
            </button>
          )}
        </div>
      </header>

      {showLogin && !user && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 text-white backdrop-blur" onClick={() => setShowLogin(false)}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101014] p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-[#FFD700]">SignalBoost</p>
                <h2 className="mt-2 text-2xl font-black">{mode === 'login' ? 'Login' : 'Create account'}</h2>
                <p className="mt-2 text-sm text-white/55">Access marketing and partner features on the main SignalBoost site.</p>
              </div>
              <button className="text-2xl text-white/40 hover:text-white" onClick={() => setShowLogin(false)} aria-label="Close login dialog">
                ×
              </button>
            </div>

            <div className="grid gap-3">
              <button onClick={() => handleOAuth('google')} className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 font-bold text-white hover:bg-white/10">
                Continue with Google
              </button>
              <button onClick={() => handleOAuth('github')} className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 font-bold text-white hover:bg-white/10">
                Continue with GitHub
              </button>
            </div>

            <div className="my-5 flex items-center gap-3 text-xs text-white/35">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>

            <div className="grid gap-3">
              {mode === 'signup' && (
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-white outline-none focus:border-[#FFD700]" />
              )}
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-white outline-none focus:border-[#FFD700]" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-white outline-none focus:border-[#FFD700]" />
            </div>

            {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
            {message && <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}

            <button onClick={handleSubmit} disabled={loading} className="mt-5 w-full rounded-xl bg-[#FFD700] px-4 py-3 font-black text-black disabled:cursor-wait disabled:opacity-70">
              {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
            </button>

            <p className="mt-5 text-center text-sm text-white/45">
              {mode === 'login' ? 'Need an account?' : 'Already have an account?'}{' '}
              <button className="font-bold text-[#FFD700]" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}>
                {mode === 'login' ? 'Sign up' : 'Login'}
              </button>
            </p>
          </div>
        </div>
      )}
    </>
  )
}
