'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'

type RegionConfig = { url: string; anonKey: string; cookieName: string }
type Access = { token: string; signOut: () => Promise<void> }
type RightRequest = { id: string; request_type: string; status: string; created_at: string }

/** All account operations stay in the Frankfurt regional API namespace. */
export default function EuAccountControls() {
  const [access, setAccess] = useState<Access | null>(null)
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [requests, setRequests] = useState<RightRequest[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/auth/eu/config', { cache: 'no-store' })
        if (!res.ok) throw new Error('region_unavailable')
        const config = await res.json() as RegionConfig
        if (config.cookieName !== 'itmounts-eu-auth' || !config.anonKey ||
            !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.url)) throw new Error('invalid_region')
        const eu = createBrowserClient(config.url, config.anonKey, { cookieOptions: {
          name: config.cookieName, path: '/', sameSite: 'lax', secure: window.location.protocol === 'https:',
        } })
        const { data } = await eu.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error('session_expired')
        const [profileResponse, requestResponse] = await Promise.all([
          fetch('/api/auth/eu/profile', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }),
          fetch('/api/auth/eu/data-rights', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }),
        ])
        if (!profileResponse.ok || !requestResponse.ok) throw new Error('eu_account_unavailable')
        const profile = await profileResponse.json()
        const requestData = await requestResponse.json()
        if (!active) return
        setAccess({ token, signOut: async () => { await eu.auth.signOut() } })
        setName(profile.profile.display_name ?? '')
        setConsent(profile.profile.consent_ai_training === true)
        setRequests(requestData.requests ?? [])
      } catch {
        if (active) setMessage('Frankfurt account access is unavailable or your session expired. Sign in again.')
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function action(type: 'save' | 'export' | 'export-request' | 'delete-request') {
    if (!access || busy) return
    setBusy(true); setMessage('')
    try {
      const url = type === 'save' ? '/api/auth/eu/profile'
        : type === 'export' ? '/api/auth/eu/export' : '/api/auth/eu/data-rights'
      const method = type === 'save' ? 'PATCH' : type === 'export' ? 'GET' : 'POST'
      const res = await fetch(url, { method, cache: 'no-store', headers: {
        Authorization: 'Bearer ' + access.token,
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      }, ...(method === 'PATCH' ? { body: JSON.stringify({ displayName: name, consentAiTraining: consent }) }
        : method === 'POST' ? { body: JSON.stringify({ type: type === 'delete-request' ? 'delete' : 'export' }) } : {}) })
      if (!res.ok) { setMessage('Frankfurt account action is currently unavailable.'); return }
      if (type === 'export') {
        const blob = await res.blob()
        const link = document.createElement('a')
        const downloadUrl = URL.createObjectURL(blob)
        link.href = downloadUrl
        link.download = 'itmounts-eu-account.json'
        link.click()
        URL.revokeObjectURL(downloadUrl)
        setMessage('Downloaded Frankfurt account foundation records. Connected-provider and workspace records are not included.')
      } else if (type === 'save') {
        setMessage('Account preferences updated in Frankfurt.')
      } else {
        const body = await res.json()
        setRequests(previous => [body.request, ...previous])
        setMessage('Request received in Frankfurt. It has not yet been fulfilled or completed.')
      }
    } catch {
      setMessage('European account action failed. Please try again.')
    } finally { setBusy(false) }
  }

  return <section style={{ display: 'grid', gap: 18, maxWidth: 560 }}>
    {!access ? <p><Link href="/eu/access">Sign in to your European account</Link></p> : <>
      <label>Display name <input aria-label="Display name" value={name} maxLength={160} onChange={event => setName(event.target.value)} /></label>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Allow account AI-training consent</label>
      <button type="button" disabled={busy} onClick={() => void action('save')}>Save Frankfurt account preferences</button>
      <h2>European data rights</h2>
      <button type="button" disabled={busy} onClick={() => void action('export')}>Download account foundation data</button>
      <button type="button" disabled={busy} onClick={() => void action('export-request')}>Request complete data export</button>
      <button type="button" disabled={busy} onClick={() => void action('delete-request')}>Request account deletion</button>
      <p>Requests are recorded for processing, not automatically fulfilled. Connected-provider and workspace data may require separate handling.</p>
      <h3>Recent requests</h3>
      <ul>{requests.map(req => <li key={req.id}>{req.request_type}: {req.status} ({new Date(req.created_at).toLocaleDateString()})</li>)}</ul>
      <button type="button" onClick={() => void access.signOut().then(() => window.location.assign('/eu/access'))}>Sign out of European account</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
