'use client'

import Link from 'next/link'
import { useState } from 'react'

const PLATFORMS = ['manual', 'google', 'facebook', 'instagram', 'website', 'directory']

export default function OutreachDiscoveryPage() {
  const [businessUrl, setBusinessUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [platform, setPlatform] = useState('manual')
  const [publicText, setPublicText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  async function analyze() {
    setError('')
    setResult(null)
    const url = businessUrl.trim()
    if (!url) {
      setError('Add a business URL or profile link to analyze.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/outreach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_url: url,
          business_name: businessName.trim() || undefined,
          source_platform: platform,
          public_text: publicText.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Could not analyze this lead.')
        return
      }
      setResult(data.outreach)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="sb-glass" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">Discovery</span>
        <h1 className="sb-h2" style={{ marginTop: 10 }}>Find a business and let AI prepare the outreach.</h1>
        <p className="sb-body" style={{ maxWidth: 680 }}>
          Paste a public website, Google profile, or social page. SignalBoost analyzes the business,
          predicts its needs, and drops a ready-to-review lead into your contacts queue.
        </p>
      </div>

      <section className="sb-card" style={{ padding: 20, display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" htmlFor="biz-url">Business URL or profile *</label>
          <input
            id="biz-url"
            className="sb-input"
            value={businessUrl}
            onChange={e => setBusinessUrl(e.target.value)}
            placeholder="https://example.com"
            style={{ padding: 12 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,220px)', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" htmlFor="biz-name">Business name (optional)</label>
            <input
              id="biz-name"
              className="sb-input"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. Luna Travel"
              style={{ padding: 12 }}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" htmlFor="biz-platform">Source</label>
            <select
              id="biz-platform"
              className="sb-input"
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              style={{ padding: 12 }}
            >
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" htmlFor="biz-text">Public text / notes (optional)</label>
          <textarea
            id="biz-text"
            className="sb-input"
            value={publicText}
            onChange={e => setPublicText(e.target.value)}
            rows={4}
            placeholder="Paste a bio, reviews, or anything that describes what they do."
            style={{ padding: 12, resize: 'vertical' }}
          />
        </div>

        <div className="sb-cta-row">
          <button className="sb-button-primary" type="button" onClick={analyze} disabled={loading}>
            {loading ? 'Analyzing…' : 'Analyze & queue lead'}
          </button>
          <Link className="sb-button-secondary" href="/dashboard/outreach/contacts">View contacts queue</Link>
        </div>

        {error && (
          <p className="sb-caption" style={{ color: '#fca5a5', margin: 0 }}>{error}</p>
        )}
      </section>

      {result && (
        <section className="sb-card" style={{ padding: 20, marginTop: 20 }}>
          <span className="sb-eyebrow" style={{ color: '#86efac' }}>Lead queued</span>
          <h2 className="sb-h3" style={{ marginTop: 8 }}>
            {result.business_name || result.analyzer_summary?.business_name || 'New lead'}
          </h2>
          {result.outreach_message && (
            <div className="sb-ai-feedback" style={{ marginTop: 12 }}>
              <strong>Draft first touch</strong>
              <p>{result.outreach_message}</p>
            </div>
          )}
          <div className="sb-cta-row" style={{ marginTop: 14 }}>
            <Link className="sb-button-primary" href="/dashboard/outreach/contacts">Review in contacts</Link>
            <Link className="sb-button-secondary" href="/dashboard/outreach/outreach">Open engine</Link>
          </div>
        </section>
      )}
    </main>
  )
}
