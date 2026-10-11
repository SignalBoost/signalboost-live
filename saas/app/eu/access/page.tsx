'use client'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { labIntegrationUiCopy } from '@/lib/i18n/labIntegrationUiCopy'
import { useState, type FormEvent } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { proposedEnrollmentRegion } from '@/lib/security/euEnrollmentRouting'

type RegionalConfig = { url: string; anonKey: string; cookieName: string }
type AuthMode = 'signup' | 'login'

/** European account access is separate from the US application and cookies. */
export default function EuAccessPage() {
  const { lang } = useTranslation()
  const copy = labIntegrationUiCopy(lang)

  const [mode, setMode] = useState<AuthMode>('signup')
  const [country, setCountry] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      if (proposedEnrollmentRegion(country) !== 'EU_EEA') {
        setMessage('Enter an EU or EEA country code (for example, DE or FR).')
        return
      }
      if (mode === 'signup' && !name.trim()) { setMessage('Enter your display name.'); return }
      const configResponse = await fetch('/api/auth/eu/config', { cache: 'no-store' })
      if (!configResponse.ok) { setMessage('European account enrollment is not available yet.'); return }
      const config = await configResponse.json() as RegionalConfig
      if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.url) || !config.anonKey || config.cookieName !== 'itmounts-eu-auth') {
        setMessage('European authentication configuration is unavailable.')
        return
      }
      const eu = createBrowserClient(config.url, config.anonKey, {
        cookieOptions: { name: config.cookieName, path: '/', sameSite: 'lax', secure: window.location.protocol === 'https:' },
      })
      const normalizedEmail = email.trim().toLowerCase()
      if (mode === 'signup') {
        const { data, error } = await eu.auth.signUp({
          email: normalizedEmail, password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin + '/auth/eu/callback',
          },
        })
        if (error) { setMessage(error.message); return }
        if (!data.session?.access_token) {
          setMessage('Check your email to confirm your Frankfurt account, then return here to sign in.')
          return
        }
      } else {
        const { error } = await eu.auth.signInWithPassword({ email: normalizedEmail, password })
        if (error) { setMessage(error.message); return }
      }
      const { data: session } = await eu.auth.getSession()
      const token = session.session?.access_token
      if (!token) { setMessage('Your European session could not be verified.'); return }
      const probe = await fetch('/api/auth/eu/session', {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
      })
      if (probe.status === 403) {
        const enrollment = await fetch('/api/auth/eu/complete-enrollment', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ countryCode: country.toUpperCase(), displayName: name.trim() || normalizedEmail.split('@')[0] }),
        })
        if (!enrollment.ok) { setMessage('European tenant provisioning is unavailable. No US fallback was attempted.'); return }
      } else if (!probe.ok) {
        setMessage('European identity or tenant verification is unavailable.')
        return
      }
      window.location.assign('/eu/account')
    } catch {
      setMessage('European authentication is currently unavailable.')
    } finally {
      setBusy(false)
    }
  }

  return <main style={{ maxWidth: 480, margin: '48px auto', padding: 24 }}>
    <h1>{copy.u_a59edceb0ab5}</h1>
    <p>{copy.u_adb7e1aa3488}</p>
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <button type="button" onClick={() => { setMode('signup'); setMessage('') }} aria-pressed={mode === 'signup'}>{copy.u_bb7234ec1245}</button>
      <button type="button" onClick={() => { setMode('login'); setMessage('') }} aria-pressed={mode === 'login'}>{copy.u_bfd402b2f6f3}</button>
    </div>
    <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
      <label>{copy.u_909d72674381}<input required maxLength={2} value={country} onChange={e => setCountry(e.target.value.toUpperCase())} autoComplete="country" /></label>
      {mode === 'signup' && <label>{copy.u_2b7f6a84de91}<input required maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>}
      <label>{copy.u_969ccbd3cf63}<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
      <label>{copy.u_e7cf3ef4f17c}<input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>
      <button type="submit" disabled={busy}>{busy ? copy.u_63bbd08c916b : mode === 'signup' ? copy.u_4431f97b4ff8 : copy.u_9d8145919fab}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <p>{copy.u_72df4b58b924}</p>
  </main>
}
