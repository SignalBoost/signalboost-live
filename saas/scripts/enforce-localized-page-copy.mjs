// Centralize user-facing English copy from app/components TSX files.
//
// Default mode is a blocking check. Use --write only for the bounded migration.
// The transform preserves each exact runtime string through a typed generated copy
// table, so routes, discriminated unions, status values, and UI behavior do not change.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const GENERATED_PATH = path.join(ROOT, 'lib', 'i18n', 'generatedUiCopy.ts')
const SCAN_ROOTS = ['app', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__'])
const WRITE = process.argv.includes('--write')
const CHECKED_ATTRS = new Set(['placeholder', 'aria-label', 'title', 'alt'])
const CUSTOM_UI_ATTRS = new Set([
  'action', 'actionLabel', 'badge', 'caption', 'detail', 'emptyLabel', 'externalLabel',
  'fallback', 'fallbackCta', 'fallbackDescription', 'fallbackHint', 'fallbackLabel',
  'fallbackMessage', 'fallbackPlaceholder', 'fallbackPrompt', 'fallbackText', 'fallbackTitle',
  'help', 'helperText', 'label', 'message', 'note', 'status', 'subtitle', 'text', 'title',
  'tooltip',
])
const UI_FIELDS = new Set([
  'actionLabel', 'adminOnly', 'auditNote', 'auditTitle', 'badge', 'body', 'caption', 'closing',
  'description', 'detail', 'emptyBody', 'emptyLabel', 'emptyMessage', 'emptyTitle', 'errorMessage',
  'evidenceTitle', 'externalLabel', 'fallback', 'fallbackCta', 'fallbackDescription', 'fallbackHint',
  'fallbackLabel', 'fallbackMessage', 'fallbackPlaceholder', 'fallbackPrompt', 'fallbackText',
  'fallbackTitle', 'heading', 'help', 'helperText', 'hint', 'intro', 'kicker', 'label', 'message',
  'note', 'placeholder', 'prompt', 'rehearsalBadge', 'rehearsalNote', 'requestFailed', 'runButton',
  'runningButton', 'runningNote', 'subtitle', 'successMessage', 'text', 'title', 'tooltip',
])
const COPYISH_NAME = /(copy|text|label|title|description|message|prompt|placeholder|empty|note|heading|subtitle|kicker|eyebrow|caption|help|tooltip|intro|closing|badge)/i
const TECHNICAL_NAME = /(channels?|statuses?|stages?|types?|modes?|kinds?|codes?|keys?|routes?|urls?|paths?|slugs?|ids?)$/i
const STYLE_FIELDS = new Set(['alignItems', 'background', 'border', 'borderColor', 'borderRadius', 'bottom', 'boxShadow', 'color', 'cursor', 'display', 'flex', 'flexDirection', 'flexWrap', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'gap', 'gridTemplateColumns', 'height', 'justifyContent', 'left', 'letterSpacing', 'lineHeight', 'margin', 'marginBottom', 'marginLeft', 'marginRight', 'marginTop', 'maxHeight', 'maxWidth', 'minHeight', 'minWidth', 'opacity', 'overflow', 'padding', 'position', 'right', 'textAlign', 'textDecoration', 'textTransform', 'top', 'transform', 'transition', 'whiteSpace', 'width', 'zIndex'])
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

function isHumanCopy(value) {
  const text = normalize(value)
  return Boolean(text && /[A-Za-z]{2,}/.test(text))
}

function propName(node) {
  if (!node) return ''
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return ''
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return ''
}

function isTypeContext(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTypeNode(current)) return true
    if (ts.isExpression(current) || ts.isStatement(current) || ts.isSourceFile(current)) return false
  }
  return false
}

function localeBranch(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current)) {
      const name = propName(current.name)
      if (['en', 'es', 'pt', 'pl', 'ru'].includes(name)) return name
    }
    if (ts.isSourceFile(current)) break
  }
  return null
}

function inEnglishCopyTable(node) {
  if (localeBranch(node) !== 'en') return false
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return COPYISH_NAME.test(current.name.text) || /locales|translations|dictionary|messages/i.test(current.name.text)
    }
    if (ts.isSourceFile(current)) break
  }
  return false
}

function looksLikeStyleObject(node) {
  if (!ts.isObjectLiteralExpression(node)) return false
  return node.properties.some(property => ts.isPropertyAssignment(property) && STYLE_FIELDS.has(propName(property.name)))
}

