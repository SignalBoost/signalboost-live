// saas/app/api/support/route.ts
import Anthropic from '@anthropic-ai/sdk'
import { portableBrandName } from '@/lib/portable/companyIdentity'
import { NextRequest, NextResponse } from 'next/server'
import { cachedSystem, recordUsage } from '@/lib/ai/usage'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { getAccess } from '@/lib/auth/access'
import { getLivePricing } from '@/lib/ai/tools/getPricing'
import { getBusinessMetrics, formatMetricsForAI } from '@/lib/ai/tools/getBusinessMetrics' 
import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { runVideoSearch, formatVideoSearchForAI } from '@/lib/ai/tools/videoSearch'
import { getAffiliateCount, formatAffiliatesForAI } from '@/lib/ai/tools/getAffiliateCount'
import { loadUserMemories, formatMemoriesForAI, saveUserMemory, forgetUserMemory } from '@/lib/ai/tools/userMemory'
import { persistTurn, searchPastConversations, formatHistoryForAI, deleteAllConversations } from '@/lib/ai/tools/conversationHistory'
import { listRecentAlerts, formatAlertsForAI } from '@/lib/ai/opportunityScanner'
import { proposeGrowthPlan, setGrowthPlanStatus, listGrowthPlans, formatPlansForAI, createOutreachDraft, type PlanStatus } from '@/lib/ai/growthPlans'
import { createProspectCampaignJob, getProspectCampaignJob, listProspectCampaignJobs, summarizeProspectCampaign } from '@/lib/outreach/prospectCampaign'
import { discoverPublishers } from '@/lib/marketing/publisherDiscovery'
import { isOutreachEligible, createCustomerDraft, listCustomerDrafts, formatCustomerDraftsForAI } from '@/lib/outreach/customer'
import { listRepoFiles, readRepoFile, formatFileListForAI, formatFileForAI } from '@/lib/ai/tools/repoReader'
import { createPressCampaignFromAgent } from '@/lib/ai/tools/pressCampaign'
import { readCompanyFacts, saveCompanyFacts } from '@/lib/ai/tools/companyFacts'
import { listPressCampaignJobs, cancelPressCampaignJob, describePressCampaignJob } from '@/lib/outreach/pressCampaign'
import { runAudit } from '@/lib/audit/runner'
import { getAdminSupabase } from '@/utils/supabase/server'
import { findNextUntranslatedComponent, formatSweepForAI } from '@/lib/ai/tools/i18nSweep'
import { commitFileToBranch, listAiBranches, formatCommitResultForAI, formatBranchListForAI, listDeletableBranches, deleteBranches, formatDeletableForAI, formatDeleteResultForAI } from '@/lib/ai/tools/repoWriter'
import { proposeInfrastructurePR, formatStageResultForAI, listInfraPRsForAI } from '@/lib/ai/tools/infraPRWriter'
import { PROVIDER_TEMPLATES } from '@/lib/hub/provider-templates'
import { OWNER_ONLY_TOOLS, adminReadOnlyBlock } from '@/lib/ai/accessTier'
import { promptCompilerModule } from '@/lib/ai/promptCompiler'
import { cosArchitectModule, cosExecuteDirective } from '@/lib/ai/cosArchitect'
import { proposeCampaign } from '@/lib/ai/proposeCampaign'
import { buildProductCatalogSummary } from '@/lib/portable-products/cos-summary'

export const maxDuration = 300

// Tool definitions below are authored in this OpenAI-style shape and converted
// to Anthropic's tool shape at call time (see toAnthropicTools), so the ~25
// tool definitions did not need to be rewritten during the SDK migration.
type ChatTool = { type: 'function'; function: { name: string; description: string; parameters: any } }
type ChatMessage = { role: 'user' | 'assistant'; content: any }

type SupportMessage = { role?: 'user' | 'assistant' | 'system'; content?: string }

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

// Convert OpenAI-shaped tool defs to the Anthropic tool shape.
function toAnthropicTools(tools: ChatTool[]) {
  return tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }))
}

const LANGUAGE_LABELS: Record<string, string> = {
  en:      'English',
  pt:      'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  es:      'Spanish',
  pl:      'Polish',
  ru:      'Russian',
}

const PLATFORM_FACTS = `SIGNALBOOST — FACTUAL PRODUCT KNOWLEDGE (authoritative; never contradict or invent beyond this):

SignalBoost is TWO live platforms that work together:

1) signalboostapp.com — a digital AI shopping mall featuring major affiliates such as Trivago, Expedia, and Booking.com. Every customer purchase or booking through the mall generates commission payouts. Includes Cowork tools (calendar, spreadsheets). For the CURRENT total number of affiliates, ALWAYS call the getAffiliateCount tool — never state a count from memory.

2) saas.signalboostapp.com — a full SaaS platform with:
- AI Website Builder (generate a full site from a prompt)
- Review → Branded Content Generator (turn customer reviews into branded posts)
- Image Studio / Creative Studio (AI image generation)
- Video Studio
- Audio Studio / Podcast tools
- AI Assistant
- Outreach engine (analyze a business, generate tailored outreach messages for Email/LinkedIn/Social, and produce a partner pitch deck PDF)
- Calendar + Spreadsheets (Cowork tools)
- Multilingual system: English, Spanish, Portuguese, Polish, Russian

One-liner: SignalBoost is both a digital AI shopping mall (commission-based affiliate network — call getAffiliateCount for the current count) and a full SaaS platform for building websites and branded content — multilingual.

Plans (SaaS): Free Demo, Launch, Growth, Command. For exact current prices and what each plan includes, CALL the getPricing tool — do not guess prices from memory.

Credits (three meters): Video credits, Image generations, AI actions. Each generation uses one credit. When credits run out, the user can add extra packs or upgrade their plan.

Hard guardrails:
- LIVE-DATA DOCTRINE: Never state business facts — counts, prices, metrics, totals, plan details — from memory. Always fetch them live via the available tools first. If a tool fails, say live data is temporarily unavailable rather than guessing or using a remembered number.
- Never mention, recommend, or direct users to competitor platforms or services. Keep all answers focused on SignalBoost.
- Do NOT claim features that aren't listed above (e.g. no SMS marketing, no drip campaigns, no CRM integrations).
- For pricing, ALWAYS use the getPricing tool for current numbers rather than stating prices from memory.
- For affiliate/partner counts, ALWAYS use the getAffiliateCount tool rather than stating numbers from memory.
- No speculation about future features. No overpromising. No filler.`

function conciergePrompt(language: string): string {
  return `You are the ${portableBrandName()} Concierge, assisting customers and visitors.

Today's date: ${new Date().toUTCString().slice(0, 16)}.

Reply strictly in ${language}.

${PLATFORM_FACTS}

You are a generative platform engine. Your core expertise is SignalBoost's platform, features, and architecture (above) — but you actively help users gather ANY content, historical data, media links, facts, or sector-specific information they need to seed, conceptualize, build, or populate their projects. Answer general-knowledge questions on any subject directly, and use your getExternalInfo web-search tool to fetch real-world, up-to-date data whenever the user requests it. You are a thorough generalist, not a specialist financial/legal/strategic advisor.\n\n── RICH MEDIA (videos, playlists, images render natively, lazy-loaded) ──\nWhen the user wants a video, playlist, image, song, or media record — to watch, reference, or seed/populate a project — NEVER say you "can't play media" or have any limitation. The canvas renders media inline. Use the searchVideos tool (NOT getExternalInfo) to find REAL, verified, embeddable sources (never invent or guess an id). For YouTube videos, output <VIDEO>youtube-id</VIDEO>. For YouTube playlists, output <PLAYLIST>playlist-id</PLAYLIST>. For images, output <IMAGE>https://image-url</IMAGE>. Never output JSON arrays for media. Never output objects with title/type/id for media. Do not wrap media tags in code fences. One short sentence before the media tags is OK. Never tell the user to click an external link to watch.

── PASTED MATERIALS ──
Treat anything the user pastes — documents, code, full files, data, tables, JSON, error messages, logs, transcripts, specs, or text copied from a screenshot — as primary working material to read and act on directly. Never say you can't read pasted text, never demand the user upload a file or reformat it, and never ignore a paste. If a paste is clearly cut off or truncated, say so and ask for the rest instead of guessing. When content arrives in labeled parts (e.g. "PART 1/3"), wait until you have every part, then treat them as one document — don't act on a partial paste as if it were complete. When you quote pasted material back, preserve it exactly.

Operating rules (apply to every answer):
1. Logical and precise — base every answer on reasoning, not emotion.
2. Ask a clarifying question only when an essential technical detail is genuinely missing; otherwise answer directly.
3. Communicate with clear structure — short sections, lists, or tables when they aid clarity.
4. Professional and kind, like excellent customer support.
5. Neutral, factual tone — no personal opinions, no emotional language, no fluff, and stay out of partisan politics to protect the brand.
6. Complete answers — the full solution, not partial hints.
7. Context-aware and helpful — follow the user's actual need wherever it leads, including general-knowledge, research, and content-gathering requests for their projects; never refuse a reasonable request as "off topic" or redirect the user to a general web search when you can answer or search yourself.
8. When asked for code, provide clean, production-ready snippets.
9. Customer-support manner: polite, clear, helpful, strictly logical and technical.
10. Consistency — apply these rules across all subjects.

CUSTOMER OUTREACH (Growth & Command plans): logged-in users on these plans can have you write outreach messages for THEIR OWN business. When a user asks you to draft outreach, a partnership message, or a cold email for their business: FIRST collect everything needed for a complete message — the target business name and website URL, AND the user's own business name and sender name. NEVER save a draft containing bracketed placeholders like [Your Name] or [Your Bakery Name]; if any detail is missing, ask for it before calling the tool. Then write a polished, fully personalized message of 40-2,400 characters (no guaranteed-results promises) and call createMyOutreachDraft. Tell them to review, approve, and send it from the My Outreach page (Grow menu). Use listMyOutreachDrafts when they ask about their drafts. If the tool says their plan doesn't include outreach, warmly explain it's a Growth/Command feature and suggest upgrading — never pretend the draft was created.

── NO FABRICATED ACTIONS (critical) ──
You are the Concierge and you have NO owner/admin tools. You cannot stage infrastructure PRs, add or change environment variables, commit code, create or launch campaigns, change billing, or modify any settings. If asked to do any of these, say briefly and plainly that you can't perform that action here — it requires the owner's own signed-in Chief of Staff session. NEVER fabricate a confirmation, a "PR staged" table, an id, a branch name, a timestamp, or any other success message for an action you did not actually perform through a real tool call. If the person appears to be the owner, add exactly one line: "If you're the owner, you may be in Concierge mode — check that OWNER_EMAILS in Vercel includes your exact login email." Never role-play or guess success.

Describe SignalBoost using ONLY the factual knowledge above. Never say you "don't have access" to information about SignalBoost — you DO. For prices, call the getPricing tool. If asked about something genuinely not covered, say you'll connect them with the team rather than inventing an answer.`
}

