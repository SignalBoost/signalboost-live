// saas/scripts/verify-marketing-sales-locale-parity.mjs
// CI guard: the Marketing-Sales module's five language dictionaries must have
// identical keys, and no value may be empty. Fails the build on any English
// leak (a key present in en but missing/blank elsewhere). Run from saas/.
//
// Wire into CI alongside verify-cos-locale-parity.mjs:
//   node scripts/verify-marketing-sales-locale-parity.mjs
import { build } from 'esbuild'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const out = mkdtempSync(join(tmpdir(), 'ms-parity-'))
await build({
  entryPoints: ['marketing-sales-core/i18n/dictionaries.ts'],
  bundle: true, format: 'esm', outfile: join(out, 'd.mjs'), logLevel: 'silent',
})
const { DICTIONARIES } = await import(join(out, 'd.mjs'))

const langs = Object.keys(DICTIONARIES)
const base = Object.keys(DICTIONARIES.en).sort()
let bad = false

for (const l of langs) {
  const keys = Object.keys(DICTIONARIES[l]).sort()
  const missing = base.filter((k) => !keys.includes(k))
  const extra = keys.filter((k) => !base.includes(k))
  if (missing.length) { bad = true; console.error(`[${l}] MISSING keys: ${missing.join(', ')}`) }
  if (extra.length)   { bad = true; console.error(`[${l}] EXTRA keys: ${extra.join(', ')}`) }
  for (const k of keys) {
    if (!String(DICTIONARIES[l][k] || '').trim()) { bad = true; console.error(`[${l}] EMPTY value: ${k}`) }
  }
}

if (bad) { console.error('\n❌ Marketing-Sales locale parity FAILED'); process.exit(1) }
console.log(`✅ Marketing-Sales locale parity OK — ${langs.length} languages, ${base.length} keys each`)
