import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const englishUrl = new URL('../../locales/en.json', import.meta.url)
let cachedEnglish = null

function loadEnglish() {
  if (cachedEnglish) return cachedEnglish
  cachedEnglish = JSON.parse(readFileSync(englishUrl, 'utf8'))
  return cachedEnglish
}

function lookup(path) {
  return String(path)
    .split('.')
    .reduce((value, key) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
      return value[key]
    }, loadEnglish())
}

function quote(value) {
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`
}

// Keep the historical helper names so existing source-inspection tests do not
// need broad rewrites. The implementation now resolves real locale keys from
// en.json instead of the deleted generatedUiCopy.ts table.
export function hydrateUiCopy(source) {
  const file = ts.createSourceFile('inspected.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'uiText' && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0])) {
        const value = lookup(node.arguments[0].text)
        if (typeof value === 'string') edits.push({ start: node.getStart(file), end: node.end, replacement: quote(value) })
      }

      if (node.expression.text === 't' && node.arguments.length >= 2 && ts.isStringLiteralLike(node.arguments[1])) {
        const value = lookup(node.arguments[1].text)
        if (typeof value === 'string') edits.push({
          start: node.getStart(file),
          end: node.end,
          replacement: `${node.getText(file)} /* ${quote(value)} */`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  edits.sort((a, b) => b.start - a.start)
  for (const edit of edits) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end)
  return source
}

export function readUiSource(url) {
  return hydrateUiCopy(readFileSync(url, 'utf8'))
}

export async function readUiSourceAsync(url) {
  return hydrateUiCopy(await readFile(url, 'utf8'))
}
