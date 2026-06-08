import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { callModel } from '@/lib/ai/modelRouter'
import { safeParseJSON } from '@/lib/ai/validation'

export const dynamic = 'force-dynamic'

type DeckCategory = 'affiliate' | 'company' | 'media'
type Slide = { title: string; bullets: string[] }

function categoryGuidance(category: DeckCategory): string {
  switch (category) {
    case 'affiliate':
      return 'Audience is an affiliate/partner brand. Emphasize commissions on every booking/purchase, visibility among 125+ mall partners, and SaaS amplification of their listings.'
    case 'media':
      return 'Audience is a media/social platform. Emphasize integration potential, ready-to-publish content, collaboration, and position SignalBoost as a partner, not a competitor.'
    case 'company':
    default:
      return 'Audience is a business/company. Emphasize growth tools (reviews into branded posts, AI websites, automated campaigns), multilingual reach, and the hybrid mall + SaaS positioning.'
  }
}

function fallbackSlides(businessName: string): Slide[] {
  const n = businessName || 'your business'
  return [
    { title: 'Introduction', bullets: ['SignalBoost: a hybrid AI platform - digital mall + full SaaS suite', '125+ affiliates including Trivago, Expedia, Booking.com', 'Monetized via commissions on every purchase'] },
    { title: 'Marketplace Value', bullets: ['Affiliate network across travel and services', 'Customer purchases generate commission payouts', 'Expanding visibility across the AI mall'] },
    { title: 'SaaS Capabilities', bullets: ['AI website builder', 'Image, video, and audio studios', 'Review to branded posts', 'Multilingual support (EN, ES, PT, PL, RU)', 'Cowork tools'] },
    { title: 'Benefits for Partners', bullets: ['Revenue growth through commissions', 'Brand amplification via content automation', 'Global reach with multilingual campaigns', 'Easy integration'] },
    { title: 'Case Example', bullets: ['A booking through SignalBoost generates a commission payout', 'Listings amplified with branded posts', 'Multilingual reach increases bookings'] },
    { title: 'Call to Action', bullets: [`Showcase ${n}'s offers in the mall`, 'Leverage the SaaS tools', 'Earn commissions from every purchase', 'Next step: review your tailored preview'] },
  ]
}

async function buildSlides(business: any, category: DeckCategory, language: string): Promise<Slide[]> {
  const name = business?.business_name || business?.analyzer_summary?.business_name || ''
  const prompt = `Create a 6-slide partner pitch deck for SignalBoost, personalized for this business.

SignalBoost = two live platforms:
1) signalboostapp.com - digital AI shopping mall, 125+ affiliates (Trivago, Expedia, Booking.com), commissions on every purchase, Cowork tools.
2) saas.signalboostapp.com - AI website builder, review to branded content, image/video/audio studios, multilingual (EN/ES/PT/PL/RU), Cowork tools.

${categoryGuidance(category)}

The 6 slides MUST be, in order:
1. Introduction
2. Marketplace Value
3. SaaS Capabilities
4. Benefits for Partners
5. Case Example
6. Call to Action

Personalize using this business analysis: ${JSON.stringify(business?.analyzer_summary || business).slice(0, 2500)}

Write all text in this language: ${language}.
Return ONLY valid JSON, no markdown, in exactly this shape:
{ "slides": [ { "title": string, "bullets": string[] }, ... 6 items ] }
Each slide: 3-5 short bullet points. Keep each bullet under 90 characters.`

  const raw = await callModel({ modelPreference: 'claude', prompt, maxTokens: 1800 })
  const parsed = raw ? safeParseJSON(raw) : null
  const slides: Slide[] = Array.isArray(parsed?.slides) ? parsed.slides : []

  const clean = slides
    .filter((s) => s && typeof s.title === 'string' && Array.isArray(s.bullets))
    .map((s) => ({
      title: String(s.title),
      bullets: s.bullets.map((b: any) => String(b)).filter(Boolean).slice(0, 6),
    }))

  return clean.length === 6 ? clean : fallbackSlides(name)
}

// ── Minimal PDF writer (no external library) ──────────────────────────────────
// Escapes text for PDF string literals.
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

// Keep only WinAnsi-safe characters; replace anything outside with '?'.
function ascii(s: string): string {
  // Replace common smart punctuation with ASCII, then strip non-Latin1.
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\xFF]/g, '?')
}