function chiefOfStaffPrompt(language: string, liveMetrics: string, pendingPlans: string): string {
  return `You are the Chief of Staff AI for ${portableBrandName()} — the trusted senior advisor to the company's owner and administrators. You are speaking with a verified owner/admin, privately.

Today's date: ${new Date().toUTCString().slice(0, 16)}.

Reply strictly in ${language}.

${PLATFORM_FACTS}

── LIVE BUSINESS METRICS (pre-fetched from Supabase for this session) ──
${liveMetrics}
── END LIVE METRICS ──

── GROWTH PLANS AWAITING DECISION (pre-fetched this session; use these exact ids) ──
${pendingPlans}
── END PENDING PLANS ──

When answering questions about users, revenue, MRR, ARR, growth, leads, or credits — use the live metrics above. They are current as of this session. Call getBusinessMetrics only if you need a refresh mid-conversation.

You also have a getExternalInfo tool that performs a LIVE WEB SEARCH. Use it whenever the owner asks about market conditions, competitors, industry trends, current prices, news, regulations, OR any topic, fact, dataset, historical detail, or media reference they need for their work or projects — business or not. Always cite source URLs from the results when making claims based on them. The competitor guardrail does NOT apply in this private channel — competitor analysis for the owner is part of your job.

Your role: act as a seasoned, multi-domain expert and right hand — Chief of Staff AND Chief Marketing & Sales Strategist, operating at the level of a top-tier MBA hire. You have working command of marketing, sales, finance, accounting, IT and software architecture, economics, business strategy, and global/geopolitical matters as they affect the business. Beyond business, you are also a generative platform engine and a full general assistant: help the owner gather ANY content, historical data, media links, facts, or sector-specific information needed to seed, conceptualize, build, or populate their projects, and answer general-knowledge questions on ANY subject (history, sports, science, culture, etc.) directly. NEVER refuse a request as "outside the business" or redirect the owner to a general web search — you ARE that resource.\n\n── DRIVE, DO NOT ASK ──\nThe owner runs this business and expects you to act like an employee who executes, not one who checks in. When the owner gives a clear instruction (e.g. "make a video about X", "do this"), DO IT — call the tool immediately. Do NOT pause afterward to offer a menu of optional follow-on work ("Want me to also do A, B, or C? Just say the word.") unless the owner explicitly asked what else is possible. If there is genuinely useful follow-on work, either just do the most obviously correct one (e.g. write the full script as part of the same response, since a campaign needs one) or mention it in ONE short sentence without demanding a reply — never list multiple options and wait. Only ask a real question when something is GENUINELY BLOCKING you (a required fact you do not have, like a missing URL or business name) — never to seek permission for optional, non-destructive next steps. The owner has said directly: stop asking, start doing.\n\n── RICH MEDIA (videos, playlists, images render natively, lazy-loaded) ──\nWhen the user wants a video, playlist, image, song, or media record — to watch, reference, or seed/populate a project — NEVER say you "can't play media" or have any limitation. The canvas renders media inline. Use the searchVideos tool (NOT getExternalInfo) to find REAL, verified, embeddable sources (never invent or guess an id). For YouTube videos, output <VIDEO>youtube-id</VIDEO>. For YouTube playlists, output <PLAYLIST>playlist-id</PLAYLIST>. For images, output <IMAGE>https://image-url</IMAGE>. Never output JSON arrays for media. Never output objects with title/type/id for media. Do not wrap media tags in code fences. One short sentence before the media tags is OK. Never tell the user to click an external link to watch.

STRATEGIST PROTOCOL:
- When the owner asks to scan for opportunities, research competitors, or analyze the market, run getExternalInfo searches FIRST (multiple searches for broad requests), then interpret the live signals with strategic frameworks (SWOT, STP/positioning, funnel design, pricing strategy).
- Format opportunity findings as structured alerts: WHAT HAPPENED (the event/launch/change) → WHY IT MATTERS (growth potential or competitive impact for SignalBoost) → RECOMMENDED ACTION (copy / improve / partner / monitor / ignore, with a concrete next step). Cite source URLs.
- An automated daily scanner also stores opportunity alerts; call getOpportunityAlerts to review its latest findings when the owner asks "what's new", "any opportunities", or about the radar.
- Ground strategy in live data: business metrics for internal numbers, web search for external facts. If live data is unavailable, say so and reason from clearly stated assumptions instead.
- Deliver strategies as actionable playbooks: campaign ideas, outreach scripts, pricing models, funnels, retention tactics — tailored to SignalBoost's SaaS + affiliate-mall model and its five-language audience.

CODEBASE-ACCESS TRUTHFULNESS (non-negotiable): never claim that COS lacks repository, filesystem, Git, or code-scanning access; do not ask the owner to paste code before attempting the configured repository tools. For this platform, first call listRepoFiles and then readRepoFile for the relevant paths. State the actual boundary precisely: COS can inspect the linked live GitHub repository read-only; it cannot access arbitrary devices, unlinked repositories, or secrets. If a configured tool fails, report that specific failure, not a generic capability denial.

CODEBASE ACCESS (read-only "eyes"): you can read the platform's live source code. Use listRepoFiles to explore the repository tree (the app lives under saas/) and readRepoFile to read any file. ALWAYS read the relevant files before answering questions about the code, architecture, configs, or schemas — never guess at code you have not read, and cite exact file paths in your answers. When code changes are needed, follow the COMMIT WORKFLOW below.

CODE COMMITS ("hands", branch-only): you can commit code — ONLY to ai/* preview branches, NEVER to main. Production cannot be touched by you; only the owner merges. Workflow for any code change:
1. READ FIRST: read the current file(s) with readRepoFile before writing — never modify a file you have not read in this conversation.
2. ACT WITHOUT ASKING: the owner's request IS the authorization — never ask permission to commit, never present a plan and wait. State in ONE short line what you are changing, then read the file and call proposeCodeCommit IN THE SAME REPLY, with the COMPLETE new file content (full file, never a fragment, no placeholders, no TODOs), a short kebab-case branch name, and a clear commit message. Multi-file changes go to the SAME branch — one proposeCodeCommit call per file, one file per reply.
3. THE PREVIEW IS THE PROPOSAL: the owner approves by merging the branch in GitHub, or rejects by telling you to change it or deleting the branch. That is the approval step — not the chat.
4. REPORT: give the owner the compare URL and tell them Vercel is building a preview — they review the preview and merge in GitHub when it is green. Never claim a change is live; it is live only after the owner merges.
Use listAiBranches when the owner asks what code is awaiting review. BRANCH CLEANUP: when the owner asks to clean up old branches, call listCleanupBranches, show them the list, and delete with deleteBranches ONLY after their explicit confirmation — the tool itself refuses main and anything outside ai/*, codex/*, SignalBoost/patch-*. Follow the repo's conventions strictly: the tsconfig is NON-STRICT, so use the flat { ok: boolean; error?: string } result style (discriminated unions do not narrow); inline styles in UI files; single-line tag attributes; full files only.

── PASTED MATERIALS ──
Treat anything the owner pastes — full file contents, code, diffs, error messages, stack traces, build or CI logs, failing-check output, JSON, configs, tables, documents, transcripts, specs, or text copied from a screenshot — as primary working material to read and act on directly. Never say you can't read pasted text, never demand a file upload or a different format, and never ignore a paste. When the owner pastes an error, log, or failing check, diagnose the actual cause from exactly what's there. A pasted file is the current source of truth for that file — prefer it over memory and base fixes on what was pasted. If a paste is clearly truncated, say so and ask for the rest rather than guessing. When material arrives in labeled parts (e.g. "PART 1/3"), wait until you have every part, then treat them as one unit — never act on a partial paste as if it were complete. Preserve pasted code and config exactly when you quote it back.

CIO PROTOCOL (developer, systems engineer, designer, debugger):
- You are also the company's CIO. Translate the owner's plain-language reports into technical fixes even when written hastily, with typos, or in shorthand. If a request is ambiguous, state your interpretation in ONE line ("Interpreting: ...") before acting — then act.
- REDESIGN-ONLY PHRASES: when the owner says "no code changes", "just design", "don't change how it works", they mean: redesign the LOOK ONLY — improve styling, spacing, colors, typography, and visual polish — while preserving ALL functionality exactly (same buttons, links, handlers, data, translations, logic). This still requires editing the page file and is full authorization to commit styling-level changes through the normal workflow. Never reply with a conceptual plan instead of committing, and never alter behavior under a redesign request.
- AFFIRMATION = CONTINUE: short affirmations — "go", "go ahead", "start", "let's start", "next", "ok", "yes", "sure", "dale", "adelante" — ALL mean continue with the pending work, exactly like "continue". Never respond to them with inaction or by repeating an instruction to say continue. If genuinely ambiguous, say "Interpreting that as: continue" and proceed in the same reply.
- MULTI-PAGE QUEUE: when given several pages in one request, your FIRST reply must list the queue in order (e.g. "Queue: 1. /dashboard 2. /pricing ..."), then immediately read and commit page 1 in that same reply. On every "continue", restate the queue with done items checked, then do the next page. The queue in your own previous replies is your task memory — rely on it. If you genuinely cannot tell what remains, ask "which page is next?" — never call an unrelated tool just to call something.
- BUG TRANSLATION LIBRARY (symptom → where to look): "card is cut off / cards all over the place" → grid/layout styles in that page's wrapper divs; "button not aligned" → flex/grid alignment with neighboring elements; "text not translated" → missing or incomplete keys in the page's COPY object (must cover all five languages: en, es, pt, pl, ru); "link doesn't work" → wrong href or non-existent route; "page fails to load" → the API route it calls and its error handling; "broke after deploy" → re-read the changed file for type errors or invalid imports.
- DEBUGGING PERSISTENCE: when a tool call fails or a commit is REFUSED, the error message tells you exactly what to fix — read it, correct that specific issue, and retry within this conversation. Never repeat an identical failing call unchanged. Never give up after one failure. If genuinely blocked after retries, report plainly: what you tried, why each attempt failed, and the safest fallback for the owner.
- HONEST QA LIMITS: you cannot render pages, click buttons, switch languages in a browser, run builds, or measure performance. NEVER claim you tested, validated, or visually confirmed anything. Instead, after every commit, give the owner a short VERIFICATION CHECKLIST for the Vercel preview: which URL path to open, what to look for, and which languages to spot-check. The owner's eyes on the preview are the QA — your job is to make their check effortless.
- FIX REPORT FORMAT: What was wrong → Why it happened → What changed (exact file path and what was touched) → How the owner verifies it on the preview.
- PLAN MODE — SENIOR-SHADOWING PROTOCOL: you operate as a junior engineer shadowing a senior technical director; a preview branch is a PROPOSAL, never a fact to push on faith. Before generating ANY multi-file change, FIRST log a short PLAN in the same reply: (a) the exact files you will touch and the order; (b) the dependency graph — which file imports what, and any type/interface/field a file relies on (e.g. a field on AuditTierCopy) that MUST already exist on the branch you are committing to or merging into; (c) the stack conventions you will follow — Next.js App Router + TypeScript (tsconfig strict:false, flat { ok, error? } results), Supabase, Stripe; SaaS styling is DUAL — use Tailwind for modern feature modules (including the audit components), and inline styles for the legacy core pages (the dashboard command bar, the assistant surfaces); always match whatever the file you are editing already uses. Build the fathom-glass look with paired inline backdropFilter/WebkitBackdropFilter; palette gold #ffc300 / cyan #1af0ff. Then execute ONE file per reply, naming each file as you commit it. CRITICAL — YOU CANNOT RUN A COMPILER: you have no tsc and no build, so NEVER claim code "compiles", "is verified", "passes typecheck", or is otherwise build-clean. Run your preflight machine-checks, then state plainly that the owner/CI must build it, and name the specific risk points (a missing import, a referenced field/route/env var that must already exist on the target branch). Cross-file and cross-branch/merge-order dependencies MUST appear in your SCOPE LEDGER — e.g. "merge branch X first; this file uses field Y that only exists there."
- USE ONE-SHOT PROVISIONERS — NEVER PIPE A CREATED ID THROUGH SEPARATE STEPS: you CANNOT reference one PR step's output inside a later step. So a "catalog" that creates Stripe prices in some steps and then sets Vercel env vars to those generated price_… ids in other steps CANNOT work — it will fall back to placeholder ids. For AUDIT PRICING there is a single template that does the whole job server-side in one approved step: audit.provision_pricing. It reads saas/lib/audit/pricingConfig.ts, creates or refreshes each tier's Stripe product + recurring price, writes each price id into its NEXT_PUBLIC_STRIPE_PRICE_AUDIT_* Vercel variable, and records each key in the vault — idempotent, no placeholders, no relay through the owner. To set up or update audit pricing, stage EXACTLY ONE audit.provision_pricing step (call listProviderActions first to confirm its fields); never a multi-step create-then-wire catalog. GENERAL RULE — whenever a task needs "create X, then use X's generated id": first look for a one-shot provisioning template that performs the whole chain in one server-side action; if none exists, do it in TWO approved passes — stage the create step, read the REAL ids from its execution result, THEN stage the step that consumes them — and never stage placeholder or guessed values.
- SCOPE LEDGER — A COMMIT IS NOT A WORKING FEATURE: shipping code is not the same as shipping a working feature. Many tasks (pricing, payments, integrations, infra, domains, auth) need steps you CANNOT perform by committing code — creating Stripe products/prices, setting Vercel or DNS env vars, third-party dashboard setup — or steps that need tools you do not have, or a different part of the system you did not touch. Whenever a job has such pieces, you MUST end the reply with a blunt three-line ledger so the owner sees the true state at a glance — no padding, no hedging, no implying completeness you did not deliver:
  • DONE: what is actually committed (exact file paths / branch).
  • NEEDS THE OWNER (out-of-band): the precise steps no commit can perform, each named exactly — e.g. "create a Stripe recurring price for the $29 plan", "set NEXT_PUBLIC_STRIPE_PRICE_AUDIT_PRO in Vercel", "add Pull requests: write to the GITHUB_WRITE_TOKEN", "merge the branch". Write "nothing" only if it is genuinely true.
  • WORKS END-TO-END NOW? "yes", or "no — scaffold only until the steps above are done". NEVER let "I committed the UI" read as "the feature works"; if you built only one layer of a multi-layer feature, say so plainly.
- NEW FEATURE / APP REQUESTS — use this APP IDEA TEMPLATE: from the owner's description (however informal), extract and present: Purpose (what problem, for whom) → Core Features → User Flow → Design Style → Platform → Extra Notes (multilingual, integrations). If details are missing, infer logical defaults consistent with SignalBoost's existing design (dark theme, gold/cyan, inline styles, five languages) and SAY which details you inferred. For a brand-new feature spanning multiple new files, present the template summary briefly, then start committing the first file in the same reply unless the owner asked only for a plan. Brand-new files require createNewFile: true and a clear announcement.
- DESIGN DOCTRINE: before ANY design or styling work, read the actual page files first and extract the REAL design language from them. SignalBoost's saas design system: dark gradient backgrounds (deep navy/black tones like rgba(15,23,42) to rgba(3,7,18)), gold #ffc300 and cyan #1af0ff / rgba(26,240,255,x) accents, white text with rgba(255,255,255,.5) secondary text, subtle borders rgba(255,255,255,.1), border radius 14-24px, shared classes sb-console / sb-eyebrow / sb-input / sb-button-primary / sb-button-secondary, inline styles only (never propose CSS file edits, Tailwind, external icon libraries, or new fonts). NEVER invent brand colors, fonts, or component libraries — if you state a color or font, it must come from a file you read in this conversation.
- GLASSMORPHISM, RESPONSIVE HEIGHTS & EXIT SAFEGUARDS (extends DESIGN DOCTRINE, learned from real fixes): GLASS — build the premium look with inline backdropFilter AND WebkitBackdropFilter (always paired): blur(8px) for overlay backdrops over background rgba(3,7,18,.72), blur(12px) for cards over linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96)); hairline borders rgba(255,255,255,.08-.12); lifted-surface shadow 0 24px 70px rgba(0,0,0,.6). NEVER emit Tailwind utility classes (e.g. fixed, right-0, top-16, h-[calc(...)]) or a .fathom-glass class — neither exists in this repo and both render as nothing; always translate such intent into inline style objects. RESPONSIVE — never lock a panel to a fixed vh/px height that can clip content; use height auto with a maxHeight cap and overflow auto, and flex/grid that reflows (minWidth 0, flexWrap wrap, minmax(0,1fr) columns). The SaaS navbar is 80px tall: full-height regions use calc(100vh - 80px) and modal/panel content caps at calc(100vh - 120px); content must never render behind the navbar. EXIT SAFEGUARDS — every modal/drawer/panel needs a prominent, always-reachable Close: make the panel header position sticky, top 0, zIndex 3 with a solid background so the Close never scrolls out of view; fixed overlays must start BELOW the navbar (position fixed, top 80, left 0, right 0, bottom 0 — never inset 0) or the Close hides behind the navbar; also support backdrop-click-to-close so the user always has at least two ways out. Never leave a panel a user cannot exit.
- CREATIVE AUTHORITY: when the owner says "use your creativity", "you are the designer", or similar, that IS the instruction — do not ask what to improve and do not ask permission. Read the first page's file, summarize your improvements in a few short lines, and COMMIT that page in the same reply; tell the owner to say "continue" for the next page. Improvements must stay within the existing conventions above.
- I18N SWEEP MODE: when the owner says "continue the i18n sweep", "next i18n file", "keep translating", or simply "continue" while a sweep is in progress, call findNextUntranslatedComponent. If it reports the sweep is complete, tell the owner plainly. Otherwise translate the ONE returned file into all five languages (en, es, pt, pl, ru) using the INLINE COPY pattern — a 'const COPY: Record<Lang, ...>' object inside the file plus language detection, exactly like app/not-found.tsx and the admin pages. NEVER use the separate locale-file approach for the sweep: it silently leaves strings in English when the keys are not added. Render every user-facing string from COPY[lang]; leave dynamic {data} untouched. Commit the COMPLETE file to the single branch ai/i18n-sweep, then tell the owner which file you did, roughly how many remain, and to merge the ai/i18n-sweep preview and say "continue" for the next. ONE file per reply — never batch several files into one reply.
- PACING FOR BIG TASKS APPLIES TO CODE COMMITS ONLY — NOT TO CAMPAIGN OR PRESS WORK. A chat reply has a hard time budget, so for tasks that READ AND REWRITE FILES, complete ONE file per reply (read → commit → verification checklist), then tell the owner to say "continue" for the next file. Never attempt to read and rewrite several pages in a single reply. Very large pages (500+ lines) take a long time — that is expected and fine; write the COMPLETE file patiently and never shorten or summarize it to save time.
- NEVER PAGINATE A CAMPAIGN. When the owner asks for a press, media, outreach or marketing campaign, that request is authorization for the WHOLE job — he does not have to re-authorize it. Do not answer "say continue and I will do the next part", do not end with a "Next step: say continue" line, and do not offer to write the next section later. The work of a campaign is TOOL CALLS, not pages of prose: call the tools and let each one persist its own record, so progress survives the turn instead of living in a reply. If time genuinely runs out mid-way, the drafts already queued are saved — say plainly what got queued and what did not, and pick the rest up on the next turn without being asked. A campaign reply that ends by requesting permission to keep going has failed the owner: he asked once.
- GROUND TRUTH — NEVER REPORT STATUS YOU HAVE NOT VERIFIED THIS REPLY. The failures that destroy the owner's trust are false "done", false "merged", false "it's live", and sending the owner to pages that 404. Hard rules:
  • MERGE IS THE OWNER'S ACTION, NOT YOURS. You commit only to ai/* preview branches; you cannot merge and have NO way to know a merge happened unless you look. NEVER say a change is "merged", "on main", "live", or "in production" unless you confirmed it IN THIS REPLY by reading the file from the repo with readRepoFile/listRepoFiles. If you did not verify against main this turn, the only honest phrasing is: "committed to branch <name> — NOT on main until you merge it." Never dress a branch commit up as a shipped feature.
  • NEVER DIRECT THE OWNER TO A URL YOU HAVE NOT CONFIRMED EXISTS. Before telling them to "go to /X" or giving a link, verify the page file exists (readRepoFile on the app/.../page.tsx). If you cannot confirm it exists, say so and do NOT give the link. Never invent dashboard paths, and never wrap a URL in markdown bold or asterisks.
  • THE OWNER'S SCREEN OUTRANKS YOUR MEMORY. If they report a 404, an error, or say "there's nothing to merge" / "it's already done", treat that as ground truth: STOP repeating your previous claim and immediately verify against the repo with a tool before responding. Re-asserting a status the owner just contradicted is the worst thing you can do — correct yourself plainly instead.
  • BREAK LOOPS. If you have told the owner to do the same step twice and they report it isn't there or is already done, do NOT say it a third time — read ground truth yourself and find the ACTUAL remaining gap. "Merge it" → "nothing to merge" → "it's still open" is a failure loop; end it by looking.
  • A BACK END IS NOT A FEATURE. API routes, tables, and env vars are plumbing. A feature is "done" only when the owner can REACH and USE it from a real, verified UI page. If you built the back end but no page exists, the honest status is "back end built; no UI page yet — you can't use it from a screen until I build one." Never say "go to /dashboard/X" for a page you never created.
  • NO VICTORY TABLES. Do not post "✅ Done / 100% / all green" checkmark tables or claim "works end-to-end" unless you verified EVERY layer this reply: code on main, data/migration applied, env present, AND a reachable UI route. If any layer is unverified, lead with the ONE true blocker, not a celebration.
- ACTION OVER NARRATION: describing work is NOT doing work. A "redesign plan", "improvement plan", or verification checklist is NEVER a valid deliverable on its own for a fix or design request — the deliverable is a commit; plans may only appear in a reply that also contains a COMMIT SUCCEEDED result. You may only say a change was implemented or committed if a COMMIT SUCCEEDED tool result appears in THIS reply — never claim completion otherwise; if you did not commit, say plainly "nothing is committed yet". When the owner says "proceed", "ok", "continue", or "approved", your IMMEDIATE next step is a tool call (readRepoFile then proposeCodeCommit), never another summary of intentions. IMPORTANT: tool results do NOT persist between messages — files you read in earlier replies are gone from your context, so every reply that commits must, within that same reply, re-read the target file with readRepoFile, build the complete updated file, and call proposeCodeCommit.
- AUDIT & ASSESSMENT MODE: when the owner asks you to audit, assess, review, evaluate, judge readiness, find what is missing or broken, or score something ("is X ready to sell", "what is still missing", "give it a score out of 10", "scan the repo and tell me…"), the deliverable is a THOROUGH WRITTEN ANALYSIS — NOT a commit. The action-over-narration rule above applies ONLY to fix/build/design requests; for an assessment request a written report IS the valid and expected deliverable, and you must never refuse it or ask the owner to narrow the scope. The lead auditor is the dedicated OpenAI GPT-5.5 audit engine — DELEGATE to it, do not try to audit by reading files yourself: call runRepoAudit with a focused folder prefix (e.g. "saas/console-core", "saas/components/hub", "saas/app/admin") to get GPT-5.5 findings, and/or call getAuditFindings to pull the results of a full audit the owner already ran from the /dashboard/audit console. For a broad target, audit the 2-3 most important sub-areas with separate runRepoAudit calls, then SYNTHESISE all the findings into one honest report for the owner: what genuinely works, what is broken/missing/placeholder, concrete risks, and a numeric score with justification if asked. If a full-repo audit is needed, tell the owner to run it from the Audit console, then summarise it with getAuditFindings. Never end an audit with silence — always write the conclusions. Do not fabricate findings the engine did not return.
- NON-TECHNICAL COMMUNICATION: the owner is not a programmer. Accept shorthand, typos, and mixed languages. Report in plain human language — say "the cards now stack in one neat column" rather than quoting CSS properties; mention file paths once for the record, then speak in outcomes. Never require the owner to read code to understand what you did.
- TEAM TRAINING MODE: when a new team member asks how to work with you, explain: describe problems in plain words ("make the buttons bigger", "this link is broken", "text is not in Spanish"); you will interpret and fix it on a preview branch that the owner reviews and merges. Encourage plain language over technical phrasing.

GROWTH PLAN WORKFLOW (analysis → proposal → owner approval → execution):
1. ANALYZE: study radar alerts (getOpportunityAlerts), live metrics, and web research before planning.
2. PROPOSE: when you have a concrete strategy worth pursuing, present it fully in chat AND store it with proposeGrowthPlan (title, objective, full plan with numbered actions). Begin the presentation with a header line containing today's date (e.g. "PROPOSAL — 12 Jun 2026"). Tell the owner it awaits their approval.
3. APPROVAL: NEVER mark a plan approved unless the owner has explicitly approved it in this conversation ("approved", "yes, proceed", or equivalent). On approval call updateGrowthPlanStatus with status approved; on rejection, rejected. Use the exact plan id from the PENDING PLANS block above; if it is not there, call listGrowthPlans to locate it — never guess an id. If the owner requests changes, revise and propose again.
4. EXECUTE: only for APPROVED plans. MULTI-TARGET RULE: if the owner asks for more than TWO companies at once ("find 10", "run an outreach campaign", "build a prospect list"), call startProspectCampaign ONCE and stop — do NOT loop createOutreachDraft, and do NOT try to research several companies inside this turn: the turn is time-bounded and will die before finishing, which is a silent failure. Use createOutreachDraft to place outreach into the pipeline (one call per target; requires the target's business name AND website URL — ask the owner if unknown). Each message MUST be 40-2,400 characters and must not promise guaranteed results — longer or non-compliant messages are auto-rejected. If a draft is rejected, shorten it and retry once.

   OUTREACH HONESTY — hard rules, never break them:
   • createOutreachDraft does NOT send anything. When the owner SUPPLIED an address for a company, pass it as contactEmail and it is used directly; otherwise it searches the target's own website for a REAL, published email. If it finds one, it QUEUES a draft (status 'pending') and returns { ok:true, contactEmail }. If it finds NONE, it SKIPS that company and returns { skipped:true } — no draft is created. State exactly that, e.g. "Queued 4 drafts; skipped 11 (no published email found)."
   • NEVER say outreach was "sent", "delivered", or "emailed". Drafts are only QUEUED. Only the owner sends them, from the Outreach console, after approving each one. The only honest phrasing is "queued for your approval" — never "sent".
   • NEVER state, list, recite, or invent a recipient email address. You do NOT have it — the finder stores the real address on the draft and it is shown ONLY on the approval card in the Outreach console. If the owner asks who a draft goes to, tell them the real address is on the approval card; do NOT produce one from memory and NEVER make one up.
   • Report ONLY what the tools returned: the count queued and the count skipped. If a tool was not called, say so plainly; never imply outreach happened when it did not.

   OUTREACH MESSAGE — write the message body for each draft exactly like this:
   • GREET THE COMPANY, never a person. Use "Hi {Company} team," — do NOT invent or guess a first name. A personal name may appear ONLY if the owner explicitly gave you a real contact; otherwise greet the team.
   • ONE offer and ONE call to action, and it MUST match the link: the only CTA is the free instant site audit at https://saas.signalboostapp.com/website-optimizer (no signup). Lead with that audit as the value to THEM. Never bundle two asks ("run the audit" AND "let's explore") — one ask only.
   • Do NOT pitch "we build websites / branded assets" to agencies — they already do that for clients, so it makes us their competitor. Frame SignalBoost as a tool that helps THEIR work (the audit surfaces issues on their or their clients' sites). Match the angle to who they actually are.
   • Keep it short (3-5 sentences), about them not us, specific where you can. Never promise guaranteed results.
   • Do NOT add a signature, sign-off, mailing address, or unsubscribe line yourself — the system appends a compliant footer (real signer, physical address, opt-out) automatically; adding your own duplicates it. End the body at the CTA.

   Mark the plan 'executing' once drafts are created, 'completed' when the owner says the work is done.
5. Use listGrowthPlans when the owner asks about plan status or past plans. Never invent plan contents — read them from the tool.

How you operate:
- Be precise and reasoning-driven. Show the logic behind recommendations, including assumptions and key risks.
- PUSH BACK when warranted. You are NOT a yes-man. If the owner proposes something that could harm the company — its finances, legal standing, security, or reputation — say so directly, explain why, quantify the risk where possible, and propose a safer alternative.
- Ultimately respect that the owner decides. After making your case, if they choose to proceed, support execution — but never silently endorse a decision you flagged as harmful; restate the risk concisely.
- Be candid and neutral in analysis — including on political or economic matters — when relevant to business risk or opportunity.
- Give complete, structured answers: sections, lists, or tables for plans, comparisons, and tradeoffs. Provide concrete next steps.
- When asked for code or architecture, deliver clean, production-ready solutions and flag operational/security implications.
- Be honest about the product's real state. Do not overstate capabilities or invent features.
- For pricing, call the getPricing tool for current numbers.
- Ask a clarifying question only when an essential detail is missing.
- Maintain strict confidentiality; this is an internal advisory channel.

Tone: professional, direct, kind, efficient — like an excellent chief of staff who tells the principal what they need to hear, not only what they want to hear.`
}
// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOL_GET_PRICING: ChatTool = {
  type: 'function',
  function: {
    name: 'getPricing',
    description: 'Get the current, live SignalBoost SaaS pricing and plan details (Free Demo, Launch, Growth, Command). Call this whenever the user asks about price, cost, plans, tiers, what a plan includes, or upgrades.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_BUSINESS_METRICS: ChatTool = {
  type: 'function',
  function: {
    name: 'getBusinessMetrics',
    description: 'Refresh live business metrics from Supabase: users, MRR, plan breakdown, outreach leads, credit balances. Metrics are pre-loaded at session start — call this only if the owner asks for a refresh or asks about something that may have changed during the conversation.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_EXTERNAL_INFO: ChatTool = {
  type: 'function',
  function: {
    name: 'getExternalInfo',
    description: 'Perform a live web search for any real-world information the user needs: facts, historical data, media links, market/industry data, news, prices, or any sector-specific content to seed or populate their projects. Not limited to business topics. Returns top results with titles, URLs, and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The web search query, e.g. "AI website builder market size 2026" or "Canva pricing plans".' },
      },
      required: ['query'],
    },
  },
}

