import { COS_UNIVERSITY_EXAM_PROFILE, type CosUniversityExamTarget } from './cosUniversityIndependentExam.ts'

function targetKey(target: CosUniversityExamTarget): string {
  return target.kind === 'subject'
    ? `subject:${target.subjectId}`
    : `language:${target.language}:${target.dimension}`
}

export function cosUniversityIndependentExamRunKey(input: {
  agentId: string
  target: CosUniversityExamTarget
  now: Date
  readyStudyPlan?: { id: string; attemptCount: number } | null
}): string {
  const scope = input.readyStudyPlan
    ? `remediation:${input.readyStudyPlan.id}:attempt:${Math.max(1, Math.floor(input.readyStudyPlan.attemptCount))}`
    : input.now.toISOString().slice(0, 10)
  return `${COS_UNIVERSITY_EXAM_PROFILE}:${input.agentId}:${scope}:${targetKey(input.target)}`
}
