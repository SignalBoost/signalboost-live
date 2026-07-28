import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const guardPath = path.join(__dirname, 'enforce-localized-page-copy.mjs')

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source
  if (!source.includes(before)) throw new Error(`Unable to apply ${label}`)
  return source.replace(before, after)
}

let guard = fs.readFileSync(guardPath, 'utf8')
guard = replaceOnce(
  guard,
  "const SCAN_ROOTS = ['app', 'components']\n",
  "const SCAN_ROOTS = ['app', 'components']\nconst SERVER_ONLY_ROOTS = new Set([path.join(ROOT, 'app', 'api')])\n",
  'server-only route exclusion',
)
guard = replaceOnce(
  guard,
  "      if (!SKIP_DIRS.has(entry.name)) walk(full, out)\n",
  "      if (!SKIP_DIRS.has(entry.name) && !SERVER_ONLY_ROOTS.has(full)) walk(full, out)\n",
  'server-only traversal exclusion',
)
guard = replaceOnce(
  guard,
  "      if (opening.tagName.getText() !== 'style') return false\n      return opening.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && propName(attribute.name) === 'jsx')\n",
  "      return opening.tagName.getText() === 'style'\n",
  'style element exclusion',
)
fs.writeFileSync(guardPath, guard, 'utf8')

const TEST_FILES = [
  'tests/auditAutonomousRemediation.node.test.ts',
  'tests/auditGlobalApproval.node.test.ts',
  'tests/auditRemediationSystem.node.test.ts',
  'tests/cybersecurityLiveProgress.node.test.ts',
  'tests/homepagePreviewProjects.node.test.ts',
  'tests/providerActionExecutionGate.node.test.ts',
  'tests/providerExecutionModePanel.node.test.ts',
  'tests/providerHubStatusDashboard.node.test.ts',
  'tests/providerReviewedPathSelector.node.test.ts',
  'tests/supervisorSectionNavigation.node.test.ts',
]
const helperImport = "import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'"
const oldHelperImport = "import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource'"

function wrapSourceReads(source, relativePath) {
  const sf = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const edits = []

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'readFileSync' &&
      node.arguments.length >= 2 &&
      (ts.isStringLiteral(node.arguments[1]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[1])) &&
      /^(utf8|utf-8)$/i.test(node.arguments[1].text) &&
      !(
        ts.isCallExpression(node.parent) &&
        ts.isIdentifier(node.parent.expression) &&
        node.parent.expression.text === 'hydrateLocalizedSource'
      )
    ) {
      edits.push({ start: node.getStart(sf), end: node.end, text: `hydrateLocalizedSource(${node.getText(sf)})` })
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  edits.sort((a, b) => b.start - a.start)
  for (const edit of edits) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return { source, count: edits.length }
}

for (const relativePath of TEST_FILES) {
  const fullPath = path.join(ROOT, relativePath)
  let source = fs.readFileSync(fullPath, 'utf8').replace(oldHelperImport, helperImport)
  const wrapped = wrapSourceReads(source, relativePath)
  source = wrapped.source

  if (!source.includes(helperImport)) {
    const imports = [...source.matchAll(/^import .*$/gm)]
    if (!imports.length) throw new Error(`No import block found in ${relativePath}`)
    const last = imports.at(-1)
    const insertion = last.index + last[0].length
    source = `${source.slice(0, insertion)}\n${helperImport}${source.slice(insertion)}`
  }

  if (wrapped.count === 0 && !source.includes('hydrateLocalizedSource(readFileSync(')) {
    throw new Error(`No source reader was hydrated in ${relativePath}`)
  }
  fs.writeFileSync(fullPath, source, 'utf8')
}

console.log('Prepared page-only localization migration and hydrated source-inspection tests.')
