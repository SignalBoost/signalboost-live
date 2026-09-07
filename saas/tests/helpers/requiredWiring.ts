// saas/tests/helpers/requiredWiring.ts

/**
 * Why this exists.
 *
 * Several gates assert that a specific line of wiring is present in a route file.
 * They are precise — they catch a whole-file paste that silently reverts someone
 * else's work — but when one fails, `assert.match` reports only "the input did not
 * match the regular expression /.../" and then dumps the entire file. That tells a
 * repair agent THAT something is missing. It does not say what to write, which file
 * to write it in, where in the file it belongs, or that a new import is needed.
 *
 * Builder repairs from the failure text. Given a symptom with no path to the cause,
 * it cannot act, and a human ends up hand-applying a two-line change. That happened
 * twice on `app/api/visuals/route.ts` alone.
 *
 * `requireWiring` keeps the same precision and makes the failure self-repairing: the
 * message names the file, the exact line to insert, the anchor line to insert it
 * after, and any import the line depends on.
 */

export type WiringRequirement = {
  /** Repository-relative path of the file that must contain the wiring. */
  file: string
  /** Human description of what this wiring accomplishes. */
  purpose: string
  /** Pattern that must be present. */
  expect: RegExp
  /** The exact source line to insert when `expect` does not match. */
  insert: string
  /** An existing line the insertion goes immediately after. */
  after?: string
  /** An import line that must also be present for `insert` to compile. */
  requiresImport?: string
}

function repairInstruction(source: string, requirement: WiringRequirement): string {
  const missingImport = requirement.requiresImport && !source.includes(requirement.requiresImport)
    ? requirement.requiresImport
    : null
  return [
    `MISSING WIRING in ${requirement.file}`,
    `Purpose: ${requirement.purpose}`,
    '',
    'TO REPAIR, edit that file and make exactly these changes:',
    missingImport ? `1. Add this import near the other imports at the top:\n${missingImport}` : '',
    `${missingImport ? '2' : '1'}. Insert this line${requirement.after ? ' immediately AFTER the line shown below' : ''}:\n${requirement.insert}`,
    requirement.after ? `   ...which must go directly after:\n${requirement.after}` : '',
    '',
    'Change nothing else in the file. Do not replace the file wholesale — other work lives in it.',
  ].filter(Boolean).join('\n')
}

/** Asserts the wiring is present, failing with an actionable repair instruction. */
export function requireWiring(source: string, requirement: WiringRequirement): void {
  if (requirement.expect.test(source)) return
  throw new Error(repairInstruction(source, requirement))
}

export async function readRepoFile(path: string): Promise<string> {
  const fs = await import('node:fs/promises')
  return fs.readFile(path, 'utf8')
}
