import { createHash } from 'node:crypto'
import type { CodeRepairPlan } from './diagnosis-contracts.ts'
import type { CodeRepairFilePatch, CodeRepairPatchPolicy, CodeRepairPatchProposal } from './patch-contracts.ts'

export const DEFAULT_CODE_REPAIR_PATCH_POLICY: Readonly<CodeRepairPatchPolicy> = Object.freeze({
  maximumDiffCharacters: 128 * 1024,
  maximumFiles: 12,
  maximumChangedLines: 1_000,
  allowNewFiles: false,
  allowDeletedFiles: false,
  prohibitedPathPatterns: Object.freeze([/^\.github\//, /^\.env(?:\.|$)/, /(?:^|\/)package-lock\.json$/, /(?:^|\/)secrets?(?:\/|$)/i]),
})

function normalizedPath(value: string): string {
  const path = value.replace(/^[ab]\//, '').trim()
  if (!path || path === '/dev/null' || path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error('Patch contains an unsafe path.')
  return path
}

export function parseUnifiedDiff(unifiedDiff: string): readonly CodeRepairFilePatch[] {
  const lines = unifiedDiff.replace(/\r\n/g, '\n').split('\n')
  const files: CodeRepairFilePatch[] = []
  let current: { oldPath: string; newPath: string; lines: string[]; additions: number; deletions: number; hunks: number } | undefined
  const flush = () => {
    if (!current) return
    const path = normalizedPath(current.newPath === '/dev/null' ? current.oldPath : current.newPath)
    files.push(Object.freeze({ path, previousPath: current.oldPath === '/dev/null' ? null : normalizedPath(current.oldPath), additions: current.additions, deletions: current.deletions, hunks: current.hunks, diff: current.lines.join('\n') }))
    current = undefined
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.startsWith('--- ')) {
      flush()
      const next = lines[index + 1]
      if (!next?.startsWith('+++ ')) throw new Error('Patch file header is incomplete.')
      current = { oldPath: line.slice(4).split('\t')[0], newPath: next.slice(4).split('\t')[0], lines: [line, next], additions: 0, deletions: 0, hunks: 0 }
      index++
      continue
    }
    if (!current) {
      if (line.trim() && !line.startsWith('diff --git ') && !line.startsWith('index ')) throw new Error('Patch contains content outside a file diff.')
      continue
    }
    current.lines.push(line)
    if (line.startsWith('@@ ')) current.hunks++
    else if (line.startsWith('+') && !line.startsWith('+++')) current.additions++
    else if (line.startsWith('-') && !line.startsWith('---')) current.deletions++
  }
  flush()
  if (!files.length) throw new Error('Patch does not contain any file changes.')
  if (files.some(file => file.hunks === 0)) throw new Error('Every patched file requires at least one hunk.')
  return Object.freeze(files)
}

export function createCodeRepairPatchProposal(plan: CodeRepairPlan, baseCommitSha: string, unifiedDiff: string, overrides: Partial<CodeRepairPatchPolicy> = {}): CodeRepairPatchProposal {
  const policy = { ...DEFAULT_CODE_REPAIR_PATCH_POLICY, ...overrides }
  if (!baseCommitSha.trim()) throw new Error('Patch proposal requires a base commit SHA.')
  if (unifiedDiff.length > policy.maximumDiffCharacters) throw new Error('Patch exceeds the maximum diff size.')
  const files = parseUnifiedDiff(unifiedDiff)
  if (files.length > policy.maximumFiles) throw new Error('Patch exceeds the maximum file count.')
  const allowed = new Set(plan.filesAllowedToModify)
  let totalAdditions = 0, totalDeletions = 0
  for (const file of files) {
    if (!allowed.has(file.path)) throw new Error(`Patch path is outside the approved scope: ${file.path}`)
    if (policy.prohibitedPathPatterns.some(pattern => pattern.test(file.path))) throw new Error(`Patch path is prohibited: ${file.path}`)
    if (!policy.allowNewFiles && file.previousPath === null) throw new Error('New files are not allowed by patch policy.')
    if (!policy.allowDeletedFiles && file.diff.includes('+++ /dev/null')) throw new Error('Deleted files are not allowed by patch policy.')
    totalAdditions += file.additions; totalDeletions += file.deletions
  }
  if (totalAdditions + totalDeletions > policy.maximumChangedLines) throw new Error('Patch exceeds the maximum changed-line count.')
  const fingerprint = createHash('sha256').update(JSON.stringify({ planId: plan.planId, baseCommitSha, unifiedDiff })).digest('hex')
  return Object.freeze({ proposalId: `patch-proposal:${fingerprint.slice(0, 20)}`, planId: plan.planId, incidentId: plan.incidentId, baseCommitSha, unifiedDiff, files, totalAdditions, totalDeletions, requiresHumanApproval: true, applicationAllowed: false, mergeAllowed: false })
}
