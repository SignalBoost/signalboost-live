'use client'

import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'

const SAAS_URL = 'www.' + 'saas.signalboostapp.com'

const draftScenes = [
  {
    label: 'Hook',
    narration: 'Most small business owners do not need another dashboard. They need one place that tells them what needs attention next.',
    visual_direction: 'Animate scattered dashboard cards moving into one SignalBoost command console.',
  },
  {
    label: 'Hero problem',
    narration: 'The hero is the busy owner who is switching between tools, checking status, reviewing tasks, and still trying to grow the company.',
    visual_direction: 'Show a business owner persona surrounded by floating cards for metrics, approvals, campaigns, and provider status.',
  },
  {
    label: 'Product moment',
    narration: 'SignalBoost brings the work into one console. COSA recommends the next action, prepares the draft, and waits for human approval.',
    visual_direction: 'Show animated product cards: recommendation, draft, approval, queue, and result.',
  },
  {
    label: 'Proof moment',
    narration: 'Instead of guessing what to do next, the user sees a clear recommendation, a reason, and the safest next step.',
    visual_direction: 'Animate a score gauge, action card, and approval gate moving from pending to ready.',
  },
  {
    label: 'CTA',
    narration: `Visit ${SAAS_URL} and explore how SignalBoost helps turn scattered work into approved business action.`,
    visual_direction: 'Show the branded SignalBoost URL, glowing CTA button, and final platform screen.',
  },
]

export default function CosaInstantVideoDraftPage() {
  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA Video Draft Studio</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>Instant video draft preview</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 860 }}>
          This is the simple testing page. It skips the campaign queue and shows a draft immediately, so you can check the creative direction, animation, narration, waveform, URL, CTA, and scene flow.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/dashboard/cosa/video" style={{ ...secondaryButton, textDecoration: 'none' }}>Advanced campaign queue</a>
          <a href="/dashboard/cosa/video/quality" style={{ ...secondaryButton, textDecoration: 'none' }}>Quality test</a>
          <a href="/dashboard/cosa/decision" style={{ ...secondaryButton, textDecoration: 'none' }}>Marketing decision</a>
        </div>
      </section>

      <section style={instructionCard}>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 20 }}>How to test this draft</h2>
        <ol style={{ color: 'rgba(255,255,255,.74)', lineHeight: 1.8, margin: '10px 0 0', paddingLeft: 22 }}>
          <li>Click <strong>Play preview</strong> to move through the scenes.</li>
          <li>Click <strong>Play narration</strong> to hear the voice and see the waveform.</li>
          <li>Check that the URL shows <strong>{SAAS_URL}</strong>.</li>
          <li>Review whether the scenes feel like a real product story, not only text.</li>
        </ol>
      </section>

      <VideoPreviewRenderer
        title="SignalBoost: from scattered work to approved action"
        scenes={draftScenes}
        callToAction={`Visit ${SAAS_URL}`}
      />

      <section style={instructionCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Important distinction</p>
        <p style={{ color: 'rgba(255,255,255,.74)', lineHeight: 1.7, margin: '10px 0 0' }}>
          This is a browser draft preview, not the final exported MP4. The purpose is to approve the creative direction first. After the direction is good, the next worker stage can render a real MP4 with produced audio, captions, and final assets.
        </p>
      </section>
    </main>
  )
}

const heroCard: React.CSSProperties = {
  border: '1px solid rgba(255,195,0,.22)',
  borderRadius: 24,
  padding: 24,
  background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))',
}

const instructionCard: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.09)',
  borderRadius: 18,
  padding: 18,
  background: 'rgba(15,23,42,.72)',
}

const secondaryButton: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  borderRadius: 12,
  padding: '10px 14px',
  fontWeight: 850,
  cursor: 'pointer',
}
