'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import Link from 'next/link'
import { FormEvent, useState, type CSSProperties } from 'react'
import { uiText } from '@/lib/i18n/uiText'

type PressChannel = 'online-newspapers' | 'print-newspapers' | 'trade-press'

const CHANNEL_LABELS: Record<PressChannel, string> = {
  'online-newspapers': "Online newspaper / digital publisher",
  'print-newspapers': "Print newspaper / offline placement",
  'trade-press': "Magazine / IT trade press",
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
      setMessage("Campaign created. It is now available in Press & Print Media for local review.")
      setPublication('')
      setContact('')
      setHeadline('')
      setNotes('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create campaign.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{uiText('generatedUi.u_91f945bb77bd7fea')}</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}><LocalizedText fallback={uiText('generatedUi.u_e2fd54c2f5e3d56f')} /></h1>
        <p style={body}><LocalizedText fallback={uiText('generatedUi.u_5d80cc1eb990ce1d')} /></p>
        <Link href="/dashboard/marketing/press-print" className="sb-button-secondary" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 12 }}><LocalizedText fallback={uiText('generatedUi.u_7145d1b611082e88')} /></Link>
      </section>

      <form onSubmit={submit} style={card}>
        <label style={field}>
          <span className="sb-caption">{uiText('generatedUi.u_ce4683e7013a18cd')}</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value as PressChannel)} style={input}>
            <option value="online-newspapers"><LocalizedText fallback={uiText('generatedUi.u_21589236db24d126')} /></option>
            <option value="print-newspapers"><LocalizedText fallback={uiText('generatedUi.u_7b35cf0332e9282c')} /></option>
            <option value="trade-press"><LocalizedText fallback={uiText('generatedUi.u_66b095894b462b80')} /></option>
          </select>
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_eab011ad9ff060aa')} /></span>
          <input value={publication} onChange={(event) => setPublication(event.target.value)} style={input} placeholder={uiText('generatedUi.u_c8862a136047e9d6')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_30e4aaba96590e85')} /></span>
          <input value={contact} onChange={(event) => setContact(event.target.value)} style={input} placeholder={uiText('generatedUi.u_49086aa5038d427a')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_0c56eedde93ee276')} /></span>
          <input value={headline} onChange={(event) => setHeadline(event.target.value)} style={input} placeholder={uiText('generatedUi.u_85f0af6c470b6ed6')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_efc3376c3690e25c')} /></span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} style={{ ...input, minHeight: 140 }} placeholder={uiText('generatedUi.u_f4b7d2d8ca96f31a')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_594d5f2b982bd5f5')} /></span>
          <input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} style={input} />
        </label>
        <button disabled={busy} type="submit" style={primary}>{busy ? uiText('generatedUi.u_c79ed9492e3c1719') : uiText('generatedUi.u_eb6a7df6628bf586')}</button>
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
