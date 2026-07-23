import { createHash } from 'node:crypto'
import type { CodeRepairDiagnosis, CodeRepairPlan, CodeRepairPlanStep } from './diagnosis-contracts.ts'

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter(Boolean))].sort())
}

function testsFrom(files: readonly string[]): readonly string[] {
  const explicit = files.filter(file => /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/.test(file))
  return unique(explicit.length ? explicit : ['npm run typecheck', 'npm run build'])
}

export function createCodeRepairPlan(diagnosis: CodeRepairDiagnosis): CodeRepairPlan {
  const filesToInspect = unique([
    ...diagnosis.primaryCause.suspectedFiles,
    ...diagnosis.context.selectedContext.files.map(file => file.relativePath),
  ]).slice(0, 20)
  const filesAllowedToModify = unique(diagnosis.context.failure.changedFiles).slice(0, 12)
  const testsToRun = testsFrom(filesToInspect)
  const rawSteps: CodeRepairPlanStep[] = [
    { id: 'inspect-evidence', action: 'inspect', description: 'Read the selected files and verify the diagnosis against the exact failing contracts and tests.', files: filesToInspect, required: true },
    { id: 'request-approval', action: 'stop', description: 'Stop for human approval before any patch is generated or repository file is modified.', files: [], required: true },
    { id: 'propose-bounded-patch', action: 'modify', description: 'Future slice: propose a unified diff limited to the approved file scope.', files: filesAllowedToModify, required: true },
    { id: 'run-targeted-validation', action: 'test', description: 'Future slice: run targeted tests, typecheck, build, and policy checks in an isolated workspace.', files: testsToRun, required: true },
    { id: 'independent-review', action: 'review', description: 'Future slice: independently review the proposed repair and validation evidence.', files: filesToInspect, required: true },
  ]
  const steps: readonly CodeRepairPlanStep[] = Object.freeze(rawSteps.map(step => Object.freeze({ ...step, files: Object.freeze([...step.files]) })))
  const diagnosisFingerprint = createHash('sha256').update(JSON.stringify({ incidentId: diagnosis.incidentId, causeId: diagnosis.primaryCause.id, filesToInspect, filesAllowedToModify, testsToRun })).digest('hex')
  return Object.freeze({
    planId: `repair-plan:${diagnosisFingerprint.slice(0, 20)}`,
    incidentId: diagnosis.incidentId,
    diagnosisFingerprint,
    problem: diagnosis.primaryCause.title,
    rationale: diagnosis.primaryCause.explanation,
    riskLevel: diagnosis.context.riskLevel,
    filesToInspect,
    filesAllowedToModify,
    testsToRun,
    steps,
    requiresHumanApproval: true,
    patchGenerationAllowed: false,
    patchApplicationAllowed: false,
    mergeAllowed: false,
  })
}
