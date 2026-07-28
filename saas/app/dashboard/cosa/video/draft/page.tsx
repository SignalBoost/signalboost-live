'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'
import LocalVideoPreviewReview from '@/components/studio/LocalVideoPreviewReview'
import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'
import { uiText } from '@/lib/i18n/uiText'

const GOLD = '#ffc300'
const SAAS_URL = 'www.' + 'saas.signalboostapp.com'

type PresenterScene = {
  label: string
  presenter_line: string
  caption: string
  visual_direction: string
  goal: string
}

type PresenterDraft = {
  presenter_name: string
  presenter_role: string
  tone: string
  title: string
  duration_seconds: number
  opening_hook: string
  scenes: PresenterScene[]
  cta: string
  destination_url: string
  approval_gates: string[]
}

const fallbackDraft: PresenterDraft = {
  presenter_name: 'SignalBoost AI',
  presenter_role: 'official platform guide',
  tone: 'professional_friendly',
  title: uiText('generatedUi.u_30d890def564f1e8'),
  duration_seconds: 25,
  opening_hook: 'Hi, I am SignalBoost AI. I will give you a quick tour so you can see how we can help your company.',
  destination_url: SAAS_URL,
  cta: `Visit ${SAAS_URL}`,
  approval_gates: ['Approve presenter style.', 'Approve opening hook.', 'Approve product tour flow.', 'Approve final video before release.'],
  scenes: [
    { label: uiText('generatedUi.u_e72c89101151faa4'), presenter_line: 'Hi, I am SignalBoost AI. I will give you a quick tour so you can see how we can help your company.', caption: uiText('generatedUi.u_7fa45e631489b427'), visual_direction: 'Show the SignalBoost AI guide with a friendly wave and branded glow.', goal: 'Create attention in the first three seconds.' },
    { label: uiText('generatedUi.u_a82746b58c602938'), presenter_line: 'Many companies lose time switching between dashboards, reviews, content tools, and approval steps.', caption: uiText('generatedUi.u_7c35f6b391218e08'), visual_direction: 'Show scattered product cards moving into one clean console.', goal: 'Make the viewer recognize the problem quickly.' },
    { label: uiText('generatedUi.u_da1b6e6a080c72d5'), presenter_line: 'SignalBoost brings the work into one place so you can see what needs attention and what action should happen next.', caption: uiText('generatedUi.u_5e0bfe84e70e9218'), visual_direction: 'Zoom into the platform console and highlight recommendations, approvals, provider data, and content tools.', goal: 'Show product value visually.' },
    { label: uiText('generatedUi.u_25d17c7d62dd9581'), presenter_line: 'COSA can prepare the recommendation, draft the campaign, and organize the work while you stay in control of approval.', caption: uiText('generatedUi.u_f4c326e52d26a9e0'), visual_direction: 'Animate approve, reject, queue, and ready cards moving through a clean workflow.', goal: 'Build trust by showing control.' },
    { label: uiText('generatedUi.u_020620132bbb140f'), presenter_line: `Visit ${SAAS_URL} and see how SignalBoost can help your company turn scattered work into approved action.`, caption: `Visit ${SAAS_URL}`, visual_direction: 'End with the guide beside the branded URL, CTA button, and final product screen.', goal: 'Drive traffic to the SaaS platform.' },
  ],
}

function sceneForPreview(scene: PresenterScene) {
  return {
    label: scene.caption || scene.label,
    narration: scene.presenter_line,
    visual_direction: scene.visual_direction,
  }
}

