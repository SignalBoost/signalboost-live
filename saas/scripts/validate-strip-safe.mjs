// saas/scripts/validate-strip-safe.mjs
//
// STRIP-SAFETY GUARD for the portable cores.
//
// WHY THIS EXISTS. The test suites run `node --test` directly on .ts sources. Node does not
// COMPILE TypeScript there — it STRIPS the types, erasing annotations and leaving the
// JavaScript behind. A handful of TypeScript features cannot be erased that way because
// they emit runtime code: a constructor parameter property has to generate `this.x = x`,
// an enum has to generate an object. Node refuses them with
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX at module load.
//
// The trap is that all of it is perfectly legal TypeScript. `next build` compiles it
// happily, so the deploy goes green while every test that imports the module dies before
// its first assertion — and because one bad file in a barrel takes down every suite that
// imports the barrel, the blast radius is the whole directory. That happened twice in one
// day in agent-gateway, and nothing in the pipeline said a word.
//
// So this guard runs in PREBUILD, on purpose. It fails the Vercel build — the one signal
// everyone actually watches — instead of quietly reddening a suite nobody runs.
//
// SCOPE. The portable cores and their host adapters: the code that is SOLD, and the code a
// buyer is most likely to run under their own toolchain. Two directories are deliberately
// absent because they carry pre-existing violations; they are named in DEFERRED below and
// reported on every run so they stay visible rather than forgotten. Move a directory from
// DEFERRED to GUARDED once it is clean — that is the whole maintenance story.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Directories that must stay strip-safe. A violation here fails the build. */
const GUARDED = [
  'agent-gateway',
  'agent-gateway-host',
  'portable-kernel',
  'portable-audit',
  'press-media-core',
  'press-media-host',
  'render-core',
  'render-host',
  'console-host',
  'marketing-sales-core',
  'marketing-sales-host',
  'cos-backup-core',
  'cos-backup-host',
  'ai-portability-host',
]

/**
 * Known-unsafe directories, not yet enforced. Reported every run so the debt is visible in
 * the build log. Clean one, then move it up into GUARDED.
 */
const DEFERRED = [
  { dir: 'console-core', note: 'operator/stateMachine.ts has a constructor parameter property' },
  { dir: 'ai-portability-core', note: 'blending / orchestrator / routing / audit have constructor parameter properties' },
]

const SOURCE_EXTENSIONS = ['.ts', '.tsx']
const PARAMETER_MODIFIER = /^(?:public|private|protected|readonly)\b/

/**
 * Blank out comments and string/template literals, preserving every byte offset and
 * newline so reported line numbers stay exact. Without this, the word "enum" inside a doc
 * comment or an error message would be reported as a violation.
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

    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      let k = i + 1
      while (k < source.length) {
        if (source[k] === '\\') { k += 2; continue }
        if (source[k] === ch) break
        k++
      }
      blank(i + 1, k)
      i = k + 1
      continue
    }

    i++
  }

  return out.join('')
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

/** Split a parameter list on top-level commas, ignoring commas inside generics or defaults. */
function splitParameters(list) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of list) {
    if ('([{<'.includes(ch)) depth++
    else if (')]}>'.includes(ch)) depth--
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

function findViolations(file, source) {
  const code = scrub(source)
  const found = []

  // 1. Constructor parameter properties — the one that keeps recurring.
  const constructorPattern = /\bconstructor\s*\(/g
  let match
  while ((match = constructorPattern.exec(code)) !== null) {
    const open = match.index + match[0].length - 1
    let depth = 0
    let close = -1
    for (let k = open; k < code.length; k++) {
      if (code[k] === '(') depth++
      else if (code[k] === ')') { depth--; if (depth === 0) { close = k; break } }
    }
    if (close === -1) continue

    for (const parameter of splitParameters(code.slice(open + 1, close))) {
      if (PARAMETER_MODIFIER.test(parameter.trim())) {
        found.push({
          file,
          line: lineOf(code, match.index),
          rule: 'constructor parameter property',
          fix: 'declare the field on the class and assign it in the constructor body',
        })
        break
      }
    }
  }

  // 2. enum — emits a runtime object, so it cannot be stripped. `declare enum` is fine.
  for (const m of code.matchAll(/(?:^|[^.\w])(declare\s+)?(?:const\s+)?enum\s+\w+/gm)) {
    if (m[1]) continue
    found.push({
      file,
      line: lineOf(code, m.index),
      rule: 'enum',
      fix: "use a const object plus a union type: const X = {...} as const; type X = typeof X[keyof typeof X]",
    })
  }

  // 3. namespace / module blocks — same problem. `declare namespace` is type-only and fine.
  for (const m of code.matchAll(/(?:^|[^.\w])(declare\s+)?namespace\s+\w+/gm)) {
    if (m[1]) continue
    found.push({
      file,
      line: lineOf(code, m.index),
      rule: 'namespace',
      fix: 'use a normal module — plain exports from the file',
    })
  }

  // 4. TypeScript-only import/export assignment forms.
  for (const m of code.matchAll(/^\s*(?:export\s*=|import\s+\w+\s*=\s*require\s*\()/gm)) {
    found.push({
      file,
      line: lineOf(code, m.index),
      rule: 'export = / import = require()',
      fix: 'use standard ESM import and export',
    })
  }

  return found
}

function sourceFilesIn(directory) {
  const absolute = join(ROOT, directory)
  let entries
  try {
    entries = readdirSync(absolute)
  } catch {
    return []
  }

  const files = []
  for (const entry of entries) {
    const full = join(absolute, entry)
    if (statSync(full).isDirectory()) {
      files.push(...sourceFilesIn(join(directory, entry)))
      continue
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) files.push(full)
  }
  return files
}

const violations = []
let scanned = 0

for (const directory of GUARDED) {
  for (const file of sourceFilesIn(directory)) {
    scanned++
    violations.push(...findViolations(relative(ROOT, file), readFileSync(file, 'utf8')))
  }
}

for (const { dir, note } of DEFERRED) {
  console.log(`Strip-safety guard: ${dir} is NOT enforced yet — ${note}.`)
}

if (violations.length > 0) {
  console.error('')
  console.error('Strip-safety guard FAILED.')
  console.error('')
  console.error('These files use TypeScript that `node --test` cannot strip. The Next build')
  console.error('compiles them fine, but every test suite importing them — and every suite')
  console.error('importing their barrel — dies at load with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX.')
  console.error('')
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.rule}`)
    console.error(`    fix: ${violation.fix}`)
  }
  console.error('')
  process.exit(1)
}

console.log(`Strip-safety guard passed (${scanned} files across ${GUARDED.length} portable directories).`)
