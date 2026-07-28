import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LANGS = ['es', 'pt', 'pl', 'ru']
const SCAN_ROOTS = ['app', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__'])
const COPY_MODULES = [
  'lib/i18n/dashboardCopy.ts',
  'lib/i18n/studioHubCopy.ts',
  'lib/i18n/platformCopy.ts',
  'lib/i18n/suiteCopy.ts',
  'lib/i18n/workspaceCopy.ts',
  'lib/i18n/bankCopy.ts',
]

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

function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function propName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return null
}

function evalLiteralObject(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (!ts.isObjectLiteralExpression(node)) return undefined
  const out = {}
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = propName(prop.name)
    if (name === null) continue
    const value = evalLiteralObject(prop.initializer)
    if (value !== undefined) out[name] = value
  }
  return out
}

function loadCopyModule(rel) {
  const full = path.join(ROOT, rel)
  const source = fs.readFileSync(full, 'utf8')
  const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let result = {}
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /_COPY$/.test(node.name.text) && node.initializer) {
      const value = evalLiteralObject(node.initializer)
      if (value && typeof value === 'object') result = value
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return result
}

const locales = Object.fromEntries(['en', ...LANGS].map(lang => [lang, JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${lang}.json`), 'utf8'))]))
const copyModules = COPY_MODULES.map(loadCopyModule)

function lookup(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => acc && typeof acc === 'object' ? acc[key] : undefined, obj)
}

function hasTranslation(lang, key) {
  if (typeof lookup(locales[lang], key) === 'string') return true
  return copyModules.some(module => typeof module?.[lang]?.[key] === 'string')
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return ''
}

const pairs = []
const seenPairs = new Set()
function addPair(file, line, key, fallback, source) {
  if (!key || !fallback || !/[A-Za-z]{2,}/.test(fallback)) return
  const id = `${file}\0${line}\0${key}\0${fallback}`
  if (seenPairs.has(id)) return
  seenPairs.add(id)
  pairs.push({ file, line, key, fallback, source })
}

for (const root of SCAN_ROOTS) {
  for (const full of walk(path.join(ROOT, root))) {
    const source = fs.readFileSync(full, 'utf8')
    const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const rel = path.relative(ROOT, full).split(path.sep).join('/')
    const lineOf = node => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    function visit(node) {
      if (ts.isCallExpression(node) && calleeName(node.expression) === 't') {
        const args = node.arguments
        const keyNode = args.length >= 3 ? args[1] : args.length >= 2 ? args[0] : null
        const fallbackNode = args.length >= 3 ? args[2] : args.length >= 2 ? args[1] : null
        const key = keyNode ? literal(keyNode) : null
        const fallback = fallbackNode ? literal(fallbackNode) : null
        if (key !== null && fallback !== null) addPair(rel, lineOf(node), key, fallback, 't')
      }
      if (ts.isObjectLiteralExpression(node)) {
        const values = {}
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const name = propName(prop.name)
          const value = literal(prop.initializer)
          if (name && value !== null) values[name] = value
        }
        const candidates = [
          ['labelKey', 'fallbackLabel'], ['prompt', 'fallbackPrompt'], ['titleKey', 'fallbackTitle'],
          ['descriptionKey', 'fallbackDescription'], ['messageKey', 'fallbackMessage'], ['key', 'fallback'],
        ]
        for (const [keyProp, fallbackProp] of candidates) {
          if (values[keyProp] && values[fallbackProp]) addPair(rel, lineOf(node), values[keyProp], values[fallbackProp], `object:${keyProp}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}

pairs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.key.localeCompare(b.key))
let missingCount = 0
const uniqueKeys = new Set()
for (const pair of pairs) {
  const missing = LANGS.filter(lang => !hasTranslation(lang, pair.key))
  if (!missing.length) continue
  missingCount += 1
  uniqueKeys.add(pair.key)
  console.log(`${pair.file}:${pair.line}\t${pair.key}\t${missing.join(',')}\t${JSON.stringify(pair.fallback)}`)
}
console.log(`TOTAL_MISSING_CALLS=${missingCount}`)
console.log(`TOTAL_MISSING_KEYS=${uniqueKeys.size}`)
