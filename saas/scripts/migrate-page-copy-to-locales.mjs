import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WRITE = process.argv.includes('--write')
const LOCALE_CODES = ['en', 'es', 'pt', 'pl', 'ru']
const LOCALE_PATHS = Object.fromEntries(LOCALE_CODES.map(code => [code, path.join(ROOT, 'locales', `${code}.json`)]))
const SCAN_ROOTS = ['app', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__'])
const SERVER_ONLY_ROOTS = new Set([path.join(ROOT, 'app', 'api')])
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
      if (!SKIP_DIRS.has(entry.name) && !SERVER_ONLY_ROOTS.has(full)) walk(full, out)
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function walkTests(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkTests(full, out)
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(full)
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
      if (LOCALE_CODES.includes(name)) return name
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
  return ts.isObjectLiteralExpression(node) && node.properties.some(property => ts.isPropertyAssignment(property) && STYLE_FIELDS.has(propName(property.name)))
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
      return Boolean(ts.isPropertyAccessExpression(access) && access.expression === current && access.name.text === 'includes' && ts.isCallExpression(access.parent) && access.parent.expression === access)
    }
    if (ts.isCallExpression(current) || ts.isJsxExpression(current) || ts.isFunctionLike(current) || ts.isSourceFile(current)) break
  }
  return false
}

function inStyleElement(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxExpression(current) && ts.isJsxElement(current.parent)) return current.parent.openingElement.tagName.getText() === 'style'
    if (ts.isJsxText(current) && ts.isJsxElement(current.parent)) return current.parent.openingElement.tagName.getText() === 'style'
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) break
  }
  return false
}

function renderedJsxExpression(node) {
  if (comparisonOperand(node) || inIncludesReceiver(node) || inStyleElement(node)) return false
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isElementAccessExpression(current) && current.argumentExpression === node) return false
    if (ts.isCallExpression(current)) {
      const name = calleeName(current.expression)
      if (name === 't' || name === 'uiText') return false
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

function lookup(obj, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined, obj)
}

function setPath(obj, dottedPath, value) {
  const parts = dottedPath.split('.')
  let cursor = obj
  for (const key of parts.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {}
    cursor = cursor[key]
  }
  if (cursor[parts.at(-1)] === undefined) cursor[parts.at(-1)] = value
}

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(next, value)
    else if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, next, out)
  }
  return out
}

function parseHardcodedTranslations() {
  const full = path.join(ROOT, 'lib', 'i18n', 'hardcoded-ui-copy.ts')
  if (!fs.existsSync(full)) return {}
  const source = fs.readFileSync(full, 'utf8')
  const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  function evaluate(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isObjectLiteralExpression(node)) {
      const result = {}
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue
        const key = propName(property.name)
        if (!key) continue
        result[key] = evaluate(property.initializer)
      }
      return result
    }
    return undefined
  }

  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'HARDCODED_UI_COPY' && declaration.initializer) return evaluate(declaration.initializer) ?? {}
    }
  }
  return {}
}

const localeData = Object.fromEntries(LOCALE_CODES.map(code => [code, JSON.parse(fs.readFileSync(LOCALE_PATHS[code], 'utf8'))]))
const originalFlat = Object.fromEntries(LOCALE_CODES.map(code => [code, flatten(localeData[code])]))
const reverseTranslations = Object.fromEntries(LOCALE_CODES.filter(code => code !== 'en').map(code => {
  const map = new Map()
  for (const [localePath, englishValue] of originalFlat.en.entries()) {
    const localized = originalFlat[code].get(localePath)
    if (typeof localized === 'string' && localized && localized !== englishValue && !map.has(englishValue)) map.set(englishValue, localized)
  }
  return [code, map]
}))
const hardcodedTranslations = parseHardcodedTranslations()
const registered = new Map()

function generatedPath(value) {
  const normalized = normalize(value)
  return `generatedUi.u_${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`
}

function translationFor(value, code) {
  const direct = hardcodedTranslations?.[code]?.[normalize(value)]
  if (typeof direct === 'string') return direct
  return reverseTranslations[code]?.get(normalize(value))
}

function registerCopy(value, preferredPath = null) {
  const text = normalize(value)
  if (!isHumanCopy(text)) return null
  const localePath = preferredPath || generatedPath(text)
  const existing = lookup(localeData.en, localePath)
  if (existing === undefined) setPath(localeData.en, localePath, text)
  for (const code of LOCALE_CODES.filter(code => code !== 'en')) {
    if (lookup(localeData[code], localePath) !== undefined) continue
    const translated = translationFor(text, code)
    if (typeof translated === 'string') setPath(localeData[code], localePath, translated)
  }
  registered.set(localePath, text)
  return localePath
}

function insertionPoint(sf) {
  const imports = sf.statements.filter(ts.isImportDeclaration)
  if (imports.length) return imports.at(-1).end
  let point = 0
  for (const statement of sf.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) point = statement.end
    else break
  }
  return point
}

