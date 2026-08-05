// saas/app/dashboard/marketing/press-print/direct/page.tsx
//
// THE FORM SENDS THE FIELDS THE GATE READS.
//
// This form used to flatten every answer into one prose sentence and post it as `signal`,
// while the intake route read request.publication, request.contact, request.article_notes —
// none of which were ever sent. The admission gate therefore judged the sentence itself
// ("Direct Marketing workspace start. Publication=…; contact=…") and refused it as
// not-a-publication. EVERY staff-led campaign failed with 400, including real newspapers with
// real editorial addresses, and the refusal quoted a sentence the operator never wrote.
//
// So each answer is now sent as its own named field, and the brief is assembled server-side
// from those fields. A refusal is rendered in full — every reason, not just the first — because
// a refusal without its cause is a guessing game.
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import Link from 'next/link'
import { FormEvent, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiText } from '@/lib/i18n/uiText'

type PressChannel = 'online-newspapers' | 'print-newspapers' | 'trade-press'

const CHANNEL_LABELS: Record<PressChannel, string> = {
  'online-newspapers': "Online newspaper / digital publisher",
  'print-newspapers': "Print newspaper / offline placement",
  'trade-press': "Magazine / IT trade press",
}

export default function DirectPressCampaignPage() {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<PressChannel>('online-newspapers')
  const [publication, setPublication] = useState('')
  const [publicationUrl, setPublicationUrl] = useState('')
  const [contact, setContact] = useState('')
  const [headline, setHeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [ctaUrl, setCtaUrl] = useState('https://saas.signalboostapp.com')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [refusals, setRefusals] = useState<string[]>([])
  const [releaseNote, setReleaseNote] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setRefusals([])
    setReleaseNote('')
    try {
      const res = await fetch('/api/marketing/press-print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: {
            // NAMED FIELDS. These are exactly the keys the route reads and the admission gate
            // judges; nothing here is prose the server has to parse back apart.
            outreach_channel: channel,
            publication: publication.trim(),
            publication_url: publicationUrl.trim(),
            contact: contact.trim(),
            headline: headline.trim(),
            article_notes: notes.trim(),
            cta_url: ctaUrl.trim() || 'https://saas.signalboostapp.com',
            department: 'marketing',
            audience: 'Publication editors, readers, and business technology buyers reached through the selected press media channel.',
            language: 'en',
          },
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        // The route returns every reason. Show all of them: the operator is the one who can fix
        // the input, and cannot do it from a summary.
        if (Array.isArray(json?.refusals) && json.refusals.length) setRefusals(json.refusals)
        throw new Error(json?.error || t('marketingSales.pressPrint.createFailed', "Could not create campaign."))
      }
      setMessage(t('marketingSales.pressPrint.created', "Campaign created. Review it in Press & Print Media before anything is submitted."))
      // Generation is reported honestly. A campaign with no release cannot be approved, and the
      // operator should learn that here rather than by finding a missing button later.
      setReleaseNote(json?.releaseGenerated
        ? t('marketingSales.pressPrint.releaseWritten', "A press release was written and is ready for you to read before approving.")
        : t('marketingSales.pressPrint.releaseMissing', "No press release could be written for it yet, so approval stays blocked. Open the campaign and use Generate release."))
      setPublication('')
      setPublicationUrl('')
      setContact('')
      setHeadline('')
      setNotes('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('marketingSales.pressPrint.createFailed', "Could not create campaign."))
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
        <p style={body}>{t('marketingSales.pressPrint.intakeRule', "The publication name and a reachable editorial contact are required. A campaign with nowhere to go, or notes that are pasted machine output rather than copy, is refused here with the reason — not accepted and warned about later.")}</p>
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
        {/* The outlet's OWN website, which is how the classifier tells a publication from a page
            about publications. Without it, a guide to writing letters to the editor and a real
            newspaper look identical to the gate. */}
        <label style={field}>
          <span className="sb-caption">{t('marketingSales.pressPrint.publicationUrl', "Publication website")}</span>
          <input value={publicationUrl} onChange={(event) => setPublicationUrl(event.target.value)} style={input} placeholder={t('marketingSales.pressPrint.publicationUrlHint', "The outlet's own site, e.g. https://www.example-news.com")} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_30e4aaba96590e85')} /></span>
          <input value={contact} onChange={(event) => setContact(event.target.value)} style={input} placeholder={t('marketingSales.pressPrint.contactHint', "Editorial email, or the URL of the outlet's submit-news form")} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_0c56eedde93ee276')} /></span>
          <input value={headline} onChange={(event) => setHeadline(event.target.value)} style={input} placeholder={uiText('generatedUi.u_85f0af6c470b6ed6')} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_efc3376c3690e25c')} /></span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} style={{ ...input, minHeight: 140 }} placeholder={t('marketingSales.pressPrint.notesHint', "The facts of the announcement, in your own words. These are written into the release.")} />
        </label>
        <label style={field}>
          <span className="sb-caption"><LocalizedText fallback={uiText('generatedUi.u_594d5f2b982bd5f5')} /></span>
          <input value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} style={input} />
        </label>
        <button disabled={busy} type="submit" style={primary}>{busy ? uiText('generatedUi.u_c79ed9492e3c1719') : uiText('generatedUi.u_eb6a7df6628bf586')}</button>
        {message ? <p className="sb-caption" style={{ color: '#fde68a' }}>{message}</p> : null}
        {releaseNote ? <p className="sb-caption" style={{ color: 'rgba(255,255,255,.72)' }}>{releaseNote}</p> : null}
        {refusals.length ? (
          <div style={refusalBox}>
            <p className="sb-caption" style={{ color: '#fca5a5', margin: 0, fontWeight: 850 }}>{t('marketingSales.pressPrint.refusedTitle', "This campaign was not created")}</p>
            <ul style={refusalList}>
              {refusals.map((reason, index) => <li key={index} style={refusalItem}>{reason}</li>)}
            </ul>
          </div>
        ) : null}
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
const refusalBox: CSSProperties = { border: '1px solid rgba(248,113,113,.45)', borderRadius: 14, padding: 14, background: 'rgba(127,29,29,.22)', display: 'grid', gap: 8 }
const refusalList: CSSProperties = { margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }
const refusalItem: CSSProperties = { color: 'rgba(255,255,255,.86)', lineHeight: 1.6 }