function inCopyishVariable(node) {
  if (localeBranch(node) && localeBranch(node) !== 'en') return false
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      if (!COPYISH_NAME.test(current.name.text) || TECHNICAL_NAME.test(current.name.text) || !current.initializer) return false
      if (current.initializer === node) return true
      if (ts.isArrayLiteralExpression(current.initializer)) return true
      if (ts.isObjectLiteralExpression(current.initializer)) return !looksLikeStyleObject(current.initializer)
      return false
    }
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) break
  }
  return false
}

function comparisonOperand(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isParenthesizedExpression(current)) continue
    if (ts.isBinaryExpression(current)) {
      return [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(current.operatorToken.kind)
    }
    if (ts.isConditionalExpression(current) || ts.isJsxExpression(current) || ts.isCallExpression(current) || ts.isPropertyAssignment(current) || ts.isArrayLiteralExpression(current)) return false
  }
  return false
}

function inIncludesReceiver(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isArrayLiteralExpression(current)) {
      const access = current.parent
      return Boolean(
        ts.isPropertyAccessExpression(access) &&
        access.expression === current &&
        access.name.text === 'includes' &&
        ts.isCallExpression(access.parent) &&
        access.parent.expression === access
      )
    }
    if (ts.isCallExpression(current) || ts.isJsxExpression(current) || ts.isFunctionLike(current) || ts.isSourceFile(current)) break
  }
  return false
}

function inStyledJsx(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxExpression(current) && ts.isJsxElement(current.parent)) {
      const opening = current.parent.openingElement
      if (opening.tagName.getText() !== 'style') return false
      return opening.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && propName(attribute.name) === 'jsx')
    }
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) break
  }
  return false
}

function renderedJsxExpression(node) {
  if (comparisonOperand(node) || inIncludesReceiver(node) || inStyledJsx(node)) return false
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isElementAccessExpression(current) && current.argumentExpression === node) return false
    if (ts.isCallExpression(current)) {
      const name = calleeName(current.expression)
      if (name === 't' || name === 'uiCopy') return false
    }
    if (ts.isJsxAttribute(current)) {
      const name = propName(current.name)
      const parentTag = current.parent?.parent?.tagName
      const customComponent = parentTag && ts.isIdentifier(parentTag) && /^[A-Z]/.test(parentTag.text)
      return CHECKED_ATTRS.has(name) || name.startsWith('fallback') || Boolean(customComponent && CUSTOM_UI_ATTRS.has(name))
    }
    if (ts.isJsxExpression(current)) {
      const parent = current.parent
      return ts.isJsxElement(parent) || ts.isJsxFragment(parent)
    }
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) break
  }
  return false
}

function keyFor(rel, node, kind, value) {
  return `u_${crypto.createHash('sha256').update(`${rel}\0${node.getStart()}\0${kind}\0${value}`).digest('hex').slice(0, 16)}`
}

function insertionPoint(sf) {
  const imports = sf.statements.filter(ts.isImportDeclaration)
  if (imports.length) return imports[imports.length - 1].end
  let point = 0
  for (const statement of sf.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) point = statement.end
    else break
  }
  return point
}

