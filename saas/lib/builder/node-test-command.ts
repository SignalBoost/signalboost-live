// saas/lib/builder/node-test-command.ts
//
// The one Node command Builder uses to run TypeScript proofs. transform-types is a superset of strip-types: it also
// runs TypeScript-only syntax (constructor parameter properties, enums, namespaces) that this repository uses and its
// release gates run with (scripts/vercel-cos-gates.mjs). Production 2026-10-22: a repository repair ran
// `node --experimental-strip-types --test tests/platformObservability.node.test.ts`, which fails before any test on
// a parameter property in agent-v2-dispatcher.ts, "reproduced" that runner error as the defect and rewrote working
// source it could then not verify.

export const BUILDER_NODE_TYPESCRIPT = 'node --experimental-transform-types'

/** `node --experimental-transform-types --test <paths>` */
export function builderNodeTestCommand(paths: string): string {
  return `${BUILDER_NODE_TYPESCRIPT} --test ${paths}`.trim()
}
