import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../app/', import.meta.url))
const CONFIG_EXPORTS = new Set([
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
])

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') files.push(path)
  }
  return files
}

function reexportedConfigNames(source) {
  const names = new Set()
  const exportFrom = /export\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g
  for (const match of source.matchAll(exportFrom)) {
    for (const raw of match[1].split(',')) {
      const imported = raw.trim().split(/\s+as\s+/i)[0]?.trim()
      if (imported && CONFIG_EXPORTS.has(imported)) names.add(imported)
    }
  }
  return [...names].sort()
}

const failures = []
for (const file of await walk(root)) {
  const source = await readFile(file, 'utf8')
  const names = reexportedConfigNames(source)
  if (names.length) failures.push({ file: relative(root, file), names })
}

if (failures.length) {
  console.error('Next.js route configuration fields must be declared as literal exports in each route file; they cannot be re-exported.')
  for (const failure of failures) {
    console.error(`- app/${failure.file}: re-exports ${failure.names.join(', ')}`)
  }
  console.error("Fix: declare values such as `export const dynamic = 'force-dynamic'` directly in the route, and re-export only HTTP handlers.")
  process.exit(1)
}

console.log('Next.js route config guard passed.')

// This script is already part of every prebuild. Chain the COS architectural guard here
// so a Portable cannot reintroduce a raw provider boundary without failing the build.
await import('./check-cos-blueprint.mjs')