function importedTranslatorNames(sf) {
  const names = new Set()
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!statement.moduleSpecifier.text.endsWith('/i18n/t')) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if ((element.propertyName?.text || element.name.text) === 't') names.add(element.name.text)
    }
  }
  return names
}

function scanFile(full) {
  const source = fs.readFileSync(full, 'utf8')
  const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const rel = path.relative(ROOT, full).split(path.sep).join('/')
  const translatorNames = importedTranslatorNames(sf)
  const edits = new Map()
  let needsUiText = false

  function addEdit(start, end, replacement, kind, node, value = '') {
    const id = `${start}:${end}`
    if (edits.has(id)) return
    edits.set(id, { start, end, replacement, kind, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, value })
  }

  function addCopy(node, value, kind, options = {}) {
    if (!isHumanCopy(value)) return
    const localePath = registerCopy(value)
    if (!localePath) return
    const expression = `uiText('${localePath}')`
    const replacement = options.jsxAttribute ? `{${expression}}` : options.jsxText ? `{${expression}}` : expression
    addEdit(options.start ?? node.getStart(sf), options.end ?? node.end, replacement, kind, node, value)
    needsUiText = true
  }

  function visit(node) {
    if (ts.isCallExpression(node) && calleeName(node.expression) === 'uiText') return

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && translatorNames.has(node.expression.text) && node.arguments.length >= 3) {
      const localePathArg = node.arguments[1]
      const fallback = node.arguments[2]
      if ((ts.isStringLiteral(fallback) || ts.isNoSubstitutionTemplateLiteral(fallback)) && isHumanCopy(fallback.text)) {
        if (ts.isStringLiteral(localePathArg) || ts.isNoSubstitutionTemplateLiteral(localePathArg)) {
          registerCopy(fallback.text, localePathArg.text)
          if (node.arguments.length === 3) addEdit(localePathArg.end, fallback.end, '', 't-fallback', fallback, fallback.text)
          else {
            const generated = registerCopy(fallback.text)
            addEdit(fallback.getStart(sf), fallback.end, `uiText('${generated}')`, 't-fallback-dynamic', fallback, fallback.text)
            needsUiText = true
          }
        } else {
          const generated = registerCopy(fallback.text)
          addEdit(fallback.getStart(sf), fallback.end, `uiText('${generated}')`, 't-fallback-dynamic', fallback, fallback.text)
          needsUiText = true
        }
      }
    }

    if (ts.isJsxText(node) && !inStyleElement(node)) addCopy(node, node.text, 'jsx-text', { start: node.pos, end: node.end, jsxText: true })

    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = propName(node.name)
      const parentTag = node.parent?.parent?.tagName
      const customComponent = parentTag && ts.isIdentifier(parentTag) && /^[A-Z]/.test(parentTag.text)
      const shouldTranslate = CHECKED_ATTRS.has(name) || name.startsWith('fallback') || Boolean(customComponent && CUSTOM_UI_ATTRS.has(name))
      if (shouldTranslate && ts.isStringLiteral(node.initializer)) addCopy(node.initializer, node.initializer.text, `jsx-attr:${name}`, { jsxAttribute: true })
      else if (shouldTranslate && ts.isJsxExpression(node.initializer) && node.initializer.expression && (ts.isStringLiteral(node.initializer.expression) || ts.isNoSubstitutionTemplateLiteral(node.initializer.expression))) addCopy(node.initializer.expression, node.initializer.expression.text, `jsx-attr:${name}`)
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propName(node.name)
      const init = node.initializer
      const displayStatus = name === 'status' && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) && /\s/.test(init.text)
      if ((FALLBACK_PROPS.has(name) || UI_FIELDS.has(name) || displayStatus) && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {
        if (localeBranch(init) === null || localeBranch(init) === 'en') addCopy(init, init.text, `property:${name}`)
      }
    }

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isTypeContext(node)) {
      const parent = node.parent
      const isModule = (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node
      const isDirective = ts.isExpressionStatement(parent) && parent.expression === node
      const isPropertyKey = ts.isPropertyAssignment(parent) && parent.name === node
      const alreadyHandled = [...edits.values()].some(edit => edit.start <= node.getStart(sf) && edit.end >= node.end)
      if (!isModule && !isDirective && !isPropertyKey && !alreadyHandled && (inEnglishCopyTable(node) || inCopyishVariable(node) || renderedJsxExpression(node))) addCopy(node, node.text, 'central-copy')
    }

    ts.forEachChild(node, visit)
  }

  visit(sf)
  const violations = [...edits.values()].sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind))
  if (!WRITE || violations.length === 0) return { rel, source, output: source, violations }

  let output = source
  const replacements = [...edits.values()].map(({ start, end, replacement }) => ({ start, end, replacement }))
  if (needsUiText && !source.includes("from '@/lib/i18n/uiText'")) {
    const at = insertionPoint(sf)
    replacements.push({ start: at, end: at, replacement: `${at > 0 ? '\n' : ''}import { uiText } from '@/lib/i18n/uiText'\n` })
  }
  replacements.sort((a, b) => b.start - a.start || b.end - a.end)
  for (const edit of replacements) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end)
  return { rel, source, output, violations }
}

