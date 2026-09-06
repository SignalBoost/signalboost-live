import { createHash } from 'node:crypto'
import { builderTaskContract } from './task-contract.ts'

export type BuilderProposal = {
  id: string
  sourceJobId: string
  objective: string
  fingerprint: string
  expiresAt: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isBuilderProposalApproval = (text: string) => /^\s*(?:go|go ahead|do it|proceed|yes,?\s*(?:go ahead|do it)|implement (?:it|that))\s*[.!]?\s*$/i.test(text)
export const wantsBuilderProposal = (text: string) => /\b(?:next|recommend|suggest|improve|improvement)\b/i.test(text)

export function proposalObjective(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length < 20 || text.length > 4000 || !/^(?:add|update|extend|improve|refactor|fix)\b/i.test(text)) return null
  // This handoff authorizes isolated project edits/tests only. Other action lanes
  // must receive their own explicit request and normal authorization checks.
  if (/\b(?:deploy|publish|merge|push|production|credentials?|secrets?|billing|purchase|payment|delete|drop|truncate)\b|https?:\/\//i.test(text)) return null
  const explicit = builderTaskContract(text).commands
  const quoted = [...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1].trim())
    .filter(command => /^(?:node|python3?|npm|pnpm|yarn|bun)\s+\S/.test(command))
  const commands = [...new Set([...explicit, ...quoted])]
  if (!commands.length || commands.length > 8 || commands.some(command => command.length > 2000)) return null
  const missing = commands.filter(command => !explicit.includes(command))
  const normalized = missing.length ? `${text}\nRun:\n${missing.join('\n')}` : text
  return normalized.length <= 4000 ? normalized : null
}

export function workspaceFingerprint(files: readonly { path: string; content: string }[]): string {
  return createHash('sha256').update(JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path))
    .map(file => [file.path, file.content]))).digest('hex')
}

export function readBuilderProposal(value: unknown): BuilderProposal | null {
  if (!value || typeof value !== 'object') return null
  const p = value as BuilderProposal
  return UUID.test(p.id) && UUID.test(p.sourceJobId) && proposalObjective(p.objective) === p.objective
    && /^[a-f0-9]{64}$/.test(p.fingerprint) && Number.isFinite(p.expiresAt) ? p : null
}

export function proposalMatches(p: BuilderProposal, input: { sourceJobId: string; fingerprint: string; priorAnswer: string; now: number }): boolean {
  return p.sourceJobId === input.sourceJobId && p.fingerprint === input.fingerprint
    && p.expiresAt > input.now && input.priorAnswer.includes(p.objective)
}
