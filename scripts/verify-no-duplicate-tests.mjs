import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve('saas/tests')
const TEST_FILE = /(?:^|\.)((?:node\.)?test|spec|e2e)\.(?:[cm]?[jt]sx?)$/i

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else if (entry.isFile() && TEST_FILE.test(entry.name)) files.push(full)
  }
  return files
}

const files = await walk(ROOT)
const byHash = new Map()

for (const file of files) {
  const bytes = await readFile(file)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const rel = path.relative(process.cwd(), file).replaceAll('\\', '/')
  const group = byHash.get(hash) ?? []
  group.push(rel)
  byHash.set(hash, group)
}

const duplicates = [...byHash.values()].filter((group) => group.length > 1)

if (duplicates.length) {
  console.error('Exact duplicate test files detected:')
  for (const group of duplicates) {
    console.error('')
    for (const file of group) console.error(`  - ${file}`)
  }
  console.error('\nConsolidate each group so identical test logic executes only once.')
  process.exit(1)
}

console.log(`Duplicate-test guard passed: ${files.length} test files scanned, no exact duplicates.`)