function patchRuntimeFiles() {
  const tPath = path.join(ROOT, 'lib', 'i18n', 't.ts')
  let tSource = fs.readFileSync(tPath, 'utf8')
  tSource = tSource.replace(
    'export function t(dict: Dict | null | undefined, path: string, fallback: string): string {',
    "export function t(dict: Dict | null | undefined, path: string, fallback = ''): string {",
  )
  fs.writeFileSync(tPath, tSource, 'utf8')

  const providerPath = path.join(ROOT, 'components', 'i18n', 'I18nProvider.tsx')
  let provider = fs.readFileSync(providerPath, 'utf8')
  const importLine = "import { setRuntimeDictionary } from '@/lib/i18n/uiText'"
  if (!provider.includes(importLine)) provider = provider.replace("import { applyHardcodedUiCopy } from '@/lib/i18n/hardcoded-ui-copy'", "import { applyHardcodedUiCopy } from '@/lib/i18n/hardcoded-ui-copy'\n" + importLine)
  provider = provider.replace('      setDict(englishCopy as Dict)\n      const safeLang', '      setDict(englishCopy as Dict)\n      setRuntimeDictionary(englishCopy as Dict)\n      const safeLang')
  provider = provider.replace('      setDict(loaded)\n      setIsReady(true)', '      setRuntimeDictionary(loaded)\n      setDict(loaded)\n      setIsReady(true)')
  fs.writeFileSync(providerPath, provider, 'utf8')
}

function hydrateSourceTests() {
  const testsRoot = path.join(ROOT, 'tests')
  for (const full of walkTests(testsRoot)) {
    if (!/\.(test|spec)\.ts$/.test(full) || full.includes(`${path.sep}helpers${path.sep}`)) continue
    let source = fs.readFileSync(full, 'utf8')
    if (!source.includes('readFileSync') && !source.includes('readFile(')) continue
    const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const edits = []

    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === 'readFileSync' || node.expression.text === 'readFile') && node.arguments.length >= 2 && (ts.isStringLiteral(node.arguments[1]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[1])) && /^(utf8|utf-8)$/i.test(node.arguments[1].text)) {
        const call = node.getText(sf)
        const sync = node.expression.text === 'readFileSync'
        const syncWrapped = ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && node.parent.expression.text === 'hydrateLocalizedSource'
        const asyncWrapped = ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'then'
        if (!syncWrapped && !asyncWrapped) edits.push({ start: node.getStart(sf), end: node.end, replacement: sync ? `hydrateLocalizedSource(${call})` : `${call}.then(hydrateLocalizedSource)` })
      }
      ts.forEachChild(node, visit)
    }

    visit(sf)
    if (!edits.length) continue
    const imports = sf.statements.filter(ts.isImportDeclaration)
    const helperRelative = path.relative(path.dirname(full), path.join(testsRoot, 'helpers', 'hydrateLocalizedSource.ts')).split(path.sep).join('/')
    const helperSpecifier = helperRelative.startsWith('.') ? helperRelative : `./${helperRelative}`
    const helperImport = `import { hydrateLocalizedSource } from '${helperSpecifier}'`
    if (!source.includes(helperImport)) {
      const at = imports.length ? imports.at(-1).end : 0
      edits.push({ start: at, end: at, replacement: `${at ? '\n' : ''}${helperImport}\n` })
    }
    edits.sort((a, b) => b.start - a.start)
    for (const edit of edits) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end)
    fs.writeFileSync(full, source, 'utf8')
  }
}

const results = []
for (const root of SCAN_ROOTS) {
  for (const full of walk(path.join(ROOT, root))) results.push({ full, ...scanFile(full) })
}
const violations = results.flatMap(result => result.violations.map(item => ({ file: result.rel, ...item })))

if (!WRITE) {
  if (!violations.length) {
    console.log('[validate:i18n-locale-keys] PASS — page and component UI copy uses locale keys without inline English fallbacks.')
    process.exit(0)
  }
  for (const item of violations) console.error(`${item.file}:${item.line}\t${item.kind}\t${JSON.stringify(normalize(item.value))}`)
  console.error(`[validate:i18n-locale-keys] FAIL — ${violations.length} hardcoded user-facing English strings remain.`)
  process.exit(1)
}

for (const result of results) if (result.output !== result.source) fs.writeFileSync(result.full, result.output, 'utf8')
patchRuntimeFiles()
hydrateSourceTests()
for (const code of LOCALE_CODES) fs.writeFileSync(LOCALE_PATHS[code], `${JSON.stringify(localeData[code], null, 2)}\n`, 'utf8')
console.log(`Migrated ${violations.length} page/component strings into locale keys; registered ${registered.size} English locale entries.`)
