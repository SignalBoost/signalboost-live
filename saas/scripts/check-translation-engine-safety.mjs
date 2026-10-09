// Offline contract checks; do not call the paid external translation provider in CI.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const script=fs.readFileSync(path.join(root,'scripts/translate-pending-language-packages.mjs'),'utf8')
assert.match(script,/AZURE_TRANSLATOR_KEY/)
assert.match(script,/AZURE_TRANSLATOR_REGION/)
assert.match(script,/AbortSignal\.timeout/)
assert.match(script,/placeholderTokens\(source\)/)
assert.match(script,/needs_review/)
assert.doesNotMatch(script,/locales\/de\.json|locales\/fr\.json/)
const run=spawnSync(process.execPath,['scripts/translate-pending-language-packages.mjs','nonexistent-packages'],{
  cwd:root,encoding:'utf8',env:{...process.env,AZURE_TRANSLATOR_KEY:'',AZURE_TRANSLATOR_REGION:''}
})
assert.equal(run.status,2,'Missing source package must fail before credentials or external API')
console.log('PASS: draft engine is opt-in, guarded and rejects missing package input offline')
