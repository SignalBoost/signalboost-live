// saas/app/api/admin/cos-holdout-certification/route.ts
//
// Item 4 (measure actual independence): standing report answering "which skills are actually
// independently proven, and are we tracking toward the 85% held-out target" — as opposed to
// cos-independence, which reports local-vs-cloud provider usage. Owner-only, read-only, one query.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  computeHeldOutCertification,
  DEFAULT_TARGET_INDEPENDENT_PASS_RATE,
  type SkillHoldoutRow,
} from '@/lib/ai/cos/cognitiveHeldOutCertification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json({
      ok: true,
      report: computeHeldOutCertification([], DEFAULT_TARGET_INDEPENDENT_PASS_RATE),
      note: 'cos service db not configured',
    })
  }

  const result = await db.from('cos_cognitive_skills')
    .select('skill_key,subject,status,evaluator_approved,understanding_approved,holdout_attempts,holdout_successes,distinct_holdout_variants,quarantined_at,last_validated_at')
    .order('subject', { ascending: true })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  const rows: SkillHoldoutRow[] = (result.data ?? []).map((row: any) => ({
    skillKey: String(row.skill_key),
    subject: String(row.subject),
    status: String(row.status),
    evaluatorApproved: Boolean(row.evaluator_approved),
    understandingApproved: Boolean(row.understanding_approved),
    holdoutAttempts: Number(row.holdout_attempts || 0),
    holdoutSuccesses: Number(row.holdout_successes || 0),
    distinctHoldoutVariants: Number(row.distinct_holdout_variants || 0),
    quarantinedAt: row.quarantined_at ?? null,
    lastValidatedAt: row.last_validated_at ?? null,
  }))

  const report = computeHeldOutCertification(rows)

  return NextResponse.json({
    ok: true,
    report,
    verdict: report.meetsTarget
      ? `CERTIFIED — ${report.skillsCertified}/${report.totalSkills} skills independently proven, overall holdout pass rate ${(report.overallPassRate * 100).toFixed(1)}% at/above the ${(report.targetPassRate * 100).toFixed(0)}% target.`
      : `NOT YET — ${report.skillsCertified}/${report.totalSkills} skills certified, ${report.skillsWithHoldoutCoverage}/${report.totalSkills} have any holdout coverage at all. This is observed runtime evidence, not a frozen benchmark run.`,
  })
}
