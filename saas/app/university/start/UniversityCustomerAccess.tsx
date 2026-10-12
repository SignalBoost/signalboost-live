'use client'

import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { proposedEnrollmentRegion } from '@/lib/security/euEnrollmentRouting'

export default function UniversityCustomerAccess({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'guest' | 'signed-in'>('loading')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let alive = true
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setStatus(data.user ? 'signed-in' : 'guest')
    }).catch(() => { if (alive) setStatus('guest') })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setStatus(session?.user ? 'signed-in' : 'guest')
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      if (mode === 'signup') {
        if (!name.trim()) { setMessage('Enter your name.'); return }
        if (!/^[A-Za-z]{2}$/.test(countryCode.trim())) { setMessage('Enter your two-letter country code (e.g., US).'); return }
        if (proposedEnrollmentRegion(countryCode.trim().toUpperCase()) === 'EU_EEA') {
          setMessage('EU/EEA registration is not yet available while regional authentication and data residency are configured. Please contact support.')
          return
        }
        const { data, error } = await supabase.auth.signUp({
          email, password, options: {
            data: { full_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/university/start`,
          },
        })
        if (error) { setMessage('Registration was not completed. Check your details or contact support.'); return }
        if (data.user && data.user.identities?.length === 0) {
          setMessage('Registration could not be completed with these details. Try signing in.')
          return
        }
        setMessage('Check your email to confirm your account, then return to AI University.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMessage('Sign-in failed. Check your email and password.')
      }
    } catch {
      setMessage('Connection unavailable. Please try again.')
    } finally { setBusy(false) }
  }

  if (status === 'loading') return <p className="py-12" role="status">Checking your account…</p>
  if (status === 'signed-in') return <>{children}</>

  return (
    <section className="mx-auto max-w-lg rounded-2xl border border-white/20 bg-white/5 p-6 sm:p-9">
      <h2 className="text-2xl font-semibold">{mode === 'signin' ? 'Sign in to AI University' : 'Create your iTMounts account'}</h2>
      <p className="mt-3 text-slate-300">Your private AI University workspace will open after sign-in. Connecting a provider does not start a paid job.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'signup' ? <>
          <label className="block text-sm">Full name<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="mt-1 w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white"/></label>
          <label className="block text-sm">Country code<input required maxLength={2} value={countryCode} onChange={e => setCountryCode(e.target.value.toUpperCase())} placeholder="US" className="mt-1 w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white"/></label>
        </> : null}
        <label className="block text-sm">Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="mt-1 w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white"/></label>
        <label className="block text-sm">Password<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="mt-1 w-full rounded-lg border border-white/30 bg-slate-900 px-3 py-2 text-white"/></label>
        {message ? <p role="status" className="text-sm text-amber-300">{message}</p> : null}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-amber-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in and open AI University' : 'Create account'}</button>
      </form>
      <button type="button" className="mt-5 text-sm underline" onClick={() => { setMessage(''); setMode(mode === 'signin' ? 'signup' : 'signin') }}>{mode === 'signin' ? 'New here? Create an account' : 'Already registered? Sign in'}</button>
    </section>
  )
}
