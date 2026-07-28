'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'
import LocalVideoPreviewReview from '@/components/studio/LocalVideoPreviewReview'
import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
  title: uiCopy('u_c7313ddc3a382a59'),
  duration_seconds: 25,
  opening_hook: 'Hi, I am SignalBoost AI. I will give you a quick tour so you can see how we can help your company.',
  destination_url: SAAS_URL,
  cta: `Visit ${SAAS_URL}`,
  approval_gates: ['Approve presenter style.', 'Approve opening hook.', 'Approve product tour flow.', 'Approve final video before release.'],
  scenes: [
    { label: uiCopy('u_fb3b88d0fc9f1a85'), presenter_line: 'Hi, I am SignalBoost AI. I will give you a quick tour so you can see how we can help your company.', caption: uiCopy('u_9db3bf86ab6567bd'), visual_direction: 'Show the SignalBoost AI guide with a friendly wave and branded glow.', goal: 'Create attention in the first three seconds.' },
    { label: uiCopy('u_05c2d4a3f760aeea'), presenter_line: 'Many companies lose time switching between dashboards, reviews, content tools, and approval steps.', caption: uiCopy('u_4fba1522264f0613'), visual_direction: 'Show scattered product cards moving into one clean console.', goal: 'Make the viewer recognize the problem quickly.' },
    { label: uiCopy('u_27e9cd2665a8d709'), presenter_line: 'SignalBoost brings the work into one place so you can see what needs attention and what action should happen next.', caption: uiCopy('u_a3e95697b3a90089'), visual_direction: 'Zoom into the platform console and highlight recommendations, approvals, provider data, and content tools.', goal: 'Show product value visually.' },
    { label: uiCopy('u_68b237d2cf471952'), presenter_line: 'COSA can prepare the recommendation, draft the campaign, and organize the work while you stay in control of approval.', caption: uiCopy('u_d98cfdf6cf179417'), visual_direction: 'Animate approve, reject, queue, and ready cards moving through a clean workflow.', goal: 'Build trust by showing control.' },
    { label: uiCopy('u_239b3777ef1cc841'), presenter_line: `Visit ${SAAS_URL} and see how SignalBoost can help your company turn scattered work into approved action.`, caption: `Visit ${SAAS_URL}`, visual_direction: 'End with the guide beside the branded URL, CTA button, and final product screen.', goal: 'Drive traffic to the SaaS platform.' },
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
    setMessage(uiCopy('u_1078aa1e8d1a45d7'))
    try {
      const res = await fetch('/api/cos/presenter-video', { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok || !json.draft) throw new Error(json.error || 'No presenter draft returned.')
      setDraft(json.draft)
      setLoadedFromEngine(true)
      setMessage(uiCopy('u_551e24bf19d16425'))
    } catch (err) {
      setLoadedFromEngine(false)
      setMessage(err instanceof Error ? `Using fallback presenter draft: ${err.message}` : uiCopy('u_fe435d717c148f44'))
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
        <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_fb17b66829bef7fa')} /></p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 34, letterSpacing: '-0.04em' }}><LocalizedText fallback={uiCopy('u_712214ed27cfb57a')} /></h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, maxWidth: 880 }}><LocalizedText fallback={uiCopy('u_84b79cc56244ec48')} /></p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={loadDraft} style={primaryButton}><LocalizedText fallback={uiCopy('u_3282a5abdcc78c5f')} /></button>
          <a href="/dashboard/cosa/video" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiCopy('u_493dd4b3e0185d83')} /></a>
          <a href="/dashboard/cosa/video/quality" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiCopy('u_eff710048bb53ca3')} /></a>
          <a href="/dashboard/cosa/decision" style={{ ...secondaryButton, textDecoration: 'none' }}><LocalizedText fallback={uiCopy('u_2321a95409a7148f')} /></a>
        </div>
      </section>

      <section style={statusCard}>
        <div>
          <p className="sb-eyebrow" style={{ margin: 0 }}>{loadedFromEngine ? uiCopy('u_33822a6815eb2609') : uiCopy('u_800ea81694b39ad9')}</p>
          <h2 style={{ color: '#fff', margin: '8px 0 0', fontSize: 22 }}>{draft.presenter_name} · {draft.duration_seconds}{uiCopy('u_5b30db117bc3d526')}</h2>
          <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.6, margin: '8px 0 0' }}>{message}</p>
        </div>
        <div style={{ display: 'grid', gap: 8, minWidth: 240 }}>
          <Badge label={uiCopy('u_dbc7ad1c6573114a')} value={draft.presenter_name} />
          <Badge label={uiCopy('u_58b43ed746c99907')} value={draft.destination_url} />
          <Badge label={uiCopy('u_15cf2fa7cef8b3ea')} value={`${draft.scenes.length}`} />
        </div>
      </section>

      <section style={finalDraftFrame}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>{uiCopy('u_6f35dee185cd6973')}</p>
        <VideoPreviewRenderer title={draft.title} scenes={previewScenes} callToAction={draft.cta} />
      </section>

      <LocalVideoPreviewReview />

      <section style={gridTwo}>
        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_a57a39f1594e838b')} /></p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {draft.scenes.map((scene, index) => (
              <div key={`${scene.label}-${index}`} style={sceneCard}>
                <strong style={{ color: '#fff' }}>{index + 1}. {scene.label}</strong>
                <p style={{ color: GOLD, lineHeight: 1.55, margin: '6px 0 0', fontWeight: 850 }}>{scene.caption}</p>
                <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.55, margin: '6px 0 0' }}>{scene.presenter_line}</p>
                <p style={{ color: 'rgba(255,195,0,.86)', lineHeight: 1.45, margin: '6px 0 0', fontSize: 12 }}>{uiCopy('u_217f2e85d7d076d7')}{scene.visual_direction}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={instructionCard}>
          <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_abe7f470d96d9363')} /></p>
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
