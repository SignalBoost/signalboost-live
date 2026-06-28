'use client'

import { useEffect, useMemo, useState } from 'react'
import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'

const GOLD = '#ffc300'
const SAAS_URL = 'www.' + 'saas.signalboostapp.com'

type Decision = {
  recommended_hero: string
  recommended_format: string
  recommended_scene_designs: string[]
  confidence_score: number
  prediction_summary: string
  creative_brief: string
  traffic_plan: string[]
  monetization_plan: string[]
  approval_required: string[]
}

type Scene = { label: string; narration: string; visual_direction: string }

const fallbackDecision: Decision = {
  recommended_hero: 'busy_owner_story',
  recommended_format: 'decision_driven_platform_short',
  recommended_scene_designs: ['before_after_transformation', 'animated_product_cards', 'branded_cta'],
  confidence_score: 58,
  prediction_summary: 'Fallback draft shown until COSA marketing decision data loads.',
  creative_brief: 'Show a busy owner moving from scattered work into one approved next action inside SignalBoost.',
  traffic_plan: [`Drive viewers to ${SAAS_URL}.`, 'Test watch time and clicks.', 'Use results to improve the next draft.'],
  monetization_plan: ['Use traffic for platform signups.', 'Reuse best clips later.', 'Store performance for future decisions.'],
  approval_required: ['Approve storyboard.', 'Approve final video before release.'],
}

function readable(value: string) {
  return value.replaceAll('_', ' ')
}

function sceneForDesign(design: string): Scene {
  const label = readable(design)
  if (design.includes('audit') || design.includes('score')) {
    return {
      label,
      narration: 'COSA opens with a credibility moment: a scan, a score, and a clear signal that the platform understands the business problem.',
      visual_direction: 'Show a moving score gauge, scan line, and checklist cards lighting up one by one.',
    }
  }
  if (design.includes('before')) {
    return {
      label,
      narration: 'Before SignalBoost, the hero is stuck between tools, tasks, and decisions. After SignalBoost, the next action is clear.',
      visual_direction: 'Split the screen: chaos on the left, organized SignalBoost console on the right.',
    }
  }
  if (design.includes('product') || design.includes('cards')) {
    return {
      label,
      narration: 'SignalBoost turns scattered work into product cards: recommendation, draft, approval, queue, and result.',
      visual_direction: 'Animate product cards sliding into a clean workflow with glowing transitions.',
    }
  }
  if (design.includes('provider') || design.includes('status')) {
    return {
      label,
      narration: 'Connected service data helps the user see what is live, what needs attention, and what action COSA recommends next.',
      visual_direction: 'Show service status cards, live indicators, and an approval-ready action card.',
    }
  }
  return {
    label,
    narration: `COSA uses ${label} to move the viewer from attention to action, ending with a clear reason to visit SignalBoost.`,
    visual_direction: `Animate ${label} with branded motion, URL overlay, and final CTA button.`,
  }
}

function scenesFromDecision(decision: Decision): Scene[] {
  const scenes = decision.recommended_scene_designs.map(sceneForDesign)
  return [
    {
      label: 'COSA hook',
      narration: `COSA selected ${readable(decision.recommended_hero)} in ${readable(decision.recommended_format)} because this direction best fits the current marketing goal.`,
      visual_direction: 'Show the selected hero, format badge, confidence score, and niche cards before the story begins.',
    },
    ...scenes,
    {
      label: 'Traffic CTA',
      narration: `Visit ${SAAS_URL} and explore how SignalBoost turns scattered work into approved business action.`,
      visual_direction: 'Show the SignalBoost URL, CTA button, product screen, and final approval gate.',
    },
  ]
}