export default function CosaInstantVideoDraftPage() {
  const [draft, setDraft] = useState<PresenterDraft>(fallbackDraft)
  const [loadedFromEngine, setLoadedFromEngine] = useState(false)
  const [message, setMessage] = useState('Loading SignalBoost AI presenter draft...')

  async function loadDraft() {
    setMessage("Loading SignalBoost AI presenter draft...")
    try {
      const res = await fetch('/api/cos/presenter-video', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok || !json.draft) throw new Error(json.error || 'No presenter draft returned.')
      setDraft(json.draft)
      setLoadedFromEngine(true)
      setMessage("SignalBoost AI presenter draft loaded from COSA.")
    } catch (err) {
      setLoadedFromEngine(false)
      setMessage(err instanceof Error ? `Using fallback presenter draft: ${err.message}` : "Using fallback presenter draft.")
    }
  }

  useEffect(() => { loadDraft() }, [])

  const previewScenes = useMemo(() => draft.scenes.map(sceneForPreview), [draft])
  const finalDraft = useMemo(() => [
    `Title: ${draft.title}`,
    `Presenter: ${draft.presenter_name}`,
    `Role: ${draft.presenter_role}`,
    `Tone: ${draft.tone}`,
    `Duration: ${draft.duration_seconds} seconds`,
    `Destination: ${draft.destination_url}`,
    '',
    'Opening hook:',
    draft.opening_hook,
    '',
    'Scene flow:',
    ...draft.scenes.map((scene, index) => `${index + 1}. ${scene.label}: ${scene.presenter_line}`),
    '',
    'Approval gates:',
    ...draft.approval_gates.map(item => `- ${item}`),
    '',
    `CTA: ${draft.cta}`,
  ].join('\n'), [draft])

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={heroCard}>
        <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_f2723c0986dc8a23')} /></p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}><LocalizedText fallback={uiText('generatedUi.u_22ab19e8972a261a')} /></h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 880 }}><LocalizedText fallback={uiText('generatedUi.u_723f75c0334c0efb')} /></p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={loadDraft} style={primaryButton}><LocalizedText fallback={uiText('generatedUi.u_ba93bbeb928596a0')} /></button>
          <a href="/dashboard/cosa/video" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiText('generatedUi.u_950b6cac3ac1e027')} /></a>
          <a href="/dashboard/cosa/video/quality" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiText('generatedUi.u_71b7d80f3411c5e3')} /></a>
          <a href="/dashboard/cosa/decision" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiText('generatedUi.u_75aa2384732e95bb')} /></a>
        </div>
      </section>

      <section style={statusCard}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{loadedFromEngine ? uiText('generatedUi.u_534549bae2c099b3') : uiText('generatedUi.u_b9049f94a8e98df4')}</p>
          <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>{draft.presenter_name} · {draft.duration_seconds}{uiText('generatedUi.u_4d84262953ed7347')}</h2>
          <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.6, margin: '8px 0 0' }}>{message}</p>
        </div>
        <div style={{ display: 'grid', gap: 8, minWidth: 240 }}>
          <Badge label={uiText('generatedUi.u_9ef077a1231ea3b7')} value={draft.presenter_name} />
          <Badge label={uiText('generatedUi.u_293d404a500f5f9a')} value={draft.destination_url} />
          <Badge label={uiText('generatedUi.u_160c0535e5c3c137')} value={`${draft.scenes.length}`} />
        </div>
      </section>

      <section style={finalDraftFrame}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{uiText('generatedUi.u_924920aa28d0b154')}</p>
        <VideoPreviewRenderer title={draft.title} scenes={previewScenes} callToAction={draft.cta} />
      </section>

      <LocalVideoPreviewReview />

      <section style={gridTwo}>
        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_3c4ce6509c1724db')} /></p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {draft.scenes.map((scene, index) => (
              <div key={`${scene.label}-${index}`} style={sceneCard}>
                <strong style={{ color: '#fff' }}>{index + 1}. {scene.label}</strong>
                <p style={{ color: GOLD, lineHeight: 1.55, margin: '6px 0 0', fontWeight: 850 }}>{scene.caption}</p>
                <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.55, margin: '6px 0 0' }}>{scene.presenter_line}</p>
                <p style={{ color: 'rgba(255,195,0,.86)', lineHeight: 1.45, margin: '6px 0 0', fontSize: 12 }}>{uiText('generatedUi.u_fd3ff4d0e9f0ec09')}{scene.visual_direction}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_c15c3f1592e0e5f0')} /></p>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.82)', background: 'rgba(0,0,0,.26)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.6, margin: '12px 0 0', maxHeight: 560, overflow: 'auto' }}>{finalDraft}</pre>
        </section>
      </section>
    </main>
  )
}

function Badge({ label, value }: { label: string; value: string }) {
  return <div style={badge}><p style={{ color: 'rgba(255,255,255,.48)', fontSize: 11, margin: 0, textTransform: 'uppercase', fontWeight: 900 }}>{label}</p><p style={{ color: GOLD, margin: '5px 0 0', fontWeight: 950 }}>{value}</p></div>
}

const heroCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const statusCard: React.CSSProperties = { border: '1px solid rgba(255,195,0,.26)', borderRadius: 18, padding: 18, background: 'linear-gradient(145deg, rgba(255,195,0,.1), rgba(15,23,42,.72))', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }
const finalDraftFrame: React.CSSProperties = { border: '2px solid rgba(255,195,0,.4)', borderRadius: 22, padding: 16, background: 'rgba(255,195,0,.045)' }
const gridTwo: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }
const instructionCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.09)', borderRadius: 18, padding: 18, background: 'rgba(15,23,42,.72)' }
const sceneCard: React.CSSProperties = { border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, background: 'rgba(0,0,0,.18)' }
const badge: React.CSSProperties = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 10, background: 'rgba(0,0,0,.18)' }
const primaryButton: React.CSSProperties = { border: 'none', background: GOLD, color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 950, cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
