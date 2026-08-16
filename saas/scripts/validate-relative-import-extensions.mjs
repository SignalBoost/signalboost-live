// saas/scripts/validate-relative-import-extensions.mjs
//
// Node's ESM resolver requires explicit extensions even though Next.js, Turbopack, and the
// TypeScript bundler resolver accept extensionless relative imports. Keep directly runnable
// TypeScript sources compatible with both environments by rejecting resolvable relative
// module specifiers that omit their .ts or .tsx extension.
//
// With no arguments this performs a full repository audit. CI passes only TypeScript files
// changed by the current commit so legacy extensionless imports cannot keep main permanently
// red while every new/modified file is still held to the ESM-safe contract.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_EXTENSIONS = ['.ts', '.tsx']
const SKIPPED_DIRECTORIES = new Set(['.git', '.next', 'node_modules'])
const PORTABLE_BROWSER = join(ROOT, 'lib', 'portable-browser')

/**
 * Blank comments and string contents while preserving offsets and newlines. String boundaries
 * remain visible so module specifiers can be inspected without matching commented-out code.
 */
function scrub(source) {
  const out = source.split('')
  let i = 0
  const blank = (start, end) => {
    for (let k = start; k < end && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' '
    }
  }

  while (i < source.length) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      const end = source.indexOf('\n', i)
      blank(i, end === -1 ? source.length : end)
      i = end === -1 ? source.length : end
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }

    const quote = source[i]
    if (quote === '"' || quote === "'" || quote === '`') {
      let end = i + 1
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2
          continue
        }
        if (source[end] === quote) break
        end++
      }
      blank(i + 1, end)
      i = end + 1
      continue
    }
    i++
  }

  return out.join('')
}

function sourceFilesIn(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (full !== PORTABLE_BROWSER) files.push(...sourceFilesIn(full))
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(full)
    }
  }
  return files
}

function requestedSourceFiles(paths) {
  const files = []
  for (const path of paths) {
    const full = resolve(ROOT, path)
    const local = relative(ROOT, full)
    if (local === '..' || local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error(`Refusing to scan a path outside the saas workspace: ${path}`)
    }
    if (!existsSync(full) || !statSync(full).isFile()) continue
    if (!SOURCE_EXTENSIONS.some((extension) => full.endsWith(extension))) continue
    files.push(full)
  }
  return [...new Set(files)]
}

function resolvedTarget(file, specifier) {
  const target = resolve(dirname(file), specifier)
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = target + extension
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  const index = join(target, 'index.ts')
  return existsSync(index) && statSync(index).isFile() ? index : null
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

const requested = process.argv.slice(2).filter(Boolean)
const filesToScan = requested.length ? requestedSourceFiles(requested) : sourceFilesIn(ROOT)
const violations = []
let scanned = 0

for (const file of filesToScan) {
  scanned++
  const source = readFileSync(file, 'utf8')
  const code = scrub(source)
  const stringPattern = /(['"])([^'"\r\n]+)\1/g

  for (const match of source.matchAll(stringPattern)) {
    if (code[match.index] !== match[1]) continue
    const specifier = match[2]
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue
    if (extname(specifier)) continue

    const prefix = code.slice(Math.max(0, match.index - 500), match.index)
    const isModuleSpecifier = /\bfrom\s*$/.test(prefix)
      || /\bimport\s*\(\s*$/.test(prefix)
      || /\bimport\s*$/.test(prefix)
    if (!isModuleSpecifier) continue

    const target = resolvedTarget(file, specifier)
    if (target) {
      violations.push({
        file: relative(ROOT, file),
        line: lineOf(source, match.index),
        specifier,
        target: relative(ROOT, target),
      })
    }
  }
}

if (violations.length) {
  console.error('Relative TypeScript import specifiers must include an explicit extension.')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} imports ${violation.specifier} (resolves to ${violation.target})`)
  }
  console.error('Fix: append .ts or .tsx, or use /index.ts for a directory entry point.')
  process.exit(1)
}

const scope = requested.length ? 'changed' : 'repository'
console.log(`Relative import extension guard passed (${scanned} ${scope} TypeScript source files scanned).`)
