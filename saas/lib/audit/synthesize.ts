// saas/lib/audit/synthesize.ts
// Post-scan synthesis pass. The per-file scanner (runner.ts) produces a flat list
// of findings; this turns that list — plus the file tree and severity mix — into a
// single holistic, narrative MARKDOWN report (executive summary, cross-cutting
// architecture observations, themed risks, prioritized roadmap). One aggregate
// model call per run, so it respects the run's MAX FILES budget and token margins.
//
// Best-effort: returns '' on any failure and never throws — a run must never fail
// because the narrative could not be written.

import { callAuditModel } from '@/lib/audit/modelRouter'
import { reportLanguageName } from '@/lib/i18n/reportLanguage'
import { AUDIT_UNTRUSTED_DATA_RULE, encodeAuditUntrustedData } from '@/lib/audit/untrustedData'

export interface SynthFinding {
  file: string
  severity: string
  category: string
  title: string
  detail: string
  recommendation: string
  line?: number
}

export interface SynthesisInput {
  repo: string
  scope: string
  filesScanned: string[]
  findings: SynthFinding[]
  repoMap?: string[]   // full repository file tree (macro layout) for cross-file reasoning
  lang?: string
}

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

function tally(findings: SynthFinding[]): string {
  const c: Record<string, number> = {}
  for (const f of findings) {
    const s = String(f.severity || 'info').toLowerCase()
    c[s] = (c[s] || 0) + 1
  }
  const parts = SEV_ORDER.filter(s => c[s]).map(s => `${c[s]} ${s}`)
  return parts.length ? parts.join(', ') : 'none'
}

function buildSynthesisPrompt(input: SynthesisInput): string {
  const { repo, scope, filesScanned, findings, repoMap } = input
  const language = reportLanguageName(input.lang)

  return [
    'You are a principal security & platform engineer writing a paid, enterprise-grade audit',
    'report for the engineering leadership of a SaaS company. Write with depth, authority, and',
    'specificity — the kind of report a CTO would pay for.',
    '',
    `IMPORTANT: Write the entire report in ${language}. Keep file paths, package names, code identifiers, route names, and product names unchanged.`,
    '',
    `Findings (${findings.length}; severity mix: ${tally(findings)}):`,
    AUDIT_UNTRUSTED_DATA_RULE,
    '',
    'Now write a COMPREHENSIVE report in GitHub-flavored Markdown. Do NOT merely restate the',
    'findings — SYNTHESIZE: connect issues across files, infer architectural patterns and systemic',
    'risks, and reason about real-world impact and likelihood. Reference actual file paths. Use',
    'exactly this section structure, translated into the requested report language:',
    '',
    '## Executive Summary',
    'Overall posture in prose: the 3–5 things leadership must know, the single headline risk, and',
    'the bottom line. No bullet dump — write it like a briefing.',
    '',
    '## Architecture & Cross-Cutting Observations',
    'Patterns you infer ACROSS the files — authorization consistency, data access & RLS, secret',
    'handling, input validation, error handling, and code-health signals. Name both strengths and',
    'systemic weaknesses, and point to the files that evidence them.',
    '',
    '## Threat Themes & Business Risk',
    'Group related findings into themes (not a flat list). For each theme: what it is, where it',
    'appears across the codebase, the SECURITY impact AND the REVENUE / business impact (data',
    'exposure, downtime, churn, compliance exposure), and the likelihood. Order by severity.',
    '',
    '## Prioritized Remediation Roadmap',
    'A markdown table with columns: | Priority | Fix | Why it matters | Effort (S/M/L) | Suggested owner |.',
    'Order rows by urgency.',
    '',
    '## What Looks Healthy',
    'Give credit where due so the assessment is balanced and trustworthy.',
    '',
    'Be exhaustive but precise — no filler. Never claim certifications (do not write "SOC 2',
    'certified" or "compliant"); describe readiness and risk instead.',
    '',
    encodeAuditUntrustedData('audit_synthesis_evidence', {
      repo,
      scope: scope || '(application code)',
      repoMap: repoMap || [],
      repoMapTruncated: Boolean(repoMap && repoMap.length >= 500),
      filesScanned,
      findings,
    }),
  ].join('\n')
}

export async function synthesizeReport(input: SynthesisInput): Promise<string> {
  try {
    const raw = await callAuditModel({
      prompt: buildSynthesisPrompt(input),
      maxTokens: 4096,
    })
    return (raw || '').trim()
  } catch {
    return ''
  }
}