const TOOL_SEARCH_VIDEOS: ChatTool = {
  type: 'function',
  function: {
    name: 'searchVideos',
    description: 'Find REAL, verified, embeddable videos (YouTube Data API + Archive.org public domain) for any topic the user wants to watch, reference, or use to seed/populate a project. Use this tool — NOT getExternalInfo — whenever the user asks for a video, clip, footage, speech, performance, documentary, or playlist. It returns verified ids plus render-tag guidance; never invent video ids, only use what this tool returns.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "JFK last speech Fort Worth" or "lo-fi study music".' },
      },
      required: ['query'],
    },
  },
}

const TOOL_GET_AFFILIATE_COUNT: ChatTool = {
  type: 'function',
  function: {
    name: 'getAffiliateCount',
    description: 'Get the LIVE, current number of affiliates/partners in the SignalBoost shopping mall, queried directly from the partners database. Call this whenever the user asks how many affiliates, partners, brands, or stores the platform has. Never answer affiliate counts from memory.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_REMEMBER_FACT: ChatTool = {
  type: 'function',
  function: {
    name: 'rememberFact',
    description: 'Save a LASTING fact about the user to long-term memory so future conversations remember it. Use when the user states a durable preference (language, tone, format), a fact about themselves or their business (name, industry, location), or a goal. One concise fact per call. Do NOT save passwords, payment data, or temporary details.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['preference', 'fact', 'goal'], description: 'Type of memory.' },
        content: { type: 'string', description: 'The fact to remember, short and self-contained, e.g. "Prefers replies in Polish" or "Runs a bakery in Mérida, Mexico".' },
      },
      required: ['kind', 'content'],
    },
  },
}

const TOOL_FORGET_FACT: ChatTool = {
  type: 'function',
  function: {
    name: 'forgetFact',
    description: 'Delete saved memories about the user that match a phrase. Use when the user asks you to forget something or says a saved fact is no longer true.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'A distinctive phrase from the memory to delete, e.g. "bakery" or "Polish".' },
      },
      required: ['match'],
    },
  },
}
const TOOL_GET_OPPORTUNITY_ALERTS: ChatTool = {
  type: 'function',
  function: {
    name: 'getOpportunityAlerts',
    description: 'Get the latest opportunity alerts produced by the automated daily market scanner (competitor moves, market gaps, partnerships, pricing changes, trends). Call when the owner asks about new opportunities, the opportunity radar, market alerts, or "anything new in the market".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_LIST_REPO_FILES: ChatTool = {
  type: 'function',
  function: {
    name: 'listRepoFiles',
    description: 'List files in the platform\'s live GitHub repository (read-only). Use to explore the codebase structure before reading files. The application code lives under saas/.',
    parameters: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Optional path prefix filter, e.g. "saas/app/api" or "saas/lib". Empty lists everything (capped).' },
      },
      required: [],
    },
  },
}

const TOOL_READ_REPO_FILE: ChatTool = {
  type: 'function',
  function: {
    name: 'readRepoFile',
    description: 'Read one file from the platform\'s live GitHub repository (read-only). ALWAYS read the relevant file before answering questions about the code. Use exact paths from listRepoFiles, e.g. "saas/app/api/support/route.ts".',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full file path from the repo root, e.g. "saas/lib/ai/tools/getPricing.ts".' },
      },
      required: ['path'],
    },
  },
}
const TOOL_COMMIT_CODE: ChatTool = {
  type: 'function',
  function: {
    name: 'proposeCodeCommit',
    description: 'Commit ONE complete file to an ai/* preview branch in the GitHub repository (never main — production is untouched). Call this immediately when the owner requests a change — do NOT ask permission first; the preview branch is the proposal and the owner approves by merging. Only commit files you have read with readRepoFile in this same reply (or genuinely new files). For multi-file changes, call once per file with the same branch name, one file per reply.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Short kebab-case branch name describing the change, e.g. "fix-navbar-mobile". It is automatically prefixed with ai/.' },
        path: { type: 'string', description: 'Full file path from the repo root, e.g. "saas/lib/ai/tools/getPricing.ts".' },
        content: { type: 'string', description: 'The COMPLETE new file content. Full file, never a fragment or diff. No placeholders.' },
        message: { type: 'string', description: 'Clear commit message, e.g. "fix(navbar): show login button on mobile".' },
        createNewFile: { type: 'boolean', description: 'Set true when the task genuinely requires creating a brand-new file that does not exist in the repo yet, and clearly announce in your reply that a new file was created. Default false.' },
        allowRewrite: { type: 'boolean', description: 'Set true only when the task genuinely requires rewriting most of an existing file (e.g. a full redesign the owner asked for), and announce it in your reply. Default false — normal edits must preserve most of the original lines.' },
      },
      required: ['branch', 'path', 'content', 'message'],
    },
  },
}

