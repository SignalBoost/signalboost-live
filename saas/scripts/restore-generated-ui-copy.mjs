import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const GENERATED = path.join(ROOT, 'lib', 'i18n', 'generatedUiCopy.ts')
const OLD_GUARD = path.join(ROOT, 'scripts', 'enforce-localized-page-copy.mjs')
const SCAN_ROOTS = [path.join(ROOT, 'app'), path.join(ROOT, 'components')]
const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__'])

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(full, out)
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function propName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return ''
}

function readGeneratedCopy() {
  if (!fs.existsSync(GENERATED)) return null
  const source = fs.readFileSync(GENERATED, 'utf8')
  const file = ts.createSourceFile(GENERATED, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'GENERATED_UI_COPY' || !declaration.initializer) continue
      let initializer = declaration.initializer
      if (ts.isAsExpression(initializer)) initializer = initializer.expression
      if (!ts.isObjectLiteralExpression(initializer)) continue

      const values = new Map()
      for (const property of initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue
        const key = propName(property.name)
        const value = property.initializer
        if (key && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) values.set(key, value.text)
      }
      return values
    }
  }
  throw new Error('Unable to parse generatedUiCopy.ts')
}

const values = readGeneratedCopy()
if (!values) {
  console.log('No generatedUiCopy.ts remains; nothing to restore.')
  process.exit(0)
}

let restoredCalls = 0
let restoredFiles = 0

for (const root of SCAN_ROOTS) {
  for (const full of walk(root)) {
    const source = fs.readFileSync(full, 'utf8')
    const file = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const importedNames = new Set()
    const edits = []

    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      if (statement.moduleSpecifier.text !== '@/lib/i18n/generatedUiCopy') continue
      const bindings = statement.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if ((element.propertyName?.text || element.name.text) === 'uiCopy') importedNames.add(element.name.text)
        }
      }
      let end = statement.end
      while (end < source.length && (source[end] === '\r' || source[end] === '\n')) end += 1
      edits.push({ start: statement.getStart(file), end, replacement: '' })
    }

    if (!importedNames.size) continue

    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        importedNames.has(node.expression.text) &&
        node.arguments.length >= 1 &&
        (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
      ) {
        const value = values.get(node.arguments[0].text)
        if (value === undefined) throw new Error(`Missing generated UI copy key ${node.arguments[0].text} in ${full}`)
        edits.push({ start: node.getStart(file), end: node.end, replacement: JSON.stringify(value) })
        restoredCalls += 1
      }
      ts.forEachChild(node, visit)
    }

    visit(file)
    edits.sort((a, b) => b.start - a.start || b.end - a.end)
    let output = source
    for (const edit of edits) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end)
    if (output !== source) {
      fs.writeFileSync(full, output, 'utf8')
      restoredFiles += 1
    }
  }
}

fs.rmSync(GENERATED, { force: true })
fs.rmSync(OLD_GUARD, { force: true })
console.log(`Restored ${restoredCalls} generated copy calls across ${restoredFiles} files, then removed the obsolete English table and guard.`)
