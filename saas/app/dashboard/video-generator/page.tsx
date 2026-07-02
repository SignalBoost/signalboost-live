'use client'

import { useState } from 'react'

type Status = 'idle' | 'queuing' | 'queued' | 'rendering' | 'ready' | 'failed'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

const panelStyle = {
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 20,
  padding: 24,
  background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
} as const

export default function VideoGeneratorPage() {
  const [prompt, setPrompt] = useState('')
  const [audience, setAudience] = useState('small businesses, agencies, hotels, restaurants, and entrepreneurs')
  const [format, setFormat] = useState('short_video')
  const [tone, setTone] = useState('professional')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)

  const isRunning = status === 'queuing' || status === 'queued' || status === 'rendering'
  const canRender = Boolean(prompt.trim()) && !isRunning

  async function handleRender() {
    if (!canRender) return
    setStatus('queuing')
    setMessage('Queuing render job...')
    setVideoUrl(null)
    setJobId(null)
    setPollCount(0)

    try {
      const res = await fetch('/api/cos/video-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt.trim().slice(0, 120),
          hook: prompt.trim(),
          audience: audience.trim() || 'small businesses, agencies, hotels, restaurants, and entrepreneurs',
          destination_url: 'www.saas.signalboostapp.com',
          brand_text: 'SignalBoostAi',
          url_text: 'www.saas.signalboostapp.com',
          production_tier: 'enterprise',
          format,
          platforms: format === 'short_video' ? ['Shorts', 'Reels'] : ['YouTube', 'LinkedIn'],
          queue_immediately: true,
          concept_approved: true,
          tone,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Could not queue render job')
      const id = json.job?.id || json.videoJobId || null
      setJobId(id)
      setStatus('queued')
      setMessage('Render queued. Preview will appear here when ready.')
      if (id) startPolling(id)
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : 'Render failed. Please try again.')
    }
  }

  async function checkStatus(id = jobId) {
    if (!id) return
    try {
      const res = await fetch(`/api/cos/video-production?id=${encodeURIComponent(id)}`)
      const json = await res.json()
      const job = Array.isArray(json.jobs) ? json.jobs.find((j: any) => String(j.id) === String(id)) : null
      if (!job) return
      if (job.output_url || job.signed_output_url) {
        setVideoUrl(job.signed_output_url || job.output_url)
        setStatus('ready')
        setMessage('Preview ready.')
      } else if (job.status === 'failed') {
        setStatus('failed')
        setMessage(job.error || 'Render failed. Please try again.')
      } else if (job.status === 'rendering') {
        setStatus('rendering')
        setMessage('Rendering preview...')
      } else {
        setStatus('queued')
        setMessage('Render queued. Preview will appear here when ready.')
      }
    } catch {
      // Keep current status visible if polling fails.
    }
  }

  function startPolling(id: string) {
    setStatus('rendering')
    setMessage('Rendering preview...')
    let attempts = 0
    const timer = setInterval(async () => {
      attempts++
      setPollCount(attempts)
      if (attempts > 60) {
        clearInterval(timer)
        setStatus('queued')
        setMessage('Still queued. You can come back later or press Check preview status.')
        return
      }
      await checkStatus(id)
    }, 5000)
  }

  function reset() {
    setStatus('idle')
    setMessage('')
    setVideoUrl(null)
    setJobId(null)
    setPollCount(0)
    setPrompt('')
  }

  return (
    <main style={{ color: '#fff', maxWidth: 980, margin: '0 auto', padding: '0 0 60px' }}>
      <section style={{ borderBottom: '1px solid rgba(255,255,255,.1)', paddingBottom: 20, marginBottom: 28 }}>
        <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD, margin: 0 }}>AI Video Generator</p>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em', margin: '8px 0 6px' }}>Prompt to render to preview</h1>
        <p style={{ color: 'rgba(255,255,255,.62)', lineHeight: 1.6, margin: 0, maxWidth: 720 }}>
          Render controls and the preview panel stay visible at all times. The video is not published automatically.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, .9fr)', gap: 22, alignItems: 'start' }}>
        <div style={{ ...panelStyle, display: 'grid', gap: 18 }}>
          <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <span style={{ color: 'rgba(255,255,255,.82)', fontWeight: 800 }}>Prompt</span>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={isRunning}
              rows={6}
              placeholder="Create a maximum 60-second promotional video for SignalBoostAi. Show SignalBoostAi and www.saas.signalboostapp.com inside the video frames."
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, color: '#fff', fontSize: 15, padding: '14px 16px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, opacity: isRunning ? .65 : 1 }}
            />
          </label>

          <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <span style={{ color: 'rgba(255,255,255,.82)', fontWeight: 800 }}>Target audience</span>
            <input
              value={audience}
              onChange={e => setAudience(e.target.value)}
              disabled={isRunning}
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, color: '#fff', fontSize: 15, padding: '12px 16px', outline: 'none', fontFamily: 'inherit', opacity: isRunning ? .65 : 1 }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <span style={{ color: 'rgba(255,255,255,.82)', fontWeight: 800 }}>Format</span>
              <select value={format} onChange={e => setFormat(e.target.value)} disabled={isRunning} style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, color: '#fff', fontSize: 14, padding: '12px 14px', outline: 'none', fontFamily: 'inherit', opacity: isRunning ? .65 : 1 }}>
                <option value="short_video">9:16 Short video</option>
                <option value="youtube">16:9 YouTube / LinkedIn</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <span style={{ color: 'rgba(255,255,255,.82)', fontWeight: 800 }}>Tone</span>
              <select value={tone} onChange={e => setTone(e.target.value)} disabled={isRunning} style={{ background: 'rgba(15,23,42,.9)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, color: '#fff', fontSize: 14, padding: '12px 14px', outline: 'none', fontFamily: 'inherit', opacity: isRunning ? .65 : 1 }}>
                <option value="professional">Professional</option>
                <option value="hype">High-energy</option>
                <option value="educational">Educational</option>
                <option value="emotional">Story</option>
              </select>
            </label>
          </div>

          {status === 'failed' && message && (
            <p style={{ color: '#ff6b6b', fontSize: 14, background: 'rgba(255,107,107,.1)', border: '1px solid rgba(255,107,107,.25)', borderRadius: 12, padding: '12px 16px', margin: 0 }}>{message}</p>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleRender} disabled={!canRender} style={{ flex: 1, minWidth: 170, background: canRender ? GOLD : 'rgba(255,195,0,.3)', color: '#000', border: 'none', borderRadius: 14, padding: '16px 24px', fontSize: 16, fontWeight: 900, cursor: canRender ? 'pointer' : 'not-allowed' }}>
              {isRunning ? 'Rendering...' : 'Render Video'}
            </button>
            <button onClick={() => checkStatus()} disabled={!jobId} style={{ flex: 1, minWidth: 170, background: jobId ? 'rgba(26,240,255,.12)' : 'rgba(255,255,255,.05)', color: jobId ? CYAN : 'rgba(255,255,255,.35)', border: '1px solid rgba(26,240,255,.22)', borderRadius: 14, padding: '16px 24px', fontSize: 15, fontWeight: 800, cursor: jobId ? 'pointer' : 'not-allowed' }}>
              Check Preview
            </button>
          </div>
        </div>

        <aside style={{ ...panelStyle, display: 'grid', gap: 18 }}>
          <p style={{ color: GOLD, fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>Preview</p>
          <div style={{ minHeight: 260, borderRadius: 16, border: '1px solid rgba(255,255,255,.1)', background: '#000', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {videoUrl ? (
              <video src={videoUrl} controls playsInline style={{ width: '100%', maxHeight: 520, display: 'block' }} />
            ) : isRunning ? (
              <div style={{ display: 'grid', gap: 14, justifyItems: 'center', padding: 24, textAlign: 'center' }}>
                <Spinner />
                <p style={{ color: CYAN, fontWeight: 800, margin: 0 }}>{message}</p>
                <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>The preview area stays visible while the render is running.</p>
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 14, textAlign: 'center', lineHeight: 1.6, padding: 24, margin: 0 }}>Preview will appear here after rendering.</p>
            )}
          </div>

          {jobId && <p style={{ color: 'rgba(255,255,255,.38)', fontSize: 11, fontFamily: 'monospace', margin: 0 }}>job {jobId} {pollCount > 0 ? `· poll #${pollCount}` : ''}</p>}
          {message && !isRunning && status !== 'idle' && <p style={{ color: status === 'failed' ? '#ff6b6b' : '#4ade80', fontWeight: 800, fontSize: 15, margin: 0 }}>{message}</p>}

          {videoUrl && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href={videoUrl} download="signalboost-video.mp4" style={{ flex: 1, minWidth: 150, background: GOLD, color: '#000', borderRadius: 14, padding: '14px 20px', fontSize: 15, fontWeight: 900, textAlign: 'center', textDecoration: 'none', display: 'block' }}>Download Video</a>
              <button onClick={reset} style={{ flex: 1, minWidth: 150, background: 'rgba(255,255,255,.07)', color: '#fff', border: '1px solid rgba(255,255,255,.15)', borderRadius: 14, padding: '14px 20px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Generate another</button>
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', border: `3px solid rgba(26,240,255,.15)`, borderTopColor: CYAN, animation: 'spin 0.9s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