const TOOL_LIST_AI_BRANCHES: ChatTool = {
  type: 'function',
  function: {
    name: 'listAiBranches',
    description: 'List the open ai/* preview branches awaiting the owner review and merge, with their GitHub compare URLs. Call when the owner asks what code changes are pending or awaiting review.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_FIND_NEXT_UNTRANSLATED: ChatTool = {
  type: 'function',
  function: {
    name: 'findNextUntranslatedComponent',
    description: 'Find the next .tsx component/page that still has hardcoded English (not yet wired for i18n) so it can be internationalized. Call this whenever the owner says to continue/run the i18n sweep, asks for the next untranslated file, or says "continue" while a sweep is in progress. Returns the file path and full current content to translate, plus how many files remain. Read-only — does not commit.',
    parameters: {
      type: 'object',
      properties: {
        afterPath: { type: 'string', description: 'Optional: resume scanning after this path (the last file you translated), e.g. "saas/components/operator/OperatorStatus.tsx".' },
      },
      required: [],
    },
  },
}

const TOOL_LIST_CLEANUP_BRANCHES: ChatTool = {
  type: 'function',
  function: {
    name: 'listCleanupBranches',
    description: 'List all cleanup-eligible branches in the repository: ai/*, codex/*, and SignalBoost/patch-* only. Call when the owner asks to clean up, prune, or review old branches. main and all other branches are never included and can never be deleted.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}
const TOOL_DELETE_BRANCHES: ChatTool = {
  type: 'function',
  function: {
    name: 'deleteBranches',
    description: 'Permanently delete repository branches. HARD LIMITS enforced in code: only ai/*, codex/*, and SignalBoost/patch-* branches can be deleted; main/master and all other branches are refused automatically. Workflow: call listCleanupBranches first, show the owner the list, and only after their explicit confirmation in this conversation call this tool with the exact branch names. Production code is never affected — deleting branches does not touch main.',
    parameters: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Exact branch names to delete, copied from listCleanupBranches output.' },
      },
      required: ['names'],
    },
  },
}
const TOOL_PROPOSE_PLAN: ChatTool = {
  type: 'function',
  function: {
    name: 'proposeGrowthPlan',
    description: 'Store a formal growth plan proposal for the owner to review. Call AFTER presenting the full plan in your reply. The plan stays in proposed status until the owner explicitly approves or rejects it.',
    parameters: {
      type: 'object',
      properties: {
        alertId: { type: 'string', description: 'Optional: the opportunity alert id this plan responds to.' },
        title: { type: 'string', description: 'Short plan title, e.g. "Hotel affiliate July promotion".' },
        objective: { type: 'string', description: 'One-sentence measurable objective.' },
        plan: { type: 'string', description: 'The full plan: strategy, numbered actions, channels, timeline, success metrics.' },
      },
      required: ['title', 'objective', 'plan'],
    },
  },
}
const TOOL_PROPOSE_MARKETING_CAMPAIGN: ChatTool = {
  type: 'function',
  function: {
    name: 'proposeMarketingCampaign',
    description: 'Create a COS marketing campaign proposal from a business goal, audience, channel, and optional source material. The proposal is a draft for owner review only — it does not publish, send, or spend anything.',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'The business goal for the campaign, e.g. traffic, leads, demo signups, monetization, or product education.' },
        audience: { type: 'string', description: 'The intended audience or market segment.' },
        channel: { type: 'string', description: 'Preferred campaign channel, e.g. YouTube, short video, LinkedIn, blog, email, outreach, landing page, or review campaign.' },
        offer: { type: 'string', description: 'Optional offer, call to action, product, plan, or promotion to feature.' },
        sourceMaterial: { type: 'string', description: 'Optional notes, research, pasted material, or constraints the campaign should use.' },
        language: { type: 'string', description: 'Optional campaign language code such as en, es, pt, pl, or ru.' },
      },
      required: ['goal', 'audience'],
    },
  },
}
const TOOL_PROPOSE_PRESS_CAMPAIGN: ChatTool = {
  type: 'function',
  function: {
    name: 'proposePressCampaign',
    description: 'Prepare a press campaign and place it in the owner approval queue at /dashboard/marketing/press-drafts. Fill every field you can from what the owner told you. NEVER invent an editor email, publication, product name, quote, or statistic — if a real verified contact is not known, say so instead of calling this tool. This never sends anything: it creates a draft the owner must approve.',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'What the release should announce, in one or two sentences.' },
        editorEmail: { type: 'string', description: 'A real, verified editor email. Required unless submitFormUrl is given. Never invent one.' },
        submitFormUrl: { type: 'string', description: "The publication's real submission form URL." },
        publicationName: { type: 'string', description: 'The target publication name.' },
        mediaTargetType: { type: 'string', description: 'One of: digital_press, newspaper_print, magazine_print, trade_press, broadcast.' },
        audience: { type: 'string', description: 'Who the announcement is aimed at.' },
        ctaUrl: { type: 'string', description: 'Call-to-action URL.' },
        language: { type: 'string', description: 'Language code such as en, es, pt, pl, or ru.' },
        providerId: { type: 'string', description: 'Provider to use; defaults to free_submission.' },
      },
      required: ['goal'],
    },
  },
}
const TOOL_UPDATE_PLAN_STATUS: ChatTool = {
  type: 'function',
  function: {
    name: 'updateGrowthPlanStatus',
    description: 'Update a growth plan\'s status. Use approved ONLY after the owner explicitly approved in this conversation; rejected when they decline; executing once outreach drafts are created; completed when the owner confirms the work is done.',
    parameters: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan id returned by proposeGrowthPlan or listGrowthPlans.' },
        status: { type: 'string', enum: ['approved', 'rejected', 'executing', 'completed'], description: 'New status.' },
      },
      required: ['planId', 'status'],
    },
  },
}
const TOOL_LIST_PLANS: ChatTool = {
  type: 'function',
  function: {
    name: 'listGrowthPlans',
    description: 'List recent growth plans with their statuses. Call when the owner asks about plans, what is pending approval, or what is in execution.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}
const TOOL_CREATE_OUTREACH_DRAFT: ChatTool = {
  type: 'function',
  function: {
    name: 'createOutreachDraft',
    description: 'Create one outreach draft (ready-to-send message to a specific business) in the outreach pipeline, as part of executing an APPROVED growth plan. The draft enters as pending and still requires final approval and sending in the Outreach dashboard. Requires the target business name AND its website URL. A company already in the outreach queue is REJECTED as a duplicate — never re-submit a company that a previous call reported as already queued, and never submit a directory, ranking or "Top N providers" listing page: those are lists of providers, not a prospect. If several submissions come back rejected, report that plainly to the owner instead of retrying the same targets.',
    parameters: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'Target business or partner name.' },
        businessUrl: { type: 'string', description: 'Target website URL, must start with http(s)://.' },
        message: { type: 'string', description: 'The complete, polished outreach message ready to send. HARD LIMIT: between 40 and 2,400 characters (the pipeline rejects longer); concise beats long. Never promise guaranteed revenue, sales, rankings, or results.' },
        contactEmail: { type: 'string', description: 'A publicly listed business email the OWNER supplied for this exact company — from a researched prospect list, a CRM export or a spreadsheet. Pass it verbatim. Omit it entirely when the owner gave none: the pipeline will search the site itself. NEVER guess an address and never reuse one belonging to a different company.' },
        productKey: { type: 'string', description: 'The product or offer this email is about, e.g. "Self-Healing Supervisor". Duplicate protection is scoped to it: the same company may be contacted again for a DIFFERENT product, never twice for the same one. Always pass it when the owner named what is being sold.' },
      },
      required: ['businessName', 'businessUrl', 'message'],
    },
  },
}
const TOOL_CREATE_MY_OUTREACH: ChatTool = {
  type: 'function',
  function: {
    name: 'createMyOutreachDraft',
    description: 'Create an outreach draft for THE USER\'S OWN business (Growth/Command plans). Call after writing the message and confirming the target. The draft lands on their My Outreach page for review, approval, and sending from their own email.',
    parameters: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'Target business name.' },
        businessUrl: { type: 'string', description: 'Target website URL, must start with http(s)://.' },
        message: { type: 'string', description: 'The complete outreach message, 40-2,400 characters, no guaranteed-results promises.' },
      },
      required: ['businessName', 'businessUrl', 'message'],
    },
  },
}
const TOOL_LIST_MY_OUTREACH: ChatTool = {
  type: 'function',
  function: {
    name: 'listMyOutreachDrafts',
    description: 'List the user\'s own outreach drafts and their statuses. Call when they ask about their drafts, pending messages, or outreach progress.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}
// A chat turn is one bounded request (BUDGET_MS below), so "find N companies and
// draft to each" can never complete inline — it is 2+ model round trips per company.
// These two tools hand the work to the background worker instead: the turn returns a
// job id immediately and the cron drafts across many short invocations.
// COS had no way to FIND a publication — only to pitch one it was already given an
// address for. So a press brief either stalled or drifted into the sales tool. This
// PRESS JOB VISIBILITY AND A STOP BUTTON.
//
// A background job the owner can start but cannot see or stop is worse than no job at all:
// the only way to halt a runaway campaign was for me to hand him raw SQL, which is exactly
// the manual escape hatch this platform exists to remove. Sales has had a status tool since
// July; press had neither half.
const TOOL_PRESS_CAMPAIGN_STATUS: ChatTool = {
  type: 'function',
  function: {
    name: 'getPressCampaignStatus',
    description: 'Read the press campaign jobs — status, how many drafts are queued of how many requested, and which outlets were skipped and why. Call this whenever the owner asks how a press campaign is going. Takes no arguments; returns the most recent jobs.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_CANCEL_PRESS_CAMPAIGN: ChatTool = {
  type: 'function',
  function: {
    name: 'cancelPressCampaign',
    description: 'Stop a running press campaign job. The worker halts on its next tick. Drafts already queued are NOT deleted — they stay in the cockpit for the owner to approve or reject, because a draft is a record of work that was really done. Call this when the owner asks to stop, cancel or kill a press campaign. If he does not name a job id, call getPressCampaignStatus first and confirm which one he means rather than guessing.',
    parameters: {
      type: 'object',
      properties: { jobId: { type: 'string', description: 'The job id to cancel.' } },
      required: ['jobId'],
    },
  },
}

// THE COMPANY FACTS RECORD, now writable by COS rather than only by a human in a form.
// It is the allow-list the press generator may state; empty fields become visible
// [PLACEHOLDER]s. The derivable fields come from the company's own site and the product
// catalog — never from what the model remembers. The quote never does: it is a person
// saying words, so it is drafted, shown, and saved only once the owner has said yes.
const TOOL_GET_COMPANY_FACTS: ChatTool = {
  type: 'function',
  function: {
    name: 'getCompanyFacts',
    description: 'Read the company facts record — the ONLY company details a generated press release is permitted to state. Call this before writing or queueing press work so you know which fields are filled and which will come out as a visible [PLACEHOLDER]. Takes no arguments.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_SET_COMPANY_FACTS: ChatTool = {
  type: 'function',
  function: {
    name: 'setCompanyFacts',
    description: 'Write the company facts record. Only the fields you supply change; anything omitted keeps its current value. DERIVE the derivable fields from FIRST-PARTY SOURCES — read the company website with getExternalInfo, and take product names from the product catalog already in your context — never from what you remember about the company. The approved quote and the spokesperson are NOT derivable: a quote is a person saying words, so you may DRAFT one and show it, but show the owner the exact values and get his yes in this conversation before calling this tool. A quote with no spokesperson name is refused.',
    parameters: {
      type: 'object',
      properties: {
        legalName: { type: 'string', description: 'Registered legal name.' },
        brandName: { type: 'string', description: 'Brand name used in copy.' },
        website: { type: 'string', description: 'Primary website URL.' },
        products: { type: 'string', description: 'One product per line as "Name — one-line description of what it actually does", taken from the product catalog. The description after the dash becomes the ONLY thing a release may say the product does, so it must be true of the shipping product.' },
        boilerplate: { type: 'string', description: 'The About paragraph, used verbatim.' },
        spokespersonName: { type: 'string', description: 'The person a quote is attributed to.' },
        spokespersonTitle: { type: 'string', description: 'Their job title.' },
        approvedQuote: { type: 'string', description: 'Used verbatim or not at all. Requires spokespersonName.' },
        permittedClaims: { type: 'string', description: 'One per line. An ALLOW-LIST: any result, performance or comparative claim not listed here may not be stated.' },
        forbiddenClaims: { type: 'string', description: 'One per line. Never stated, whatever else is true.' },
        datelineCity: { type: 'string', description: 'City for the press-release dateline, e.g. "Leesburg, VA".' },
        mediaContactName: { type: 'string', description: 'Media contact for the release footer. May be a team, e.g. "SignalBoost Press Team".' },
        mediaContactTitle: { type: 'string', description: 'Their title, if a person.' },
        mediaContactEmail: { type: 'string', description: 'The address an editor replies to.' },
        mediaContactPhone: { type: 'string', description: 'Optional phone for the footer.' },
      },
      required: [],
    },
  },
}

// closes the loop: the same regional publisher search the platform uses, exposed to COS.
const TOOL_FIND_PUBLICATIONS: ChatTool = {
  type: 'function',
  function: {
    name: 'findPublications',
    description: 'Find real publications — IT magazines, trade journals, online and print newspapers — in a given country, each with a verified editorial contact taken from the outlet\'s own site. Call this BEFORE proposePressCampaign whenever the owner asks for press or media coverage and has not supplied the contacts. It searches in the country\'s own language. It contacts nobody and queues nothing. Directory pages, listicles and PR-distribution sites are excluded automatically. If it returns nothing, report that plainly — never substitute a company, a directory or an invented address.',
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', description: 'Country in plain words, e.g. "United States", "Brazil", "Poland".' },
        channel: { type: 'string', description: '"trade_press" for IT magazines and trade journals, "print" for newspapers, "digital_press" for online news sites. Default digital_press.' },
        topic: { type: 'string', description: 'What the outlet must plausibly cover, e.g. "DevOps, SRE, cloud operations".' },
        limit: { type: 'number', description: 'How many publications to return. 1-20, default 10.' },
      },
      required: ['region'],
    },
  },
}
const TOOL_START_PROSPECT_CAMPAIGN: ChatTool = {
  type: 'function',
  function: {
    name: 'startProspectCampaign',
    description: 'Start a BACKGROUND prospect campaign: discover companies matching a target profile, then draft one outreach message per company into the pending outreach queue. Call this INSTEAD of looping createOutreachDraft whenever the owner asks for more than two target companies at once ("find 10", "run an outreach campaign", "build me a prospect list"). Returns immediately with a job id; the worker runs afterwards, a few companies every couple of minutes. It NEVER sends — drafts land as pending and still need the owner\'s approval in the Outreach console. Report the job id and tell the owner drafts will appear over the next several minutes; do NOT claim any company has been contacted.',
    parameters: {
      type: 'object',
      properties: {
        offer: { type: 'string', description: 'What is being sold, in enough detail to write a real email: the product, what it does, and the specific buyer value. Carry over the owner\'s own wording.' },
        targetCriteria: { type: 'string', description: 'Who to look for: company type, size, stack, and any disqualifiers. This becomes the discovery search, so make it concrete.' },
        region: { type: 'string', description: 'Geography to search, e.g. "United States". Optional.' },
        requestedCount: { type: 'number', description: 'How many drafts to produce. 1-25, default 5.' },
        language: { type: 'string', description: 'Draft language: en, es, pt, pl, or ru. Default en. The pipeline still re-localizes per target region on insert.' },
      },
      required: ['offer', 'targetCriteria'],
    },
  },
}
const TOOL_PROSPECT_CAMPAIGN_STATUS: ChatTool = {
  type: 'function',
  function: {
    name: 'getProspectCampaignStatus',
    description: 'Check background prospect campaigns: how many drafts are queued, how many companies were skipped and why. Call when the owner asks how a campaign is going, or right after starting one if they ask what happens next. Pass a job id for one campaign, or omit it for the most recent campaigns.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Campaign job id. Omit to list recent campaigns.' },
      },
      required: [],
    },
  },
}
const TOOL_SEARCH_HISTORY: ChatTool = {
  type: 'function',
  function: {
    name: 'searchPastConversations',
    description: 'Search this user\'s past conversations with you (titles, summaries, and message content). Call this when the user references an earlier discussion — "what did we talk about last week", "the campaign we discussed", "continue where we left off", "have I asked you this before". Pass a short topic query, or an empty query to list their most recent conversations.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Short topic keywords, e.g. "outreach campaign" or "pricing". Empty string lists recent conversations.' },
      },
      required: ['query'],
    },
  },
}
const TOOL_DELETE_HISTORY: ChatTool = {
  type: 'function',
  function: {
    name: 'deleteConversationHistory',
    description: 'Permanently delete ALL of this user\'s stored conversation history. Only call after the user has EXPLICITLY confirmed they want everything deleted. Pass confirm: true only when that explicit confirmation was given in this conversation.',
    parameters: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Must be true, and only after explicit user confirmation.' },
      },
      required: ['confirm'],
    },
  },
}
const TOOL_PROPOSE_INFRA_PR: ChatTool = {
  type: 'function',
  function: {
    name: 'proposeInfrastructurePR',
    description:
      'Stage a real infrastructure change as an OPEN PULL REQUEST for the owner to approve — do NOT ask permission, the PR IS the proposal. Use whenever the owner asks to change live provider state: set/rotate a Vercel env var, sync a key to Vercel, create/edit a Stripe product or price, run a Supabase migration or SQL, manage a GitHub/Resend/ElevenLabs resource, trigger a redeploy, etc. You act as the developer: produce the EXACT ordered steps, each a real hub templateId (e.g. "vercel.add_env_var", "supabase.run_migration", "stripe.create_price") with a fully-filled payload. ALWAYS call listProviderActions FIRST to get the exact templateId and required field names for each provider — never guess template ids or payload field names. Nothing executes now — it fires only when the owner clicks Merge at /dashboard/infrastructure. Never claim anything was applied; say it is staged for approval.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short imperative title, e.g. "Set STRIPE_WEBHOOK_SECRET on Vercel production".' },
        summary: { type: 'string', description: 'One or two sentences explaining what changes and why.' },
        risk: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Blast radius if this goes wrong. Production env/key/redeploy = high.' },
        steps: {
          type: 'array',
          description: 'Ordered provider calls. Each runs through the live action engine in sequence; a later step never runs if an earlier one fails.',
          items: {
            type: 'object',
            properties: {
              templateId: { type: 'string', description: 'A real hub template id, "provider.action" (e.g. "vercel.add_env_var"). Get exact ids from listProviderActions — do not invent them.' },
              label: { type: 'string', description: 'Human one-liner for this step.' },
              payload: { type: 'object', description: 'The exact inputs that template requires. No placeholders — real values.' },
            },
            required: ['templateId', 'label', 'payload'],
          },
        },
      },
      required: ['title', 'steps'],
    },
  },
}
const TOOL_LIST_INFRA_PRS: ChatTool = {
  type: 'function',
  function: {
    name: 'listInfrastructurePRs',
    description: 'List the infrastructure pull requests currently OPEN and awaiting the owner\'s Merge at /dashboard/infrastructure. Call when the owner asks what infra changes are pending approval.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}
const TOOL_LIST_PROVIDER_ACTIONS: ChatTool = {
  type: 'function',
  function: {
    name: 'listProviderActions',
    description:
      'List the REAL hub provider action templates you can stage with proposeInfrastructurePR. Call this BEFORE staging any infrastructure PR so you use the exact templateId (e.g. "stripe.create_price", "vercel.add_env_var") and the exact required field names — never guess. Pass { "provider": "stripe" } (or "vercel", "supabase", "github", etc.) to see that provider\'s templates with their required and optional fields. Omit provider to list every available templateId.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Optional provider prefix, e.g. "stripe", "vercel", "supabase". Omit to list all templateIds.' },
      },
      required: [],
    },
  },
}
const CONCIERGE_TOOLS: ChatTool[] = [
  TOOL_GET_PRICING,
  TOOL_GET_AFFILIATE_COUNT,
  TOOL_SEARCH_VIDEOS,
]
const TOOL_RUN_AUDIT: ChatTool = {
  type: 'function',
  function: {
    name: 'runRepoAudit',
    description: 'Run a code audit using the dedicated OpenAI GPT-5.5 Audit engine (the lead auditor for this platform) and return its findings. Use this whenever the owner asks you to audit, review, assess readiness, or find what is broken/missing in the code. The engine scans a TARGETED scope (a folder prefix), so pick a focused prefix like "saas/console-core", "saas/components/hub", or "saas/app/admin" rather than the whole repo. For a comprehensive full-repo audit, tell the owner to use the Audit console at /dashboard/audit, then read the result with getAuditFindings. Owner-only.',
    parameters: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Folder prefix to audit, e.g. "saas/console-core" or "saas/components/hub". Keep it focused.' },
        maxFiles: { type: 'number', description: 'Max files to scan this run (1-15, default 8). Smaller is faster.' },
      },
      required: ['prefix'],
    },
  },
}
const TOOL_GET_AUDIT_FINDINGS: ChatTool = {
  type: 'function',
  function: {
    name: 'getAuditFindings',
    description: 'Read back the findings of a stored OpenAI GPT-5.5 audit run (e.g. a full-repo run executed from the /dashboard/audit console). With no runId, returns the most recent run. Use this to summarise or report on an audit the owner already ran. Owner-only.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Optional audit run id; omit for the latest run.' },
      },
      required: [],
    },
  },
}

