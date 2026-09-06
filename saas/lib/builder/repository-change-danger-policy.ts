// saas/lib/builder/repository-change-danger-policy.ts
//
// Classification is default-deny, matching lib/supervisor/executors/api-danger-policy.ts:
// financial and credential_security changes never auto-merge, regardless of test evidence.
// A repair that touches billing logic or an auth/secrets path can pass every test it was
// given and still be wrong in a way only a person reviewing intent would catch — proof
// against the tests supplied is not proof against the business or security consequence.
import type { BuilderFile } from './contracts.ts'

export type RepositoryChangeDangerCategory = 'financial' | 'credential_security'

// Same words as the Supervisor's DangerCategory patterns. One vocabulary for "this touches
// money or access control" across every portable that has to make this call.
const FINANCIAL_PATH = /(stripe|billing|invoice|charge|payment|payout|refund|price|pricing|subscription|budget|spend|checkout|wire|paypal|bank|ach)/i
const CREDENTIAL_PATH = /(key|apikey|api-key|token|secret|credential|password|passwd|oauth|auth|permission|role|grant|scope|iam|rotat|cert|certificate|private-?key|administrator)/i
const FINANCIAL_CONTENT = /(?:stripe|charge|refund|payment_intent|invoice|checkout\.session|payout)/i
const CREDENTIAL_CONTENT = /(?:api[_-]?key|secret|password|access[_-]?token|refresh[_-]?token|private[_-]?key|service[_-]?account|oauth|jwt)/i

/**
 * Credential/secrets risk is checked first: a path or diff that reads as both financial and
 * credential-bearing (e.g. a Stripe webhook secret) is the more dangerous of the two categories.
 */
export function repositoryChangeDangerCategory(
  files: readonly Pick<BuilderFile, 'path' | 'content'>[],
  patch: string,
): RepositoryChangeDangerCategory | null {
  const paths = files.map(file => String(file.path || ''))
  const diffText = String(patch || '')
  const addedLines = diffText
    .split(/\r?\n/)
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .join('\n')

  if (paths.some(path => CREDENTIAL_PATH.test(path)) || CREDENTIAL_CONTENT.test(addedLines)) {
    return 'credential_security'
  }
  if (paths.some(path => FINANCIAL_PATH.test(path)) || FINANCIAL_CONTENT.test(addedLines)) {
    return 'financial'
  }
  return null
}

export function repositoryChangeDangerReason(category: RepositoryChangeDangerCategory): string {
  return category === 'credential_security'
    ? 'The change touches an authentication, credential, or secrets-handling path. This category never auto-merges, regardless of test evidence.'
    : 'The change touches billing, payment, or pricing logic. This category never auto-merges, regardless of test evidence.'
}
