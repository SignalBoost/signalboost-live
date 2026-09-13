import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const saasRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(saasRoot, '..')
const testsRoot = path.join(saasRoot, 'tests')
const destinationRoot = path.join(testsRoot, 'cos', 'university')
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const ignoredDirectories = new Set(['.git', 'node_modules', '.next', '.vercel', 'coverage', 'dist', 'build'])

const normalize = value => path.resolve(value)
const unix = value => value.split(path.sep).join('/')

const targets = fs.readdirSync(testsRoot, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.startsWith('cosUniversity'))
  .map(entry => entry.name)
  .sort()

if (targets.length === 0) {
  throw new Error('No root-level saas/tests/cosUniversity* files were found; refusing a no-op migration.')
}

fs.mkdirSync(destinationRoot, { recursive: true })

const moveMap = new Map(targets.map(name => [
  normalize(path.join(testsRoot, name)),
  normalize(path.join(destinationRoot, name)),
]))

function walk(root) {
  const files = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) stack.push(path.join(dir, entry.name))
        continue
      }
      if (entry.isFile()) files.push(path.join(dir, entry.name))
    }
  }
  return files
}

function mappedTarget(oldAbsolute) {
  const exact = moveMap.get(normalize(oldAbsolute))
  if (exact) return exact

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']
  for (const extension of extensions) {
    const oldWithExtension = normalize(`${oldAbsolute}${extension}`)
    const moved = moveMap.get(oldWithExtension)
    if (moved) return moved.slice(0, -extension.length)
  }
  return normalize(oldAbsolute)
}

function splitSuffix(specifier) {
  const match = specifier.match(/^([^?#]*)([?#].*)?$/)
  return { pathname: match?.[1] ?? specifier, suffix: match?.[2] ?? '' }
}

function rewriteRelativeSpecifier(specifier, oldSourcePath, newSourcePath) {
  const { pathname, suffix } = splitSuffix(specifier)
  if (!(pathname === '.' || pathname === '..' || pathname.startsWith('./') || pathname.startsWith('../'))) {
    return specifier
  }

  const oldTarget = path.resolve(path.dirname(oldSourcePath), pathname)
  const newTarget = mappedTarget(oldTarget)
  let relative = unix(path.relative(path.dirname(newSourcePath), newTarget))
  if (!relative.startsWith('.')) relative = `./${relative}`
  if (relative === '') relative = '.'
  return `${relative}${suffix}`
}

function rewriteCode(content, oldSourcePath, newSourcePath) {
  const rewrite = specifier => rewriteRelativeSpecifier(specifier, oldSourcePath, newSourcePath)
  let next = content

  // Static imports / exports: import x from '../x', export { x } from '../x'.
  next = next.replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_m, lead, quote, specifier) =>
    `${lead}${quote}${rewrite(specifier)}${quote}`)

  // Side-effect imports: import './x'.
  next = next.replace(/(\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_m, lead, quote, specifier) =>
    `${lead}${quote}${rewrite(specifier)}${quote}`)

  // Dynamic imports and CommonJS requires.
  next = next.replace(/(\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*\))/g, (_m, lead, quote, specifier, tail) =>
    `${lead}${quote}${rewrite(specifier)}${quote}${tail}`)
  next = next.replace(/(\brequire\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*\))/g, (_m, lead, quote, specifier, tail) =>
    `${lead}${quote}${rewrite(specifier)}${quote}${tail}`)

  // File-relative URLs used by fs/readFileSync.
  next = next.replace(/(\bnew\s+URL\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*,\s*import\.meta\.url\s*\))/g,
    (_m, lead, quote, specifier, tail) => `${lead}${quote}${rewrite(specifier)}${quote}${tail}`)

  // Common test roots based directly on the file directory. Moving two levels deeper must
  // preserve the absolute target these expressions resolved to before the migration.
  next = next.replace(/((?:path\.)?(?:resolve|join)\(\s*(?:import\.meta\.dirname|__dirname)\s*,\s*)(['"])(\.{1,2}(?:\/[^'"]*)?)\2/g,
    (_m, lead, quote, specifier) => `${lead}${quote}${rewrite(specifier)}${quote}`)

  return next
}

const allFilesBeforeMove = walk(repoRoot)
for (const oldPath of allFilesBeforeMove) {
  const extension = path.extname(oldPath)
  if (!codeExtensions.has(extension)) continue

  const newPath = moveMap.get(normalize(oldPath)) ?? oldPath
  const source = fs.readFileSync(oldPath, 'utf8')
  const rewritten = rewriteCode(source, oldPath, newPath)

  if (newPath !== oldPath) {
    fs.mkdirSync(path.dirname(newPath), { recursive: true })
    fs.writeFileSync(newPath, rewritten)
  } else if (rewritten !== source) {
    fs.writeFileSync(oldPath, rewritten)
  }
}

// Copy any non-code university helper files, then remove every old root-level source.
for (const name of targets) {
  const oldPath = path.join(testsRoot, name)
  const newPath = path.join(destinationRoot, name)
  if (!fs.existsSync(newPath)) {
    fs.copyFileSync(oldPath, newPath)
  }
}
for (const name of targets) {
  fs.unlinkSync(path.join(testsRoot, name))
}

// Update explicit test-path references in gates, workflows, docs, fixtures and scripts.
// Only write files that contain the old path; binary files are ignored via NUL detection.
for (const file of walk(repoRoot)) {
  const buffer = fs.readFileSync(file)
  if (buffer.includes(0)) continue
  const source = buffer.toString('utf8')
  if (!source.includes('tests/cosUniversity')) continue

  const rewritten = source
    .replaceAll('saas/tests/cosUniversity', 'saas/tests/cos/university/cosUniversity')
    .replaceAll('tests/cosUniversity', 'tests/cos/university/cosUniversity')

  if (rewritten !== source) fs.writeFileSync(file, rewritten)
}

const leftovers = fs.readdirSync(testsRoot, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.startsWith('cosUniversity'))
  .map(entry => entry.name)
if (leftovers.length) {
  throw new Error(`Root-level university files remain: ${leftovers.join(', ')}`)
}

const staleReferences = []
for (const file of walk(repoRoot)) {
  const buffer = fs.readFileSync(file)
  if (buffer.includes(0)) continue
  const source = buffer.toString('utf8')
  if (source.includes('tests/cosUniversity')) staleReferences.push(unix(path.relative(repoRoot, file)))
}
if (staleReferences.length) {
  throw new Error(`Stale tests/cosUniversity references remain in: ${staleReferences.join(', ')}`)
}

console.log(`[university-layout] moved ${targets.length} files into saas/tests/cos/university`)
