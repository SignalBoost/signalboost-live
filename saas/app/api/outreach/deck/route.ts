import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { callModel } from '@/lib/ai/modelRouter'
import { safeParseJSON } from '@/lib/ai/validation'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const dynamic = 'force-dynamic'

type DeckCategory = 'affiliate' | 'company' | 'media'

type Slide = { title: string; bullets: string[] }

const BRAND = {
  gold: rgb(1, 0.764, 0),
  ink: rgb(0.06, 0.09, 0.16),
  slate: rgb(0.28, 0.33, 0.41),
  white: rgb(1, 1, 1),
}

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
    { title: 'Introduction', bullets: ['SignalBoost: a hybrid AI platform — digital mall + full SaaS suite', '125+ affiliates including Trivago, Expedia, Booking.com', 'Monetized via commissions on every purchase'] },
    { title: 'Marketplace Value', bullets: ['Affiliate network across travel and services', 'Customer purchases generate commission payouts', 'Expanding visibility across the AI mall'] },
    { title: 'SaaS Capabilities', bullets: ['AI website builder', 'Image, video, and audio studios', 'Review → branded posts', 'Multilingual support (EN, ES, PT, PL, RU)', 'Cowork tools'] },
    { title: 'Benefits for Partners', bullets: ['Revenue growth through commissions', 'Brand amplification via content automation', 'Global reach with multilingual campaigns', 'Easy integration'] },
    { title: 'Case Example', bullets: [`A booking through SignalBoost generates a commission payout`, 'Listings amplified with branded posts', 'Multilingual reach increases bookings'] },
    { title: 'Call to Action', bullets: [`Showcase ${n}'s offers in the mall`, 'Leverage the SaaS tools', 'Earn commissions from every purchase', 'Next step: review your tailored preview'] },
  ]
}

async function buildSlides(business: any, category: DeckCategory, language: string): Promise<Slide[]> {
  const name = business?.business_name || business?.analyzer_summary?.business_name || ''
  const prompt = `Create a 6-slide partner pitch deck for SignalBoost, personalized for this business.

SignalBoost = two live platforms:
1) signalboostapp.com — digital AI shopping mall, 125+ affiliates (Trivago, Expedia, Booking.com), commissions on every purchase, Cowork tools.
2) saas.signalboostapp.com — AI website builder, review→branded content, image/video/audio studios, multilingual (EN/ES/PT/PL/RU), Cowork tools.

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
Each slide: 3-5 short bullet points.`

  const raw = await callModel({ modelPreference: 'claude', prompt, maxTokens: 1800 })
  const parsed = raw ? safeParseJSON(raw) : null
  const slides: Slide[] = Array.isArray(parsed?.slides) ? parsed.slides : []

  // Validate shape; fall back if the model didn't return 6 usable slides.
  const clean = slides
    .filter((s) => s && typeof s.title === 'string' && Array.isArray(s.bullets))
    .map((s) => ({ title: String(s.title), bullets: s.bullets.map((b: any) => String(b)).filter(Boolean).slice(0, 6) }))

  return clean.length === 6 ? clean : fallbackSlides(name)
}

function wrapText(text: string, max: number): string[] {
  const words = text.split(/\s+/)
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

  // Load the lead from the queue (preferred), or accept inline business data.
  let business: any = body?.business || null
  if (!business && leadId) {
    const { data, error } = await ctx.admin.from('outreach_queue').select('*').eq('id', leadId).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    business = data
  }
  if (!business) return NextResponse.json({ error: 'No business data provided' }, { status: 400 })

  const businessName = business?.business_name || business?.analyzer_summary?.business_name || 'Partner'
  const slides = await buildSlides(business, category, language)

  // ── Render the PDF ──────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create()
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica)

  const W = 720
  const H = 540

  slides.forEach((slide, idx) => {
    const page = pdf.addPage([W, H])

    // Background
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BRAND.ink })
    // Top accent bar
    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: BRAND.gold })

    // Brand wordmark
    page.drawText('signalboost', { x: 48, y: H - 56, size: 18, font: fontBold, color: BRAND.white })
    // Slide number
    page.drawText(`${idx + 1} / 6`, { x: W - 96, y: H - 52, size: 12, font: fontReg, color: BRAND.slate })

    // Title
    page.drawText(slide.title, { x: 48, y: H - 120, size: 30, font: fontBold, color: BRAND.gold })

    // Bullets
    let y = H - 180
    for (const bullet of slide.bullets) {
      const lines = wrapText(bullet, 70)
      // Bullet dot
      page.drawCircle({ x: 56, y: y + 4, size: 3, color: BRAND.gold })
      lines.forEach((ln, i) => {
        page.drawText(ln, { x: 72, y: y - i * 20, size: 14, font: fontReg, color: BRAND.white })
      })
      y -= lines.length * 20 + 16
    }

    // Footer
    page.drawText('signalboostapp.com  ·  saas.signalboostapp.com', {
      x: 48, y: 32, size: 10, font: fontReg, color: BRAND.slate,
    })
  })

  const bytes = await pdf.save()
  const safeName = businessName.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'partner'

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="signalboost-deck-${safeName}.pdf"`,
    },
  })
}
