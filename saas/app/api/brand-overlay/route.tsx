// saas/app/api/brand-overlay/route.tsx
// Renders the brand banner as a TRANSPARENT PNG (gold "SignalBoostAi" + cyan URL).
// JSON2Video overlays this image on the video, so the text is guaranteed to show —
// it's pixels, not text the video engine can drop. Public (no auth) so JSON2Video
// can fetch it.
//   /api/brand-overlay?a=16x9   -> 1920x1080 overlay
//   /api/brand-overlay?a=9x16   -> 1080x1920 overlay
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const vertical = (searchParams.get('a') || '16x9') === '9x16'
  const width = vertical ? 1080 : 1920
  const height = vertical ? 1920 : 1080
  const nameSize = vertical ? 86 : 96
  const urlSize = vertical ? 40 : 46
  const padTop = vertical ? 130 : 72

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: padTop,
          backgroundColor: 'transparent',
        }}
      >
        <div
          style={{
            display: 'flex',
            backgroundColor: 'rgba(6,12,32,0.66)',
            color: '#ffc300',
            fontSize: nameSize,
            fontWeight: 800,
            padding: '16px 38px',
            borderRadius: 20,
            letterSpacing: -1,
          }}
        >
          SignalBoostAi
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 16,
            backgroundColor: 'rgba(6,12,32,0.66)',
            color: '#1af0ff',
            fontSize: urlSize,
            fontWeight: 700,
            padding: '12px 28px',
            borderRadius: 14,
          }}
        >
          www.saas.signalboostapp.com
        </div>
      </div>
    ),
    { width, height },
  )
}