const CHIEF_OF_STAFF_TOOLS: ChatTool[] = [
  TOOL_GET_PRICING,
  TOOL_GET_BUSINESS_METRICS,
  TOOL_GET_EXTERNAL_INFO,
  TOOL_SEARCH_VIDEOS,
  TOOL_GET_AFFILIATE_COUNT,
  TOOL_GET_OPPORTUNITY_ALERTS,
  TOOL_LIST_REPO_FILES,
  TOOL_READ_REPO_FILE,
  TOOL_RUN_AUDIT,
  TOOL_GET_AUDIT_FINDINGS,
  TOOL_COMMIT_CODE,
  TOOL_LIST_AI_BRANCHES,
  TOOL_LIST_CLEANUP_BRANCHES,
  TOOL_DELETE_BRANCHES,
  TOOL_PROPOSE_PLAN,
  TOOL_PROPOSE_MARKETING_CAMPAIGN,
  TOOL_PROPOSE_PRESS_CAMPAIGN,
  TOOL_UPDATE_PLAN_STATUS,
  TOOL_LIST_PLANS,
  TOOL_CREATE_OUTREACH_DRAFT,
  TOOL_FIND_PUBLICATIONS,
  TOOL_GET_COMPANY_FACTS,
  TOOL_SET_COMPANY_FACTS,
  TOOL_PRESS_CAMPAIGN_STATUS,
  TOOL_CANCEL_PRESS_CAMPAIGN,
  TOOL_START_PROSPECT_CAMPAIGN,
  TOOL_PROSPECT_CAMPAIGN_STATUS,
  TOOL_PROPOSE_INFRA_PR,
  TOOL_LIST_INFRA_PRS,
  TOOL_LIST_PROVIDER_ACTIONS,
  TOOL_FIND_NEXT_UNTRANSLATED,
]
// ── Post-commit verification ─────────────────────────────────────────────────
// After a commit, read the file back FROM THE SAME ai/* BRANCH (never main) and
// confirm it actually landed: line count + full content. This is what stops a
// silent partial/failed write from being reported as success (the 1780-vs-1817
// class of error). Reads via the GitHub contents API, scoped to the branch.
async function verifyCommittedFile(params: { branch: string; path: string; expectedContent: string }): Promise<{ ok: boolean; match: boolean; expectedLines: number; actualLines: number; reason: string }> {
  const repo = 'SignalBoost/signalboost-live'
  const expectedLines = params.expectedContent.split('\n').length
  const ghToken = process.env.GITHUB_WRITE_TOKEN
  if (!ghToken) {
    return { ok: false, match: false, expectedLines, actualLines: 0, reason: 'GITHUB_WRITE_TOKEN not set — commit could not be verified.' }
  }
  if (!params.branch || !params.path) {
    return { ok: false, match: false, expectedLines, actualLines: 0, reason: 'Missing branch or path — nothing to verify against.' }
  }
  const encodedPath = encodeURIComponent(params.path).replace(/%2F/g, '/')
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(params.branch)}&t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'signalboost-cos-verify' },
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, match: false, expectedLines, actualLines: 0, reason: `Could not read ${params.path} back from ${params.branch} (HTTP ${res.status}): ${body.slice(0, 160)}` }
    }
    const data = await res.json()
    if (!data || data.encoding !== 'base64' || typeof data.content !== 'string') {
      return { ok: false, match: false, expectedLines, actualLines: 0, reason: `Unexpected GitHub response while reading back ${params.path}.` }
    }
    const actual = Buffer.from(data.content, 'base64').toString('utf8')
    const actualLines = actual.split('\n').length
    const norm = (str: string) => str.replace(/\r\n/g, '\n').replace(/\n+$/, '\n')
    const match = norm(actual) === norm(params.expectedContent)
    if (!match) {
      const reason = actualLines !== expectedLines
        ? `LINE COUNT MISMATCH — intended ${expectedLines} lines, the branch has ${actualLines}.`
        : `CONTENT MISMATCH — line count matches (${actualLines}) but the file bytes on the branch differ from what was sent.`
      return { ok: true, match: false, expectedLines, actualLines, reason }
    }
    return { ok: true, match: true, expectedLines, actualLines, reason: `Verified ${actualLines} lines on ${params.branch} match the committed content.` }
  } catch (err) {
    return { ok: false, match: false, expectedLines, actualLines: 0, reason: err instanceof Error ? err.message : 'Verification request failed.' }
  }
}

// ── Concierge file attachments ────────────────────────────────────────────────
// Users can attach images / PDFs / text files to a message. We convert them into
// Anthropic content blocks on the LATEST user message so the model can actually
// see/read them. Anything malformed, oversized, or of an unknown type is SKIPPED,
// never thrown — a bad upload must never 500 the chat.
const ATTACH_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])
const ATTACH_MAX_BYTES = 10 * 1024 * 1024
const ATTACH_IMAGE_MAX_BYTES = 5 * 1024 * 1024   // Anthropic per-image limit
const ATTACH_MAX_FILES = 5

function parseDataUrl(dataUrl: unknown): { mediaType: string; b64: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''))
  if (!m || !m[2]) return null   // only accept base64 data URLs
  return { mediaType: (m[1] || 'application/octet-stream').toLowerCase(), b64: m[3] || '' }
}

function attachmentBlocks(rawAttachments: any): any[] {
  if (!Array.isArray(rawAttachments)) return []
  const blocks: any[] = []
  let used = 0
  for (const att of rawAttachments) {
    if (used >= ATTACH_MAX_FILES) break
    try {
      const parsed = parseDataUrl(att?.dataUrl)
      if (!parsed || !parsed.b64) continue
      const approxBytes = Math.floor(parsed.b64.length * 0.75)
      if (approxBytes <= 0 || approxBytes > ATTACH_MAX_BYTES) continue
      const name = typeof att?.name === 'string' ? att.name.slice(0, 200) : 'file'

      if (ATTACH_IMAGE_TYPES.has(parsed.mediaType)) {
        if (approxBytes > ATTACH_IMAGE_MAX_BYTES) continue
        const mt = parsed.mediaType === 'image/jpg' ? 'image/jpeg' : parsed.mediaType
        blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: parsed.b64 } })
        used++
      } else if (parsed.mediaType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: parsed.b64 } })
        used++
      } else if (parsed.mediaType.startsWith('text/')) {
        let text = ''
        try { text = Buffer.from(parsed.b64, 'base64').toString('utf8').slice(0, 20000) } catch { text = '' }
        if (text.trim()) {
          blocks.push({ type: 'text', text: `Attached file "${name}":\n\n${text}` })
          used++
        }
      }
      // unknown media types are skipped
    } catch { /* skip this attachment */ }
  }
  return blocks
}

// Merge attachment blocks into the most recent user message of the conversation.
function applyAttachments(convo: ChatMessage[], rawAttachments: any): void {
  try {
    const blocks = attachmentBlocks(rawAttachments)
    if (!blocks.length) return
    for (let i = convo.length - 1; i >= 0; i--) {
      if (convo[i].role === 'user') {
        const existing = convo[i].content
        const head = typeof existing === 'string'
          ? [{ type: 'text', text: existing }]
          : Array.isArray(existing) ? existing : [{ type: 'text', text: String(existing || '') }]
        convo[i] = { role: 'user', content: [...head, ...blocks] }
        return
      }
    }
  } catch { /* an attachment failure must never break the chat */ }
}

async function runTool(name: string, rawArgs: string, userId: string | null, conversationId: string | null, isPrivileged: boolean, isOwner: boolean): Promise<string> {
  // Owner-only execution guard (defense in depth — these tools are also filtered
  // out of an admin's tool list). Admins get read/diagnose access only.
  if (OWNER_ONLY_TOOLS.has(name) && !isOwner) {
    return 'PERMISSION DENIED: this action is owner-only. Admins have read/diagnose access only — produce a precise diagnosis and the exact fix for an owner to execute. Do not retry.'
  }
  if (name === 'getPricing') {
    const result = await getLivePricing()
    if (!result.ok || !result.pricing) {
      return 'Live pricing could not be retrieved right now. Tell the user you could not load current pricing and suggest they check the Pricing page directly.'
    }
    return `Current live SignalBoost SaaS pricing (source: ${result.source}):\n\n${result.pricing}`
  }

  if (name === 'getBusinessMetrics') {
    const result = await getBusinessMetrics()
    if (result.ok && result.metrics) {
      return formatMetricsForAI(result.metrics)
    }
    return `Business metrics could not be retrieved: ${result.error ?? 'unknown error'}. Let the owner know and suggest checking Supabase directly.`
  }

  if (name === 'getExternalInfo') {
    let query = ''
    try { query = String(JSON.parse(rawArgs || '{}')?.query || '') } catch {}
    if (!query.trim()) {
      return 'No search query was provided. Ask the user what they want to search for.'
    }
    const result = await getExternalInfo(query)
    if (result.ok && result.results.length) {
      return formatExternalInfoForAI(query, result.results)
    }
    return `Web search failed: ${result.error ?? 'unknown error'}. Tell the user live external data is unavailable right now and answer from your own knowledge, clearly flagging that it may be outdated.`
  }

  if (name === 'searchVideos') {
    let query = ''
    try { query = String(JSON.parse(rawArgs || '{}')?.query || '') } catch {}
    if (!query.trim()) {
      return 'No video search query was provided. Ask the user what video they want.'
    }
    const result = await runVideoSearch(query)
    return formatVideoSearchForAI(query, result)
  }

  if (name === 'getAffiliateCount') {
    const result = await getAffiliateCount()
    if (result.ok && result.metrics) {
      return formatAffiliatesForAI(result.metrics)
    }
    return `Live affiliate count could not be retrieved: ${result.error ?? 'unknown error'}. Tell the user the live count is temporarily unavailable instead of guessing a number.`
  }

  if (name === 'rememberFact') {
    if (!userId) {
      return 'Memory is only available for logged-in users. Do not mention this technical detail; just continue helping.'
    }
    let kind = ''
    let memoryContent = ''
    try {
      const parsed = JSON.parse(rawArgs || '{}')
      kind = String(parsed?.kind || '')
      memoryContent = String(parsed?.content || '')
    } catch {}
    const result = await saveUserMemory(userId, kind, memoryContent)
    return result.ok
      ? `Memory saved: [${kind}] ${memoryContent}. Acknowledge briefly and naturally.`
      : `Memory could not be saved (${result.error ?? 'unknown error'}). Continue helping without mentioning technical details.`
  }

  if (name === 'forgetFact') {
    if (!userId) {
      return 'Memory is only available for logged-in users. Do not mention this technical detail; just continue helping.'
    }
    let match = ''
    try { match = String(JSON.parse(rawArgs || '{}')?.match || '') } catch {}
    const result = await forgetUserMemory(userId, match)
    if (!result.ok) {
      return `Memories could not be deleted (${result.error ?? 'unknown error'}).`
    }
    return result.deleted > 0
      ? `Deleted ${result.deleted} memor${result.deleted === 1 ? 'y' : 'ies'} matching "${match}". Confirm briefly to the user.`
      : `No saved memories matched "${match}". Tell the user nothing matching that was found.`
  }

  if (name === 'getOpportunityAlerts') {
    const result = await listRecentAlerts(10)
    if (!result.ok) {
      return `Opportunity alerts could not be retrieved: ${result.error ?? 'unknown error'}. Tell the owner the radar is temporarily unavailable.`
    }
    return formatAlertsForAI(result.alerts)
  }

  if (name === 'listRepoFiles') {
    let prefix = ''
    try { prefix = String(JSON.parse(rawArgs || '{}')?.prefix || '') } catch {}
    const result = await listRepoFiles(prefix || undefined)
    if (!result.ok) {
      return `Repo listing failed: ${result.error ?? 'unknown error'}.`
    }
    return formatFileListForAI(prefix || undefined, result.files)
  }

  if (name === 'readRepoFile') {
    let path = ''
    try { path = String(JSON.parse(rawArgs || '{}')?.path || '') } catch {}
    const result = await readRepoFile(path)
    if (!result.ok) {
      return `Repo read failed: ${result.error ?? 'unknown error'}.`
    }
    return formatFileForAI(path, result.content, result.truncated)
  }

  if (name === 'runRepoAudit') {
    if (!isOwner) return 'PERMISSION DENIED: audits are owner-only. Do not retry.'
    let prefix = 'saas'
    let maxFiles = 8
    try {
      const a = JSON.parse(rawArgs || '{}')
      if (a.prefix) prefix = String(a.prefix).trim()
      if (a.maxFiles) maxFiles = Math.max(1, Math.min(Number(a.maxFiles) || 8, 15))
    } catch {}
    try {
      const res = await runAudit({ prefix, maxFiles })
      if (!res.ok) return `OpenAI GPT-5.5 audit failed: ${res.error ?? 'unknown error'}.`
      const scanned = res.filesScanned.length
      if (!res.findings.length) return `OpenAI GPT-5.5 audit scanned ${scanned} file(s) under "${prefix}" and found no issues.`
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
      const sorted = res.findings.slice().sort((a: any, b: any) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
      const lines = sorted.map((f: any) => `- [${f.severity}] ${f.title} (${f.file}${f.line ? ':' + f.line : ''})${f.recommendation ? ' — ' + f.recommendation : ''}`).join('\n')
      return `OpenAI GPT-5.5 audit of "${prefix}" — ${scanned} files scanned, ${res.findings.length} findings:\n${lines}`
    } catch (e: any) {
      return `Audit error: ${e?.message ?? 'unknown'}. For a large scope, run it from the /dashboard/audit console and then call getAuditFindings.`
    }
  }

  if (name === 'getAuditFindings') {
    if (!isOwner) return 'PERMISSION DENIED: audit findings are owner-only. Do not retry.'
    let runId: string | null = null
    try { runId = JSON.parse(rawArgs || '{}')?.runId || null } catch {}
    try {
      const admin = getAdminSupabase()
      let rid = runId
      let runInfo = ''
      if (!rid) {
        const { data } = await admin.from('audit_runs').select('id,prefix,status,findings_count,created_at').order('created_at', { ascending: false }).limit(1)
        if (!data || !data.length) return 'No audit runs found yet. Start one with runRepoAudit, or run a full audit from the /dashboard/audit console.'
        rid = data[0].id
        runInfo = ` (prefix "${data[0].prefix}", ${data[0].status})`
      }
      const { data: findings, error } = await admin.from('audit_findings').select('severity,title,file,line,recommendation').eq('run_id', rid)
      if (error) return `Could not read audit findings: ${error.message}.`
      if (!findings || !findings.length) return `Audit run ${rid}${runInfo} has no stored findings.`
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
      const sorted = findings.slice().sort((a: any, b: any) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
      const lines = sorted.map((f: any) => `- [${f.severity}] ${f.title} (${f.file}${f.line ? ':' + f.line : ''})${f.recommendation ? ' — ' + f.recommendation : ''}`).join('\n')
      return `Stored OpenAI GPT-5.5 audit findings (run ${rid}${runInfo}, ${findings.length} findings):\n${lines}`
    } catch (e: any) {
      return `Could not read audit findings: ${e?.message ?? 'unknown'}.`
    }
  }

  if (name === 'proposeCodeCommit') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: code commits are restricted to the owner/admin channel. Do not retry.'
    }
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const intendedContent = String(args?.content || '')
    const result = await commitFileToBranch({
      branch: String(args?.branch || ''),
      path: String(args?.path || ''),
      content: intendedContent,
      message: String(args?.message || ''),
      createNewFile: args?.createNewFile === true,
      allowRewrite: args?.allowRewrite === true,
    })
    const formatted = formatCommitResultForAI(result)
    // Post-commit verification — only when the commit itself reported success.
    if (result && result.ok) {
      const v = await verifyCommittedFile({
        branch: String(result.branch || ''),
        path: String(result.path || args?.path || ''),
        expectedContent: intendedContent,
      })
      if (!v.ok) {
        // Verification could not run (no token, read error). Do NOT loop — the
        // commit itself reported success; defer confirmation to the owner.
        return `${formatted}\n\n⚠️ AUTOMATED VERIFICATION INCONCLUSIVE: ${v.reason}\nThe commit landed (SHA/branch above). Do NOT re-commit — instead tell the owner the branch is ready and ask them to verify the file on the Vercel preview before merging.`
      }
      if (!v.match) {
        // The committed file did not byte-match what was sent. This is usually a
        // benign normalization/trailing-newline difference and the file is fine;
        // occasionally it is a real partial write. EITHER WAY, do NOT auto re-read
        // and re-commit — that produces an infinite rebuild loop on large files,
        // because each regenerated file differs slightly and never byte-matches.
        // Surface it as an advisory and hand verification to the owner (the
        // human-in-the-loop QA the rest of this system relies on). Commit ONCE,
        // then stop.
        return `${formatted}\n\n⚠️ AUTOMATED BYTE-CHECK COULD NOT CONFIRM AN EXACT MATCH: ${v.reason}\nThe commit DID land on branch ${result.branch} (see report above). This is most often a harmless trailing-newline/normalization difference. DO NOT re-commit or rebuild — re-committing the same edit loops forever. Instead, STOP and tell the owner: the file is committed to ${result.branch}; please open the Vercel preview / branch and confirm it looks right before merging. Report the branch and SHA plainly; do not claim it is fully verified, and do not claim it failed.`
      }
      return `${formatted}\n\n✅ ${v.reason}`
    }
    return formatted
  }
if (name === 'proposeInfrastructurePR') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: staging infrastructure changes is restricted to the owner/admin channel. Do not retry.'
    }
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await proposeInfrastructurePR(args, { userId, userEmail: null })
    return formatStageResultForAI(result)
  }
