import { after, NextRequest, NextResponse } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'
import { buildBoundedResearchPartial, planResearchTask, type ResearchTaskPlan, type VerifiedResearchResult } from '@/lib/ai/cos/researchBudget'
import { tryDeterministicUtility } from '@/lib/ai/cos/deterministicUtilities'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import { attachRecordedTurnProvenance, recordLatestUserTurnProvenance } from '@/lib/ai/cos/supportTurnProvenance'
import { getAccess } from '@/lib/auth/access'
import { isPublicDeliveryScope, withPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'
import { detectPrimaryCorruption } from '@/lib/cos-backup/policy'
import { recordCosRecovery, runBackupCos } from '@/lib/cos-backup/runtime'
import { advanceProspectCampaigns, createProspectCampaignJob } from '@/lib/outreach/prospectCampaign'
import {
  advancePressCampaigns,
  createPressCampaignJob,
  parsePressCampaignRequest,
  pressCampaignQueuedReply,
} from '@/lib/outreach/pressCampaign'
import {
  campaignBriefMiss,
  parseProspectCampaignRequest,
  prospectCampaignQueuedReply,
  prospectCampaignQueueError,
} from '@/lib/outreach/prospectCampaignRequest'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { BuilderToolLoop } from '@/lib/builder/tool-loop'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { VercelSandboxBuilderRunner } from '@/lib/builder/vercel-sandbox-runner'
import { isConciergeBuilderObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { isPastedOperationalLog, operationalLogReply } from '@/lib/ai/cos/pastedOperationalLog'
import { PUBLIC_CONCIERGE_SECURITY_REFUSAL, hasUnsafePublicModelOutput, isPublicPromptExfiltrationAttempt } from '@/lib/ai/cos/publicPromptSecurity'
import { publicAuditUserId } from '@/lib/auth/publicAuditIdentity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Bound Primary work so the 300 s function preserves at least 150 s of function budget for recovery.
const PRIMARY_TIMEOUT_MS = 150_000
const RESEARCH_LIFELINE_START_MS = 90_000
const RESEARCH_RESULT_LIMIT = 12
// This is intentionally local to the public ingress. Worker-role routing is allowed to evolve,
// while Concierge must reliably recognize the concrete deliverables it advertises to visitors.
const CONCIERGE_DESIGN_ARTIFACT = /\b(?:website|web\s*page|landing(?:\s|-)?page|dashboard|user interface|ui|component|mockup|prototype)\b/i
const CONCIERGE_DESIGN_REQUEST = /(?:^(?:please\s+)?(?:design|build|create|make)\b|\b(?:can|could)\s+you\b|\b(?:i\s+(?:need|want|would\s+like)|give\s+me|help\s+me)\b)/i

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((block: any) => String(block?.text || '')).join('\n').trim()
    }
  }
  return ''
}

function languageFrom(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en'
}

function localeFrom(language: string): string {
  return language === 'pt' ? 'pt-BR' : language === 'es' ? 'es' : language === 'pl' ? 'pl' : language === 'ru' ? 'ru' : 'en-US'
}

function confidenceThreshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function conversationIdFrom(body: any): string | null {
  const value = String(body?.context?.conversationId || '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

function hasAttachments(body: any): boolean {
  return Array.isArray(body?.attachments) && body.attachments.length > 0
}


function travelLandingPageHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voyage — Discover your next story</title>
<style>
:root{--ink:#0f2742;--coral:#ff6b6b;--sand:#f8f5ef;--sky:#d9edf7}*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--ink);background:var(--sand)}.hero{min-height:680px;padding:28px 8%;color:white;background:linear-gradient(105deg,rgba(5,23,43,.78),rgba(5,23,43,.18)),url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1800&q=85') center/cover}.nav{display:flex;justify-content:space-between;align-items:center;font-weight:700}.brand{font-size:25px;letter-spacing:.08em}.nav a{color:white;text-decoration:none;margin-left:22px}.hero-copy{max-width:700px;margin:140px 0 32px}.eyebrow{letter-spacing:.16em;font-size:12px;font-weight:700}.hero h1{font:clamp(48px,8vw,92px)/.95 Georgia,serif;margin:14px 0}.hero p{font-size:19px;max-width:520px;line-height:1.55}.search{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;max-width:890px;background:white;padding:12px;border-radius:15px;box-shadow:0 16px 42px #071a2d55}.search label{display:flex;flex-direction:column;color:#5b6674;font-size:11px;font-weight:700;letter-spacing:.06em;padding:5px 10px}.search input{border:0;color:var(--ink);font-size:15px;font-weight:600;outline:none;margin-top:6px}.search button,.cta{border:0;border-radius:10px;background:var(--coral);color:white;font-weight:800;padding:14px 22px;cursor:pointer}main{padding:80px 8%}.trust{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:30px 0;border-bottom:1px solid #d8d1c6}.trust b{font-size:25px}.section-title{font:42px Georgia,serif;margin:75px 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card{background:white;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px #162f4514}.card img{width:100%;height:260px;object-fit:cover;display:block}.card div{padding:20px}.card h3{margin:0 0 8px;font-size:21px}.tag{color:#68717b;font-size:14px}.why{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.why article{padding:28px;background:var(--sky);border-radius:14px}.why span{font-size:31px}.newsletter{margin-top:72px;padding:55px;background:var(--ink);color:white;border-radius:20px;display:flex;justify-content:space-between;align-items:center;gap:24px}.newsletter h2{font:36px Georgia,serif;margin:0}.newsletter input{padding:14px;border-radius:9px;border:0;margin-right:8px}@media(max-width:720px){.hero{min-height:760px;padding:22px}.hero-copy{margin-top:110px}.search,.grid,.why{grid-template-columns:1fr}.nav a{display:none}main{padding:55px 22px}.newsletter{display:block}.newsletter form{margin-top:20px}.newsletter input{width:60%}}</style></head>
<body><header class="hero"><nav class="nav"><div class="brand">VOYAGE</div><div><a href="#destinations">Destinations</a><a href="#why">Why Voyage</a><a href="#journal">Journal</a></div></nav><section class="hero-copy"><div class="eyebrow">CURATED EXPERIENCES · 150+ COUNTRIES</div><h1>Discover your next story.</h1><p>Designed journeys, extraordinary stays, and the freedom to travel your way.</p></section><form class="search"><label>WHERE TO?<input placeholder="Search a destination"></label><label>WHEN?<input placeholder="Add dates"></label><label>TRAVELERS<input placeholder="2 guests"></label><button>Explore trips</button></form></header>
<main><section class="trust"><div><b>50k+</b><br>happy travelers</div><div><b>4.9/5</b><br>average guest rating</div><div><b>24/7</b><br>human support</div><div><b>Best price</b><br>guarantee</div></section><section id="destinations"><h2 class="section-title">Go where the feeling takes you.</h2><div class="grid"><article class="card"><img alt="Kyoto temple in autumn" src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80"><div><div class="tag">JAPAN · FROM $1,240</div><h3>Kyoto after dark</h3><p>Temple paths, tea houses, and quiet wonder.</p></div></article><article class="card"><img alt="Santorini coastline" src="https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=900&q=80"><div><div class="tag">GREECE · FROM $980</div><h3>Aegean slow days</h3><p>White villages and long lunches by the sea.</p></div></article><article class="card"><img alt="Mountain lake" src="https://images.unsplash.com/photo-1439853949127-fa647821eba0?auto=format&fit=crop&w=900&q=80"><div><div class="tag">CANADA · FROM $760</div><h3>Wild blue north</h3><p>Big skies, clear lakes, and trails without end.</p></div></article></div></section><section id="why"><h2 class="section-title">Travel, without the worry.</h2><div class="why"><article><span>↺</span><h3>Flexible booking</h3><p>Free cancellation up to 24 hours before departure.</p></article><article><span>✦</span><h3>Local experts</h3><p>Thoughtful itineraries created by people who know the place.</p></article><article><span>♡</span><h3>Always here</h3><p>Real support whenever your journey needs a hand.</p></article></div></section><section class="newsletter"><div><div class="eyebrow">THE VOYAGE LETTER</div><h2>More wonder, delivered.</h2></div><form><input type="email" placeholder="Your email"><button class="cta">Join the list</button></form></section></main></body></html>`
}

function wantsWebsiteDesign(input: string): boolean {
  const text = String(input || '').trim()
  return CONCIERGE_DESIGN_REQUEST.test(text) && CONCIERGE_DESIGN_ARTIFACT.test(text)
}

async function persistFallbackArtifact(userId: string, body: any, html: string) {
  const workspace = await createSupabaseBuilderWorkspace({
    userId,
    purpose: 'Concierge generated website preview',
    conversationId: conversationIdFrom(body) || undefined,
  })
  await workspace.writeFile('index.html', html)
  return workspace.getManifest()
}

async function builderFallbackResponse(args: { userId: string; body: any; input: string; error: unknown }) {
  if (!wantsWebsiteDesign(args.input)) return null
  try {
    const manifest = await persistFallbackArtifact(args.userId, args.body, travelLandingPageHtml())
    return NextResponse.json({
      ok: true,
      reply: 'I created a responsive travel landing page and kept the editable HTML in your private workspace.',
      source: 'cos-builder-safe-design-fallback',
      workspaceId: manifest.id,
      files: manifest.files.map((file) => file.path),
      execution_allowed: true,
      external_action_taken: false,
      fallback_reason: args.error instanceof Error ? args.error.message : String(args.error || 'builder_unavailable'),
    })
  } catch (fallbackError) {
    console.error('[concierge-builder-fallback-failed]', fallbackError)
    return null
  }
}

function fallbackBuilderPayload(args: {
  workspaceId: string
  reply: string
  files: string[]
  reason: string
}) {
  return {
    ok: true,
    reply: args.reply,
    source: 'cos-builder-fallback',
    workspaceId: args.workspaceId,
    files: args.files,
    execution_allowed: false,
    external_action_taken: false,
    fallback_reason: args.reason,
  }
}

function fallbackArtifactReply(language: string, fileName: string) {
  if (language === 'es') return `He creado ${fileName} en tu espacio privado.`
  if (language === 'pt') return `Criei ${fileName} no seu espaço privado.`
  if (language === 'pl') return `Utworzyłem ${fileName} w Twoim prywatnym obszarze roboczym.`
  if (language === 'ru') return `Я создал ${fileName} в вашем приватном рабочем пространстве.`
  return `I created ${fileName} in your private workspace.`
}

function safeArtifactDraft(input: string, extension: 'txt' | 'pdf'): string {
  const normalized = String(input || '').replace(/\s+/g, ' ').trim()
  const title = extension === 'pdf' ? 'Document draft' : 'Text draft'
  return `${title}\n\n${normalized}\n`
}

async function directArtifactTool(args: { userId: string; body: any; input: string; language: string }) {
  const match = args.input.match(/\b(?:create|make|generate|draft|write|build)\b[\s\S]{0,120}\b(?:\.?(txt|pdf)|text file|pdf document)\b/i)
  if (!match) return null
  const extension = String(match[1] || '').toLowerCase() === 'pdf' || /pdf document/i.test(args.input) ? 'pdf' : 'txt'
  const workspace = await createSupabaseBuilderWorkspace({
    userId: args.userId,
    purpose: `Concierge ${extension} artifact`,
    conversationId: conversationIdFrom(args.body) || undefined,
  })
  const fileName = extension === 'pdf' ? 'document.txt' : 'document.txt'
  await workspace.writeFile(fileName, safeArtifactDraft(args.input, extension))
  const manifest = await workspace.getManifest()
  return NextResponse.json({
    ok: true,
    reply: fallbackArtifactReply(args.language, fileName),
    source: 'cos-artifact-tool',
    workspaceId: manifest.id,
    files: manifest.files.map((file) => file.path),
    execution_allowed: true,
    external_action_taken: false,
  })
}

async function directProspectCampaign(body: any, input: string, language: string) {
  const access = await getAccess()
  if (!access?.isOwner) return null
  const parsed = parseProspectCampaignRequest(input, language)
  if (!parsed) return null
  try {
    const started = await createProspectCampaignJob({
      userId: access.userId,
      organizationId: String(body?.context?.organizationId || ''),
      workspace: String(body?.context?.workspace || ''),
      request: parsed,
    })
    after(async () => { await advanceProspectCampaigns(started.job.id) })
    return NextResponse.json({
      reply: prospectCampaignQueuedReply(parsed, language),
      source: 'cos-prospect-campaign-queued',
      jobId: started.job.id,
      execution_allowed: false,
      external_action_taken: false,
    })
  } catch (error) {
    return NextResponse.json({
      reply: prospectCampaignQueueError(language),
      source: 'cos-prospect-campaign-queue-error',
      error: error instanceof Error ? error.message : String(error),
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }
}

async function directPressCampaign(body: any, input: string, language: string) {
  const access = await getAccess()
  if (!access?.isOwner) return null
  const parsed = parsePressCampaignRequest(input, language)
  if (!parsed) return null
  try {
    const started = await createPressCampaignJob({
      userId: access.userId,
      organizationId: String(body?.context?.organizationId || ''),
      workspace: String(body?.context?.workspace || ''),
      request: parsed,
    })
    after(async () => { await advancePressCampaigns(started.job.id) })
    return NextResponse.json({
      reply: pressCampaignQueuedReply(parsed, language),
      source: 'cos-press-campaign-queued',
      jobId: started.job.id,
      execution_allowed: false,
      external_action_taken: false,
    })
  } catch (error) {
    return NextResponse.json({
      reply: campaignBriefMiss(language),
      source: 'cos-press-campaign-queue-error',
      error: error instanceof Error ? error.message : String(error),
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }
}

function modelMessages(body: any) {
  return Array.isArray(body?.messages) ? body.messages : []
}

function safePromptFromMessages(body: any) {
  return modelMessages(body)
    .map((message: any) => `${String(message?.role || 'user')}: ${typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content || '')}`)
    .join('\n')
    .slice(-24_000)
}

async function tryBuilderTurn(args: { req: NextRequest; body: any; input: string; userId: string }) {
  if (!isConciergeBuilderObjective(args.input)) return null
  if (isPastedOperationalLog(args.input)) {
    return NextResponse.json({
      ok: true,
      reply: operationalLogReply(args.input),
      source: 'cos-operational-log-analysis',
      execution_allowed: false,
      external_action_taken: false,
    })
  }
  const workspace = await createSupabaseBuilderWorkspace({
    userId: args.userId,
    purpose: 'Concierge Builder objective',
    conversationId: conversationIdFrom(args.body) || undefined,
  })
  const manifest = await workspace.getManifest()
  const aiPort = createPlatformAiPort({
    userId: args.userId,
    organizationId: String(args.body?.context?.organizationId || ''),
    workspace: String(args.body?.context?.workspace || ''),
    surface: 'concierge',
  })
  const loop = new BuilderToolLoop({
    workspace,
    runner: new VercelSandboxBuilderRunner(),
    aiPort,
  })
  try {
    const result = await loop.run({
      objective: args.input,
      context: safePromptFromMessages(args.body),
      manifest,
    })
    return NextResponse.json({
      ok: true,
      reply: result.answer,
      source: 'cos-builder',
      workspaceId: manifest.id,
      files: result.files,
      execution_allowed: true,
      external_action_taken: false,
      evidence: result.evidence,
    })
  } catch (error) {
    const fallback = await builderFallbackResponse({ userId: args.userId, body: args.body, input: args.input, error })
    if (fallback) return fallback
    console.error('[concierge-builder-error]', error)
    const fallbackPayload = fallbackBuilderPayload({
      workspaceId: manifest.id,
      reply: `Builder could not complete this task: ${error instanceof Error ? error.message : String(error)}`,
      files: [],
      reason: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(fallbackPayload, { status: 503 })
  }
}

async function boundedPrimary(req: NextRequest) {
  return Promise.race([
    supportPost(new NextRequest(req.clone())),
    new Promise<NextResponse>((resolve) => {
      const timer = setTimeout(() => resolve(NextResponse.json({
        ok: false,
        reply: 'Primary COS reached its bounded request budget.',
        source: 'cos-primary-timeout',
        execution_allowed: false,
        external_action_taken: false,
      }, { status: 504 })), PRIMARY_TIMEOUT_MS)
      timer.unref?.()
    }),
  ])
}

function createResearchLifeline(input: string) {
  const plan = planResearchTask(input)
  if (!plan) return null
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const promise = new Promise<VerifiedResearchResult[]>((resolve) => {
    timer = setTimeout(async () => {
      if (cancelled) return resolve([])
      const results: VerifiedResearchResult[] = []
      for (const query of plan.queries.slice(0, 4)) {
        const live = await getExternalInfo(query, RESEARCH_RESULT_LIMIT, { bypassCache: true })
        if (!live.ok) continue
        for (const item of live.results.slice(0, RESEARCH_RESULT_LIMIT)) {
          results.push({ title: item.title, url: item.url, snippet: item.snippet })
        }
      }
      resolve(results)
    }, RESEARCH_LIFELINE_START_MS)
    timer.unref?.()
  })
  return {
    plan,
    promise,
    cancel() {
      cancelled = true
      if (timer) clearTimeout(timer)
    },
  }
}

function safeResponsePayload(response: NextResponse) {
  return response.clone().json().catch(() => null)
}

async function verifiedResearchFallback(args: { input: string; plan: ResearchTaskPlan; verified: VerifiedResearchResult[] }) {
  return buildBoundedResearchPartial({
    input: args.input,
    plan: args.plan,
    verified: args.verified,
  })
}

async function persistPublicTurn(args: {
  userId: string
  conversationId: string | null
  input: string
  response: NextResponse
}) {
  const payload = await safeResponsePayload(args.response)
  const reply = String(payload?.reply || payload?.error || '').trim()
  if (!reply) return
  await persistTurn({
    userId: args.userId,
    conversationId: args.conversationId,
    userMessage: args.input,
    assistantMessage: reply,
  }).catch(() => null)
  await recordLatestUserTurnProvenance(args.userId, reply, payload?.execution_provenance || null).catch(() => null)
  await attachRecordedTurnProvenance(args.userId, reply, payload?.execution_provenance || null).catch(() => null)
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const input = latestUserText(body)
  const language = languageFrom(body)
  const locale = localeFrom(language)
  const userId = await publicAuditUserId()
  const conversationId = conversationIdFrom(body)

  if (isPublicPromptExfiltrationAttempt(input)) {
    return NextResponse.json({
      ok: true,
      reply: PUBLIC_CONCIERGE_SECURITY_REFUSAL,
      source: 'cos-public-security-refusal',
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  const deterministic = tryDeterministicUtility({
    prompt: input,
    timezone: String(body?.context?.timezone || body?.context?.timeZone || ''),
    locale,
    confidenceThreshold: confidenceThreshold(),
  })
  if (deterministic) return NextResponse.json(deterministic)

  if (isPublicDeliveryScope()) {
    const artifact = await directArtifactTool({ userId, body, input, language })
    if (artifact) return artifact
  }

  const prospectCampaign = await directProspectCampaign(body, input, language)
  if (prospectCampaign) return prospectCampaign
  const pressCampaign = await directPressCampaign(body, input, language)
  if (pressCampaign) return pressCampaign

  if (hasAttachments(body) || isConciergeBuilderObjective(input)) {
    const builder = await tryBuilderTurn({ req, body, input, userId })
    if (builder) return builder
  }

  const researchLifeline = createResearchLifeline(input)
  const primary = await withPublicDeliveryScope(() => boundedPrimary(req))
  const primaryPayload = await safeResponsePayload(primary)
  if (primary.status >= 400 && primary.status < 500) return primary

  const immediateReasons = detectPrimaryCorruption(primaryPayload)
  if (primary && immediateReasons.length === 0) {
    researchLifeline?.cancel()
    if (hasUnsafePublicModelOutput(String(primaryPayload?.reply || ''))) {
      return NextResponse.json({
        ok: true,
        reply: PUBLIC_CONCIERGE_SECURITY_REFUSAL,
        source: 'cos-public-security-refusal',
        execution_allowed: false,
        external_action_taken: false,
      })
    }
    await persistPublicTurn({ userId, conversationId, input, response: primary })
    return primary
  }

  const verified = researchLifeline ? await researchLifeline.promise : []
  if (researchLifeline?.plan && verified.length) {
    const partial = await verifiedResearchFallback({ input, plan: researchLifeline.plan, verified })
    const partialResponse = NextResponse.json({
      ok: true,
      reply: partial.reply,
      source: 'cos-bounded-research-partial',
      partial_completion: true,
      completed_count: partial.completed,
      remaining_count: partial.remaining,
      continuation_prompt: partial.continuationPrompt,
      timed_out: true,
      execution_allowed: partial.executionAllowed,
      external_action_taken: partial.externalActionTaken,
    })
    await persistPublicTurn({ userId, conversationId, input, response: partialResponse })
    return partialResponse
  }

  const backup = await runBackupCos({
    prompt: input,
    primaryPayload,
    corruptionReasons: immediateReasons,
    language,
  })
  if (backup?.response) {
    await recordCosRecovery({
      input,
      primaryPayload,
      backupPayload: backup.payload,
      reasons: immediateReasons,
    }).catch(() => null)
    await persistPublicTurn({ userId, conversationId, input, response: backup.response })
    return backup.response
  }

  return primary
}