export default function CosaInstantVideoDraftPage() {
  const [decision, setDecision] = useState<Decision>(fallbackDecision)
  const [loadedFromEngine, setLoadedFromEngine] = useState(false)
  const [message, setMessage] = useState('Loading COSA marketing decision...')

  async function loadDecision() {
    setMessage('Loading COSA marketing decision...')
    try {
      const res = await fetch('/api/cos/marketing-decision', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok || !json.decision) throw new Error(json.error || 'No COSA decision returned.')
      setDecision(json.decision)
      setLoadedFromEngine(true)
      setMessage('COSA marketing decision loaded. This draft is now decision-driven, not static.')
    } catch (err) {
      setLoadedFromEngine(false)
      setMessage(err instanceof Error ? `Using fallback draft: ${err.message}` : 'Using fallback draft.')
    }
  }

  useEffect(() => { loadDecision() }, [])

  const scenes = useMemo(() => scenesFromDecision(decision), [decision])
  const draftTitle = `SignalBoost ${readable(decision.recommended_format)} with ${readable(decision.recommended_hero)}`
  const finalDraft = useMemo(() => [
    `Title: ${draftTitle}`,
    `Hero: ${readable(decision.recommended_hero)}`,
    `Format: ${readable(decision.recommended_format)}`,
    `Confidence: ${decision.confidence_score}%`,
    `Destination: ${SAAS_URL}`,
    '',
    'COSA prediction:',
    decision.prediction_summary,
    '',
    'Creative brief:',
    decision.creative_brief,
    '',
    'Scene flow:',
    ...scenes.map((scene, index) => `${index + 1}. ${scene.label}: ${scene.narration}`),
    '',
    'Traffic plan:',
    ...decision.traffic_plan.map(item => `- ${item}`),
    '',
    'Monetization plan:',
    ...decision.monetization_plan.map(item => `- ${item}`),
    '',
    `CTA: Visit ${SAAS_URL}`,
  ].join('\n'), [decision, draftTitle, scenes])

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA Video Draft Studio</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}>Decision-driven video draft</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 860 }}>
          This page now pulls COSA's marketing decision engine and changes the draft based on the selected hero, format, scene designs, traffic plan, and monetization path.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={loadDecision} style={primaryButton}>Reload COSA decision</button>
          <a href="/dashboard/cosa/video" style={{ ...secondaryButton, textDecoration: 'none' }}>Advanced campaign queue</a>
          <a href="/dashboard/cosa/video/quality" style={{ ...secondaryButton, textDecoration: 'none' }}>Quality test</a>
          <a href="/dashboard/cosa/decision" style={{ ...secondaryButton, textDecoration: 'none' }}>Marketing decision</a>
        </div>
      </section>

      <section style={statusCard}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{loadedFromEngine ? 'COSA engine active' : 'Fallback draft'}</p>
          <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>{readable(decision.recommended_hero)} · {readable(decision.recommended_format)}</h2>
          <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.6, margin: '8px 0 0' }}>{message}</p>
        </div>
        <div style={{ display: 'grid', gap: 8, minWidth: 240 }}>
          <Badge label="Confidence" value={`${decision.confidence_score}%`} />
          <Badge label="Destination" value={SAAS_URL} />
          <Badge label="Scenes" value={`${scenes.length}`} />
        </div>
      </section>

      <section style={decisionGrid}>
        <DecisionList title="COSA scene designs" items={decision.recommended_scene_designs.map(readable)} />
        <DecisionList title="Traffic plan" items={decision.traffic_plan} />
        <DecisionList title="Monetization plan" items={decision.monetization_plan} />
      </section>

      <section style={finalDraftFrame}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>Decision-driven video player</p>
        <VideoPreviewRenderer title={draftTitle} scenes={scenes} callToAction={`Visit ${SAAS_URL}`} />
      </section>

      <section style={gridTwo}>
        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Storyboard from COSA decision</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {scenes.map((scene, index) => (
              <div key={`${scene.label}-${index}`} style={sceneCard}>
                <strong style={{ color: '#fff' }}>{index + 1}. {scene.label}</strong>
                <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.55, margin: '6px 0 0' }}>{scene.narration}</p>
                <p style={{ color: 'rgba(255,195,0,.86)', lineHeight: 1.45, margin: '6px 0 0', fontSize: 12 }}>Visual: {scene.visual_direction}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>Final decision draft script</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.82)', background: 'rgba(0,0,0,.26)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.6, margin: '12px 0 0', maxHeight: 560, overflow: 'auto' }}>{finalDraft}</pre>
        </section>
      </section>
    </main>
  )
}

function Badge({ label, value }: { label: string; value: string }) {
  return <div style={badge}><p style={{ color: 'rgba(255,255,255,.48)', fontSize: 11, margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>{label}</p><p style={{ color: GOLD, margin: '5px 0 0', fontWeight: 950 }}>{value}</p></div>
}

function DecisionList({ title, items }: { title: string; items: string[] }) {
  return <section style={instructionCard}><p className="sb-eyebrow" style={{ margin: 0 }}>{title}</p><div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{items.map((item, index) => <div key={`${title}-${index}`} style={miniItem}>{item}</div>)}</div></section>
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const statusCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.26)', borderRadius: 18, padding: 18, background: 'linear-gradient(145deg, rgba(255,195,0,.1), rgba(15,23,42,.72))', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }
const finalDraftFrame: React.CSSProperties = { border: '2px solid rgba(255,195,0,.4)', borderRadius: 22, padding: 16, background: 'rgba(255,195,0,.045)' }
const decisionGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }
const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }
const instructionCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const sceneCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, background: 'rgba(0,0,0,.18)' }
const badge: React.CSSProperties = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)' }
const miniItem: React.CSSProperties = { color: 'rgba(255,255,255,.78)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 9, background: 'rgba(0,0,0,.16)', fontSize: 12, lineHeight: 1.45 }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
