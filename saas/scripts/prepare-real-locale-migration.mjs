import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(__dirname, 'migrate-page-copy-to-locales.mjs')
let source = fs.readFileSync(target, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Unable to apply ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "    if (typeof localized === 'string' && localized && localized !== englishValue && !map.has(englishValue)) map.set(englishValue, localized)",
  "    const normalizedEnglish = normalize(englishValue)\n    if (typeof localized === 'string' && localized && localized !== englishValue && !map.has(normalizedEnglish)) map.set(normalizedEnglish, localized)",
  'normalized reverse translation index',
)

replaceOnce(
  "  const text = normalize(value)\n  if (!isHumanCopy(text)) return null",
  "  const text = String(value)\n  if (!isHumanCopy(text)) return null",
  'exact English locale value preservation',
)

replaceOnce(
  "    const replacement = options.jsxAttribute ? `{${expression}}` : options.jsxText ? `{${expression}}` : expression",
  "    let replacement = options.jsxAttribute ? `{${expression}}` : expression\n    if (options.jsxText) {\n      const original = String(options.originalText ?? value)\n      const leading = /^\\s/.test(original) ? ' ' : ''\n      const trailing = /\\s$/.test(original) ? ' ' : ''\n      replacement = `${leading}{${expression}}${trailing}`\n    }",
  'JSX edge-space preservation',
)

replaceOnce(
  "    if (ts.isJsxText(node) && !inStyleElement(node)) addCopy(node, node.text, 'jsx-text', { start: node.pos, end: node.end, jsxText: true })",
  "    if (ts.isJsxText(node) && !inStyleElement(node)) addCopy(node, normalize(node.text), 'jsx-text', { start: node.pos, end: node.end, jsxText: true, originalText: node.text })",
  'normalized JSX core copy',
)

fs.writeFileSync(target, source, 'utf8')
console.log('Prepared exact-value locale migration with JSX spacing safeguards.')
