// saas/tests/hubCatalogSource.node.test.ts
//
// Regression coverage for hub console catalog/template source files that are
// edited directly in GitHub during provider catalog updates. These files must
// remain raw TypeScript modules, not pasted replacement instructions.
//
// Run: node --test tests/hubCatalogSource.node.test.ts

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const SOURCE_FILES = [
  'lib/hub/console-catalog.ts',
  'lib/hub/provider-templates.ts',
]

const PASTED_INSTRUCTION_PATTERNS = [
  'PASTE THIS AS REPLACEMENT FOR:',
  'In GitHub: open that file',
]

for (const file of SOURCE_FILES) {
  test(`${file} starts as TypeScript source, not paste instructions`, async () => {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    const firstLine = source.split('\n')[0]

    assert.match(
      firstLine,
      /^(import|export|\/\/)/,
      `${file} must start with TypeScript syntax or a source comment`,
    )

    for (const pattern of PASTED_INSTRUCTION_PATTERNS) {
      assert.equal(source.includes(pattern), false, `${file} must not include ${pattern}`)
    }
  })
}
