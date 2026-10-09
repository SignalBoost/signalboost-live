import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
test('navbar derives selectable languages from production allowlist, and disables all six pending languages',()=>{
 const source=fs.readFileSync(path.join(root,'components/PremiumCustomerNavbarV2.tsx'),'utf8')
 assert.match(source,/const\s+LANGUAGES\s*=\s*SUPPORTED_LANGUAGES/)
 assert.match(source,/PENDING_LANGUAGES\.map\(code => <option[^>]+disabled/)
 assert.match(source,/PENDING_LANGUAGE_NAMES\[code\]/)
 assert.doesNotMatch(source,/const\s+LANGUAGES\s*=\s*\['en', 'pt', 'es', 'pl', 'ru'\]/)
})
