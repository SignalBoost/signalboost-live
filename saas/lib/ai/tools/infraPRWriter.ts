// saas/lib/ai/tools/infraPRWriter.ts
//
// The "automated runner" for the PR-style infrastructure flow. The Chief of
// Staff acts as the developer: when the owner gives an instruction, the model
// generates the precise provider templateIds + JSON payloads and stages them as
// an Open Pull Request via stageInfrastructurePR(). It NEVER fires them — that
// is the owner's Merge click on the /hub/prs page.
//
// This mirrors repoWriter.ts: the model proposes, the owner approves. Code goes
// to ai/* branches; infrastructure goes to the infrastructure_prs queue.

import {
  stageInfrastructurePR,
  listInfrastructurePRs,
  type InfraPR,
  type InfraPRStep,
  type InfraRisk,
} from '@/lib/hub/pr-engine'

export type StageResult = { ok: boolean; pr?: InfraPR; error?: string }

/** Stage a PR from raw tool arguments (already JSON-parsed). */
export async function proposeInfrastructurePR(
  args: {
    title?: unknown
    summary?: unknown
    risk?: unknown
    steps?: unknown
  },
  ctx: { userId: string | null; userEmail?: string | null },
): Promise<StageResult> {
  const title = String(args?.title || '').trim()
  if (!title) return { ok: false, error: 'A short title is required.' }

  const rawSteps = Array.isArray(args?.steps) ? args.steps : []
  if (rawSteps.length === 0) {
    return { ok: false, error: 'At least one step is required. Each step is { templateId, label, payload }.' }
  }

  // Shape each step defensively; the engine validates templateId format again.
  const steps: InfraPRStep[] = rawSteps.map((s: any) => ({
    templateId: String(s?.templateId || ''),
    provider: String(s?.provider || String(s?.templateId || '').split('.')[0]),
    label: String(s?.label || s?.templateId || ''),
    payload: (s?.payload && typeof s.payload === 'object') ? s.payload : {},
  }))

  const risk = (['low', 'medium', 'high'] as const).includes(args?.risk as InfraRisk)
    ? (args.risk as InfraRisk)
    : 'medium'

  return stageInfrastructurePR({
    title,
    summary: String(args?.summary || ''),
    risk,
    steps,
    createdBy: ctx.userId,
    createdByEmail: ctx.userEmail || null,
  })
}

// ── Formatters: turn results into text the model reads back to the owner ─────

export function formatStageResultForAI(r: StageResult): string {
  if (!r.ok || !r.pr) {
    return `INFRA PR NOT STAGED: ${r.error || 'unknown error'}. Fix the issue and try again — do NOT claim anything is queued.`
  }
  const pr = r.pr
  const lines = pr.steps
    .map((s, i) => `  ${i + 1}. [${s.templateId}] ${s.label}`)
    .join('\n')
  return [
    `PR STAGED — status: open (nothing has executed yet).`,
    `Title: ${pr.title}`,
    `Risk: ${pr.risk}`,
    `Steps (${pr.steps.length}):`,
    lines,
    ``,
    `Tell the owner it is waiting on the Hub Console → Pull Requests page (/hub/prs).`,
    `It will only fire the live provider APIs when they click Merge / Approve.`,
  ].join('\n')
}

export async function listInfraPRsForAI(): Promise<string> {
  const r = await listInfrastructurePRs('open', 25)
  if (!r.ok) return `Could not load open infrastructure PRs: ${r.error || 'unknown error'}.`
  if (r.prs.length === 0) return 'There are no open infrastructure PRs awaiting approval.'
  const lines = r.prs.map(pr => {
    const steps = Array.isArray(pr.steps) ? pr.steps.length : 0
    return `• "${pr.title}" — ${steps} step${steps === 1 ? '' : 's'}, risk ${pr.risk} (id ${pr.id})`
  })
  return [
    `${r.prs.length} open infrastructure PR${r.prs.length === 1 ? '' : 's'} awaiting the owner's Merge on /hub/prs:`,
    ...lines,
  ].join('\n')
}
