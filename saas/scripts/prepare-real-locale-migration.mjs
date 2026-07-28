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
  "const TECHNICAL_NAME = /(channels?|statuses?|stages?|types?|modes?|kinds?|codes?|keys?|routes?|urls?|paths?|slugs?|ids?)$/i",
  "const TECHNICAL_NAME = /(channels?|statuses?|stages?|types?|modes?|kinds?|codes?|keys?|routes?|urls?|paths?|slugs?|ids?)$/i\nconst TECHNICAL_FIELD = /^(role|type|kind|mode|status|stage|channel|animation|dateStyle|timeStyle|format|method|variant|value|key|id|slug|path|route|url|month|year|day|hour|minute|second)$/i",
  'technical field classification',
)

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
  "function renderedJsxExpression(node) {",
  "function inTechnicalProperty(node) {\n  for (let current = node.parent; current; current = current.parent) {\n    if (ts.isPropertyAssignment(current) && TECHNICAL_FIELD.test(propName(current.name))) return true\n    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) break\n  }\n  return false\n}\n\nfunction renderedJsxExpression(node) {",
  'technical property exclusion',
)

replaceOnce(
  "    if (ts.isCallExpression(current)) {\n      const name = calleeName(current.expression)\n      if (name === 't' || name === 'uiText') return false\n    }",
  "    if (ts.isCallExpression(current)) return false",
  'function argument exclusion',
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

replaceOnce(
  "      if ((FALLBACK_PROPS.has(name) || UI_FIELDS.has(name) || displayStatus) && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {",
  "      if (!TECHNICAL_FIELD.test(name) && (FALLBACK_PROPS.has(name) || UI_FIELDS.has(name) || displayStatus) && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {",
  'technical object-field preservation',
)

replaceOnce(
  "      if (!isModule && !isDirective && !isPropertyKey && !alreadyHandled && (inEnglishCopyTable(node) || inCopyishVariable(node) || renderedJsxExpression(node))) addCopy(node, node.text, 'central-copy')",
  "      if (!isModule && !isDirective && !isPropertyKey && !alreadyHandled && !inTechnicalProperty(node) && (inEnglishCopyTable(node) || renderedJsxExpression(node))) addCopy(node, node.text, 'central-copy')",
  'remove unsafe generic copy-variable migration',
)

fs.writeFileSync(target, source, 'utf8')
console.log('Prepared exact-value locale migration with JSX spacing and strict technical-literal safeguards.')
