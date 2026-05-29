import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
])
const conflictMarkerPrefixes = ['<'.repeat(7), '='.repeat(7), '>'.repeat(7)]
const conflictMarkerPattern = new RegExp(`^(${conflictMarkerPrefixes.join('|')})(?:\\s|$)`, 'm')
const i18nDirectory = path.join(root, 'public', 'i18n')

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue

    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      yield* walk(entryPath)
    } else if (entry.isFile()) {
      yield entryPath
    }
  }
}

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix.slice(0, -1)] : []
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = `${prefix}${key}.`
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      return flattenKeys(child, nextPrefix)
    }
    return [nextPrefix.slice(0, -1)]
  })
}

async function validateConflictMarkers() {
  const filesWithMarkers = []

  for await (const filePath of walk(root)) {
    const buffer = await readFile(filePath)
    if (buffer.includes(0)) continue

    const content = buffer.toString('utf8')
    if (conflictMarkerPattern.test(content)) {
      filesWithMarkers.push(path.relative(root, filePath))
    }
  }

  if (filesWithMarkers.length > 0) {
    throw new Error(`Conflict markers remain in:\n${filesWithMarkers.join('\n')}`)
  }

  console.log('✓ No merge conflict markers found')
}

async function validateLocales() {
  await stat(i18nDirectory)
  const localeFiles = (await readdir(i18nDirectory))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()

  if (localeFiles.length === 0) {
    throw new Error('No locale JSON files found')
  }

  const keySets = new Map()

  for (const fileName of localeFiles) {
    const filePath = path.join(i18nDirectory, fileName)
    const locale = JSON.parse(await readFile(filePath, 'utf8'))
    keySets.set(fileName, new Set(flattenKeys(locale)))
  }

  const allKeys = new Set([...keySets.values()].flatMap((keySet) => [...keySet]))
  const failures = []

  for (const [fileName, keySet] of keySets) {
    const missingKeys = [...allKeys].filter((key) => !keySet.has(key))
    if (missingKeys.length > 0) {
      failures.push(`${fileName} is missing ${missingKeys.length} keys:\n${missingKeys.join('\n')}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n\n'))
  }

  console.log(`✓ Locale JSON is valid and key-complete (${localeFiles.join(', ')})`)
}

await validateConflictMarkers()
await validateLocales()
