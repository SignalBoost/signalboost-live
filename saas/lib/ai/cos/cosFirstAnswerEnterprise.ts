
⌁
iTMounts
Home
Platform
Pricing
Public Tools
▾
Campaigns
▾
Operations
▾
Studio
▾
Security
▾
Help
▾
Admin
▾
⚡ Unlimited

English
Log out

≡
Tier 1 Providers
1
2
3
4

AWS

GCP

Azure

Stripe

Supabase

Vercel

GitHub

OpenAI

Anthropic

Google Gemini

Secondary Supabase

🌐
Domains/DNS

🚀
Deployments

📝
Logs

🔗
Webhooks

👥
Team Access

⚙️
Settings
🎛️ Hub Home
/
Tier 1 · Core
/
Supabase Workspace
SQL Engine
⚡
SQL Editor
Run arbitrary raw queries directly against your data tables.
→
🚀
Run Migration
Execute compiled data definition schema migrations over the query bridge.
→
Table CRUD
➕
Insert Row
Directly inject structured row data records into an existing schema.
→
📝
Edit Row
Update an existing table row matched by a filter expression.
→
🗄️
Archive Rows
Flip active visibility flags on a specific database item record.
→
🗑️
Delete Row
Hard purge row records out of the storage layer completely.
→
Users & Access
✉️
Invite User
Send an email invite to provision a new authenticated user.
→
✏️
Edit User
Update a user's email, metadata, or confirmation state.
→
🗑️
Delete User
Permanently remove an authenticated user and their identity.
→
🔁
Reset Password
Trigger a password-recovery email for a user account.
→
Storage
📂
Storage Panel
Upload, download, or list objects inside a storage bucket.
→
🪣
Create Bucket
Instantiate a fresh media or binary object storage file container.
→
💥
Empty Bucket
Purge all nested objects and binary layout leaves without dropping the core asset container.
→
Audit Log: All actions are recorded for compliance. View log →
⚡
Provider Action · SUPABASE
SQL Editor
Run arbitrary raw queries directly against your data tables.
✅
Query returned 5 rows
role
took
at et
reason
result
Reasoning & Decision Science:verifier
6ms
19:29:24
error:Error:context_window_budget_insufficient:modelitmounts
FAIL
Reasoning & Decision Science:verifier
6ms
19:24:44
-
FAIL
Reasoning & Decision Science:verifier
5ms
19:08:17
-
FAIL
Reasoning & Decision Science:critic
120003ms
15:50:15
-
FAIL
Reasoning & Decision Science:verifier
4ms
14:06:59
-
FAIL
Close
iTMounts
✨ Concierge
Reset
×
❓ FAQ
✉️ Contact Support
📖 Documentation
I identified optimization opportunities on your URL. Would you like our media studio (COS Core v1) to automatically create a video campaign to boost your conversion for only 10 credits?

Free Website Optimizer report for https://itmounts.com/: score 80, findings 3, high 0. Top opportunities: many_scripts, missing_csp, missing_nosniff.
🛰️ Marketplace
🚀 SaaS cockpit
📊 Executive insights
💬 Support
📎

Ask anything...

Send
Product
Home
Pricing
Free Repo Check
Free Website Optimizer
Dashboard
Documentation
FAQ
Podcasters
Build
Build a website
Collect reviews
Generate native audio
Create videos
Company
About
Partners
Privacy
Contact
Native experiences available in
🇺🇸
English
🇧🇷
Português
🇪🇸
Español
🇵🇱
Polski
🇷🇺
Русский
© 2026 iTMounts
AI software that works for you
// saas/lib/ai/cos/cosFirstAnswerEnterprise.ts — PART 2 of 2 (paste directly below PART 1 in the same file)
function emptyRetrieval():RetrievalCounts { return { retrieved:0, relevant:0, selected:0 } }
function stage(counts:RetrievalCounts, injected:boolean, cited=0):EvidenceFunnelStage {
  return { ...counts, injected:injected ? counts.selected : 0, cited }
}

// ONE COS PIPELINE (owner decision 2026-09-26): COS is the brain and Concierge is the mouth. Every
// question — owner, signed-in user, or public visitor — is reasoned by this one pipeline. WHO IS ASKING
// changes what COS may know and say (retrieval scope, knowledge blocks, release rules), never which
// pipeline answers.
export type CosAudience = 'owner' | 'user' | 'public'
export function cosAudience(privileged:boolean):CosAudience {
  if (isPublicDeliveryScope()) return 'public'
  return privileged ? 'owner' : 'user'
}

function contextFallbackBudgetMs():number {
  const value = Number(process.env.COS_CONTEXT_FALLBACK_BUDGET_MS || '2500')
  return Number.isFinite(value) ? Math.max(250, Math.min(15000, value)) : 2500
}

/**
 * Runs a lexical context fallback under its own time budget. The work returns a commit function; it is applied
 * only when the work finishes inside the budget, so a late result never mutates context already sent to the model.
 */
async function boundedContextFallback(stage:string, work:() => Promise<(() => void)|null>):Promise<void> {
  const startedAt = Date.now()
  const budgetMs = contextFallbackBudgetMs()
  let timer:ReturnType<typeof setTimeout>|undefined
  const timedOut = Symbol('context_fallback_budget_exceeded')
  const outcome = await Promise.race([
    work().catch(error => {
      console.warn('cosFirstAnswer: lexical context fallback failed', { stage, error: error instanceof Error ? error.message : String(error) })
      return null
    }),
    new Promise<typeof timedOut>(resolve => { timer = setTimeout(() => resolve(timedOut), budgetMs) }),
  ])
  if (timer !== undefined) clearTimeout(timer)
  if (outcome === timedOut) {
    console.warn('cosFirstAnswer: lexical context fallback exceeded budget; continuing without it', { stage, budgetMs })
    recordCosLatencyStage(`retrieval:${stage}:budget_exceeded`, Date.now() - startedAt)
    return
  }
  recordCosLatencyStage(`retrieval:${stage}`, Date.now() - startedAt)
  if (outcome) outcome()
}

