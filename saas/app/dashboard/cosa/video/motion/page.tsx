'use client'

import { VideoPreviewRenderer } from '@/lib/cos/ui/VideoPreviewRenderer'

const SAAS_URL = 'www.' + 'saas.signalboostapp.com'

const scenes = [
  { label: 'Start', narration: `Start at ${SAAS_URL} and enter the SignalBoost console.`, visual_direction: 'Show the SignalBoost platform address and the main console.' },
  { label: 'Console', narration: 'The console gives the user one place to see current work, metrics, and next steps.', visual_direction: 'Show dashboard cards moving into one clean view.' },
  { label: 'Review', narration: 'The review cockpit shows proposed work before it moves forward.', visual_direction: 'Show a review card and a clear status summary.' },
  { label: 'Live data', narration: 'Live service data helps the user see what is working and what needs attention.', visual_direction: 'Show live status cards and a recommended next step.' },
  { label: 'Next step', narration: 'The system guides the user from information to a clear next step.', visual_direction: 'Show a progress flow from insight to action.' },
]

export default function CosaMotionPreviewPage() {
  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={{ border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: 24, background: 'rgba(15,23,42,.88)' }}>
        <p className="sb-eyebrow" style={{ margin: 0 }}>COSA guided tour</p>
        <h1 style={{ color: '#fff', margin: '8px 0 0', fontSize: 32 }}>SignalBoost platform tour</h1>
        <p style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7 }}>This tour uses the real video preview component with URL, narration, waveform, and animation.</p>
      </section>
      <VideoPreviewRenderer title="SignalBoost platform tour" scenes={scenes} callToAction={`Visit ${SAAS_URL}`} />
    </main>
  )
}
