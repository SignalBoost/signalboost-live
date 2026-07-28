import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SCAN_ROOTS = ['app', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__'])
const FALLBACK_PROPS = new Set([
  'fallback', 'fallbackLabel', 'fallbackPrompt', 'fallbackTitle', 'fallbackDescription',
  'fallbackText', 'fallbackMessage', 'fallbackPlaceholder', 'fallbackHint', 'fallbackCta',
])

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out)
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function normalize(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

function userFacing(value) {
  const text = normalize(value)
  return Boolean(text && /[A-Za-z]{2,}/.test(text))
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return ''
}

const rows = []
const seen = new Set()
for (const root of SCAN_ROOTS) {
  for (const full of walk(path.join(ROOT, root))) {
    const source = fs.readFileSync(full, 'utf8')
    const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const rel = path.relative(ROOT, full).split(path.sep).join('/')
    const record = (node, value, kind) => {
      const text = normalize(value)
      if (!userFacing(text)) return
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
      const key = `${rel}:${line}:${kind}:${text}`
      if (seen.has(key)) return
      seen.add(key)
      rows.push({ file: rel, line, kind, text })
    }
    const visit = node => {
      if (ts.isCallExpression(node) && calleeName(node.expression) === 't') {
        const args = node.arguments
        const candidate = args.length >= 3 ? args[2] : args.length >= 2 ? args[1] : null
        const text = candidate ? literalText(candidate) : null
        if (text !== null) record(candidate, text, 't-fallback')
      }
      if (ts.isPropertyAssignment(node)) {
        const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : ''
        if (FALLBACK_PROPS.has(name)) {
          const text = literalText(node.initializer)
          if (text !== null) record(node.initializer, text, `property:${name}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}
rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.text.localeCompare(b.text))
for (const row of rows) console.log(`${row.file}:${row.line}\t${row.kind}\t${JSON.stringify(row.text)}`)
console.log(`TOTAL_FALLBACKS=${rows.length}`)
