import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
test('navbar lists all eleven languages and routes six new ones to published public pages',()=>{
 const source=fs.readFileSync(path.join(root,'components/PremiumCustomerNavbarV2.tsx'),'utf8')
 assert.match(source,/const\s+LANGUAGES\s*=\s*SUPPORTED_LANGUAGES/)
 assert.match(source,/PENDING_LANGUAGES\.map\(code => <option/)
 assert.doesNotMatch(source,/PENDING_LANGUAGES\.map\(code => <option[^>]*disabled/)
 assert.match(source,/PENDING_LANGUAGE_NAMES\[code\]/)
 assert.match(source,/router\.push\(\x60\/\$\{code\}\/\x60\)/)
 assert.match(source,/setLang\(code\)/)
})
