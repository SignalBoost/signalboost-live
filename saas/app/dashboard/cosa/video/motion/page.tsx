'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const SAAS_URL = 'www.' + 'saas.signalboostapp.com'

const scenes = [
  { label: uiCopy('u_b20fbbf433e72b16'), narration: `Start at ${SAAS_URL} and enter the SignalBoost console.`, visual_direction: 'Show the SignalBoost platform address and the main console.' },
  { label: uiCopy('u_66780e93fe565292'), narration: 'The console gives the user one place to see current work, metrics, and next steps.', visual_direction: 'Show dashboard cards moving into one clean view.' },
  { label: uiCopy('u_2faebdd66f3cb517'), narration: 'The review cockpit shows proposed work before it moves forward.', visual_direction: 'Show a review card and a clear status summary.' },
  { label: uiCopy('u_10d747f215cf5e8c'), narration: 'Live service data helps the user see what is working and what needs attention.', visual_direction: 'Show live status cards and a recommended next step.' },
  { label: uiCopy('u_c248605f0c393f58'), narration: 'The system guides the user from information to a clear next step.', visual_direction: 'Show a progress flow from insight to action.' },
]

export default function CosaMotionPreviewPage() {
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={{ border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'rgba(15,23,42,.88)' }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}><LocalizedText fallback={uiCopy('u_b7e30be4308c551e')} /></p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 32 }}><LocalizedText fallback={uiCopy('u_3a668c521f7274f8')} /></h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7 }}><LocalizedText fallback={uiCopy('u_5630bb4cbfe38540')} /></p>
      </section>
      <VideoPreviewRenderer title={uiCopy('u_16aeefa94adf5dfd')} scenes={scenes} callToAction={`Visit ${SAAS_URL}`} />
    </main>
  )
}