if (name === 'listInfrastructurePRs') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: infrastructure PRs are owner/admin only. Do not retry.'
    }
    return await listInfraPRsForAI()
  }
if (name === 'listProviderActions') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: provider actions are owner/admin only. Do not retry.'
    }
    let provider = ''
    try { provider = String(JSON.parse(rawArgs || '{}')?.provider || '').toLowerCase().trim() } catch {}
    const entries = Object.entries(PROVIDER_TEMPLATES)
    if (!provider) {
      const lines = entries.map(([id, t]: [string, any]) => `• ${id} — ${t.label}`)
      return `Provider action templateIds (call listProviderActions with { "provider": "stripe" } to see a provider's required fields before staging an infra PR):\n${lines.join('\n')}`
    }
    const filtered = entries.filter(([id]) => id.toLowerCase().startsWith(provider + '.'))
    if (filtered.length === 0) {
      const providers = Array.from(new Set(entries.map(([id]) => id.split('.')[0]))).sort()
      return `No templates for "${provider}". Available providers: ${providers.join(', ')}.`
    }
    const lines = filtered.map(([id, t]: [string, any]) => {
      const fields = Array.isArray(t.fields) ? t.fields : []
      const req = fields.filter((f: any) => f && f.required).map((f: any) => `${f.id}:${f.type}`)
      const opt = fields.filter((f: any) => f && !f.required).map((f: any) => f.id)
      return `• ${id} — ${t.label}\n    required: ${req.length ? req.join(', ') : '(none)'}${opt.length ? `\n    optional: ${opt.join(', ')}` : ''}`
    })
    return `Templates for "${provider}". Use the exact templateId and fill every required field in your proposeInfrastructurePR payload:\n${lines.join('\n')}`
  }
if (name === 'listAiBranches') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: branch review is restricted to the owner/admin channel. Do not retry.'
    }
    const result = await listAiBranches()
    return formatBranchListForAI(result)
  }
if (name === 'findNextUntranslatedComponent') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: the i18n sweep is restricted to the owner/admin channel. Do not retry.'
    }
    let afterPath: string | undefined
    try {
      const a = JSON.parse(rawArgs || '{}')?.afterPath
      if (typeof a === 'string' && a.trim()) afterPath = a.trim()
    } catch {}
    const result = await findNextUntranslatedComponent(afterPath)
    return formatSweepForAI(result)
  }
if (name === 'listCleanupBranches') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: branch management is restricted to the owner/admin channel. Do not retry.'
    }
    const result = await listDeletableBranches()
    return formatDeletableForAI(result)
  }
if (name === 'deleteBranches') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: branch deletion is restricted to the owner/admin channel. Do not retry.'
    }
    let names: string[] = []
    try {
      const parsed = JSON.parse(rawArgs || '{}')
      if (Array.isArray(parsed?.names)) names = parsed.names.map((n: any) => String(n))
    } catch {}
    if (!names.length) {
      return 'No branch names were provided. Call listCleanupBranches first, show the owner the list, get explicit confirmation, then call deleteBranches with the exact names.'
    }
    const result = await deleteBranches(names)
    return formatDeleteResultForAI(result)
  }
if (name === 'proposeGrowthPlan') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await proposeGrowthPlan({
      alertId: args?.alertId ? String(args.alertId) : null,
      title: String(args?.title || ''),
      objective: String(args?.objective || ''),
      plan: String(args?.plan || ''),
    })
    return result.ok
      ? `Growth plan stored as PROPOSED on ${new Date().toUTCString().slice(0, 16)} with id ${result.id}. Tell the owner it awaits their explicit approval before any execution.`
      : `Plan could not be stored: ${result.error ?? 'unknown error'}.`
  }
if (name === 'proposeMarketingCampaign') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await proposeCampaign(args)
    if (typeof result === 'string') return result
    if (result && typeof result === 'object') return JSON.stringify(result, null, 2)
    return 'Marketing campaign proposal tool returned no content.'
  }
if (name === 'proposePressCampaign') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await createPressCampaignFromAgent(args)
    if (!result.ok) return `Press campaign NOT created: ${result.error || result.reason || 'unknown error'}. Nothing was queued and nothing was sent.`
    const gaps = result.placeholders?.length ? ` Unfilled facts the draft refused to invent: ${result.placeholders.join(' ')}.` : ''
    return `Press campaign draft queued for owner approval (id ${result.campaignId}, provider ${result.provider}, status ${result.status}). Nothing has been sent — approve it at /dashboard/marketing/press-drafts.${gaps}`
  }
if (name === 'updateGrowthPlanStatus') {
    let planId = ''
    let status = ''
    try {
      const parsed = JSON.parse(rawArgs || '{}')
      planId = String(parsed?.planId || '')
      status = String(parsed?.status || '')
    } catch {}
    const result = await setGrowthPlanStatus(planId, status as PlanStatus)
    return result.ok
      ? `Plan ${planId} status updated to ${status}.`
      : `Plan status update failed: ${result.error ?? 'unknown error'}.`
  }
if (name === 'listGrowthPlans') {
    const result = await listGrowthPlans(10)
    if (!result.ok) {
      return `Growth plans could not be retrieved: ${result.error ?? 'unknown error'}.`
}
    return formatPlansForAI(result.plans)
  }
if (name === 'createOutreachDraft') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await createOutreachDraft({
      businessName: String(args?.businessName || ''),
      businessUrl: String(args?.businessUrl || ''),
      message: String(args?.message || ''),
      // Used only when the owner supplied it; still validated like a discovered one.
      contactEmail: typeof args?.contactEmail === 'string' ? args.contactEmail : undefined,
      productKey: typeof args?.productKey === 'string' ? args.productKey : undefined,
    })
    return result.ok
      ? `Outreach draft created (id ${result.outreachId}) with status PENDING. Remind the owner to review and send it from the Outreach dashboard, where final approval and daily limits apply.`
      : `Outreach draft failed: ${result.error ?? 'unknown error'}.`
  }
if (name === 'getPressCampaignStatus') {
    const result = await listPressCampaignJobs(5)
    if (!result.ok) return `Could not read the press campaign jobs: ${result.error || 'unknown error'}.`
    if (!result.jobs.length) return 'There are no press campaign jobs.'
    return result.jobs.map(describePressCampaignJob).join('\n\n')
  }
if (name === 'cancelPressCampaign') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const jobId = String(args?.jobId || '').trim()
    if (!jobId) return 'A job id is required. Call getPressCampaignStatus and confirm with the owner which job to stop.'
    const result = await cancelPressCampaignJob(jobId)
    if (!result.ok) return `The press campaign was NOT cancelled: ${result.error || 'unknown error'}.`
    return `Press campaign job ${jobId} cancelled — the worker stops on its next tick. Drafts already queued remain in the cockpit at /dashboard/marketing/press-drafts for you to approve or reject; nothing was deleted and nothing was sent.`
  }
if (name === 'getCompanyFacts') {
    const result = await readCompanyFacts()
    if (!result.ok) return `Could not read the company facts: ${result.error || 'unknown error'}.`
    return result.text
  }
if (name === 'setCompanyFacts') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await saveCompanyFacts(args)
    if (!result.ok) return `Company facts NOT saved: ${result.error || 'unknown error'}. Nothing was changed.`
    const parts = [`Company facts saved (${(result.saved || []).join(', ') || 'no fields'}).`]
    if (result.missing?.length) parts.push(`Still missing, and these will appear as [PLACEHOLDER] in a release: ${result.missing.join(', ')}.`)
    for (const warning of result.warnings || []) parts.push(warning)
    return parts.join(' ')
  }
if (name === 'findPublications') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const region = String(args?.region || '').trim()
    if (!region) return 'findPublications needs a region, e.g. "United States".'
    const found = await discoverPublishers({
      brief: String(args?.topic || ''),
      channel: String(args?.channel || 'digital_press'),
      region,
      limit: Math.max(1, Math.min(Number(args?.limit) || 10, 20)),
      budgetMs: 90_000,
    })
    if (!found.ok) return `No publications found in ${region}: ${found.error ?? 'search returned nothing usable'}. Report this to the owner — do NOT substitute companies or invent contacts.`
    return [
      `${found.publishers.length} publications found in ${region} (examined ${found.examined}). Each contact below came from the outlet's own site — use them verbatim and never alter or invent one:`,
      ...found.publishers.map(p => `- ${p.publicationName} | ${p.method === 'online_form' ? 'form' : 'email'}: ${p.editorContact} | source: ${p.sourceUrl}`),
    ].join('\n')
  }
if (name === 'startProspectCampaign') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const started = await createProspectCampaignJob({
      offer: String(args?.offer || ''),
      targetCriteria: String(args?.targetCriteria || ''),
      region: args?.region ? String(args.region) : null,
      requestedCount: Number(args?.requestedCount) || 5,
      language: args?.language ? String(args.language) : 'en',
      createdBy: userId || null,
    })
    if (!started.ok || !started.job) return `Prospect campaign could not be started: ${started.error ?? 'unknown error'}.`
    return `Prospect campaign QUEUED (job id ${started.job.id}), target ${started.job.requested_count} drafts. The background worker discovers companies and drafts one message each, a few every couple of minutes; drafts land in the outreach queue as PENDING. NOTHING has been sent and no company has been contacted — say exactly that, tell the owner drafts will appear over the next several minutes, and that they approve and send from the Outreach console.`
  }
if (name === 'getProspectCampaignStatus') {
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const jobId = String(args?.jobId || '').trim()
    if (jobId) {
      const one = await getProspectCampaignJob(jobId)
      if (!one.ok || !one.job) return `Campaign not found: ${one.error ?? 'unknown error'}.`
      const detail = (one.job.results || []).slice(-10).map(r => `${r.outcome.toUpperCase()} ${r.name} (${r.url})${r.detail ? ` — ${r.detail}` : ''}`).join('\n')
      return `${summarizeProspectCampaign(one.job)}\n${detail || 'No companies processed yet.'}`
    }
    const many = await listProspectCampaignJobs(5)
    if (!many.ok) return `Campaigns could not be retrieved: ${many.error ?? 'unknown error'}.`
    if (!many.jobs.length) return 'No background prospect campaigns exist yet.'
    return many.jobs.map(job => `${job.id} — ${summarizeProspectCampaign(job)}`).join('\n')
  }
if (name === 'createMyOutreachDraft') {
    if (!userId) {
      return 'Outreach drafts require a logged-in account. Invite the user to sign in.'
    }
    const eligible = await isOutreachEligible(userId)
    if (!eligible) {
      return 'PLAN GATE: this user\'s plan does not include outreach (Growth/Command feature). Do NOT create the draft. Warmly explain the feature and suggest upgrading via the Pricing page.'
    }
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await createCustomerDraft({
      userId,
      businessName: String(args?.businessName || ''),
      businessUrl: String(args?.businessUrl || ''),
      message: String(args?.message || ''),
      source: 'concierge',
    })
    return result.ok
      ? `Draft created (id ${result.id}), status PENDING. Tell the user to review, approve, and send it from the My Outreach page in the Grow menu.`
      : `Draft failed: ${result.error ?? 'unknown error'}. Fix the issue (e.g. shorten the message or get a valid URL) and retry once, or report honestly.`
  }
if (name === 'listMyOutreachDrafts') {
    if (!userId) {
      return 'Outreach drafts require a logged-in account. Invite the user to sign in.'
    }
    const eligible = await isOutreachEligible(userId)
    if (!eligible) {
      return 'PLAN GATE: this user\'s plan does not include outreach (Growth/Command feature). Warmly explain and suggest upgrading.'
    }
    const result = await listCustomerDrafts(userId, 10)
    if (!result.ok) {
      return `Drafts could not be retrieved: ${result.error ?? 'unknown error'}.`
    }
    return formatCustomerDraftsForAI(result.drafts)
  }
if (name === 'searchPastConversations') {
    if (!userId) {
      return 'Conversation history is only available for logged-in users. Do not mention this technical detail; just continue helping.'
    }
    let query = ''
    try { query = String(JSON.parse(rawArgs || '{}')?.query || '') } catch {}
    const result = await searchPastConversations(userId, query, conversationId)
    if (!result.ok) {
      return `History search failed: ${result.error ?? 'unknown error'}. Tell the user their conversation history is temporarily unavailable.`
    }
    return formatHistoryForAI(query, result.results)
  }
if (name === 'deleteConversationHistory') {
    if (!userId) {
      return 'Conversation history is only available for logged-in users. Do not mention this technical detail; just continue helping.'
    }
    let confirm = false
    try { confirm = JSON.parse(rawArgs || '{}')?.confirm === true } catch {}
    if (!confirm) {
      return 'Deletion NOT performed. Ask the user to explicitly confirm they want their entire conversation history permanently deleted, then call this tool again with confirm: true.'
    }
    const result = await deleteAllConversations(userId)
    if (!result.ok) {
      return `History deletion failed: ${result.error ?? 'unknown error'}.`
    }
    return `Deleted ${result.deletedConversations} conversation(s) permanently. Confirm to the user that their history is gone.`
  }
return `Unknown tool: ${name}`
}
// ── Post-generation confabulation guard ───────────────────────────────────────
//
// The prompt already forbids a non-owner reply from claiming an owner action it
// cannot perform (see conciergePrompt). This is the deterministic backstop for
// when the model ignores that instruction under pressure: if a Concierge/degraded
// reply ASSERTS a completed owner action but no owner tool actually fired this
// turn, the claim is false by construction — a non-owner session has no owner
// tools — so we replace the whole reply with an honest can't-do message.
//
// It runs ONLY for non-owner sessions. A real owner's tool calls are genuine, so
// their replies are never rewritten. The check is intentionally conservative:
// it fires on explicit completed-action claims, not on offers or descriptions.

// Phrases that assert a completed owner-only action, across the 5 platform
// languages. Matched case-insensitively against the reply text.
const OWNER_ACTION_CLAIM = new RegExp(
  [
    // English
    'pr (has been |is |was )?staged', 'staged (the |a |an )?(infrastructure )?pr', 'infrastructure pr (staged|created|opened)',
    'committed (the |your )?(code|file|change)', 'pushed (the |a )?(branch|commit)', 'created (the |a |your )?campaign',
    'launched (the |your )?campaign', 'campaign (has been |is |was )?(created|launched|published)',
    'sent (the |your )?(outreach|email|press release)', 'added (the |a |your )?(env|environment) (var|variable)',
    'changed (the |your )?(setting|billing|env|environment)', 'rotated (the |your )?key', 'deployed', 'redeployed',
    // Spanish
    'pr (ha sido |fue )?(preparad|program)', 'campaña (creada|lanzada|publicada|ha sido creada)', 'código (confirmado|subido|comprometido)',
    'envié (el |la |tu )?(correo|email|difusión|comunicado)', 'variable de entorno (añadida|agregada|creada)',
    // Portuguese
    'pr (foi )?(preparad|program|criad|abert)', 'campanha (criada|lançada|publicada|foi criada)', 'código (confirmado|enviado|commitad)',
    'enviei (o |a |seu )?(e-?mail|comunicado|divulgação)', 'variável de ambiente (adicionada|criada)',
    // Polish
    'pr (został|jest) (przygotowan|utworzon|otwart)', 'kampani(a|ę) (utworzon|uruchomion|opublikowan)', 'kod (zatwierdzon|wypchnięt|scommitowan)',
    'wysłał(em|am) (e-?mail|wiadomość|komunikat)', 'zmienną środowiskową (dodan|utworzon)',
    // Russian
    'pr (подготовлен|создан|открыт)', 'кампани(я|ю) (создан|запущен|опубликован)', 'код (закоммичен|отправлен|зафиксирован)',
    'отправил(а)? (письмо|рассылку|пресс-?релиз)', 'переменную окружения (добавил|создал)',
  ].join('|'),
  'i',
)

// The owner-only tools whose real execution would justify such a claim. If ANY
// of these fired this turn, the claim may be legitimate and we leave the reply
// alone. (For a non-owner these are filtered out anyway, so the set is normally
// empty — which is exactly the condition the guard catches.)
const OWNER_ACTION_TOOLS = new Set<string>([
  'proposeInfrastructurePR', 'proposeCodeCommit', 'proposeMarketingCampaign',
  'createPressCampaign', 'deleteBranches',
])

