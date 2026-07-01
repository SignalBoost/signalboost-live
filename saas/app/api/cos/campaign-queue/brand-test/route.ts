// saas/app/api/cos/campaign-queue/brand-test/route.ts
// TEMP admin test — proves whether JSON2Video renders our on-screen text, CHEAPLY.
// Renders a 4-second, low-res (640x360) clip with ONLY the brand banner over a
// solid navy background — no b-roll, no voice, no captions. Costs a fraction of a
// credit and finishes in ~30s, so we can nail the exact text format without
// burning full 60s renders.
//
// Open (as admin):  /api/cos/campaign-queue/brand-test
// On success it returns { ok:true, url:"...mp4" } — open that URL and check:
//   - gold "SignalBoostAi" at the TOP
//   - cyan "www.saas.signalboostapp.com" in the CENTER
// On failure it returns the exact JSON2Video error so we can see why.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ENDPOINT = 'https://api.json2video.com/v2/movies'

export async function GET(_req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const key = process.env.JSON2VIDEO_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'JSON2VIDEO_API_KEY missing in Vercel' }, { status: 200 })
  const headers = { 'Content-Type': 'application/json', 'x-api-key': key }

  const movie = {
    width: 640,
    height: 360,
    quality: 'low',
    scenes: [
      {
        duration: 4,
        'background-color': '#0b122d',
        elements: [
          {
            type: 'text',
            text: 'SignalBoostAi',
            duration: -2,
            settings: {
              'font-family': 'Montserrat',
              'font-weight': '800',
              'font-size': '54px',
              'font-color': '#ffc300',
              'vertical-position': 'top',
              'horizontal-position': 'center',
            },
          },
          {
            type: 'text',
            text: 'www.saas.signalboostapp.com',
            duration: -2,
            settings: {
              'font-family': 'Montserrat',
              'font-weight': '700',
              'font-size': '28px',
              'font-color': '#1af0ff',
              'vertical-position': 'center',
              'horizontal-position': 'center',
            },
          },
        ],
      },
    ],
  }

  try {
    const sub = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(movie) })
    const sd: any = await sub.json().catch(() => ({}))
    if (!sub.ok || sd?.success === false) {
      return NextResponse.json({ ok: false, stage: 'submit', httpStatus: sub.status, error: sd?.message || sd?.error || sd }, { status: 200 })
    }
    const project = sd?.project || sd?.movie?.project || sd?.id
    if (!project) return NextResponse.json({ ok: false, stage: 'submit', error: 'no project id', raw: sd }, { status: 200 })

    const deadline = Date.now() + 95_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 6000))
      const pr = await fetch(`${ENDPOINT}?project=${encodeURIComponent(project)}`, { headers })
      const pd: any = await pr.json().catch(() => ({}))
      const m = pd?.movie || {}
      if (m?.status === 'done' && m?.url) return NextResponse.json({ ok: true, url: m.url, message: m?.message || null })
      if (m?.status === 'error' || m?.success === false) return NextResponse.json({ ok: false, stage: 'render', error: m?.message || m, raw: m }, { status: 200 })
    }
    return NextResponse.json({ ok: false, stage: 'timeout', project }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, stage: 'exception', error: e?.message || String(e) }, { status: 200 })
  }
}
