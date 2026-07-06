'use client'

import Link from 'next/link'
import { FormEvent, useState, type CSSProperties } from 'react'

type PressChannel = 'online-newspapers' | 'print-newspapers' | 'trade-press'

const CHANNEL_LABELS: Record<PressChannel, string> = {
  'online-newspapers': 'Online newspaper / digital publisher',
  'print-newspapers': 'Print newspaper / offline placement',
  'trade-press': 'Magazine / IT trade press',
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
      setMessage('Campaign created. It is now available in Press & Print Media for local review.')
      setPublication('')
      setContact('')
      setHeadline('')
      setNotes('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create campaign.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Marketing + Sales · Press & Print Media</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>Start a staff-led press campaign</h1>
        <p style={body}>Use this when the team will identify the publication, prepare the article or ad, coordinate with the editor or media contact, and handle the campaign directly. No rich-media workflow is required.</p>
        <Link href="/dashboard/marketing/press-print" className="sb-button-secondary" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 12 }}>Back to Press & Print Media</Link>
      </section>

      <form onSubmit={submit} style={card}>
        <label style={field}>
          <span className="sb-caption">Channel</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value as PressChannel)} style={input}>
            <option value="online-newspapers">Online newspaper / digital publisher</option>
            <option value="print-newspapers">Print newspaper / offline placement</option>
            <option value="trade-press">Magazine / IT trade press</option>
          </select>
        </label>
        <label style={field}>
          <span className="sb-caption">Publication name</span>
          <input value={publication} onChange={(event) => setPublication(event.target.value)} style={input} placeholder="Example: local newspaper, IT magazine, trade publication" />
        </label>
        <label style={field}>
          <span className="sb-caption">Editor / media contact</span>
          <input value={contact} onChange={(event) => setContact(event.target.value)} style={input} placeholder="Name, email, phone, media-kit link, or notes" />
        </label>
        <label style={field}>
          <span className="sb-caption">Headline / campaign title</span>
          <input value={headline} onChange={(event) => setHeadline(event.target.value)} style={input} placeholder="Working headline or ad title" />
        </label>
        <label style={field}>
          <span className="sb-caption">Article / ad notes</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} style={{ ...input, minHeight: 140 }} placeholder="What the team will prepare, submit, or publish." />
        </label>
        <label style={field}>
          <span className="sb-caption">CTA URL</span>
          <input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} style={input} />
        </label>
        <button disabled={busy} type="submit" style={primary}>{busy ? 'Creating…' : 'Create press campaign record'}</button>
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
