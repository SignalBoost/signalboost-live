import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const sourceRoots = ['app', 'components']
const langs = ['en', 'es', 'pt', 'pl', 'ru']
const excludedFragments = [
  '/lib/supervisor/portable/', '/portable-license/', '/portable-kernel/',
  '/press-media-core/', '/node_modules/', '/.next/'
]

const walk = (dir, predicate = () => true) => {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const normalized = full.replaceAll('\\', '/')
    if (excludedFragments.some(fragment => normalized.includes(fragment))) continue
    if (entry.isDirectory()) out.push(...walk(full, predicate))
    else if (predicate(full)) out.push(full)
  }
  return out
}

const tsxFiles = sourceRoots.flatMap(dir => walk(path.join(root, dir), file => file.endsWith('.tsx'))).sort()
const localeFiles = walk(path.join(root, 'locales'), file => file.endsWith('.json')).sort()

function flatten(value, prefix = '', out = new Map()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') out.set(next, child)
    else flatten(child, next, out)
  }
  return out
}

const dictionaries = Object.fromEntries(langs.map(lang => [lang, new Map()]))
const dictionaryFiles = Object.fromEntries(langs.map(lang => [lang, []]))
for (const file of localeFiles) {
  const base = path.basename(file)
  const lang = langs.find(candidate => base === `${candidate}.json` || base.endsWith(`.${candidate}.json`))
  if (!lang) continue
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  const flat = flatten(parsed)
  dictionaryFiles[lang].push(path.relative(root, file).replaceAll('\\', '/'))
  for (const [key, value] of flat) dictionaries[lang].set(key, value)
}

const refs = new Map()
const visibleLiterals = []
const filesUsingHook = new Set()
const filesRenderingVisibleText = new Set()

const visibleJsxAttrs = new Set(['placeholder', 'aria-label', 'alt', 'title', 'label'])
const visibleCallNames = new Set(['toast', 'alert', 'confirm'])
const ignoredText = value => {
  const s = value.trim()
  return !s || /^[\s\p{P}\p{S}\d]+$/u.test(s) || /^https?:\/\//.test(s)
}

for (const file of tsxFiles) {
  const text = fs.readFileSync(file, 'utf8')
  const rel = path.relative(root, file).replaceAll('\\', '/')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let usesHook = false
  let rendersVisible = false

  const addLiteral = (node, value, kind) => {
    if (ignoredText(value)) return
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    visibleLiterals.push({ value, kind, location: `${rel}:${pos.line + 1}` })
    rendersVisible = true
  }

  const visit = node => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'useI18n') usesHook = true
      if (ts.isIdentifier(node.expression) && node.expression.text === 't' && node.arguments.length >= 1) {
        const keyArg = node.arguments[0]
        const fallbackArg = node.arguments[1]
        if (ts.isStringLiteralLike(keyArg)) {
          const key = keyArg.text
          const fallback = fallbackArg && ts.isStringLiteralLike(fallbackArg) ? fallbackArg.text : null
          const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf))
          const item = refs.get(key) ?? { key, fallbacks: new Set(), references: [] }
          if (fallback !== null) item.fallbacks.add(fallback)
          item.references.push(`${rel}:${pos.line + 1}`)
          refs.set(key, item)
        }
      }
      if (ts.isIdentifier(node.expression) && visibleCallNames.has(node.expression.text)) {
        const arg = node.arguments[0]
        if (arg && ts.isStringLiteralLike(arg)) addLiteral(arg, arg.text, `${node.expression.text}-message`)
      }
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'error') {
        const arg = node.arguments[0]
        if (arg && ts.isStringLiteralLike(arg) && /toast/i.test(node.expression.expression.getText(sf))) addLiteral(arg, arg.text, 'toast-error')
      }
    }

    if (ts.isJsxText(node)) addLiteral(node, node.getText(sf), 'jsx-text')
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf)
      if (visibleJsxAttrs.has(name) && node.initializer && ts.isStringLiteral(node.initializer)) {
        addLiteral(node.initializer, node.initializer.text, `jsx-attribute:${name}`)
      }
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
      addLiteral(node.expression, node.expression.text, 'jsx-expression')
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (usesHook) filesUsingHook.add(rel)
  if (rendersVisible) filesRenderingVisibleText.add(rel)
}

const allDictionaryKeys = new Set(langs.flatMap(lang => [...dictionaries[lang].keys()]))
const referencedKeys = new Set(refs.keys())
const keys = [...refs.values()].sort((a, b) => a.key.localeCompare(b.key)).map(item => ({
  key: item.key,
  englishFallback: item.fallbacks.size === 0 ? null : item.fallbacks.size === 1 ? [...item.fallbacks][0] : [...item.fallbacks].sort(),
  references: [...new Set(item.references)].sort(),
  dictionariesContainingKey: langs.filter(lang => dictionaries[lang].has(item.key)),
}))

const deadKeys = [...allDictionaryKeys].filter(key => !referencedKeys.has(key)).sort().map(key => ({
  key,
  dictionariesContainingKey: langs.filter(lang => dictionaries[lang].has(key)),
}))

const identicalToEnglish = Object.fromEntries(langs.filter(lang => lang !== 'en').map(lang => [lang,
  [...dictionaries.en.entries()]
    .filter(([key, value]) => dictionaries[lang].get(key) === value)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key))
]))

const missingFromAll = keys.filter(item => item.dictionariesContainingKey.length === 0)
const noWiring = [...filesRenderingVisibleText].filter(file => !filesUsingHook.has(file)).sort()

const audit = {
  generatedAt: new Date().toISOString(),
  scope: { sourceRoots, excludedFragments, languages: langs },
  measurements: {
    tsxFiles: tsxFiles.length,
    tsxFilesUsingI18nHook: filesUsingHook.size,
    tsxFilesNotUsingI18nHook: tsxFiles.length - filesUsingHook.size,
    distinctReferencedTKeys: keys.length,
    referencedKeysMissingFromAllDictionaries: missingFromAll.length,
    dictionaryStringCounts: Object.fromEntries(langs.map(lang => [lang, dictionaries[lang].size])),
    dictionaryFiles,
    visibleLiteralOccurrences: visibleLiterals.length,
    filesRenderingVisibleTextWithoutI18nWiring: noWiring.length,
    deadDictionaryKeys: deadKeys.length,
    identicalToEnglishCounts: Object.fromEntries(Object.entries(identicalToEnglish).map(([lang, values]) => [lang, values.length])),
  },
  keys,
  missingFromAllDictionaries: missingFromAll,
  visibleLiteralsNotWrappedInT: visibleLiterals.sort((a, b) => a.location.localeCompare(b.location)),
  filesRenderingVisibleTextWithoutI18nWiring: noWiring,
  deadKeys,
  identicalToEnglish,
  needsHumanDecision: [],
  notes: [
    'This is an inventory only. No UI strings or dictionaries were modified.',
    'Visible-literal detection is syntax-based and intentionally broad; reviewers should classify false positives before fixes.',
  ],
}

const output = path.join(root, 'locales', 'i18n-audit.json')
fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`)
console.log(JSON.stringify(audit.measurements, null, 2))