function timedRetrievalStage(stage:string, run:() => Promise<void>):Promise<void> {
  const startedAt = Date.now()
  return run().finally(() => recordCosLatencyStage(`retrieval:${stage}`, Date.now() - startedAt))
}

async function retrieveInternalContext(prompt:string, userId?:string|null, privileged=false, audience:CosAudience = privileged ? 'owner' : 'user'):Promise<InternalContext> {
  // Public audience: company information must never reach Concierge (owner decision 2026-08-26), so
  // the boundary is enforced HERE, before any row can reach a prompt: no Knowledge Graph, no Enterprise
  // Memory, no user memory, and learned corpus limited to externally published source kinds.
  const publicAudience = audience === 'public'
  const systems = ['semantic/exact cache preflight']
  const facts:string[] = []
  const learned:string[] = []
  const enterpriseMemories:string[] = []
  const memories:string[] = []
  const creativeMemories:string[] = []
  const skills:string[] = []
  const skillIds:string[] = []
  const terms = queryTerms(prompt)
  const db = cosServiceDb()
  const funnel = {
    knowledgeGraph:emptyRetrieval(),
    learnedCorpus:emptyRetrieval(),
    enterpriseMemory:emptyRetrieval(),
    userMemory:emptyRetrieval(),
    creativeMemory:emptyRetrieval(),
    cognitiveSkills:emptyRetrieval(),
  }
  let enterpriseMemoryStatus = privileged ? 'organization_not_found' : 'no_authorized_scope'
  let enterpriseMemoryOrganizationId:string|null = null

  // PARALLEL RETRIEVAL (2026-09-27). Production evidence (cos_ai_roi_metrics, owner Polish question 10:31 and
  // 10:53 ET): a semantic-cache HIT took 7.5-9.5s because these five independent sources were read one after
  // another before the cache could be checked. Each stage writes only its own arrays and funnel entry, so they
  // run concurrently; systems are merged in the original order, so output is identical to the sequential form.
  const kgSystems:string[] = [], enterpriseSystems:string[] = [], userSystems:string[] = [], creativeSystems:string[] = [], skillSystems:string[] = []
  const knowledgeStage = timedRetrievalStage('knowledgeStage', async () => {
    if (db) {
      kgSystems.push('Knowledge Graph', 'Continuous Learning Corpus')
      const [semanticResult, semanticLearnedResult] = await Promise.allSettled([
        publicAudience ? Promise.resolve([] as Awaited<ReturnType<typeof semanticKnowledgeFacts>>) : semanticKnowledgeFacts(prompt, db),
        semanticLearnedCorpus(prompt),
      ])

      // BOUNDED LEXICAL FALLBACK (2026-09-27). Production evidence (cos-latency-stage rows, owner Polish question
      // 13:30 ET): retrieval:knowledgeStage took 9,428ms while every other context source finished in <=558ms. The
      // semantic lookups above are already capped at the knowledge-fact budget (1.5s), so the rest of that time was
      // spent in the uncapped lexical fallbacks below (a wide ilike scan, then embedding up to 128 corpus rows).
      // Both fallbacks now run concurrently under their own budget. Each computes into locals and commits only when
      // it finishes in time, so a late result can never mutate a context that was already used.
      const fallbacks:Promise<void>[] = []

      const semanticRows = semanticResult.status === 'fulfilled' ? semanticResult.value : null
      if (publicAudience) {
        // Knowledge Graph facts are internal company records; never retrieved for the public audience.
      } else if (semanticRows !== null) {
        funnel.knowledgeGraph.retrieved = semanticRows.length
        const relevant = semanticRows.filter(row =>
          row.predicate !== 'excluded_from_cos_retrieval' && Number(row.similarityScore || 0) >= knowledgeFactSimilarityThreshold(),
        )
        funnel.knowledgeGraph.relevant = relevant.length
        const selected = relevant.slice(0, 16)
        funnel.knowledgeGraph.selected = selected.length
        for (const row of selected) {
          facts.push(`[KG${facts.length + 1}] ${safeText(row.subject,180)} — ${safeText(row.predicate,120)} — ${safeText(row.object,600)} [confidence ${Number(row.confidence || 0).toFixed(2)}; similarity ${Number(row.similarityScore || 0).toFixed(2)}; source ${safeText(row.source,180)}]`)
        }
      } else if (terms.length) {
        fallbacks.push(boundedContextFallback('kg_lexical', async () => {
          const factFilters = terms.flatMap(term => [`subject.ilike.%${term}%`, `predicate.ilike.%${term}%`, `object.ilike.%${term}%`]).join(',')
          const result = await db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at')
            .or(factFilters).order('confidence', { ascending:false }).order('updated_at', { ascending:false }).order('subject', { ascending:true }).limit(32)
          if (result.error) return null
          const rows = (result.data ?? []).filter(row => row.predicate !== 'excluded_from_cos_retrieval')
          const selected = rows.slice(0, 16)
          return () => {
            funnel.knowledgeGraph.retrieved = rows.length
            funnel.knowledgeGraph.relevant = rows.length
            funnel.knowledgeGraph.selected = selected.length
            for (const row of selected) {
              facts.push(`[KG${facts.length + 1}] ${safeText(row.subject,180)} — ${safeText(row.predicate,120)} — ${safeText(row.object,600)} [confidence ${Number(row.confidence || 0).toFixed(2)}; source ${safeText(row.source,180)}]`)
            }
          }
        }))
      }

      const semanticLearnedAll = semanticLearnedResult.status === 'fulfilled' ? semanticLearnedResult.value : null
      const semanticLearned = semanticLearnedAll !== null && publicAudience ? filterPublicCorpusRows(semanticLearnedAll) : semanticLearnedAll
      if (semanticLearned !== null) {
        funnel.learnedCorpus.retrieved = semanticLearned.length
        const relevant = semanticLearned.filter(row =>
          Number(row.similarity || 0) >= learnedContextSimilarityThreshold() && domainCompatibleContext(prompt, corpusCandidateText(row)),
        )
        funnel.learnedCorpus.relevant = relevant.length
        // Substantive rows take the limited injection slots first; metadata pointers fill leftovers.
        const selected = selectLearnedCorpusRows<(typeof relevant)[number]>(relevant, 6)
        funnel.learnedCorpus.selected = selected.length
        if (semanticLearned.length) kgSystems.push('Continuous Learning semantic retrieval')
        for (const row of selected) {
          const evidenceFacts = Array.isArray(row.facts) ? row.facts.slice(0, 4).map(fact => safeText(fact,300)).join('; ') : ''
          learned.push(`[CL${learned.length + 1}] ${safeText(row.subject,180)}: ${safeText(row.summary,800)}${evidenceFacts ? ` Facts: ${evidenceFacts}` : ''} [${learnedEvidenceLabel(classifyLearnedEvidence(row))}; confidence ${Number(row.confidence || 0).toFixed(2)}; similarity ${Number(row.similarity || 0).toFixed(2)}; ${safeText(row.source_kind,80)} ${safeText(row.source_uri,280)}]`)
        }
      } else if (terms.length) {
        fallbacks.push(boundedContextFallback('learned_lexical', async () => {
          const learnedResult = await db.from('cos_continuous_learning')
            .select('subject,summary,facts,confidence,source_kind,source_uri,observed_at,fact_extraction_error')
            .or(terms.flatMap(term => [`subject.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(','))
            .order('confidence', { ascending:false }).order('observed_at', { ascending:false }).order('source_uri', { ascending:true }).limit(128)
          if (learnedResult.error) return null
          const unfilteredRows = (learnedResult.data ?? []).filter(row => !rejectedLearningRow(row))
          const rows = publicAudience ? filterPublicCorpusRows(unfilteredRows) : unfilteredRows
          const candidates = rows.map(row => ({ item:row, text:corpusCandidateText(row) }))
          const ranked = await rankContextCandidates(prompt, candidates, { threshold:learnedContextSimilarityThreshold(), limit:candidates.length })
          // Same substance preference on the backfill-window path: candidates wrap the row in `item`.
          const rankedWithSummary = ranked.relevant.map(candidate => ({ ...candidate, summary: String((candidate.item as { summary?: unknown })?.summary ?? '') }))
          const selected = selectLearnedCorpusRows<(typeof rankedWithSummary)[number]>(rankedWithSummary, 6)
          return () => {
            funnel.learnedCorpus.retrieved = rows.length
            funnel.learnedCorpus.relevant = ranked.relevant.length
            funnel.learnedCorpus.selected = selected.length
            if (ranked.mode === 'semantic' && rows.length) kgSystems.push('Continuous Learning semantic relevance')
            for (const candidate of selected) {
              const row = candidate.item
              const evidenceFacts = Array.isArray(row.facts) ? row.facts.slice(0, 4).map((fact:unknown) => safeText(fact,300)).join('; ') : ''
              learned.push(`[CL${learned.length + 1}] ${safeText(row.subject,180)}: ${safeText(row.summary,800)}${evidenceFacts ? ` Facts: ${evidenceFacts}` : ''} [${learnedEvidenceLabel(classifyLearnedEvidence(row))}; confidence ${Number(row.confidence || 0).toFixed(2)}; relevance ${candidate.similarity.toFixed(2)}; ${safeText(row.source_kind,80)} ${safeText(row.source_uri,280)}]`)
            }
          }
        }))
      }
      await Promise.all(fallbacks)
    }
  })
  const enterpriseStage = timedRetrievalStage('enterpriseStage', async () => {
    const scopeResolution = publicAudience
      ? { scope:null, status:'not_available_public_delivery' as const }
      : await resolveCosEnterpriseMemoryScope({ privileged }).catch(() => ({ scope:null, status:'lookup_failed' as const }))
    enterpriseMemoryStatus = scopeResolution.status
    if (scopeResolution.scope) {
      enterpriseMemoryOrganizationId = scopeResolution.scope.organizationId
      enterpriseSystems.push('Organization Enterprise Memory')
      try {
        const context = await retrieveEnterpriseMemoryContext({
          organizationId:scopeResolution.scope.organizationId,
          workspace:scopeResolution.scope.workspace,
          taskTags:terms,
          limit:12,
        })
        const rows = context?.memories ?? []
        const candidates = rows.map(item => ({ item, text:enterpriseCandidateText(item) }))
        const ranked = await rankContextCandidates(prompt, candidates, { threshold:enterpriseMemorySimilarityThreshold(), limit:candidates.length })
        funnel.enterpriseMemory.retrieved = rows.length
        funnel.enterpriseMemory.relevant = ranked.relevant.length
        const selected = ranked.relevant.slice(0, 4)
        funnel.enterpriseMemory.selected = selected.length
        enterpriseMemoryStatus = rows.length ? (selected.length ? 'connected' : 'scoped_no_relevant_memory') : 'scoped_no_memory'
        if (ranked.mode === 'semantic' && rows.length) enterpriseSystems.push('Enterprise Memory semantic relevance')
        for (const candidate of selected) {
          const item = candidate.item
          enterpriseMemories.push(`[OEM${enterpriseMemories.length + 1}] [organization ${scopeResolution.scope.organizationId}; ${safeText(item.kind,60)}${item.workspace ? `; workspace ${safeText(item.workspace,80)}` : ''}] ${safeText(item.payload,850)} [confidence ${Number(item.confidence || 0).toFixed(2)}; retrieval_score ${Number(item.score || 0).toFixed(2)}; relevance ${candidate.similarity.toFixed(2)}]`)
        }
      } catch (error) {
        enterpriseMemoryStatus = 'retrieval_error'
        console.warn('[cos-enterprise-memory] retrieval failed', error)
      }
    }
  })
  const userMemoryStage = timedRetrievalStage('userMemoryStage', async () => {
    if (userId && !publicAudience) {
      userSystems.push('Saved User Memory')
      const loaded = await loadUserMemories(userId).catch(() => [])
      const candidates = loaded.map(item => ({ item, text:`${safeText(item.kind,80)} ${safeText(item.content,1000)}` }))
      const ranked = await rankContextCandidates(prompt, candidates, { threshold:userMemorySimilarityThreshold(), limit:candidates.length })
      funnel.userMemory.retrieved = loaded.length
      funnel.userMemory.relevant = ranked.relevant.length
      const selected = ranked.relevant.slice(0, 4)
      funnel.userMemory.selected = selected.length
      if (ranked.mode === 'semantic' && loaded.length) userSystems.push('User memory semantic relevance')
      for (const candidate of selected) {
        const item = candidate.item
        memories.push(`[EM${memories.length + 1}] [${item.kind}] ${safeText(item.content,500)} [relevance ${candidate.similarity.toFixed(2)}]`)
      }
    }
  })
  const creativeStage = timedRetrievalStage('creativeStage', async () => {
    const creative = await retrieveCreativeMemory(prompt, { privileged, limit:4 }).catch(error => {
      console.warn('[cos-creative-memory] retrieval failed', error)
      return { retrieved:0, relevant:0, selected:[], mode:'unavailable' as const }
    })
    funnel.creativeMemory = {
      retrieved:creative.retrieved,
      relevant:creative.relevant,
      selected:creative.selected.length,
    }
    if (creative.selected.length) {
      creativeSystems.push('Creative Memory')
      creativeMemories.push(...formatCreativeMemoryForReasoner(creative.selected))
    }
  })
  const skillStage = timedRetrievalStage('skillStage', async () => {
    const cognitive = await retrieveValidatedCognitiveSkills(prompt).catch(error => {
      console.warn('[cos-cognitive-skill-context] ranking failed', error)
      return { retrieved:0, relevant:0, selected:0, items:[] }
    })
    funnel.cognitiveSkills = { retrieved:cognitive.retrieved, relevant:cognitive.relevant, selected:cognitive.selected }
    if (cognitive.retrieved > 0) skillSystems.push('Validated Cognitive Skills')
    for (const item of cognitive.items) {
      skills.push(item.line)
      skillIds.push(item.id)
    }
  })
  await Promise.all([knowledgeStage, enterpriseStage, userMemoryStage, creativeStage, skillStage])
  systems.push(...kgSystems, ...enterpriseSystems, ...userSystems, ...creativeSystems, ...skillSystems)

  return {
    systems:[...new Set(systems)], facts, learned, enterpriseMemories, memories, creativeMemories, skills, skillIds,
    enterpriseMemoryStatus, enterpriseMemoryOrganizationId, funnel,
  }
}

function executionFunnel(context:InternalContext, injected:boolean, cited={kg:0,cl:0,em:0}, enterpriseCited=0):COSEvidenceFunnel {
  return {
    knowledgeGraph:stage(context.funnel.knowledgeGraph, injected, cited.kg),
    learnedCorpus:stage(context.funnel.learnedCorpus, injected, cited.cl),
    enterpriseMemory:stage(context.funnel.enterpriseMemory, injected, enterpriseCited),
    userMemory:stage(context.funnel.userMemory, injected, cited.em),
  }
}
function executionSkillFunnel(context:InternalContext, injected:boolean, cited=0):EvidenceFunnelStage {
  return stage(context.funnel.cognitiveSkills, injected, cited)
}
function executionCreativeMemoryFunnel(context:InternalContext, injected:boolean):EvidenceFunnelStage {
  return stage(context.funnel.creativeMemory, injected, 0)
}
function contextFingerprint(context:{facts:string[];learned:string[];enterpriseMemories:string[];memories:string[];creativeMemories:string[];skills:string[]}):string {
  return createHash('sha256').update(JSON.stringify({
    facts:context.facts, learned:context.learned, enterpriseMemories:context.enterpriseMemories, memories:context.memories, creativeMemories:context.creativeMemories, skills:context.skills,
  })).digest('hex')
}
async function readCachedAnswer(key:string):Promise<CachedCosAnswer|null> {
  const db = cosServiceDb()
  if (!db) return null
  try { return (await new SupabaseExactCacheStore(db).get<CachedCosAnswer>(key))?.value ?? null } catch { return null }
}
async function writeCachedAnswer(key:string, value:CachedCosAnswer):Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    const now = Date.now()
    await new SupabaseExactCacheStore(db).set(key, { value, createdAt:now, expiresAt:now + CACHE_TTL_MS })
  } catch {}
}

async function waitForCacheWritesWithinBudget(work: Promise<unknown>, budgetMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      work.then(() => undefined),
      new Promise<void>(resolve => {
        timer = setTimeout(() => {
          console.warn('cosFirstAnswer: cache writes exceeded response budget; response continued while writes remain best-effort', { budgetMs })
          resolve()
        }, budgetMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// COMPANY BACKGROUND (2026-09-27). Production (public Concierge, 19:2x ET): "Compare the trade-offs of scaling
// our RunPod GPUs versus adding DeepInfra capacity" was answered twice with "iTMounts does not provide GPU cloud
// services ... We specialize in physical mounting solutions for displays, cameras, and equipment." The question
// did not name iTMounts, so no identity reached the prompt; the model knew only the name and guessed from it, then
// declined a general question as out of scope. Every prompt now carries this short, public-safe background.
export const COMPANY_BACKGROUND_RULE = `COMPANY BACKGROUND (context only; do not mention it unless the question is about iTMounts): you work for iTMounts (itmounts.com), an AI software platform. ${SIGNALBOOST_COMPANY_IDENTITY_DEFINITION} iTMounts is software only; it is never a hardware, mounting, bracket, or equipment company. Answer general, technical, and business questions fully on their merits, and never decline a question because it falls outside iTMounts' own products.`

/** Company knowledge every audience receives: short background always, full identity + catalog for questions about iTMounts itself (public-safe by construction). */
export function companyKnowledgeBlock(prompt:string):string {
  if (!isSignalBoostSpecificPublicRequest(prompt)) return `${COMPANY_BACKGROUND_RULE}\n\n`
  let catalog:string|null = null
  try { catalog = buildProductCatalogSummary() } catch { catalog = null }
  return [
    `COMPANY IDENTITY (owner-approved; authoritative for this question — this is the company you work for):\n${SIGNALBOOST_COMPANY_IDENTITY_DEFINITION}`,
    catalog ? `PUBLIC PRODUCT CATALOG:\n${catalog}` : '',
  ].filter(Boolean).join('\n\n') + '\n\n'
}

export async function tryCOSFirstAnswer(input:{prompt:string;previousAssistant?:string|null;userId?:string|null;language?:string;privileged?:boolean;disableCache?:boolean}):Promise<COSFirstAnswerResult> {
  const startedAt = Date.now()
  const audience = cosAudience(input.privileged === true)
  const context = await retrieveInternalContext(input.prompt, input.userId, Boolean(input.privileged), audience)
  const userSuppliedPremises = detectUserSuppliedPremises(input.prompt)
  const base = {
    userSuppliedPremises,
    externalAiInvoked:false as const,
    localModelInvoked:false,
    reasonerLabel:null as string|null,
    internalSystemsConsulted:context.systems,
    knowledgeFactsUsed:context.facts.length,
    learnedItemsUsed:context.learned.length,
    enterpriseMemoriesUsed:context.enterpriseMemories.length,
    userMemoriesUsed:context.memories.length,
    cognitiveSkillsUsed:context.skills.length,
    creativeMemoriesUsed:context.creativeMemories.length,
    enterpriseMemoryStatus:context.enterpriseMemoryStatus,
    enterpriseMemoryOrganizationId:context.enterpriseMemoryOrganizationId,
    evidenceFunnel:executionFunnel(context, false),
    cognitiveSkillFunnel:executionSkillFunnel(context, false),
    creativeMemoryFunnel:executionCreativeMemoryFunnel(context, false),
  }
  const contextWindow = [...context.facts, ...context.learned, ...context.enterpriseMemories, ...context.creativeMemories, ...context.skills].join('\n')
  const scopedMemorySelected = context.enterpriseMemories.length > 0 || context.memories.length > 0
  const policyVersion = answerPolicyVersion()
  // Cached answers never cross audiences: an owner answer may hold internal knowledge a visitor must not see.
  const cacheTaskId = cosCacheTaskId(`cos-first-answer:${audience}`, policyVersion)
  const cacheMaxAgeMs = cosCacheMaxAgeMs()
  const knowledge = semanticKnowledgeLayer()

  // A follow-up depends on the preceding answer. Never replay a prompt-only cache entry into that conversation.
  const cacheAllowed = !input.disableCache && !input.previousAssistant?.trim() && semanticCacheAllowedForPrompt(input.prompt)
  if (cacheAllowed && knowledge && !scopedMemorySelected) {
    const nearest = await knowledge.lookupSemanticCache(cacheTaskId, input.prompt, contextWindow)
    if (nearest) {
      const payload = nearest.responsePayload as CachedCosAnswer|null
      const current = cachedAnswerIsCurrent(payload, policyVersion, cacheMaxAgeMs)
      if (payload?.reply && !current.ok) console.warn('cosFirstAnswer: semantic cache entry refused as stale', { reason:current.reason, similarity:nearest.similarityScore })
      if (payload?.reply && current.ok && payload.confidence >= threshold() && normativeAnswerContractViolations(input.prompt, payload.reply).length === 0) {
        recordAvoidedCost('semantic_similarity', input.prompt.length, payload.reply.length, Date.now() - startedAt)
        // Cache replay must be cleaned too: entries written before answer hygiene existed still
        // carry internal markers, and a cached leak is indistinguishable to the reader from a live
        // one (observed 2026-08-23 — an [OEM1] answer cached at 01:28 replayed verbatim).
        return { handled:true, reply:cleanAnswerText(payload.reply), confidence:payload.confidence, provenance:cacheHitProvenance(payload, base, 'semantic_similarity', nearest.similarityScore) }
      }
    }
  }

  const cacheKey = createExactCacheKey({
    taskId:cacheTaskId,
    prompt:input.prompt,
    contextFingerprint:contextFingerprint(context),
    policyVersion,
    knowledgeVersion:null,
  })
  const cached = cacheAllowed ? await readCachedAnswer(cacheKey) : null
  const cachedCurrent = cachedAnswerIsCurrent(cached, policyVersion, cacheMaxAgeMs)
  if (cached?.reply && !cachedCurrent.ok) console.warn('cosFirstAnswer: exact cache entry refused as stale', { reason:cachedCurrent.reason })
  if (cached?.reply && cachedCurrent.ok && cached.confidence >= threshold() && normativeAnswerContractViolations(input.prompt, cached.reply).length === 0) {
    recordAvoidedCost('exact_cache', input.prompt.length, cached.reply.length, Date.now() - startedAt)
    return { handled:true, reply:cleanAnswerText(cached.reply), confidence:cached.confidence, provenance:cacheHitProvenance(cached, base, 'semantic_cache') }
  }

  if (process.env.COS_LOCAL_FIRST_ENABLED === 'false') {
    const reason = 'COS-first answering is disabled by COS_LOCAL_FIRST_ENABLED.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...base } }
  }
  const resolved = resolveCosReasoner()
  if (!resolved.config) {
    const reason = 'reason' in resolved ? resolved.reason : 'Independent COS reasoner is not configured.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...base } }
  }

  const internalContext = [
    context.facts.length ? `KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}` : '',
    context.learned.length ? `CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}` : '',
    context.enterpriseMemories.length ? `ORGANIZATION ENTERPRISE MEMORY:\n${context.enterpriseMemories.join('\n')}` : '',
    context.memories.length ? `SAVED USER MEMORY:\n${context.memories.join('\n')}` : '',
    context.creativeMemories.length ? `CREATIVE MEMORY — VALIDATED APPROACH PATTERNS (HOW TO SOLVE/PRESENT, NEVER FACTUAL EVIDENCE):\n${context.creativeMemories.join('\n')}` : '',
    context.skills.length ? `VALIDATED COGNITIVE PROCEDURAL SKILLS (HOW-TO GUIDANCE, NOT FACTUAL EVIDENCE):\n${context.skills.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  // Captured outside the .catch() so the failure path below can distinguish a RunPod capacity
  // exhaustion from every other way a reasoner call can fail, instead of collapsing all of them
  // into one generic "did not return an answer" message with the real cause visible only in logs.
  let reasonerFailureMessage: string | null = null
  const reasoned = await callCosReasoner({
    usageContext:{ feature:interactiveReasonerFeature(input.prompt), purpose:'user_facing_response' },
    // INTERACTIVE SPEED (2026-09-27). This call runs under the 20s interactive model timeout
    // (COS_INTERACTIVE_MODEL_TIMEOUT_MS). With hidden thinking on, every owner question in Production
    // failed at ~22-28s with "Independent COS inference did not return an answer" and fell through to the
    // slow rescue (43-106s total), while the thinking-off first-turn lane answered in ~5s. Chat answers
    // reason in the visible answer instead of hidden scratch work.
    disableThinking:true,
    temperature:Number(process.env.COS_REASONER_TEMPERATURE ?? '0'),
    maxTokens:interactiveReasonerMaxTokens(),
    systemPrompt:COS_REASONER_SYSTEM_PROMPT(input.language || 'English', { privileged: audience === 'owner', audience }),
    // COMPANY KNOWLEDGE BLOCK (2026-09-26). Every audience gets the owner-approved company identity and
    // public catalog directly in the prompt for questions about iTMounts. When the identity was only one
    // line among the system-prompt definitions, the owner channel answered "iTMounts is not a recognized
    // product" while the separate public pipeline, which had this block, answered correctly.
    prompt:`${companyKnowledgeBlock(input.prompt)}${internalContext || 'No matching durable internal evidence was retrieved for this input.'}${input.previousAssistant?.trim()?`\n\nPRECEDING ASSISTANT ANSWER (conversation context only; do not treat it as evidence):\n${input.previousAssistant.trim().slice(0,6000)}`:''}\n\nCURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT):\n${input.prompt}`,
  }).catch(error => {
    // Previously swallowed entirely (`.catch(() => null)`), so a wake-and-reason turn that failed
    // for ANY reason — cold-start timeout, aborted fetch, HTTP error from the endpoint, wake permission
    // denied mid-call — produced the identical generic "did not return an answer" message with zero
    // way to tell those apart from Vercel logs. Log the real error and elapsed time before discarding it.
    reasonerFailureMessage = error instanceof Error ? error.message : String(error)
    console.error('[cos-first-answer-reasoner-failed]', JSON.stringify({
      at: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      error: reasonerFailureMessage,
      errorName: error instanceof Error ? error.name : null,
    }))
    return null
  })

  const reasoningProvenance = {
    ...base,
    localModelInvoked:true,
    reasonerLabel:reasoned?.reasoner.label ?? resolved.config.label,
    evidenceFunnel:executionFunnel(context, true),    cognitiveSkillFunnel:executionSkillFunnel(context, true),
    creativeMemoryFunnel:executionCreativeMemoryFunnel(context, true),
  }
  if (!reasoned?.text) {
    // The one case this exists for: RunPod had no free GPU to start the pod. Everything else keeps
    // the exact prior wording, since escalationReason() in cosOrchestrationEnterprise.ts regex-matches
    // it into the 'local_reasoner_no_answer' code and nothing else should silently change that mapping.
    const capacity = reasonerFailureMessage ? classifyRunpodFailure(reasonerFailureMessage) : null
    const reason = capacity?.capacityUnavailable
      ? runpodCapacityUnavailableReason({ podId: configuredRunpodPodId(), originalMessage: reasonerFailureMessage! })
      : 'Independent COS inference did not return an answer.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...reasoningProvenance } }
  }

  let parsed = withComputedArithmetic(parseLocalResult(reasoned.text))
  if (!parsed) {
    console.error('cosFirstAnswer: unparseable reasoner output', { characters:reasoned.text.length, raw:reasoned.text })
    const reason = `Independent COS inference returned an unparseable result after ${reasoned.text.length} characters. Raw output started: "${safeText(reasoned.text,240)}"`
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...reasoningProvenance } }
  }
  if (parsed.truncated) {
    const maxTokens = Number(process.env.COS_REASONER_MAX_TOKENS || '6000')
    const reason = `Independent COS inference stopped mid-answer after ${reasoned.text.length} characters, so it never produced a confidence value. ${parsed.answer.length} characters were recoverable. Near the token ceiling, raise COS_REASONER_MAX_TOKENS (currently ${maxTokens}); far short of it, the call was cut off before the model finished.`
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled:false, confidence:0, reason, provenance:{ responseSource:'external_fallback_required', ...reasoningProvenance } }
  }

  // Worker adapters can bypass the raw-reasoner draft-repair seam. Enforce the same executive
  // claim boundary immediately before evidence accounting, caching, and release.
  // Owner-fed documents, transcripts, papers, and other full-content corpus rows must be
  // demonstrably used when retrieval selected them as relevant. Metadata pointers remain optional.
  // Owner correction (2026-08-25): evidence-use is demanded only for knowledge answers. Artifact
  // composition (edits, scripts, drafts, translations of the user's own material) is exempt —
  // forcing [CL#] citations into an edited email rejected perfectly good work and failed the turn
  // closed. See learnedEvidencePolicy.ts for the recorded production failure.
  const requiresRelevantLearnedEvidenceUse = learnedEvidenceUseRequired(input.prompt, context.learned)
  const releaseSignals = (raw: string) => [
    ...executiveDecisionUnsupportedClaims(input.prompt, raw),
    ...normativeAnswerContractViolations(input.prompt, parseLocalResult(raw)?.answer || raw),
    ...(requiresRelevantLearnedEvidenceUse && citedEvidence(parseLocalResult(raw)?.answer || '').cl === 0
      ? ['relevant_learned_evidence_not_used'] : []),
  ]
  const executiveSignals = releaseSignals(reasoned.text)
  if (executiveSignals.length) {
    const repair = await callCosReasoner({
      usageContext:{ feature:interactiveReasonerFeature(input.prompt), purpose:'user_facing_release_repair' },
      temperature: 0,
      maxTokens: interactiveReasonerMaxTokens(),
      systemPrompt: 'EXECUTIVE RELEASE REPAIR. Return ONLY strict JSON: {"answer":"...","confidence":0.0}. Rewrite the draft using only the supplied facts and the supplied internal evidence. Remove unsupported commercial certainty and invented numeric limits, timelines, feature gates, market claims, legal conclusions, forecasts, and unstated security frameworks. For a normative or public-policy question, never begin with Yes or No: give at least 100 words of neutral analysis separating descriptive facts from the strongest material supporting and opposing frameworks, then state what evidence establishes and what remains value-dependent. If selected full-content learned-corpus evidence is supplied, use it materially and cite its [CL#] label in the draft. This applies to owner-fed documents, videos, scientific articles, and other approved learning. Deliver the complete memo; do not mention this repair.',
      prompt: `INTERNAL EVIDENCE:\n${internalContext || 'None'}\n\nORIGINAL QUESTION:\n${input.prompt}\n\nREJECTED DRAFT:\n${parsed.answer}`,
    }).catch(() => null)
    const repairText = repair?.text ?? ''
    const repaired = withComputedArithmetic(repairText ? parseLocalResult(repairText) : null)
    const repairUsable = Boolean(repaired && !repaired.truncated)
    const remainingSignals = repairUsable ? releaseSignals(repairText) : executiveSignals
    const remainingBlocking = blockingReleaseSignals(remainingSignals)
    if (remainingBlocking.length) {
      const reason = `Executive answer release rejected: unsupported claim signals (${remainingBlocking.join(', ')}) remained after local repair.`
      void recordKnowledgeGap(input.prompt, 0, reason)
      return { handled:false, confidence:0, reason, bestEffortReply:undefined, provenance:{ responseSource:'external_fallback_required', ...reasoningProvenance } }
    }
    const remainingAdvisory = advisoryReleaseSignals(remainingSignals)
    if (remainingAdvisory.length) {
      // Released deliberately. The evidence funnel in provenance already reports the shortfall as
      // "N injected -> 0 cited", which is the honest place for a retrieval-quality finding.
      console.warn('cosFirstAnswer: advisory release signals did not block the answer', {
        signals: remainingAdvisory, repairAttempted: true, repairUsable,
      })
    }
    if (repairUsable && repaired) parsed = repaired
  }

  const cited = citedEvidence(parsed.answer)
  const enterpriseCited = organizationMemoryCitationCount(parsed.answer)
  const canonicalSelfKnowledgeUsed = canonicalSelfKnowledgeContribution(parsed.answer)
  const citedProvenance = {
    ...reasoningProvenance,
    knowledgeFactsCited:cited.kg,
    learnedItemsCited:cited.cl,
    enterpriseMemoriesCited:enterpriseCited,
    userMemoriesCited:cited.em,
    cognitiveSkillsCited:cited.sk,
    evidenceFunnel:executionFunnel(context, true, cited, enterpriseCited),
    cognitiveSkillFunnel:executionSkillFunnel(context, true, cited.sk),
    creativeMemoryFunnel:executionCreativeMemoryFunnel(context, true),
    ...(canonicalSelfKnowledgeUsed.used ? { canonicalSelfKnowledgeUsed:{ semanticMemoryDefinition:canonicalSelfKnowledgeUsed.semanticMemoryDefinition, creativeMemoryDefinition:canonicalSelfKnowledgeUsed.creativeMemoryDefinition, enterpriseMemoryDefinition:canonicalSelfKnowledgeUsed.enterpriseMemoryDefinition, semanticCacheDefinition:canonicalSelfKnowledgeUsed.semanticCacheDefinition, companyIdentityDefinition:canonicalSelfKnowledgeUsed.companyIdentityDefinition } } : {}),
  }
  const groundedCount = citedKnowledgeEvidenceCount({ kg:cited.kg, cl:cited.cl, oem:enterpriseCited })
  const ceiling = groundedEvidenceCeiling(groundedCount, input.prompt)
  const specificity = assessAnswerSpecificity(parsed.answer)
  const diagnosticQuestion = promptAppearsDiagnostic(input.prompt)
  const specificityCap = diagnosticQuestion ? specificity.cap : 1
  const confidence = Math.min(parsed.confidence, ceiling, specificityCap)
  if (specificity.applies && specificityCap < 1) {
    console.warn('cosFirstAnswer: answer specificity capped confidence', {
      score:specificity.score, cap:specificityCap, artifacts:specificity.artifacts, density:specificity.density,
      words:specificity.words, claimed:parsed.confidence, final:confidence,
    })
  }
  if (confidence < threshold()) {
    const cappedBySpecificity = specificity.applies && specificityCap < Math.min(parsed.confidence, ceiling)
    const reason = cappedBySpecificity
      ? `COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}. ${specificityReason(specificity)}`
      : `COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`
    void recordKnowledgeGap(input.prompt, confidence, reason)
    return { handled:false, confidence, reason, bestEffortReply:cleanAnswerText(parsed.answer), provenance:{ responseSource:'external_fallback_required', ...citedProvenance } }
  }

  const citedSkillIds = citedIndexedValues(parsed.answer, 'SK', context.skillIds)
  if (citedSkillIds.length) void recordCitedCognitiveSkillReuse(citedSkillIds)

  const storedAnswer:CachedCosAnswer = {
    // User-facing prose only: internal retrieval identifiers ([CL1], [LIVE2]) are prompt
    // scaffolding, and citation accounting above already ran against the raw answer. Leaked ids
    // confused a real user on 2026-08-22; see answerEvidenceIdHygiene.ts.
    reply:cleanAnswerText(parsed.answer),
    confidence,
    reasonerLabel:citedProvenance.reasonerLabel,
    policyVersion,
    storedAt:new Date().toISOString(),
    origin:{
      knowledgeFactsUsed:context.facts.length,
      learnedItemsUsed:context.learned.length,
      enterpriseMemoriesUsed:context.enterpriseMemories.length,
      userMemoriesUsed:context.memories.length,
      cognitiveSkillsUsed:context.skills.length,
      creativeMemoriesUsed:context.creativeMemories.length,
      knowledgeFactsCited:cited.kg,
      learnedItemsCited:cited.cl,
      enterpriseMemoriesCited:enterpriseCited,
      userMemoriesCited:cited.em,
      cognitiveSkillsCited:cited.sk,
      evidenceFunnel:citedProvenance.evidenceFunnel,
      cognitiveSkillFunnel:citedProvenance.cognitiveSkillFunnel,
      creativeMemoryFunnel:citedProvenance.creativeMemoryFunnel,
      ...(canonicalSelfKnowledgeUsed.used ? { canonicalSelfKnowledgeUsed:{ semanticMemoryDefinition:canonicalSelfKnowledgeUsed.semanticMemoryDefinition, creativeMemoryDefinition:canonicalSelfKnowledgeUsed.creativeMemoryDefinition, enterpriseMemoryDefinition:canonicalSelfKnowledgeUsed.enterpriseMemoryDefinition, semanticCacheDefinition:canonicalSelfKnowledgeUsed.semanticCacheDefinition, companyIdentityDefinition:canonicalSelfKnowledgeUsed.companyIdentityDefinition } } : {}),
    },
  }
  const cacheWriteBudgetMs = Number(process.env.COS_CACHE_WRITE_BUDGET_MS ?? '8000')
  if (!input.disableCache) await waitForCacheWritesWithinBudget(
    Promise.allSettled([
      writeCachedAnswer(cacheKey, storedAnswer),
      knowledge ? knowledge.commitToMemory(cacheTaskId, input.prompt, contextWindow, storedAnswer) : Promise.resolve(),
    ]),
    cacheWriteBudgetMs,
  )
  recordAvoidedCost('local_reasoner', input.prompt.length, parsed.answer.length, Date.now() - startedAt)
  void resolveKnowledgeGap(input.prompt)
  // The LIVE return, not only the cached copy: an earlier fix stripped `storedAnswer.reply`
  // (what gets cached) but left this path raw, so fresh answers leaked [OEM1] while replays were
  // clean — backwards. Both paths strip now.
  // Deterministic owner append — see ownerPlatformTechnicalSpec(). Runs after all release gates
  // and after cache storage (self-knowledge prompts are cache-excluded anyway), so the spec is
  // guaranteed in the owner's reply without ever entering shared caches.
  const finalReply = input.privileged === true && isPlatformSelfKnowledgePrompt(input.prompt)
    ? `${cleanAnswerText(parsed.answer)}\n\n${ownerPlatformTechnicalSpec()}`
    : cleanAnswerText(parsed.answer)
  return { handled:true, reply:finalReply, confidence, provenance:{ responseSource:'local_cos_reasoning', ...citedProvenance } }
}

export function formatCosWorkflowStatement(result:COSFirstAnswerResult, language='en'):string {
  const p = result.provenance
  const evidence = `${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.enterpriseMemoriesUsed} enterprise memories, ${p.creativeMemoriesUsed ?? 0} creative patterns, ${p.cognitiveSkillsUsed} validated skills, ${p.userMemoriesUsed} saved memories`
  const source = p.responseSource === 'semantic_cache' ? 'exact-match cache' : p.responseSource === 'semantic_similarity' ? `semantic match, similarity ${(p.similarityScore ?? 0).toFixed(2)}` : p.reasonerLabel
  if (language === 'pt') return result.handled ? `Fluxo: COS consultou primeiro seu conhecimento, corpus, memória empresarial, habilidades validadas e memória do usuário (${evidence}) → respondeu via ${source} com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.` : `Fluxo: COS consultou primeiro sua memória interna (${evidence}) → não atingiu confiança suficiente → IA externa é apenas o último recurso.`
  if (language === 'es') return result.handled ? `Flujo: COS consultó primero su conocimiento, corpus, memoria empresarial, habilidades validadas y memoria del usuario (${evidence}) → respondió vía ${source} con confianza ${result.confidence.toFixed(2)}. No se llamó IA externa.` : `Flujo: COS consultó primero su memoria interna (${evidence}) → no alcanzó confianza suficiente → la IA externa es solo el último recurso.`
  return result.handled ? `Workflow: COS searched its knowledge, learning corpus, organization Enterprise Memory, validated skills and saved user memory first (${evidence}) → answered via ${source} at confidence ${result.confidence.toFixed(2)}. No external AI was called.` : `Workflow: COS searched its internal memory first (${evidence}) → did not reach sufficient confidence → external AI is the last resort.`
}
