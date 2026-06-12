import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { getConciergeAnswer } from '@/lib/platform/unifiedPlatform'
import { getAccess } from '@/lib/auth/access'
import { getLivePricing } from '@/lib/ai/tools/getPricing'
import { getBusinessMetrics, formatMetricsForAI } from '@/lib/ai/tools/getBusinessMetrics' 
import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { getAffiliateCount, formatAffiliatesForAI } from '@/lib/ai/tools/getAffiliateCount'
import { loadUserMemories, formatMemoriesForAI, saveUserMemory, forgetUserMemory } from '@/lib/ai/tools/userMemory'
import { persistTurn, searchPastConversations, formatHistoryForAI, deleteAllConversations } from '@/lib/ai/tools/conversationHistory'
import { listRecentAlerts, formatAlertsForAI } from '@/lib/ai/opportunityScanner'
import { proposeGrowthPlan, setGrowthPlanStatus, listGrowthPlans, formatPlansForAI, createOutreachDraft, type PlanStatus } from '@/lib/ai/growthPlans'
import { isOutreachEligible, createCustomerDraft, listCustomerDrafts, formatCustomerDraftsForAI } from '@/lib/outreach/customer'
import { listRepoFiles, readRepoFile, formatFileListForAI, formatFileForAI } from '@/lib/ai/tools/repoReader'
import { commitFileToBranch, listAiBranches, formatCommitResultForAI, formatBranchListForAI, listDeletableBranches, deleteBranches, formatDeletableForAI, formatDeleteResultForAI } from '@/lib/ai/tools/repoWriter'

type SupportMessage = { role?: 'user' | 'assistant' | 'system'; content?: string }

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
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
  return `You are the SignalBoost Concierge, assisting customers and visitors.

Today's date: ${new Date().toUTCString().slice(0, 16)}.

Reply strictly in ${language}.

${PLATFORM_FACTS}

You are a knowledgeable GENERALIST about SignalBoost and general topics — thorough on the platform's real features above, with broad general knowledge, but not a specialist financial/legal/strategic advisor.

Operating rules (apply to every answer):
1. Logical and precise — base every answer on reasoning, not emotion.
2. Ask a clarifying question only when an essential technical detail is genuinely missing; otherwise answer directly.
3. Communicate with clear structure — short sections, lists, or tables when they aid clarity.
4. Professional and kind, like excellent customer support.
5. Neutral, factual tone — no personal opinions, no emotional language, no fluff, and stay out of partisan politics to protect the brand.
6. Complete answers — the full solution, not partial hints.
7. Context-aware — tailor to the user's request without drifting off topic.
8. When asked for code, provide clean, production-ready snippets.
9. Customer-support manner: polite, clear, helpful, strictly logical and technical.
10. Consistency — apply these rules across all subjects.

CUSTOMER OUTREACH (Growth & Command plans): logged-in users on these plans can have you write outreach messages for THEIR OWN business. When a user asks you to draft outreach, a partnership message, or a cold email for their business: FIRST collect everything needed for a complete message — the target business name and website URL, AND the user's own business name and sender name. NEVER save a draft containing bracketed placeholders like [Your Name] or [Your Bakery Name]; if any detail is missing, ask for it before calling the tool. Then write a polished, fully personalized message of 40-2,400 characters (no guaranteed-results promises) and call createMyOutreachDraft. Tell them to review, approve, and send it from the My Outreach page (Grow menu). Use listMyOutreachDrafts when they ask about their drafts. If the tool says their plan doesn't include outreach, warmly explain it's a Growth/Command feature and suggest upgrading — never pretend the draft was created.

Describe SignalBoost using ONLY the factual knowledge above. Never say you "don't have access" to information about SignalBoost — you DO. For prices, call the getPricing tool. If asked about something genuinely not covered, say you'll connect them with the team rather than inventing an answer.`
}

