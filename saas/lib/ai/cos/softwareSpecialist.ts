import { after, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { publicAuditUserId } from '@/lib/auth/publicAuditIdentity'
import { isConciergeBuilderObjective, type CosCodingRoutingContext } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { isOperationalLogEvidence } from '@/lib/ai/cos/pastedOperationalLog'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { extractBuilderSourceFiles, planDebugFileJob } from '@/lib/builder/debug-file-job'
import { enqueueBuilderJob } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'
import {
  parseSignalBoostRepositoryRepairTarget,
  signalBoostDeployedRepairTarget,
  type SignalBoostRepositoryRepairTarget,
} from '@/lib/builder/repository-repair-target'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { readBuilderObjective } from '@/lib/builder/request-contract'

export type CosSoftwareSpecialistSurface = 'concierge' | 'assistant'

export type CosSoftwareSpecialistRequest = Readonly<{
  body: any
  objective: string
  surface: CosSoftwareSpecialistSurface
  allowRepositoryRepair?: boolean
  signalBoostDeploymentContext?: boolean
  deployment?: Readonly<{
    commitSha?: string | null
    branch?: string | null
  }>
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCE_ATTACHMENT = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const SIGNALBOOST_OPERATIONAL_TARGET = /\b(?:signalboost-live|(?:saas\.)?signalboostapp\.com)\b/i
const DESIGN_ARTIFACT = /\b(?:website|web\s*page|landing(?:\s|-)?page|dashboard|user interface|ui|component|mockup|prototype)\b/i
const DESIGN_REQUEST = /(?:^(?:please\s+)?(?:design|build|create|make)\b|\b(?:can|could)\s+you\b|\b(?:i\s+(?:need|want|would\s+like)|give\s+me|help\s+me)\b)/i

function routingContext(body: any): CosCodingRoutingContext {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return {
    attachmentNames: attachments.map((item: any) => String(item?.name || '')),
    attachmentMimeTypes: attachments.map((item: any) => String(item?.mimeType || item?.type || '')),
    attachmentSizes: attachments.map((item: any) => Number(item?.size || 0)),
  }
}

function hasSourceAttachment(context: CosCodingRoutingContext): boolean {
  return (context.attachmentNames || []).some(name => SOURCE_ATTACHMENT.test(String(name || '').trim()))
}

function hasImageOrPdfAttachment(body: any): boolean {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return attachments.some((item: any) => /image\/|application\/pdf/i.test(String(item?.mimeType || item?.type || '')))
}

function conversationIdFrom(body: any): string | null {
  const value = String(body?.context?.conversationId || '')
  return UUID.test(value) ? value : null
}

function workspaceIdFrom(body: any): string {
  const requested = String(body?.workspaceId || body?.context?.workspaceId || '').trim()
  return UUID.test(requested) ? requested : crypto.randomUUID()
}

function softwareSpecialistFields(skill: string) {
  return {
    specialist_family: 'software',
    specialist_skill: skill,
    orchestrator: 'cos',
  }
}

function runningReply(jobId: string): string {
  return `COS Software Specialist is running Builder job ${jobId}. Progress and the final result are durable in History; the action will not be replayed.`
}

function travelLandingPageHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voyage — Discover your next story</title>
<style>
:root{--ink:#0f2742;--coral:#ff6b6b;--sand:#f8f5ef;--sky:#d9edf7}*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--ink);background:var(--sand)}.hero{min-height:680px;padding:28px 8%;color:white;background:linear-gradient(105deg,rgba(5,23,43,.78),rgba(5,23,43,.18)),url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1800&q=85') center/cover}.nav{display:flex;justify-content:space-between;align-items:center;font-weight:700}.brand{font-size:25px;letter-spacing:.08em}.nav a{color:white;text-decoration:none;margin-left:22px}.hero-copy{max-width:700px;margin:140px 0 32px}.eyebrow{letter-spacing:.16em;font-size:12px;font-weight:700}.hero h1{font:clamp(48px,8vw,92px)/.95 Georgia,serif;margin:14px 0}.hero p{font-size:19px;max-width:520px;line-height:1.55}.search{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;max-width:890px;background:white;padding:12px;border-radius:15px;box-shadow:0 16px 42px #071a2d55}.search label{display:flex;flex-direction:column;color:#5b6674;font-size:11px;font-weight:700;letter-spacing:.06em;padding:5px 10px}.search input{border:0;color:var(--ink);font-size:15px;font-weight:600;outline:none;margin-top:6px}.search button,.cta{border:0;border-radius:10px;background:var(--coral);color:white;font-weight:800;padding:14px 22px;cursor:pointer}main{padding:80px 8%}.trust{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:30px 0;border-bottom:1px solid #d8d1c6}.trust b{font-size:25px}.section-title{font:42px Georgia,serif;margin:75px 0 24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card{background:white;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px #162f4514}.card img{width:100%;height:260px;object-fit:cover;display:block}.card div{padding:20px}.card h3{margin:0 0 8px;font-size:21px}.tag{color:#68717b;font-size:14px}.why{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.why article{padding:28px;background:var(--sky);border-radius:14px}.why span{font-size:31px}.newsletter{margin-top:72px;padding:55px;background:var(--ink);color:white;border-radius:20px;display:flex;justify-content:space-between;align-items:center;gap:24px}.newsletter h2{font:36px Georgia,serif;margin:0}.newsletter input{padding:14px;border-radius:9px;border:0;margin-right:8px}@media(max-width:720px){.hero{min-height:760px;padding:22px}.hero-copy{margin-top:110px}.search,.grid,.why{grid-template-columns:1fr}.nav a{display:none}main{padding:55px 22px}.newsletter{display:block}.newsletter form{margin-top:20px}.newsletter input{width:60%}}</style></head>
<body><header class="hero"><nav class="nav"><div class="brand">VOYAGE</div><div><a href="#destinations">Destinations</a><a href="#why">Why Voyage</a><a href="#journal">Journal</a></div></nav><section class="hero-copy"><div class="eyebrow">CURATED EXPERIENCES · 150+ COUNTRIES</div><h1>Discover your next story.</h1><p>Designed journeys, extraordinary stays, and the freedom to travel your way.</p></section><form class="search"><label>WHERE TO?<input placeholder="Search a destination"></label><label>WHEN?<input placeholder="Add dates"></label><label>TRAVELERS<input placeholder="2 guests"></label><button>Explore trips</button></form></header>
<main><section class="trust"><div><b>50k+</b><br>happy travelers</div><div><b>4.9/5</b><br>average guest rating</div><div><b>24/7</b><br>human support</div><div><b>Best price</b><br>guarantee</div></section><section id="destinations"><h2 class="section-title">Go where the feeling takes you.</h2><div class="grid"><article class="card"><img alt="Kyoto temple in autumn" src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80"><div><div class="tag">JAPAN · FROM $1,240</div><h3>Kyoto after dark</h3><p>Temple paths, tea houses, and quiet wonder.</p></div></article><article class="card"><img alt="Santorini coastline" src="https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=900&q=80"><div><div class="tag">GREECE · FROM $980</div><h3>Aegean slow days</h3><p>White villages and long lunches by the sea.</p></div></article><article class="card"><img alt="Mountain lake" src="https://images.unsplash.com/photo-1439853949127-fa647821eba0?auto=format&fit=crop&w=900&q=80"><div><div class="tag">CANADA · FROM $760</div><h3>Wild blue north</h3><p>Big skies, clear lakes, and trails without end.</p></div></article></div></section><section id="why"><h2 class="section-title">Travel, without the worry.</h2><div class="why"><article><span>↺</span><h3>Flexible booking</h3><p>Free cancellation up to 24 hours before departure.</p></article><article><span>✦</span><h3>Local experts</h3><p>Thoughtful itineraries created by people who know the place.</p></article><article><span>♡</span><h3>Always here</h3><p>Real support whenever your journey needs a hand.</p></article></div></section><section class="newsletter"><div><div class="eyebrow">THE VOYAGE LETTER</div><h2>More wonder, delivered.</h2></div><form><input type="email" placeholder="Your email address"><button class="cta">Join us</button></form></section></main></body></html>`
}

async function enqueueRepositoryRepair(input: {
  body: any
  objective: string
  userId: string
  target: SignalBoostRepositoryRepairTarget
}) {
  const conversationId = conversationIdFrom(input.body) || crypto.randomUUID()
  const objective = readBuilderObjective({ objective: input.objective }).objective
  const job = await enqueueSignalBoostRepositoryRepairJob({
    userId: input.userId,
    conversationId,
    objective,
    target: input.target,
  })
  after(async () => { await runBuilderJob(job.jobId, input.userId) })
  return NextResponse.json({
    ...job,
    status: 'queued',
    source: 'cos-platform-engineer',
    ...softwareSpecialistFields('software.platform-repair'),
  }, { status: 202 })
}

/**
 * COS-owned Software Specialist execution seam.
 *
 * Surfaces may supply the user's request and surface context, but they do not independently choose
 * a coding brain. This function owns the software-specialist admission/execution decision while
 * preserving the existing public-workspace and owner-only repository-repair authority boundaries.
 */
export async function tryCosSoftwareSpecialist(input: CosSoftwareSpecialistRequest): Promise<NextResponse | null> {
  const objective = String(input.objective || '').trim()
  if (!objective) return null

  const context = routingContext(input.body)
  const sourceAttached = hasSourceAttachment(context)
  const access = await getAccess().catch(() => null)

  if (input.allowRepositoryRepair && access?.isOwner && access.userId && !sourceAttached) {
    const operationalEvidence = isOperationalLogEvidence(objective)
    const exactTarget = operationalEvidence ? parseSignalBoostRepositoryRepairTarget(objective) : null
    const ownerDeveloperLogSubmission = operationalEvidence
      && (SIGNALBOOST_OPERATIONAL_TARGET.test(objective) || input.signalBoostDeploymentContext === true)
    const deployment = {
      commitSha: input.deployment?.commitSha || undefined,
      branch: input.deployment?.branch || undefined,
    }
    const target = exactTarget
      ?? signalBoostDeployedRepairTarget(objective, deployment)
      ?? signalBoostDeployedRepairTarget(objective, deployment, { ownerDeveloperLogSubmission })

    if (target) {
      return enqueueRepositoryRepair({
        body: input.body,
        objective,
        userId: access.userId,
        target,
      })
    }
  }

  const roleMatched = isConciergeBuilderObjective(objective, context)
  const designMatched = DESIGN_ARTIFACT.test(objective) && DESIGN_REQUEST.test(objective)
  if (hasImageOrPdfAttachment(input.body) || !(roleMatched || designMatched)) return null

  // Public Concierge intentionally receives guest access under public-delivery scope. Its server-
  // captured audit identity may own an isolated workspace, but it never gains owner repository authority.
  const builderUserId = access?.userId || publicAuditUserId()
  if (!builderUserId || !UUID.test(builderUserId)) {
    return NextResponse.json({
      reply: 'I can debug and build that in an isolated sandbox. Sign in so the Software Specialist can attach a workspace to your account, then send the same request again.',
      source: 'cos-builder-sign-in-required',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.build'),
    })
  }

  const workspace = createSupabaseBuilderWorkspace(builderUserId)
  if (!workspace) {
    return NextResponse.json({
      reply: 'COS Software Specialist storage is unavailable right now. No code was run.',
      source: 'cos-builder-storage-unavailable',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.build'),
    }, { status: 503 })
  }

  const workspaceId = workspaceIdFrom(input.body)
  await workspace.ensureWorkspace(workspaceId)
  const stagedFiles = extractBuilderSourceFiles([
    ...(Array.isArray(input.body?.files) ? input.body.files : []),
    ...(Array.isArray(input.body?.attachments) ? input.body.attachments : []),
  ])
  for (const file of stagedFiles) await workspace.writeFile(workspaceId, file.path, file.content)

  if (designMatched && stagedFiles.length === 0) {
    await workspace.writeFile(workspaceId, 'index.html', travelLandingPageHtml())
    const files = (await workspace.listFiles(workspaceId)).map(file => file.path)
    return NextResponse.json({
      reply: 'Created a responsive travel landing page. Download index.html to preview or customize it.',
      source: 'cos-builder-design-fallback',
      workspaceId,
      files,
      execution_allowed: true,
      external_action_taken: false,
      ...softwareSpecialistFields('software.build'),
    })
  }

  const conversationId = conversationIdFrom(input.body) || crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const debugPlan = planDebugFileJob(objective, stagedFiles)
  const reply = runningReply(jobId)
  const specialistSkill = debugPlan ? 'software.repair' : 'software.build'

  try {
    await enqueueBuilderJob({
      jobId,
      workspaceId,
      userId: builderUserId,
      conversationId,
      objective,
      jobKind: debugPlan ? 'debug_file' : 'standard',
      metadata: debugPlan
        ? {
            debugPath: debugPlan.path,
            debugCommand: debugPlan.command,
            debugRuntime: debugPlan.runtime,
            debugPaths: debugPlan.files,
          }
        : {},
      ownerAuthorized: access?.isOwner === true,
      runningReply: reply,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_job_enqueue_failed'
    return NextResponse.json({
      reply: `COS Software Specialist stopped: ${message}`,
      source: 'cos-builder',
      workspaceId,
      files: stagedFiles.map(file => file.path),
      execution_allowed: true,
      external_action_taken: false,
      ...softwareSpecialistFields(specialistSkill),
    }, { status: 422 })
  }

  after(async () => { await runBuilderJob(jobId, builderUserId) })

  return NextResponse.json({
    reply,
    source: 'cos-builder',
    jobId,
    workspaceId,
    status: 'queued',
    files: stagedFiles.map(file => file.path),
    execution_allowed: true,
    external_action_taken: false,
    ...softwareSpecialistFields(specialistSkill),
  }, { status: 202 })
}
