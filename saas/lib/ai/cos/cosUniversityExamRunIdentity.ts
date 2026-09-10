export type CosUniversityExamRunIdentityTarget =
  | Readonly<{ kind: 'subject'; subjectId: string }>
  | Readonly<{ kind: 'language'; language: string; dimension: string }>

function targetKey(target: CosUniversityExamRunIdentityTarget): string {
  return target.kind === 'subject'
    ? `subject:${target.subjectId}`
    : `language:${target.language}:${target.dimension}`
}

export function cosUniversityExamRunKey(input: {
  profile: string
  agentId: string
  target: CosUniversityExamRunIdentityTarget
  now: Date
  remediationAttemptId?: string
}): string {
  const attempt = input.remediationAttemptId
    ? `remediation:${input.remediationAttemptId}`
    : `scheduled:${input.now.toISOString().slice(0, 10)}`
  return `${input.profile}:${input.agentId}:${attempt}:${targetKey(input.target)}`
}
