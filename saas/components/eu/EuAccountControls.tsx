'use client'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { labIntegrationUiCopy } from '@/lib/i18n/labIntegrationUiCopy'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'

type RegionConfig = { url: string; anonKey: string; cookieName: string }
type Access = { token: string; signOut: () => Promise<void> }
type RightRequest = { id: string; request_type: string; status: string; created_at: string }

/** All account operations stay in the Frankfurt regional API namespace. */
export default function EuAccountControls() {
  const { lang } = useTranslation()
  const copy = labIntegrationUiCopy(lang)

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
        link.download = 'itmounts-eu-data.json'
        link.click()
        URL.revokeObjectURL(downloadUrl)
        setMessage('Downloaded Frankfurt account, projects and workspace records. Connected-provider records require separate handling.')
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
    {!access ? <p><Link href="/eu/access">{copy.u_fb78737aa9e7}</Link></p> : <>
      <label>{copy.u_2b7f6a84de91} <input aria-label={copy.u_2b7f6a84de91} value={name} maxLength={160} onChange={event => setName(event.target.value)} /></label>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> {copy.u_632c4c56f0c8}</label>
      <button type="button" disabled={busy} onClick={() => void action('save')}>{copy.u_fb6790dc269e}</button>
      <h2>{copy.u_1f1517b4417a}</h2>
      <button type="button" disabled={busy} onClick={() => void action('export')}>{copy.u_ff8c9594c4b5}</button>
      <button type="button" disabled={busy} onClick={() => void action('export-request')}>{copy.u_14eee1c9df25}</button>
      <button type="button" disabled={busy} onClick={() => void action('delete-request')}>{copy.u_6914ba38bf46}</button>
      <p>{copy.u_160a0f610aa6}</p>
      <h3>{copy.u_b83a589f114a}</h3>
      <ul>{requests.map(req => <li key={req.id}>{req.request_type}: {req.status} ({new Date(req.created_at).toLocaleDateString()})</li>)}</ul>
      <button type="button" onClick={() => void access.signOut().then(() => window.location.assign('/eu/access'))}>{copy.u_13cb6203fe3b}</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}