function scanFile(full) {
  const source = fs.readFileSync(full, 'utf8')
  const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const rel = path.relative(ROOT, full).split(path.sep).join('/')
  const edits = new Map()
  const entries = new Map()

  function add(node, value, kind, options = {}) {
    if (!isHumanCopy(value)) return
    const start = options.start ?? node.getStart(sf)
    const end = options.end ?? node.end
    const id = `${start}:${end}`
    if (edits.has(id)) return
    const key = keyFor(rel, node, kind, value)
    const call = `uiCopy('${key}')`
    const expression = options.widen ? `String(${call})` : call
    const replacement = options.jsxAttribute ? `{${expression}}` : options.jsxText ? `{${expression}}` : expression
    edits.set(id, { start, end, replacement, key, value, kind, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 })
    entries.set(key, value)
  }

  function visit(node) {
    if (ts.isCallExpression(node) && calleeName(node.expression) === 'uiCopy') return

    if (ts.isJsxText(node)) {
      add(node, node.text, 'jsx-text', { start: node.pos, end: node.end, jsxText: true })
    }

    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = propName(node.name)
      const parentTag = node.parent?.parent?.tagName
      const customComponent = parentTag && ts.isIdentifier(parentTag) && /^[A-Z]/.test(parentTag.text)
      const shouldTranslate = CHECKED_ATTRS.has(name) || name.startsWith('fallback') || (customComponent && CUSTOM_UI_ATTRS.has(name))
      if (shouldTranslate && ts.isStringLiteral(node.initializer)) {
        add(node.initializer, node.initializer.text, `jsx-attr:${name}`, { jsxAttribute: true })
      } else if (
        shouldTranslate && ts.isJsxExpression(node.initializer) && node.initializer.expression &&
        (ts.isStringLiteral(node.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(node.initializer.expression))
      ) {
        add(node.initializer.expression, node.initializer.expression.text, `jsx-attr:${name}`)
      }
    }

    if (ts.isCallExpression(node) && calleeName(node.expression) === 't') {
      const args = node.arguments
      const fallback = args.length >= 3 ? args[2] : args.length >= 2 ? args[1] : null
      if (fallback && (ts.isStringLiteral(fallback) || ts.isNoSubstitutionTemplateLiteral(fallback))) {
        add(fallback, fallback.text, 't-fallback')
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propName(node.name)
      const init = node.initializer
      const displayStatus = name === 'status' && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) && /\s/.test(init.text)
      if ((FALLBACK_PROPS.has(name) || UI_FIELDS.has(name) || displayStatus) && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {
        if (localeBranch(init) !== null && localeBranch(init) !== 'en') {
          // Localized values are already intentionally separated by language.
        } else {
          add(init, init.text, `property:${name}`, { widen: name === 'message' })
        }
      }
    }

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isTypeContext(node)) {
      const parent = node.parent
      const isModule = (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node
      const isDirective = ts.isExpressionStatement(parent) && parent.expression === node
      const isPropertyKey = ts.isPropertyAssignment(parent) && parent.name === node
      const alreadyHandled = [...edits.values()].some(edit => edit.start === node.getStart(sf) && edit.end === node.end)
      if (!isModule && !isDirective && !isPropertyKey && !alreadyHandled) {
        if (inEnglishCopyTable(node) || inCopyishVariable(node) || renderedJsxExpression(node)) add(node, node.text, 'central-copy')
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sf)
  if (!edits.size) return { rel, source, output: source, entries, violations: [] }

  const violations = [...edits.values()].sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind))
  if (!WRITE) return { rel, source, output: source, entries, violations }

  let output = source
  const allEdits = [...edits.values()].map(({ start, end, replacement }) => ({ start, end, replacement }))
  if (!source.includes("from '@/lib/i18n/generatedUiCopy'")) {
    const at = insertionPoint(sf)
    const prefix = at > 0 ? '\n' : ''
    allEdits.push({ start: at, end: at, replacement: `${prefix}import { uiCopy } from '@/lib/i18n/generatedUiCopy'\n` })
  }
  allEdits.sort((a, b) => b.start - a.start || b.end - a.end)
  for (const edit of allEdits) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end)
  return { rel, source, output, entries, violations }
}

const results = []
const generated = new Map()
for (const root of SCAN_ROOTS) {
  for (const full of walk(path.join(ROOT, root))) {
    const result = scanFile(full)
    results.push({ full, ...result })
    for (const [key, value] of result.entries) generated.set(key, value)
  }
}

const violations = results.flatMap(result => result.violations.map(item => ({ file: result.rel, ...item })))
if (!WRITE) {
  if (!violations.length) {
    console.log('[validate:i18n-centralization] PASS — no hardcoded user-facing English remains in app/components TSX files.')
    process.exit(0)
  }
  for (const item of violations) console.error(`${item.file}:${item.line}\t${item.kind}\t${JSON.stringify(normalize(item.value))}`)
  console.error(`[validate:i18n-centralization] FAIL — ${violations.length} hardcoded user-facing strings remain.`)
  process.exit(1)
}

for (const result of results) {
  if (result.output !== result.source) fs.writeFileSync(result.full, result.output, 'utf8')
}

const rows = [...generated.entries()].sort(([a], [b]) => a.localeCompare(b))
const generatedSource = `// Generated by scripts/enforce-localized-page-copy.mjs --write.\n// User-facing English belongs here, not inside app/components page implementations.\n// Values stay exact so the migration cannot alter runtime behavior or literal types.\n\nconst GENERATED_UI_COPY = {\n${rows.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n')}\n} as const\n\nexport type GeneratedUiCopyKey = keyof typeof GENERATED_UI_COPY\n\nexport function uiCopy<K extends GeneratedUiCopyKey>(key: K): (typeof GENERATED_UI_COPY)[K] {\n  return GENERATED_UI_COPY[key]\n}\n`
fs.mkdirSync(path.dirname(GENERATED_PATH), { recursive: true })
fs.writeFileSync(GENERATED_PATH, generatedSource, 'utf8')
console.log(`Centralized ${violations.length} strings from ${results.filter(result => result.output !== result.source).length} files into ${path.relative(ROOT, GENERATED_PATH)}.`)
