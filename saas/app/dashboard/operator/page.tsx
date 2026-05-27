'use client'

import { useState } from 'react'
import OperatorInput from '@/components/operator/OperatorInput'
import OperatorPlan, { type OperatorPlanView } from '@/components/operator/OperatorPlan'
import OperatorApproval from '@/components/operator/OperatorApproval'

export default function OperatorPage() {
  const [request, setRequest] = useState('A cozy Italian restaurant in São Paulo with a menu, our story, and a reservation button')
  const [content, setContent] = useState<OperatorPlanView | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  // Step 1: generate the real website content
  async function generate() {
    setLoading(true)
    setMessage('')
    setLiveUrl(null)
    setContent(null)
    try {
      const res = await fetch('/api/sites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: request }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Could not generate the website.')
      } else {
        setContent(data.content)
      }
    } catch {
      setMessage('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: publish the generated content live
  async function publish() {
    if (!content) return
    setPublishing(true)
    setMessage('')
    try {
      const res = await fetch('/api/sites/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'Could not publish the website.')
      } else {
        setLiveUrl(data.url || null)
        setMessage(data.userMessage || 'Your website is live.')
      }
    } catch {
      setMessage('Could not connect. Please try again.')
    } finally {
      setPublishing(false)
    }
  }

  const fullUrl = liveUrl
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${liveUrl}`
    : null

  return (
    <main className="sb-page" style={{ maxWidth: 980 }}>
      <OperatorInput value={request} onChange={setRequest} onPlan={generate} loading={loading} />

      {content && (
        <>
          <OperatorPlan plan={content} />

          {!liveUrl && (
            <div style={{ marginTop: 12 }}>
              <OperatorApproval loading={publishing} onApprove={publish} />
            </div>
          )}
        </>
      )}

      {liveUrl && fullUrl && (
        <section className="hero-panel" style={{ marginTop: 16, padding: 22 }}>
          <h3 style={{ color: '#fff', marginTop: 0 }}>🎉 Your website is live</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Anyone can now visit it here:</p>
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sb-button-primary"
            style={{ display: 'inline-block', marginTop: 6, wordBreak: 'break-all' }}
          >
            {fullUrl} ↗
          </a>
        </section>
      )}

      {message && <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>{message}</p>}
    </main>
  )
}
