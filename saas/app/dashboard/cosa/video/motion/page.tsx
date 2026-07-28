'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'
import { uiText } from '@/lib/i18n/uiText'

const SAAS_URL = 'www.' + 'saas.signalboostapp.com'

const scenes = [
  { label: uiText('generatedUi.u_e4bb9f1ece9af926'), narration: `Start at ${SAAS_URL} and enter the SignalBoost console.`, visual_direction: 'Show the SignalBoost platform address and the main console.' },
  { label: uiText('generatedUi.u_29a40861bafe31e7'), narration: 'The console gives the user one place to see current work, metrics, and next steps.', visual_direction: 'Show dashboard cards moving into one clean view.' },
  { label: uiText('generatedUi.u_aff0766a5290e117'), narration: 'The review cockpit shows proposed work before it moves forward.', visual_direction: 'Show a review card and a clear status summary.' },
  { label: uiText('generatedUi.u_a991aed496e3a816'), narration: 'Live service data helps the user see what is working and what needs attention.', visual_direction: 'Show live status cards and a recommended next step.' },
  { label: uiText('generatedUi.u_298a9207a732a11d'), narration: 'The system guides the user from information to a clear next step.', visual_direction: 'Show a progress flow from insight to action.' },
]

export default function CosaMotionPreviewPage() {
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={{ border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'rgba(15,23,42,.88)' }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiText('generatedUi.u_7097d9af34aa64a7')} /></p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 32 }}><LocalizedText fallback={uiText('generatedUi.u_4e7052cde80d9b56')} /></h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7 }}><LocalizedText fallback={uiText('generatedUi.u_1dee8676dcfffb55')} /></p>
      </section>
      <VideoPreviewRenderer title={uiText('generatedUi.u_4e7052cde80d9b56')} scenes={scenes} callToAction={`Visit ${SAAS_URL}`} />
    </main>
  )
}