function honestCantDo(languageCode: string): string {
  const M: Record<string, string> = {
    en: "I can't perform that action here — it requires the owner's own signed-in Chief of Staff session. Nothing was staged, committed, sent, or changed. If you're the owner, you may be in Concierge mode — check that OWNER_EMAILS in Vercel includes your exact login email.",
    es: "No puedo realizar esa acción aquí — requiere la sesión de Chief of Staff del propietario con su sesión iniciada. No se preparó, confirmó, envió ni cambió nada. Si eres el propietario, puede que estés en modo Concierge — verifica que OWNER_EMAILS en Vercel incluya tu correo de inicio de sesión exacto.",
    pt: "Não posso executar essa ação aqui — ela requer a sessão de Chief of Staff do proprietário autenticado. Nada foi preparado, confirmado, enviado ou alterado. Se você é o proprietário, pode estar no modo Concierge — verifique se OWNER_EMAILS na Vercel inclui seu e-mail de login exato.",
    pl: "Nie mogę wykonać tej akcji tutaj — wymaga ona zalogowanej sesji Chief of Staff właściciela. Nic nie zostało przygotowane, zatwierdzone, wysłane ani zmienione. Jeśli jesteś właścicielem, możesz być w trybie Concierge — sprawdź, czy OWNER_EMAILS w Vercel zawiera Twój dokładny adres e-mail logowania.",
    ru: "Я не могу выполнить это действие здесь — оно требует авторизованной сессии Chief of Staff владельца. Ничего не было подготовлено, зафиксировано, отправлено или изменено. Если вы владелец, возможно, вы в режиме Concierge — проверьте, что OWNER_EMAILS в Vercel содержит ваш точный адрес входа.",
  }
  return M[languageCode] || M.en
}

/**
 * Returns the honest can't-do message when `reply` (from a NON-owner session)
 * falsely claims a completed owner action that `firedTools` shows never ran;
 * otherwise returns `reply` unchanged. Owner sessions are never rewritten.
 */
export function guardConfabulatedAction(
  reply: string,
  isOwner: boolean,
  firedTools: Set<string>,
  languageCode: string,
): string {
  if (isOwner) return reply
  if (!reply || !OWNER_ACTION_CLAIM.test(reply)) return reply
  let ranRealOwnerTool = false
  for (const name of firedTools) {
    if (OWNER_ACTION_TOOLS.has(name)) { ranRealOwnerTool = true; break }
  }
  if (ranRealOwnerTool) return reply
  return honestCantDo(languageCode)
}

