import { createHash } from 'node:crypto'
import type { CodeRepairPatchGenerator } from './patch-contracts.ts'
import type { CodeRepairModelProvider, CodeRepairPatchGenerationInput } from './provider-contracts.ts'

function boundedFileContext(input: CodeRepairPatchGenerationInput): string {
  const allowed = new Set(input.plan.filesAllowedToModify)
  return Object.entries(input.fileContents)
    .filter(([path]) => allowed.has(path))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => `FILE ${path}\n${content.slice(0, 20_000)}`)
    .join('\n\n')
}

function extractUnifiedDiff(content: string): string {
  const fenced = content.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = (fenced ?? content).trim()
  const start = candidate.indexOf('diff --git ')
  if (start < 0) throw new Error('Patch provider did not return a unified diff.')
  return candidate.slice(start).trimEnd() + '\n'
}

export class ProviderBackedCodeRepairPatchGenerator implements CodeRepairPatchGenerator {
  constructor(
    private readonly provider: CodeRepairModelProvider,
    private readonly maximumOutputCharacters = 60_000,
  ) {}

  async generate(input: CodeRepairPatchGenerationInput): Promise<string> {
    if (!input.plan.requiresHumanApproval || input.plan.patchGenerationAllowed) {
      throw new Error('Provider patch generation requires an approval-only repair plan.')
    }
    const requestId = createHash('sha256')
      .update(`${input.plan.planId}:${input.baseCommitSha}`)
      .digest('hex')
      .slice(0, 24)
    const response = await this.provider.complete({
      requestId: `patch:${requestId}`,
      systemInstruction: 'Return only one unified diff. Modify only explicitly allowed existing files. Do not include prose, secrets, lockfiles, environment files, workflows, generated files, or new files.',
      userInstruction: [
        `Problem: ${input.plan.problem}`,
        `Rationale: ${input.plan.rationale}`,
        `Allowed files: ${input.plan.filesAllowedToModify.join(', ')}`,
        `Validation targets: ${input.plan.testsToRun.join(', ')}`,
        boundedFileContext(input),
      ].join('\n\n'),
      maximumOutputCharacters: this.maximumOutputCharacters,
    })
    if (response.finishReason !== 'stop') throw new Error(`Patch provider did not complete successfully: ${response.finishReason}.`)
    if (response.content.length > this.maximumOutputCharacters) throw new Error('Patch provider output exceeded the configured limit.')
    return extractUnifiedDiff(response.content)
  }
}
