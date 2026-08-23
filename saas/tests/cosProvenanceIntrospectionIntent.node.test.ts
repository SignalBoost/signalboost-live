// saas/lib/ai/cos/provenanceIntrospection.ts
//
// Compatibility surface for provenance-introspection detection.
//
// `cosOrchestrationEnterprise` and the cos-primary routes import `isProvenanceIntrospection` from
// this path; the recognition logic itself lives in provenanceIntrospectionIntent.ts. This file
// exists only to keep that import path stable, so the classifier can be rewritten without touching
// every caller.
//
// It previously re-exported a symbol (`isProvenanceIntrospectionIntent`) that the intent module
// does not define, which failed the Turbopack build on 2026-08-23. The intent module exports
// exactly one predicate — `asksWhereTheAnswerCameFrom` — and this shim maps the legacy name onto
// it. Keep it that way: one predicate, two names, no drift.

import { asksWhereTheAnswerCameFrom } from './provenanceIntrospectionIntent.ts'

export { asksWhereTheAnswerCameFrom }

/** True only for a request to reveal the recorded origin of a prior answer. */
export function isProvenanceIntrospection(input: string): boolean {
  return asksWhereTheAnswerCameFrom(input)
}
