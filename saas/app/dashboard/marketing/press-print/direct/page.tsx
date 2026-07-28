'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import Link from 'next/link'
import { FormEvent, useState, type CSSProperties } from 'react'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type PressChannel = 'online-newspapers' | 'print-newspapers' | 'trade-press'

const CHANNEL_LABELS: Record<PressChannel, string> = {
  'online-newspapers': uiCopy('u_8c03b5e254ac0503'),
  'print-newspapers': uiCopy('u_e46d89eebf67a470'),
  'trade-press': uiCopy('u_ee15f1ec792f22cf'),
}

export default function DirectPressCampaignPage() {
  const [channel, setChannel] = useState<PressChannel>('online-newspapers')
  const [publication, setPublication] = useState('')
  const [contact, setContact] = useState('')
  const [headline, setHeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [ctaUrl, setCtaUrl] = useState('https://saas.signalboostapp.com')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const title = headline.trim() || `${CHANNEL_LABELS[channel]} campaign`
      const objective = [
        `Prepare a staff-led press media campaign for ${publication.trim() || CHANNEL_LABELS[channel]}.`,
        contact.trim() ? `Publication contact: ${contact.trim()}.` : '',
        notes.trim() ? `Article/ad notes: ${notes.trim()}.` : '',
        `CTA URL: ${ctaUrl.trim() || 'https://saas.signalboostapp.com'}.`,
      ].filter(Boolean).join(' ')
      const res = await fetch('/api/marketing/press-print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: {
            title,
            objective,
            channel: 'outreach',
            outreach_channel: channel,
            department: 'marketing',
            audience: 'Publication editors, readers, and business technology buyers reached through the selected press media channel.',
            priority: 'high',
            estimatedCostUsd: 5,
            signal: `Direct Marketing workspace start. Publication=${publication || 'not set'}; contact=${contact || 'not set'}; cta=${ctaUrl || 'not set'}`,
          },
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'Could not create campaign.')
      setMessage(uiCopy('u_07df21cb9694f789'))
      setPublication('')
      setContact('')
      setHeadline('')
      setNotes('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiCopy('u_ad1ec9251d129ad1'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{uiCopy('u_ec2f1761fb12c7b7')}</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}><LocalizedText fallback={uiCopy('u_cf6c48fc5098c4ca')} /></h1>
        <p style={body}><LocalizedText fallback={uiCopy('u_f87cbd2b496ad2e7')} /></p>
        <Link href="/dashboard/marketing/press-print" className="sb-button-secondary" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 12 }}><LocalizedText fallback={uiCopy('u_0d433e5473978012')} /></Link>
      </section>

      <form onSubmit={submit} style={card}>
        <label style={field}>
          <span className="sb-caption">{uiCopy('u_557384529a3f522d')}</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value as PressChannel)} style={input}>
            <option value="online-newspapers"><LocalizedText fallback={uiCopy('u_0c0f6202af8a2558')} /></option>
            <option value="print-newspapers"><LocalizedText fallback={uiCopy('u_b887a722dc30ffd9')} /></option>
            <option value="trade-press"><LocalizedText fallback={uiCopy('u_6694f71bc04a01b9')} /></option>
          </select>
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiCopy('u_b3c1b806bcde0e6c')} /></span>
          <input value={publication} onChange={(event) => setPublication(event.target.value)} style={input} placeholder={uiCopy('u_2cb50df1d5e3e49f')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiCopy('u_6d07e3fac1ea0fc9')} /></span>
          <input value={contact} onChange={(event) => setContact(event.target.value)} style={input} placeholder={uiCopy('u_73fd2d1ce6e84228')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiCopy('u_4af31aba610cb07e')} /></span>
          <input value={headline} onChange={(event) => setHeadline(event.target.value)} style={input} placeholder={uiCopy('u_a2256a59d4255cc3')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiCopy('u_5f1e76ae36a1ba3b')} /></span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} style={{ ...input, minHeight: 140 }} placeholder={uiCopy('u_f0f113287850caf0')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiCopy('u_53ea8e3306b8e02d')} /></span>
          <input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} style={input} />
        </label>
        <button disabled={busy} type="submit" style={primary}>{busy ? uiCopy('u_dbbc9261b4447df8') : uiCopy('u_1dad72ce56c26796')}</button>
        {message ? <p className="sb-caption" style={{ color: '#fde68a' }}>{message}</p> : null}
      </form>
    </main>
  )
}

const heroCard: CSSProperties = { border: '1px solid rgba(244,114,182,.24)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const card: CSSProperties = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 22, padding: 20, background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.76))', backdropFilter: 'blur(18px)', display: 'grid', gap: 14 }
const body: CSSProperties = { color: 'rgba(255,255,255,.70)', lineHeight: 1.65, maxWidth: 820 }
const field: CSSProperties = { display: 'grid', gap: 8 }
const input: CSSProperties = { width: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(15,23,42,.76)', color: '#fff', padding: '11px 12px' }
const primary: CSSProperties = { border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '11px 14px', fontWeight: 900, cursor: 'pointer', justifySelf: 'start' }
