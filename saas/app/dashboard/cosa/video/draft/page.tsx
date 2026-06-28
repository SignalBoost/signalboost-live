'use client'

import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'

const SAAS_URL = 'www.' + 'saas.signalboostapp.com'
const DRAFT_TITLE = 'SignalBoost: from scattered work to approved action'

const draftScenes = [
  { label: 'Hook', narration: 'Most small business owners do not need another dashboard. They need one place that tells them what needs attention next.', visual_direction: 'Animate scattered dashboard cards moving into one SignalBoost command console.' },
  { label: 'Hero problem', narration: 'The hero is the busy owner who is switching between tools, checking status, reviewing tasks, and still trying to grow the company.', visual_direction: 'Show a business owner persona surrounded by floating cards for metrics, approvals, campaigns, and provider status.' },
  { label: 'Product moment', narration: 'SignalBoost brings the work into one console. COSA recommends the next action, prepares the draft, and waits for human approval.', visual_direction: 'Show animated product cards: recommendation, draft, approval, queue, and result.' },
  { label: 'Proof moment', narration: 'Instead of guessing what to do next, the user sees a clear recommendation, a reason, and the safest next step.', visual_direction: 'Animate a score gauge, action card, and approval gate moving from pending to ready.' },
  { label: 'CTA', narration: `Visit ${SAAS_URL} and explore how SignalBoost helps turn scattered work into approved business action.`, visual_direction: 'Show the branded SignalBoost URL, glowing CTA button, and final platform screen.' },
]

const finalDraft = [
  `Title: ${DRAFT_TITLE}`,
  `Destination: ${SAAS_URL}`,
  'Status: final browser draft ready for creative review',
  '',
  'Scene flow:',
  ...draftScenes.map((scene, index) => `${index + 1}. ${scene.label}: ${scene.narration}`),
  '',
  `CTA: Visit ${SAAS_URL}`,
].join('\n')

export default function CosaInstantVideoDraftPage() {
  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA Video Draft Studio</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>Final video draft preview</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 860 }}>
          This page shows the playable draft and the written draft package. The large player below is the video draft preview. The storyboard and script underneath are the final draft package for review.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/dashboard/cosa/video" style={{ ...secondaryButton, textDecoration: 'none' }}>Advanced campaign queue</a>
          <a href="/dashboard/cosa/video/quality" style={{ ...secondaryButton, textDecoration: 'none' }}>Quality test</a>
          <a href="/dashboard/cosa/decision" style={{ ...secondaryButton, textDecoration: 'none' }}>Marketing decision</a>
        </div>
      </section>

      <section style={statusCard}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Final draft status</p>
          <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>Playable draft + storyboard ready</h2>
          <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.6, margin: '8px 0 0' }}>Use this draft to approve the creative direction before the production renderer is connected.</p>
        </div>
        <div style={{ color: GOLD, fontWeight: 950 }}>{SAAS_URL}</div>
      </section>

      <section style={finalDraftFrame}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Playable video draft</p>
        <VideoPreviewRenderer title={DRAFT_TITLE} scenes={draftScenes} callToAction={`Visit ${SAAS_URL}`} />
      </section>

      <section style={gridTwo}>
        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Storyboard</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {draftScenes.map((scene, index) => (
              <div key={scene.label} style={sceneCard}>
                <strong style={{ color: '#fff' }}>{index + 1}. {scene.label}</strong>
                <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.55, margin: '6px 0 0' }}>{scene.narration}</p>
                <p style={{ color: 'rgba(255,195,0,.86)', lineHeight: 1.45, margin: '6px 0 0', fontSize: 12 }}>Visual: {scene.visual_direction}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Final draft script</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.82)', background: 'rgba(0,0,0,.26)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.6, margin: '12px 0 0', maxHeight: 520, overflow: 'auto' }}>{finalDraft}</pre>
        </section>
      </section>
    </main>
  )
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const statusCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.26)', borderRadius: 18, padding: 18, background: 'linear-gradient(145deg, rgba(255,195,0,.1), rgba(15,23,42,.72))', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }
const finalDraftFrame: React.CSSProperties = { border: '2px solid rgba(255,195,0,.4)', borderRadius: 22, padding: 16, background: 'rgba(255,195,0,.045)' }
const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }
const instructionCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const sceneCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, background: 'rgba(0,0,0,.18)' }
const secondaryButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
