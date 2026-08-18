//
// The check that would have caught it: DECLARED study subjects vs what the durable corpus actually
// contains. Owner-only, read-only, one query. Answers "is COS learning the curriculum" without
// anyone having to read code or trust a status claim.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  computeCurriculumCoverage,
  type DeclaredStudySubject,
  type RetainedSubjectRow,
} from '@/lib/ai/cos/curriculumCoverage'
import { curriculumStudyItems } from '@/lib/ai/cos/cosCurriculumPriority'
import { recurringTechnologyCurriculum } from '@/lib/cos/dailyAutonomousLearning'
import { roboticsPhysicsCurriculum } from '@/lib/cos/roboticsPhysicsCurriculum'
import { FOUNDATIONAL_KNOWLEDGE_DOMAINS } from '@/lib/cos-core/layers/learning/foundational'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORPUS_ROW_LIMIT = 5000

/**
 * Everything COS has been told to study, from every list that feeds the daily cycle. If a source of
 * study subjects is added later and not registered here, it shows up as an undeclared corpus
 * subject rather than being silently missed.
 */
function declaredStudySubjects(): DeclaredStudySubject[] {
  const declared: DeclaredStudySubject[] = []
  for (const item of curriculumStudyItems()) {
    declared.push({ subject: item.topic, declaredIn: `curriculum_track:${item.track.id}` })
  }
  for (const gap of recurringTechnologyCurriculum()) {
    declared.push({ subject: gap.subject, declaredIn: 'recurring_technology_curriculum' })
  }
  for (const gap of roboticsPhysicsCurriculum()) {
    declared.push({ subject: gap.subject, declaredIn: 'robotics_physics_curriculum' })
  }
  for (const domain of FOUNDATIONAL_KNOWLEDGE_DOMAINS) {
    declared.push({ subject: domain.subject, declaredIn: 'foundational_domain' })
  }
  return declared
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const declared = declaredStudySubjects()
  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json({
      ok: true,
      report: computeCurriculumCoverage(declared, []),
      verdict: 'UNKNOWN — cos service database is not configured, so retained evidence cannot be read.',
    })
  }

  const result = await db.from('cos_continuous_learning')
    .select('subject,source_kind,observed_at,created_at')
    .order('observed_at', { ascending: false })
    .limit(CORPUS_ROW_LIMIT)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  const retained: RetainedSubjectRow[] = (result.data ?? []) as RetainedSubjectRow[]
  const report = computeCurriculumCoverage(declared, retained)

  const verdict = report.neverStudied > 0
    ? `INCOMPLETE — ${report.neverStudied} of ${report.declaredSubjects} declared subjects have never been acquired even once. Those topics are declared, not learned.`
    : report.learned === report.declaredSubjects
      ? `COVERED — all ${report.declaredSubjects} declared subjects have current evidence. Coverage is not competence: see cos-holdout-certification for whether COS can actually use it.`
      : `PARTIAL — ${report.learned}/${report.declaredSubjects} subjects have current evidence, ${report.thin} thin, ${report.stale} stale.`

  return NextResponse.json({
    ok: true,
    report,
    verdict,
    note: 'Coverage measures whether declared study subjects produced retained evidence. It does not measure answer quality or independence.',
  })
}