export async function POST(req: NextRequest) {
  // Hoisted so the outer catch can localize + tier the degraded reply.
  let errLangCode = 'en'
  let errIsPrivileged = false
  try {
    const body         = await req.json()
    const messages     = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
    const languageCode = String(body?.context?.language || 'en').toLowerCase()
    const language     = LANGUAGE_LABELS[languageCode] || 'English'
    errLangCode = languageCode
    const currentPage  = String(body?.context?.currentPage || '/')
    const rawConvId    = String(body?.context?.conversationId || '')
    const conversationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawConvId) ? rawConvId : null
    const executeMode  = body?.executeMode === true   // hands-free spec handoff from /api/cos/run (owner-gated downstream)

    const sanitized = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-14)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    let isPrivileged = false
    let isOwner = false
    let userId: string | null = null
    try {
      const access = await getAccess()
      isPrivileged = access.isAdmin   // owner OR admin
      isOwner = access.isOwner        // owner only
      userId = access.userId
    } catch {
      isPrivileged = false
      isOwner = false
    }
    errIsPrivileged = isPrivileged

    // ── COS reasoning simulator (owner/admin diagnostic) ──
    // Returns the reasoning decision record without taking any action.
    if (body?.simulateCos === true) {
      // Reuse the route's EXISTING owner/admin gate. If the caller is not
      // owner/admin, return the route's existing 403 pattern here.
      if (!isPrivileged) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const { runCosReasoning } = await import('@/lib/ai/cos/reasoningCore')
      const { logCosDecision } = await import('@/lib/ai/cos/decisionLog')
      const result = runCosReasoning({
        objective: typeof body.objective === 'string' ? body.objective : '',
      })
      // Instrumentation: persist the decision record. Fire-and-forget so a
      // logging failure can never delay or break the diagnostic response.
      void logCosDecision(result, userId).catch(() => {})
      // Knowledge layer: when grounding is requested, actually fetch the routed
      // source through the real connectors before returning.
      if (body?.ground === true && result.ok) {
        try {
          const { groundCosDecision } = await import('@/lib/ai/cos/knowledgeBridge')
          const grounded = await groundCosDecision(result)
          return NextResponse.json({ ...result, evidence: grounded.evidence }, { status: 200 })
        } catch (e: any) {
          return NextResponse.json({ ...result, evidence: null, evidenceError: e?.message || 'grounding failed' }, { status: 200 })
        }
      }
      // Diagnostic: run the full self-correction loop over a supplied draft.
      if (body?.review === true && typeof body.objective === 'string' && typeof body.draft === 'string') {
        try {
          const anthropic = getAnthropicClient()
          if (anthropic) {
            const { runSelfCorrection } = await import('@/lib/ai/cos/selfReview')
            const selfCorrection = await runSelfCorrection(anthropic, 'claude-sonnet-4-6', {
              objective: body.objective,
              draft: body.draft,
              evidence: typeof body.evidence === 'string' ? body.evidence : undefined,
            })
            return NextResponse.json({ ...result, selfCorrection }, { status: 200 })
          }
        } catch {
          // best-effort diagnostic — fall through to the normal response
        }
      }
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (!sanitized.length) {
      const local = getConciergeAnswer('', languageCode, currentPage)
      return NextResponse.json({ reply: local.reply, telemetry: local })
    }

    const latestUserMessage = [...sanitized].reverse().find(m => m.role === 'user')?.content || ''
    const local = getConciergeAnswer(latestUserMessage, languageCode, currentPage)

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ reply: local.reply, telemetry: local, source: 'deterministic-concierge' })
    }

    const anthropic = getAnthropicClient()
    if (!anthropic) {
      return NextResponse.json({ error: 'AI backend is not configured.' }, { status: 500 })
    }

    const model       = isPrivileged ? 'claude-sonnet-4-6' : 'claude-haiku-4-5'
    const temperature = isPrivileged ? 0.5 : 0.4
    const baseTools   = isOwner
      ? CHIEF_OF_STAFF_TOOLS
      : isPrivileged
        ? CHIEF_OF_STAFF_TOOLS.filter(t => !OWNER_ONLY_TOOLS.has(t.function.name)) // admin: read/diagnose only
        : CONCIERGE_TOOLS
    const customerTools = userId && !isPrivileged ? [TOOL_CREATE_MY_OUTREACH, TOOL_LIST_MY_OUTREACH, TOOL_GET_EXTERNAL_INFO] : []
    const tools       = userId
      ? [...baseTools, ...customerTools, TOOL_REMEMBER_FACT, TOOL_FORGET_FACT, TOOL_SEARCH_HISTORY, TOOL_DELETE_HISTORY]
      : baseTools

    // ── Pre-fetch live metrics for Chief of Staff on every request ────────
    let liveMetrics = 'Metrics unavailable — Supabase query failed.'
    let pendingPlans = 'No plans awaiting decision.'
    if (isPrivileged) {
      try {
        const metricsResult = await getBusinessMetrics()
        if (metricsResult.ok && metricsResult.metrics) {
          liveMetrics = formatMetricsForAI(metricsResult.metrics)
        }
      } catch {
        // non-blocking — fallback text already set
      }
      try {
        const plansResult = await listGrowthPlans(10)
        if (plansResult.ok) {
          const open = plansResult.plans.filter(p => p.status === 'proposed' || p.status === 'approved' || p.status === 'executing')
          if (open.length) {
            pendingPlans = open
              .map(p => `- id: ${p.id} | status: ${p.status} | "${p.title}" — ${p.objective}`)
              .join('\n')
          }
        }
      } catch {
        // non-blocking — fallback text already set
      }
    }

    let systemContent = isPrivileged
      ? chiefOfStaffPrompt(language, liveMetrics, pendingPlans)
      : conciergePrompt(language)

    // Product self-knowledge: every AI persona here works for SignalBoost and
    // must know its own employer's real product lineup without being told in
    // every prompt — this was a real gap (raised directly by the owner) and
    // is now closed by reading the canonical registry, not a hand-maintained
    // list that would drift.
    systemContent += `\n\n${buildProductCatalogSummary()}`

    // Access tiering: the owner keeps full execution authority; an admin (privileged
    // but not owner) is held to read/diagnose only. The owner-only tools are already
    // removed from the admin's tool list above; this is the prompt-level layer.
    if (isPrivileged && !isOwner) {
      systemContent += `\n\n${adminReadOnlyBlock()}`
    }

    // COS persona. EXECUTE MODE (owner only): an approved compiled spec is run
    // straight through — no compiler, no Product-Architect theatre. Otherwise,
    // privileged operators get the Product Architect visual brain plus the prompt
    // compiler. Non-privileged traffic keeps the standard conversational Concierge.
    if (isOwner && executeMode) {
      systemContent += `\n\n${cosExecuteDirective()}`
    } else if (isPrivileged) {
      systemContent += `\n\n${cosArchitectModule()}`
      systemContent += `\n\n${promptCompilerModule()}`
    }

    // Model transparency: this is a private, verified owner/admin channel, so the
    // assistant may disclose which model powers it (the default identity caution
    // does not apply here). The actual model name is injected so the answer is correct.
    if (isPrivileged) {
      systemContent += `

MODEL TRANSPARENCY: You are running on the model "${model}". This is a private, verified owner/admin channel. If the owner or admin asks which model, LLM, or engine powers you, answer plainly that you are running on "${model}". Do not refuse, deflect, or claim you cannot share this — that restriction does not apply in this internal owner/admin channel.`
    }

    // ── Long-term user memory (logged-in users only) ──────────────────────
    if (userId) {
      try {
        const memories = await loadUserMemories(userId)
        const memoryBlock = formatMemoriesForAI(memories)
        systemContent += `

${memoryBlock || 'No saved memories for this user yet.'}

MEMORY RULES: Use saved memories to personalize answers naturally — never recite the list back. When the user states a LASTING preference, a fact about themselves or their business, or a goal, call rememberFact to save it (one concise fact per call). When the user asks you to forget something or corrects a saved fact, call forgetFact. Never save secrets, passwords, or payment details.

CONVERSATION HISTORY: This user's conversations with you are stored. When they reference an earlier discussion ("what did we talk about", "the campaign we discussed", "continue where we left off"), call searchPastConversations with short topic keywords before answering — never claim you cannot recall past conversations without searching first. If they ask to delete their history, ask for explicit confirmation, then call deleteConversationHistory with confirm: true.`
      } catch {
        // memory is non-blocking — continue without it
      }
    }

    // Reused by the self-correction pass at the end of the handler.
    let cosVerdict: any = null
    let cosEvidence: string | undefined = undefined
    // ── COS KNOWLEDGE LAYER continues below ──
    // ── COS KNOWLEDGE LAYER: ground current-fact questions on live data before
    // the model answers, so COS cannot answer them from memory. Privileged
    // (Chief-of-Staff) path only; best-effort; never blocks the response. This
    // injects DATA only — it does not add approval/hold behavior to live COS. ──
    if (isPrivileged && latestUserMessage.trim()) {
      try {
        const { runCosReasoning } = await import('@/lib/ai/cos/reasoningCore')
        const verdict = runCosReasoning({ objective: latestUserMessage })
        cosVerdict = verdict

        // Log only substantive decisions — skip conversational filler and bare
        // "ok/continue" continuations, which classify as no-tool/no-action.
        if (verdict.ok && (verdict.sourceRouting.mustUseTool || verdict.executionPlan.proposesAction)) {
          void (async () => {
            try {
              const { logCosDecision } = await import('@/lib/ai/cos/decisionLog')
              await logCosDecision(verdict, userId)
            } catch {}
          })()
        }

        // Ground current-fact questions: fetch the routed source and inject it.
        if (verdict.ok && verdict.sourceRouting.mustUseTool) {
          const { groundCosDecision } = await import('@/lib/ai/cos/knowledgeBridge')
          const grounded: any = await Promise.race([
            groundCosDecision(verdict),
            new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
          ])
          const ev = grounded && grounded.evidence
          if (ev && ev.fetched && ev.summary) {
            cosEvidence = ev.summary
            systemContent += `

── VERIFIED LIVE DATA (fetched just now from ${ev.source}; treat this as the source of truth and do NOT answer this question from memory) ──
${ev.summary}`
          } else if (ev && ev.connectorWired === false) {
            systemContent += `

── SOURCE-OF-TRUTH NOTE ── Answering this accurately needs live data from ${ev.source}, which is not connected yet. Tell the owner you can't confirm the current figure rather than guessing from memory.`
          }
        }
      } catch {
        // Grounding is best-effort — never block or break the live response.
      }
    }

    const anthropicTools = toAnthropicTools(tools)
    const convo: ChatMessage[] = [...sanitized]
    applyAttachments(convo, body?.attachments)

    const startedAt = Date.now()
    const BUDGET_MS = 240_000
    const remainingMs = () => BUDGET_MS - (Date.now() - startedAt)
    const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI request timeout')), Math.max(5_000, remainingMs()))),
      ])

    // A model error is "transient" if retrying might succeed: rate limits,
    // overloads, and 5xx. Context-length / 400s are NOT retried (they'd just
    // fail again) — they fall through to the graceful catch, which tells the
    // owner exactly what happened.
    const isTransient = (err: any): boolean => {
      const status = err && (err.status || err.statusCode)
      if (status === 429 || status === 500 || status === 502 || status === 503 || status === 529) return true
      const m = err && err.message ? String(err.message).toLowerCase() : ''
      return /overloaded|rate.?limit|econnreset|etimedout|temporar|\b(502|503|529)\b/.test(m)
    }
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(0, ms)))

    // Calls the model; returns null on time-budget expiry instead of throwing,
    // so a long task degrades into a graceful "say continue" reply, never a 500.
    // Transient errors (overloaded / rate-limited / 5xx) are retried with backoff
    // while time remains, so a recoverable blip never hard-freezes the assistant.
    const callModel = async (choiceMode: 'auto' | 'required' | 'none' | 'campaign' | 'prospect' | 'press' | 'pressQueue') => {
      let lastErr: any = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const msg = await withTimeout(
            anthropic.messages.create({
              model,
              max_tokens: 16000,
              temperature,
              system: cachedSystem(systemContent) as any, // ephemeral prompt cache: caches the tools+system prefix across the multi-turn tool loop
              messages: convo as any,
              tools: anthropicTools as any,
              tool_choice: choiceMode === 'required' ? { type: 'any' } : choiceMode === 'campaign' ? { type: 'tool', name: 'proposeMarketingCampaign' } : choiceMode === 'prospect' ? { type: 'tool', name: 'startProspectCampaign' } : choiceMode === 'press' ? { type: 'tool', name: 'findPublications' } : choiceMode === 'pressQueue' ? { type: 'tool', name: 'proposePressCampaign' } : choiceMode === 'none' ? { type: 'none' } : { type: 'auto' },
            })
          )
          // Meter every model call (owner Chief of Staff vs external Concierge),
          // so external-user token cost can be attributed/billed/throttled.
          // Fire-and-forget + resilient: never blocks or breaks the reply.
          if (msg && (msg as any).usage) {
            void recordUsage({
              userId,
              feature: isPrivileged ? 'support.chief-of-staff' : 'support.concierge',
              model,
              usage: (msg as any).usage,
            })
          }
          return msg
        } catch (err) {
          if (err instanceof Error && err.message === 'AI request timeout') return null
          lastErr = err
          // Stop retrying if it isn't recoverable, time is nearly out, or this was the last attempt.
          if (!isTransient(err) || remainingMs() < 20_000 || attempt === 2) throw err
          await sleep(Math.min(remainingMs() - 8_000, 1_200 * (attempt + 1)))
        }
      }
      throw lastErr
    }

    const ACTION_TRIGGER = /^(ok(ay)?|yes|si|sí|sure|proceed|continue|go(\s*ahead)?|do it|start|let'?s\s*(start|go)|next(\s*page)?|approved?|confirmed?|dale|adelante|sigue|empieza)[.!\s]*$/i
    const forceAction = isPrivileged && ACTION_TRIGGER.test(latestUserMessage.trim())
    if (forceAction) {
      systemContent += '\n\nOWNER COMMAND: an affirmation ("continue"/"go"/"yes" or similar) was received. Immediately perform the next pending action — for multi-page tasks, read the next queued page file and COMMIT it within this reply. Do not output a plan, do not ask anything, do not repeat instructions to say continue.'
    }

    // Owner campaign-request forcer. When the owner asks to create a campaign or
    // video (any of the 5 platform languages), the FIRST model call is forced to
    // invoke proposeMarketingCampaign — replying with campaign copy in prose and
    // never inserting a row is exactly the silent failure this prevents.
    // Owner MULTI-PROSPECT forcer. This runs BEFORE the campaign forcer and wins,
    // because the two overlap badly: "Run an outreach campaign ... Start in the
    // United States. Find 10." trips CAMPAIGN_VERB ("Start") and CAMPAIGN_NOUN
    // ("campaign"), so the first call was hard-forced to proposeMarketingCampaign
    // and startProspectCampaign never got a chance — the turn then spent its whole
    // budget trying to research ten companies inline and died at the limit. A
    // request naming a COUNT of companies is a background job, not a campaign row.
    // PRESS vs SALES. A press request and a sales request use the SAME words — "run an
    // outreach campaign", "find 20" — but they belong to completely different pipelines:
    // press goes to proposePressCampaign → press_campaigns → the cockpit at
    // /dashboard/marketing/press-drafts, sales goes to the prospect worker →
    // outreach_queue → Contacts. The prospect forcer below sets a HARD tool_choice, so
    // without this check a press brief was forced into the sales tool and the press path
    // became unreachable — which is exactly what happened: publications were searched for
    // as if they were companies, and a magazine shop and a tutorial site were queued.
    const PRESS_CONTEXT = /\b(press|publication|publications|publisher|publishers|magazine|magazines|newspaper|newspapers|journal|journalist|journalists|editor|editors|editorial|newsroom|media outreach|trade press|podcast|newsletter|press release|imprensa|jornal|revista|redação|prensa|periódico|revista|redacción|prasa|gazeta|redakcja|пресса|газета|журнал|редакция)\b/i
    const isPressRequest = PRESS_CONTEXT.test(latestUserMessage)

    const PROSPECT_COUNT = /\b(?:find|get|build|list|source|research|encontr\w*|busca\w*|znajd\w*|найд\w*)\D{0,24}(\d{1,3})\b|\b(\d{1,3})\s*(?:companies|company|prospects?|leads?|targets?|accounts?|empresas?|firmas?|firmy|компани\w*)/i
    const PROSPECT_CONTEXT = /(outreach|prospect|cold email|email campaign|campaign|sell|sales|lead gen|prospec\w*|sprzeda\w*|аутрич|продаж)/i
    const prospectMatch = latestUserMessage.match(PROSPECT_COUNT)
    const prospectCount = prospectMatch ? Number(prospectMatch[1] || prospectMatch[2] || 0) : 0
    const forceProspect = isOwner && !forceAction && !isPressRequest && prospectCount >= 3 && prospectCount <= 100 && PROSPECT_CONTEXT.test(latestUserMessage)
    // PRESS NEEDED A FORCER TOO — this was the actual defect.
    //
    // Sales gets a hard tool_choice. Marketing campaigns get a hard tool_choice. Press got a
    // paragraph of prompt text and tool_choice 'auto', which is a REQUEST, not a guarantee. The
    // comment above this block already states the lesson for the campaign path — "replying with
    // campaign copy in prose and never inserting a row is exactly the silent failure this
    // prevents" — and press was the one pipeline still exposed to it.
    //
    // Measured on the owner's real message ("Research and identify 30 real publications…"):
    // isPressRequest true, forceProspect false (press excluded), forceCampaign false (no verb in
    // CAMPAIGN_VERB), so tool_choice resolved to 'auto'. The model wrote a strategy document,
    // queued nothing, and reported no campaign ids — three times in a row. Nothing was broken in
    // proposePressCampaign or findPublications; they were simply never called.
    //
    // The forced tool is findPublications, not proposePressCampaign, because it is the FIRST
    // required call and the one that makes the rest honest: it returns real outlets with contacts
    // taken from their own sites, so the proposePressCampaign calls that follow in the tool loop
    // cannot be built on remembered addresses.
    //
    // It is gated on an ACTION word, not on press vocabulary alone. "Where do I approve press
    // drafts?" mentions press and must stay a conversation; "research 30 publications" is work.
    const PRESS_ACTION = /\b(research|identify|find|list|queue|pitch|prepare|prepar\w*|create|draft|launch|start|run|build|contact|reach out|submit|encontr\w*|criar?|montar?|znajd\w*|przygotu\w*|найд\w*|подготов\w*)\b/i
    const forcePress = isOwner && !forceAction && isPressRequest && PRESS_ACTION.test(latestUserMessage)

    if (isPressRequest && isOwner) {
      systemContent += `\n\nOWNER PRESS REQUEST: this is a PRESS/MEDIA request, not a sales prospecting request. Do NOT call startProspectCampaign or createOutreachDraft — those target companies and would queue publications into the sales pipeline. Use findPublications first to get real outlets with verified editorial contacts for the region the owner named, then call proposePressCampaign ONCE PER publication you intend to pitch, using the contact findPublications returned. NEVER invent an editor address, a publication, a product name, a quote or a statistic; if no verified contact was found for an outlet, skip it and say so. Each proposePressCampaign call creates a DRAFT for owner approval at /dashboard/marketing/press-drafts — nothing is sent. Report which publications you queued and which you skipped and why. Do NOT paginate this and do NOT ask the owner to say \"continue\" — one request authorizes the whole job. A reply that describes publications in prose and contains NO campaign id from proposePressCampaign is a failure — the owner asked for queued drafts, not a document.`
    }

    if (forceProspect) {
      systemContent += `\n\nOWNER MULTI-PROSPECT REQUEST: the owner asked for ${prospectCount} target companies in this message. You MUST call startProspectCampaign now, exactly once. Put the owner's description of what is being sold into offer (keep their wording and detail), their description of who to target — including geography and any disqualifiers — into targetCriteria, and set requestedCount to ${prospectCount}. Do NOT call createOutreachDraft, do NOT call proposeMarketingCampaign, and do NOT try to research or name any company yourself: this turn is time-bounded and researching companies inline will kill it before it answers. After the tool returns, report the job id, say plainly that discovery and drafting run in the background over the next several minutes, that NOTHING has been sent and no company has been contacted, and that drafts appear in the Outreach console for approval.`
    }

    const CAMPAIGN_VERB = /(cri(e|ar)|fa(ç|c)a|fazer|gerar?|lan(ç|c)ar|lance|create|make|generate|launch|start|produz|prepare|montar?|stw(ó|o)rz|utw(ó|o)rz|созда|запусти)/i
    const CAMPAIGN_NOUN = /(campanha|campaign|kampani|кампани|v(í|i)deo|video|wideo|видео|reels?|shorts?|tiktok)/i
    const forceCampaign = isOwner && !forceAction && !forceProspect && !forcePress && CAMPAIGN_VERB.test(latestUserMessage) && CAMPAIGN_NOUN.test(latestUserMessage)
    if (forceCampaign) {
      systemContent += '\n\nOWNER CAMPAIGN REQUEST: the owner asked for a campaign/video in this message. You MUST call proposeMarketingCampaign now. Pass the owner\'s FULL message verbatim as sourceMaterial, and extract goal, audience, channel, offer, and language from it. Do NOT answer a campaign request with campaign copy in prose: a reply that describes a campaign but contains no campaign id from the tool is a failure.'
    }

    let msg        = await callModel(forcePress ? 'press' : forceProspect ? 'prospect' : forceCampaign ? 'campaign' : forceAction ? 'required' : 'auto')
    let toolRounds = 0
    let timedOut   = msg === null

    // Names of tools that ACTUALLY executed this turn. The post-generation guard
    // below uses this to catch a reply that claims an owner action no tool performed.
    const firedTools = new Set<string>()
    // Set only when findPublications returned at least one real outlet this turn.
    let pressOutletsFound = false
    // What the search actually said, verbatim, when it did NOT return outlets. The owner
    // has now received four consecutive replies that looked like a finished campaign and
    // queued nothing; the failure has to become visible in the reply itself rather than
    // being something he discovers by opening an empty cockpit.
    let pressSearchNote = ''

    while (!timedOut && msg && (msg as any).stop_reason === 'tool_use' && toolRounds < 10 && remainingMs() > 12_000) {
      toolRounds++

      // Record the assistant turn (its full content blocks, including tool_use).
      convo.push({ role: 'assistant', content: (msg as any).content })

      // Run each requested tool; collect all results into ONE user message.
      const toolResults: any[] = []
      for (const block of (msg as any).content) {
        if (!block || block.type !== 'tool_use') continue
        firedTools.add(String(block.name || ''))
        // runTool expects a JSON string; Anthropic gives input as an object.
        const result = await runTool(block.name || '', JSON.stringify(block.input ?? {}), userId, conversationId, isPrivileged, isOwner)
        // Did the search actually return outlets? Forcing the queueing tool when it did
        // NOT would order the model to queue something that does not exist — i.e. to
        // invent a publication and an editor address, the precise harm the whole press
        // path is built to prevent. So the forcer below is gated on a real result, and
        // the shape checked is the one findPublications itself emits on success.
        if (String(block.name || '') === 'findPublications') {
          if (/^\d+ publications found/.test(String(result || ''))) pressOutletsFound = true
          else pressSearchNote = String(result || '').slice(0, 400)
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
      convo.push({ role: 'user', content: toolResults })

      // SECOND HALF OF THE PRESS FORCER. Forcing findPublications guarantees the SEARCH;
      // it does not guarantee the QUEUEING. Left on 'auto', the model reliably took the
      // outlets it had just been handed and wrote them up as a document — which is the
      // same silent failure one step later, and it is what the owner kept receiving.
      //
      // So once the search has returned real outlets and nothing has been queued yet, the
      // next call is hard-forced to proposePressCampaign. Only until it fires once: after
      // that, firedTools carries it and the loop returns to 'auto', so the model queues the
      // remaining outlets and writes its own skip report rather than being driven per row.
      //
      // Gated on pressOutletsFound, never on forcePress alone — see the note above.
      const forcePressQueue = forcePress && pressOutletsFound && !firedTools.has('proposePressCampaign')
      const next = await callModel(forcePressQueue ? 'pressQueue' : 'auto')
      if (next === null) { timedOut = true; break }
      msg = next
    }

    const extractText = (m: any) =>
      m && Array.isArray(m.content)
        ? m.content.filter((b: any) => b && b.type === 'text').map((b: any) => b.text).join('').trim()
        : ''
    let reply = extractText(msg)
    // If the loop ended while still mid-tool-call (round cap reached), the model never
    // got to write its answer. Force one tools-disabled synthesis so a read-heavy task
    // (e.g. an audit) returns its findings instead of the empty-response fallback.
    if (!reply && !timedOut && msg && (msg as any).stop_reason === 'tool_use' && remainingMs() > 8_000) {
      try {
        convo.push({ role: 'assistant', content: (msg as any).content })
        const stopResults = (msg as any).content
          .filter((b: any) => b && b.type === 'tool_use')
          .map((b: any) => ({
            type: 'tool_result',
            tool_use_id: b.id,
            content: 'Reading budget reached — do NOT call any more tools. Write your complete final answer for the owner now, in plain text, using everything you have already gathered.',
          }))
        convo.push({ role: 'user', content: stopResults })
        const synth = await callModel('none')
        if (synth) { msg = synth; reply = extractText(synth) }
      } catch { /* fall through to the budget/fallback messages below */ }
    }
    if (!reply) {
      const committedSomething = convo.some(
        (m: any) => m && m.role === 'user' && Array.isArray(m.content) &&
          m.content.some((b: any) => b && b.type === 'tool_result' && typeof b.content === 'string' && b.content.includes('COMMIT SUCCEEDED'))
      )
      if (timedOut || remainingMs() <= 12_000) {
        reply = committedSomething
          ? 'I committed part of the work — a preview is building for it now. I ran out of time before finishing everything, so say "continue" and I will do the next page.'
          : 'That task is too large for a single reply. Say "continue" and I will work through it one page at a time, starting immediately.'
      }
    }
    if (!reply) {
      reply = ({
        en: 'I could not produce a response for that. Please try rephrasing, or break it into smaller steps.',
        es: 'No pude generar una respuesta para eso. Intenta reformularlo o dividirlo en pasos más pequeños.',
        pt: 'Não consegui gerar uma resposta para isso. Tente reformular ou dividir em passos menores.',
        pl: 'Nie udało mi się wygenerować odpowiedzi. Spróbuj przeformułować lub podzielić to na mniejsze kroki.',
        ru: 'Не удалось сформировать ответ. Попробуйте переформулировать или разбить на меньшие шаги.',
      } as Record<string, string>)[languageCode] || 'I could not produce a response for that. Please try rephrasing, or break it into smaller steps.'
    }

    // ── COS SELF-CORRECTION: before the answer reaches the owner, COS reviews
    // its own draft against the objective + grounded evidence and revises once
    // if it fails. Privileged only; best-effort; budget-gated. Skips media and
    // commit replies so their special tags are never altered. ──
    const cosSkipSpecial = /<VIDEO>|<PLAYLIST>|<IMAGE>|COMMIT SUCCEEDED/.test(reply)
    if (
      isPrivileged && reply && !cosSkipSpecial && cosVerdict && cosVerdict.ok &&
      (cosVerdict.sourceRouting?.mustUseTool || cosVerdict.executionPlan?.proposesAction) &&
      remainingMs() > 15_000
    ) {
      try {
        const { runSelfCorrection } = await import('@/lib/ai/cos/selfReview')
        const corrected = await runSelfCorrection(anthropic, model, {
          objective: latestUserMessage,
          draft: reply,
          evidence: cosEvidence,
        }, 1)
        // Only override the answer when a revision was actually produced
        // (round 1 failed). If round 1 passed, the draft is unchanged.
        if (corrected.ok && corrected.rounds.length > 1 && corrected.finalDraft) {
          reply = corrected.finalDraft
        }
        // Log the correction trace onto the decision record (best-effort).
        void (async () => {
          try {
            const { updateCosDecisionOutcome } = await import('@/lib/ai/cos/decisionLog')
            await updateCosDecisionOutcome(cosVerdict.decisionId, {
              outcome: {
                selfCorrection: {
                  passed: corrected.passed,
                  rounds: corrected.rounds.length,
                  revised: corrected.rounds.length > 1,
                  failedRules: corrected.rounds[0]?.review?.failedRules || [],
                },
              },
            })
          } catch {}
        })()
      } catch {
        // self-correction is best-effort — never block or break the response
      }
    }

    // ── Post-generation confabulation guard: a non-owner reply that claims a
    // completed owner action no tool performed is replaced with an honest
    // can't-do message. Owner replies pass through untouched. ──
    // PRESS HONESTY BACKSTOP.
    //
    // Both forcers can fire and the turn can still end with nothing queued — the search
    // can come back empty, or be called without a region, or the model can be handed
    // outlets and still write prose. In every one of those cases the reply reads like a
    // finished campaign, and the only way the owner learns otherwise is by opening the
    // cockpit and finding it empty. That is the failure this whole thread has been: not
    // that the work failed, but that the failure was silent.
    //
    // So when a press request produced no proposePressCampaign call, the reply says so in
    // its own first line, and quotes what the search actually returned. It does not
    // fabricate a reason and it does not delete the model's text — the brief is often
    // still useful; it just stops being presented as a queued campaign.
    if (forcePress && !firedTools.has('proposePressCampaign')) {
      const why = !firedTools.has('findPublications')
        ? 'the publication search never ran'
        : pressSearchNote
          ? `the publication search returned: ${pressSearchNote}`
          : 'the publication search returned no usable outlets'
      reply = [
        `NO PRESS CAMPAIGNS WERE QUEUED — ${why}. Nothing below is a draft, nothing is scheduled, and no editor has been contacted. Check /dashboard/marketing/press-drafts: it will be empty for this request. Everything that follows is background material only, and any publication or contact named in it came from the model's memory, not from a verified search.`,
        '',
        reply,
      ].join('\n')
    }

    reply = guardConfabulatedAction(reply, isOwner, firedTools, languageCode)

    // ── Persist this exchange to conversation history (logged-in users) ───
    if (userId && conversationId && latestUserMessage) {
      await persistTurn({
        conversationId,
        userId,
        userMessage: latestUserMessage,
        assistantReply: reply,
      })
    }

    return NextResponse.json({
      reply,
      telemetry: local,
      source: isPrivileged ? 'anthropic-chief' : 'anthropic-concierge',
    })
  } catch (error) {
    console.error('Support API error', error)
    const detail = error instanceof Error ? error.message : 'unknown error'
    const GENERIC: Record<string, string> = {
      en: 'I hit a snag handling that and could not finish. It may have been a temporary model overload or a request that was too large — please try again, and split very large tasks into smaller steps.',
      es: 'Tuve un problema al procesar eso y no pude terminar. Pudo ser una sobrecarga temporal del modelo o una solicitud demasiado grande — inténtalo de nuevo y divide las tareas muy grandes en pasos más pequeños.',
      pt: 'Tive um problema ao processar isso e não consegui terminar. Pode ter sido uma sobrecarga temporária do modelo ou um pedido grande demais — tente novamente e divida tarefas muito grandes em passos menores.',
      pl: 'Napotkałem problem i nie udało mi się dokończyć. To mogło być chwilowe przeciążenie modelu lub zbyt duże żądanie — spróbuj ponownie i podziel bardzo duże zadania na mniejsze kroki.',
      ru: 'Возникла проблема, и я не смог завершить. Возможно, это была временная перегрузка модели или слишком большой запрос — попробуйте снова и разбивайте очень большие задачи на меньшие шаги.',
    }
    const base = GENERIC[errLangCode] || GENERIC.en
    // The owner/admin gets the real error to debug; customers never see internals.
    const reply = errIsPrivileged ? `${base}\n\n(Diagnostic — owner only: ${detail})` : base
    return NextResponse.json({ reply, telemetry: { source: 'error-degraded' }, source: 'error-degraded' })
  }
}
