import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const english = JSON.parse(
  readFileSync(new URL('../../locales/en.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

function lookup(path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
      return (current as Record<string, unknown>)[key]
    }, english)
  return typeof value === 'string' ? value : undefined
}

function asSingleQuotedLiteral(value: string): string {
  return `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`
}

export function hydrateLocalizedSource(source: string): string {
  const file = ts.createSourceFile('inspected.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits: Array<{ start: number; end: number; replacement: string }> = []

  function visit(node: any): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'uiText' && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0])) {
        const value = lookup(node.arguments[0].text)
        if (value !== undefined) edits.push({ start: node.getStart(file), end: node.end, replacement: asSingleQuotedLiteral(value) })
      }

      if (node.expression.text === 't' && node.arguments.length >= 2 && ts.isStringLiteralLike(node.arguments[1])) {
        const value = lookup(node.arguments[1].text)
        if (value !== undefined) {
          const call = node.getText(file)
          edits.push({ start: node.getStart(file), end: node.end, replacement: `${call} /* ${asSingleQuotedLiteral(value)} */` })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  edits.sort((a, b) => b.start - a.start)
  for (const edit of edits) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end)
  return source
}