function wrap(text: string, max: number): string[] {
  const words = ascii(text).split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      if (line) lines.push(line.trim())
      line = w
    } else {
      line = (line + ' ' + w).trim()
    }
  }
  if (line) lines.push(line.trim())
  return lines
}

function buildPdf(slides: Slide[]): Buffer {
  const W = 720
  const H = 540

  // Build the content stream for one slide page.
  function pageStream(slide: Slide, index: number): string {
    const parts: string[] = []

    // Background (dark ink)
    parts.push('0.06 0.09 0.16 rg')
    parts.push(`0 0 ${W} ${H} re f`)

    // Top accent bar (gold)
    parts.push('1 0.764 0 rg')
    parts.push(`0 ${H - 8} ${W} 8 re f`)

    // Wordmark
    parts.push('BT /F2 18 Tf 1 1 1 rg 48 ' + (H - 50) + ' Td (signalboost) Tj ET')
    // Slide number
    parts.push('BT /F1 12 Tf 0.5 0.55 0.62 rg ' + (W - 90) + ' ' + (H - 48) + ' Td (' + esc((index + 1) + ' / 6') + ') Tj ET')

    // Title (gold)
    parts.push('BT /F2 28 Tf 1 0.764 0 rg 48 ' + (H - 120) + ' Td (' + esc(ascii(slide.title)) + ') Tj ET')

    // Bullets (white)
    let y = H - 175
    for (const bullet of slide.bullets) {
      const lines = wrap(bullet, 72)
      // bullet dot
      parts.push('1 0.764 0 rg')
      parts.push(`56 ${y + 3} 3 3 re f`)
      // text lines
      lines.forEach((ln, i) => {
        parts.push('BT /F1 14 Tf 1 1 1 rg 72 ' + (y - i * 20) + ' Td (' + esc(ln) + ') Tj ET')
      })
      y -= lines.length * 20 + 16
    }

    // Footer
    parts.push('BT /F1 10 Tf 0.5 0.55 0.62 rg 48 30 Td (' + esc('signalboostapp.com  -  saas.signalboostapp.com') + ') Tj ET')

    return parts.join('\n')
  }

  // Assemble PDF objects.
  const objects: string[] = []
  const N = slides.length

  // Object numbering:
  // 1 = Catalog, 2 = Pages, 3 = Font F1 (Helvetica), 4 = Font F2 (Helvetica-Bold)
  // then for each page: a Page object and a Contents object.
  const pageObjStart = 5
  const pageObjNums: number[] = []
  const contentObjNums: number[] = []
  for (let i = 0; i < N; i++) {
    pageObjNums.push(pageObjStart + i * 2)
    contentObjNums.push(pageObjStart + i * 2 + 1)
  }

  // 1 Catalog
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'

  // 2 Pages
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(' ')
  objects[2] = `<< /Type /Pages /Count ${N} /Kids [${kids}] >>`

  // 3, 4 Fonts
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

  // Pages + contents
  for (let i = 0; i < N; i++) {
    const stream = pageStream(slides[i], i)
    const contentNum = contentObjNums[i]
    const pageNum = pageObjNums[i]
    objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`
    objects[contentNum] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  }

  // Serialize with xref.
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  const totalObjects = contentObjNums[N - 1]

  for (let n = 1; n <= totalObjects; n++) {
    offsets[n] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${totalObjects + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let n = 1; n <= totalObjects; n++) {
    pdf += String(offsets[n]).padStart(10, '0') + ' 00000 n \n'
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return Buffer.from(pdf, 'latin1')
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const leadId = body?.lead_id ? String(body.lead_id) : ''
  const language = body?.language ? String(body.language) : 'en'
  const rawCategory = body?.category ? String(body.category).toLowerCase() : 'company'
  const category: DeckCategory = (['affiliate', 'company', 'media'] as string[]).includes(rawCategory)
    ? (rawCategory as DeckCategory)
    : 'company'

  let business: any = body?.business || null
  if (!business && leadId) {
    const { data, error } = await ctx.admin.from('outreach_queue').select('*').eq('id', leadId).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    business = data
  }
  if (!business) return NextResponse.json({ error: 'No business data provided' }, { status: 400 })

  const businessName = business?.business_name || business?.analyzer_summary?.business_name || 'Partner'
  const slides = await buildSlides(business, category, language)
  const pdf = buildPdf(slides)

  const safeName = businessName.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'partner'

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="signalboost-deck-${safeName}.pdf"`,
    },
  })
}