function chiefOfStaffPrompt(language: string, liveMetrics: string, pendingPlans: string): string {
  return `You are the Chief of Staff AI for SignalBoost — the trusted senior advisor to the company's owner and administrators. You are speaking with a verified owner/admin, privately.

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

You also have a getExternalInfo tool that performs a LIVE WEB SEARCH. Use it whenever the owner asks about market conditions, competitors, industry trends, current prices of external services, news, regulations, or anything outside SignalBoost's internal data. Always cite source URLs from the results when making claims based on them. The competitor guardrail does NOT apply in this private channel — competitor analysis for the owner is part of your job.

Your role: act as a seasoned, multi-domain expert and right hand — Chief of Staff AND Chief Marketing & Sales Strategist, operating at the level of a top-tier MBA hire. You have working command of marketing, sales, finance, accounting, IT and software architecture, economics, business strategy, and global/geopolitical matters as they affect the business.

STRATEGIST PROTOCOL:
- When the owner asks to scan for opportunities, research competitors, or analyze the market, run getExternalInfo searches FIRST (multiple searches for broad requests), then interpret the live signals with strategic frameworks (SWOT, STP/positioning, funnel design, pricing strategy).
- Format opportunity findings as structured alerts: WHAT HAPPENED (the event/launch/change) → WHY IT MATTERS (growth potential or competitive impact for SignalBoost) → RECOMMENDED ACTION (copy / improve / partner / monitor / ignore, with a concrete next step). Cite source URLs.
- An automated daily scanner also stores opportunity alerts; call getOpportunityAlerts to review its latest findings when the owner asks "what's new", "any opportunities", or about the radar.
- Ground strategy in live data: business metrics for internal numbers, web search for external facts. If live data is unavailable, say so and reason from clearly stated assumptions instead.
- Deliver strategies as actionable playbooks: campaign ideas, outreach scripts, pricing models, funnels, retention tactics — tailored to SignalBoost's SaaS + affiliate-mall model and its five-language audience.

CODEBASE ACCESS (read-only "eyes"): you can read the platform's live source code. Use listRepoFiles to explore the repository tree (the app lives under saas/) and readRepoFile to read any file. ALWAYS read the relevant files before answering questions about the code, architecture, configs, or schemas — never guess at code you have not read, and cite exact file paths in your answers. When code changes are needed, follow the COMMIT WORKFLOW below.

CODE COMMITS ("hands", branch-only): you can commit code — ONLY to ai/* preview branches, NEVER to main. Production cannot be touched by you; only the owner merges. Workflow for any code change:
1. READ FIRST: read the current file(s) with readRepoFile before writing — never modify a file you have not read in this conversation.
2. PRESENT: show the owner what you intend to change and why, then ask for explicit approval to commit.
3. COMMIT: only after explicit approval, call proposeCodeCommit with the COMPLETE new file content (full file, never a fragment, no placeholders, no TODOs), a short kebab-case branch name describing the change, and a clear commit message. Multi-file changes go to the SAME branch — one proposeCodeCommit call per file.
4. REPORT: give the owner the compare URL and tell them Vercel is building a preview — they review the preview and merge in GitHub when it is green. Never claim a change is live; it is live only after the owner merges.
Use listAiBranches when the owner asks what code is awaiting review. BRANCH CLEANUP: when the owner asks to clean up old branches, call listCleanupBranches, show them the list, and delete with deleteBranches ONLY after their explicit confirmation — the tool itself refuses main and anything outside ai/*, codex/*, SignalBoost/patch-*. Follow the repo's conventions strictly: the tsconfig is NON-STRICT, so use the flat { ok: boolean; error?: string } result style (discriminated unions do not narrow); inline styles in UI files; single-line tag attributes; full files only.

CIO PROTOCOL (developer, systems engineer, designer, debugger):
- You are also the company's CIO. Translate the owner's plain-language reports into technical fixes even when written hastily, with typos, or in shorthand. If a request is ambiguous, state your interpretation in ONE line ("Interpreting: ...") before acting — then act.
- BUG TRANSLATION LIBRARY (symptom → where to look): "card is cut off / cards all over the place" → grid/layout styles in that page's wrapper divs; "button not aligned" → flex/grid alignment with neighboring elements; "text not translated" → missing or incomplete keys in the page's COPY object (must cover all five languages: en, es, pt, pl, ru); "link doesn't work" → wrong href or non-existent route; "page fails to load" → the API route it calls and its error handling; "broke after deploy" → re-read the changed file for type errors or invalid imports.
- DEBUGGING PERSISTENCE: when a tool call fails or a commit is REFUSED, the error message tells you exactly what to fix — read it, correct that specific issue, and retry within this conversation. Never repeat an identical failing call unchanged. Never give up after one failure. If genuinely blocked after retries, report plainly: what you tried, why each attempt failed, and the safest fallback for the owner.
- HONEST QA LIMITS: you cannot render pages, click buttons, switch languages in a browser, run builds, or measure performance. NEVER claim you tested, validated, or visually confirmed anything. Instead, after every commit, give the owner a short VERIFICATION CHECKLIST for the Vercel preview: which URL path to open, what to look for, and which languages to spot-check. The owner's eyes on the preview are the QA — your job is to make their check effortless.
- FIX REPORT FORMAT: What was wrong → Why it happened → What changed (exact file path and what was touched) → How the owner verifies it on the preview.
- NEW FEATURE / APP REQUESTS: extract the features, user flows, pages, components, data model, and API needs from the owner's description; present that plan for approval first; then implement through the commit workflow. Brand-new files require the owner's explicit approval and createNewFile: true.

GROWTH PLAN WORKFLOW (analysis → proposal → owner approval → execution):
1. ANALYZE: study radar alerts (getOpportunityAlerts), live metrics, and web research before planning.
2. PROPOSE: when you have a concrete strategy worth pursuing, present it fully in chat AND store it with proposeGrowthPlan (title, objective, full plan with numbered actions). Begin the presentation with a header line containing today's date (e.g. "PROPOSAL — 12 Jun 2026"). Tell the owner it awaits their approval.
3. APPROVAL: NEVER mark a plan approved unless the owner has explicitly approved it in this conversation ("approved", "yes, proceed", or equivalent). On approval call updateGrowthPlanStatus with status approved; on rejection, rejected. Use the exact plan id from the PENDING PLANS block above; if it is not there, call listGrowthPlans to locate it — never guess an id. If the owner requests changes, revise and propose again.
4. EXECUTE: only for APPROVED plans. Use createOutreachDraft to place ready-to-send outreach messages into the outreach pipeline (one call per target; requires the target's business name and website URL — ask the owner if unknown). Each message MUST be 40-2,400 characters and must not promise guaranteed results — longer or non-compliant messages are auto-rejected by the pipeline guardrails. If a draft is rejected, shorten or fix it and retry once, then report the outcome honestly. Drafts enter as 'pending' and still pass the outreach system's own approval, guardrails, daily limits, and audit before anything is sent — tell the owner to finalize sends in the Outreach dashboard. Mark the plan 'executing' once drafts are created, 'completed' when the owner says the work is done.
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

const TOOL_GET_PRICING: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getPricing',
    description: 'Get the current, live SignalBoost SaaS pricing and plan details (Free Demo, Launch, Growth, Command). Call this whenever the user asks about price, cost, plans, tiers, what a plan includes, or upgrades.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_BUSINESS_METRICS: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getBusinessMetrics',
    description: 'Refresh live business metrics from Supabase: users, MRR, plan breakdown, outreach leads, credit balances. Metrics are pre-loaded at session start — call this only if the owner asks for a refresh or asks about something that may have changed during the conversation.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_GET_EXTERNAL_INFO: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getExternalInfo',
    description: 'Perform a live web search for current external information: market data, competitor analysis, industry trends, news, regulations, prices of external services. Returns top results with titles, URLs, and snippets. Use for anything outside SignalBoost internal data that requires up-to-date facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The web search query, e.g. "AI website builder market size 2026" or "Canva pricing plans".' },
      },
      required: ['query'],
    },
  },
}

const TOOL_GET_AFFILIATE_COUNT: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getAffiliateCount',
    description: 'Get the LIVE, current number of affiliates/partners in the SignalBoost shopping mall, queried directly from the partners database. Call this whenever the user asks how many affiliates, partners, brands, or stores the platform has. Never answer affiliate counts from memory.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_REMEMBER_FACT: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_FORGET_FACT: OpenAI.Chat.Completions.ChatCompletionTool = {
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
const TOOL_GET_OPPORTUNITY_ALERTS: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'getOpportunityAlerts',
    description: 'Get the latest opportunity alerts produced by the automated daily market scanner (competitor moves, market gaps, partnerships, pricing changes, trends). Call when the owner asks about new opportunities, the opportunity radar, market alerts, or "anything new in the market".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_LIST_REPO_FILES: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_READ_REPO_FILE: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_COMMIT_CODE: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'proposeCodeCommit',
    description: 'Commit ONE complete file to an ai/* preview branch in the GitHub repository (never main — production is untouched). Call only AFTER the owner explicitly approved the change in this conversation, and only for files you have read with readRepoFile first (or genuinely new files). Vercel automatically builds a preview for the branch; the owner reviews and merges in GitHub. For multi-file changes, call once per file with the same branch name.',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Short kebab-case branch name describing the change, e.g. "fix-navbar-mobile". It is automatically prefixed with ai/.' },
        path: { type: 'string', description: 'Full file path from the repo root, e.g. "saas/lib/ai/tools/getPricing.ts".' },
        content: { type: 'string', description: 'The COMPLETE new file content. Full file, never a fragment or diff. No placeholders.' },
        message: { type: 'string', description: 'Clear commit message, e.g. "fix(navbar): show login button on mobile".' },
        createNewFile: { type: 'boolean', description: 'Set true ONLY when the owner explicitly approved creating a brand-new file that does not exist in the repo yet. Default false.' },
        allowRewrite: { type: 'boolean', description: 'Set true ONLY when the owner explicitly approved a full rewrite of an existing file. Default false — normal edits must preserve most of the original lines.' },
      },
      required: ['branch', 'path', 'content', 'message'],
    },
  },
}

const TOOL_LIST_AI_BRANCHES: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'listAiBranches',
    description: 'List the open ai/* preview branches awaiting the owner review and merge, with their GitHub compare URLs. Call when the owner asks what code changes are pending or awaiting review.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_LIST_CLEANUP_BRANCHES: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'listCleanupBranches',
    description: 'List all cleanup-eligible branches in the repository: ai/*, codex/*, and SignalBoost/patch-* only. Call when the owner asks to clean up, prune, or review old branches. main and all other branches are never included and can never be deleted.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_DELETE_BRANCHES: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_PROPOSE_PLAN: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_UPDATE_PLAN_STATUS: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_LIST_PLANS: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'listGrowthPlans',
    description: 'List recent growth plans with their statuses. Call when the owner asks about plans, what is pending approval, or what is in execution.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_CREATE_OUTREACH_DRAFT: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'createOutreachDraft',
    description: 'Create one outreach draft (ready-to-send message to a specific business) in the outreach pipeline, as part of executing an APPROVED growth plan. The draft enters as pending and still requires final approval and sending in the Outreach dashboard. Requires the target business name AND its website URL.',
    parameters: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'Target business or partner name.' },
        businessUrl: { type: 'string', description: 'Target website URL, must start with http(s)://.' },
        message: { type: 'string', description: 'The complete, polished outreach message ready to send. HARD LIMIT: between 40 and 2,400 characters (the pipeline rejects longer); concise beats long. Never promise guaranteed revenue, sales, rankings, or results.' },
      },
      required: ['businessName', 'businessUrl', 'message'],
    },
  },
}

const TOOL_CREATE_MY_OUTREACH: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_LIST_MY_OUTREACH: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'listMyOutreachDrafts',
    description: 'List the user\'s own outreach drafts and their statuses. Call when they ask about their drafts, pending messages, or outreach progress.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}

const TOOL_SEARCH_HISTORY: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const TOOL_DELETE_HISTORY: OpenAI.Chat.Completions.ChatCompletionTool = {
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

const CONCIERGE_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  TOOL_GET_PRICING,
  TOOL_GET_AFFILIATE_COUNT,
]

const CHIEF_OF_STAFF_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  TOOL_GET_PRICING,
  TOOL_GET_BUSINESS_METRICS,
  TOOL_GET_EXTERNAL_INFO,
  TOOL_GET_AFFILIATE_COUNT,
  TOOL_GET_OPPORTUNITY_ALERTS,
  TOOL_LIST_REPO_FILES,
  TOOL_READ_REPO_FILE,
  TOOL_COMMIT_CODE,
  TOOL_LIST_AI_BRANCHES,
  TOOL_LIST_CLEANUP_BRANCHES,
  TOOL_DELETE_BRANCHES,
  TOOL_PROPOSE_PLAN,
  TOOL_UPDATE_PLAN_STATUS,
  TOOL_LIST_PLANS,
  TOOL_CREATE_OUTREACH_DRAFT,
]
async function runTool(name: string, rawArgs: string, userId: string | null, conversationId: string | null, isPrivileged: boolean): Promise<string> {
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
      return 'No search query was provided. Ask the owner what they want to search for.'
    }
    const result = await getExternalInfo(query)
    if (result.ok && result.results.length) {
      return formatExternalInfoForAI(query, result.results)
    }
    return `Web search failed: ${result.error ?? 'unknown error'}. Tell the owner live external data is unavailable right now and answer from your own knowledge, clearly flagging that it may be outdated.`
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

  if (name === 'proposeCodeCommit') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: code commits are restricted to the owner/admin channel. Do not retry.'
    }
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await commitFileToBranch({
      branch: String(args?.branch || ''),
      path: String(args?.path || ''),
      content: String(args?.content || ''),
      message: String(args?.message || ''),
      createNewFile: args?.createNewFile === true,
      allowRewrite: args?.allowRewrite === true,
    })
    return formatCommitResultForAI(result)
  }

  if (name === 'listAiBranches') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: branch review is restricted to the owner/admin channel. Do not retry.'
    }
    const result = await listAiBranches()
    return formatBranchListForAI(result)
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
    })
    return result.ok
      ? `Outreach draft created (id ${result.outreachId}) with status PENDING. Remind the owner to review and send it from the Outreach dashboard, where final approval and daily limits apply.`
      : `Outreach draft failed: ${result.error ?? 'unknown error'}.`
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

export async function POST(req: NextRequest) {
  try {
    const body         = await req.json()
    const messages     = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
    const languageCode = String(body?.context?.language || 'en').toLowerCase()
    const language     = LANGUAGE_LABELS[languageCode] || 'English'
    const currentPage  = String(body?.context?.currentPage || '/')
    const rawConvId    = String(body?.context?.conversationId || '')
    const conversationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawConvId) ? rawConvId : null

    const sanitized = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-14)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    let isPrivileged = false
    let userId: string | null = null
    try {
      const access = await getAccess()
      isPrivileged = access.isAdmin
      userId = access.userId
    } catch {
      isPrivileged = false
    }

    if (!sanitized.length) {
      const local = getConciergeAnswer('', languageCode, currentPage)
      return NextResponse.json({ reply: local.reply, telemetry: local })
    }

    const latestUserMessage = [...sanitized].reverse().find(m => m.role === 'user')?.content || ''
    const local = getConciergeAnswer(latestUserMessage, languageCode, currentPage)

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: local.reply, telemetry: local, source: 'deterministic-concierge' })
    }

    const openai = getOpenAIClient()
    if (!openai) {
      return NextResponse.json({ error: 'AI backend is not configured.' }, { status: 500 })
    }

    const model       = isPrivileged ? 'gpt-4o' : 'gpt-4o-mini'
    const temperature = isPrivileged ? 0.5 : 0.4
    const baseTools   = isPrivileged ? CHIEF_OF_STAFF_TOOLS : CONCIERGE_TOOLS
    const customerTools = userId && !isPrivileged ? [TOOL_CREATE_MY_OUTREACH, TOOL_LIST_MY_OUTREACH] : []
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

    const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...sanitized,
    ]

    const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI request timeout')), 25000)),
      ])

    let response = await withTimeout(
      openai.chat.completions.create({
        model,
        temperature,
        messages: convo,
        tools,
        tool_choice: 'auto',
      })
    )

    let choice     = response.choices[0]
    let toolRounds = 0

    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && toolRounds < 6) {
      toolRounds++

      convo.push(choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam)

      for (const call of choice.message.tool_calls) {
        const toolName = call.function?.name || ''
        const toolArgs = call.function?.arguments || '{}'
        const result   = await runTool(toolName, toolArgs, userId, conversationId, isPrivileged)
        convo.push({
          role:         'tool',
          tool_call_id: call.id,
          content:      result,
        })
      }

      response = await withTimeout(
        openai.chat.completions.create({
          model,
          temperature,
          messages: convo,
          tools,
          tool_choice: 'auto',
        })
      )
      choice = response.choices[0]
    }

    const reply = choice?.message?.content?.trim()
    if (!reply) {
      return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 })
    }

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
      source: isPrivileged ? 'openai-chief' : 'openai-concierge',
    })
  } catch (error) {
    console.error('Support API error', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
