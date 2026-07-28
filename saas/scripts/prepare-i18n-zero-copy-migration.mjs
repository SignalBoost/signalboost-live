import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
const helperImport = "import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource'"
const readPattern = /(?<!hydrateLocalizedSource\()readFileSync\(([^;\n]*?),\s*(['"])(utf-?8)\2\)/g

for (const relativePath of TEST_FILES) {
  const fullPath = path.join(ROOT, relativePath)
  let source = fs.readFileSync(fullPath, 'utf8')

  if (!source.includes(helperImport)) {
    const imports = [...source.matchAll(/^import .*$/gm)]
    if (!imports.length) throw new Error(`No import block found in ${relativePath}`)
    const last = imports.at(-1)
    const insertion = last.index + last[0].length
    source = `${source.slice(0, insertion)}\n${helperImport}${source.slice(insertion)}`
  }

  source = source.replace(
    readPattern,
    (_match, args, quote, encoding) => `hydrateLocalizedSource(readFileSync(${args}, ${quote}${encoding}${quote}))`,
  )
  fs.writeFileSync(fullPath, source, 'utf8')
}

console.log('Prepared page-only localization migration and hydrated source-inspection tests.')
