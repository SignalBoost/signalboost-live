// saas/scripts/check-rtl-logical-styles.mjs
//
// Arabic renders right-to-left (writingDirection('ar') === 'rtl' sets <html dir>). Physical
// left/right styling does not mirror, so UI in app/ and components/ must use logical
// equivalents that follow the reading direction:
//   style objects   marginLeft → marginInlineStart, paddingRight → paddingInlineEnd,
//                   borderLeft* → borderInlineStart*, textAlign 'left' → 'start',
//                   left/right (literal, positioned, not translate-centred) → insetInlineStart/End
//   className       ml-/mr- → ms-/me-, pl-/pr- → ps-/pe-, left-/right- → start-/end-,
//                   text-left/right → text-start/end, border-l/r → border-s/e,
//                   rounded-l/r/tl/tr/bl/br → rounded-s/e/ss/se/es/ee
// Computed positions (tooltips, pointer coordinates) and translate-based centring stay
// physical on purpose: mirroring them would misplace the element.
//
// USAGE
//   node scripts/check-rtl-logical-styles.mjs           # fail on physical styling
//   node scripts/check-rtl-logical-styles.mjs --write   # rewrite to logical styling

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_ROOTS = ['app', 'components']
const SKIP_DIRS = new Set(['api', 'node_modules', '.next', '__tests__', '__mocks__'])
const WRITE = process.argv.includes('--write')

const STYLE_KEYS = {
  marginLeft: 'marginInlineStart', marginRight: 'marginInlineEnd',
  paddingLeft: 'paddingInlineStart', paddingRight: 'paddingInlineEnd',
  borderLeft: 'borderInlineStart', borderRight: 'borderInlineEnd',
  borderLeftColor: 'borderInlineStartColor', borderRightColor: 'borderInlineEndColor',
  borderLeftWidth: 'borderInlineStartWidth', borderRightWidth: 'borderInlineEndWidth',
  borderLeftStyle: 'borderInlineStartStyle', borderRightStyle: 'borderInlineEndStyle',
  borderTopLeftRadius: 'borderStartStartRadius', borderTopRightRadius: 'borderStartEndRadius',
  borderBottomLeftRadius: 'borderEndStartRadius', borderBottomRightRadius: 'borderEndEndRadius',
}
const INSET_KEYS = { left: 'insetInlineStart', right: 'insetInlineEnd' }
const POSITIONED_SIBLINGS = new Set(['position', 'top', 'bottom', 'inset', 'zIndex'])
const CLASS_MAP = [
  [/^(-?)ml-/, '$1ms-'], [/^(-?)mr-/, '$1me-'], [/^pl-/, 'ps-'], [/^pr-/, 'pe-'],
  [/^(-?)left-/, '$1start-'], [/^(-?)right-/, '$1end-'],
  [/^text-left$/, 'text-start'], [/^text-right$/, 'text-end'],
  [/^border-l(?=$|-)/, 'border-s'], [/^border-r(?=$|-)/, 'border-e'],
  [/^rounded-tl(?=$|-)/, 'rounded-ss'], [/^rounded-tr(?=$|-)/, 'rounded-se'],
  [/^rounded-bl(?=$|-)/, 'rounded-es'], [/^rounded-br(?=$|-)/, 'rounded-ee'],
  [/^rounded-l(?=$|-)/, 'rounded-s'], [/^rounded-r(?=$|-)/, 'rounded-e'],
]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

const keyName = (prop) => prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null
const isLiteral = (node) => ts.isNumericLiteral(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
  (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand))

function rewriteClassToken(token) {
  const parts = token.split(':')
  const utility = parts.pop()
  for (const [pattern, replacement] of CLASS_MAP) {
    if (pattern.test(utility)) return [...parts, utility.replace(pattern, replacement)].join(':')
  }
  return token
}

function rewriteClassText(text) {
  const tokens = text.split(/(\s+)/)
  const centred = tokens.some(token => /(^|:)-?translate-x-/.test(token))
  return tokens.map(token => {
    if (!token.trim()) return token
    if (centred && /(^|:)-?(left|right)-/.test(token)) return token
    return rewriteClassToken(token)
  }).join('')
}

function scan(full) {
  const source = fs.readFileSync(full, 'utf8')
  const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  const record = (node, start, end, replacement, label) => {
    const { line } = sf.getLineAndCharacterOfPosition(start)
    edits.push({ start, end, replacement, label, line: line + 1 })
  }

  function visitObject(obj) {
    const keys = new Set(obj.properties.map(keyName).filter(Boolean))
    const positioned = [...keys].some(key => POSITIONED_SIBLINGS.has(key)) && !keys.has('transform')
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = keyName(prop)
      if (!key) continue
      const logical = STYLE_KEYS[key] || (positioned && INSET_KEYS[key] && isLiteral(prop.initializer) ? INSET_KEYS[key] : null)
      if (logical && !keys.has(logical)) record(prop, prop.name.getStart(sf), prop.name.end, logical, `${key} → ${logical}`)
      if (key === 'textAlign' && ts.isStringLiteral(prop.initializer) && /^(left|right)$/.test(prop.initializer.text)) {
        const value = prop.initializer.text === 'left' ? 'start' : 'end'
        const quote = source[prop.initializer.getStart(sf)]
        record(prop, prop.initializer.getStart(sf), prop.initializer.end, `${quote}${value}${quote}`, `textAlign ${prop.initializer.text} → ${value}`)
      }
    }
  }

  function visitClassStrings(node) {
    const literal = (lit, start, end, raw) => {
      const next = rewriteClassText(raw)
      if (next !== raw) record(lit, start, end, next, `className "${raw.trim().slice(0, 60)}"`)
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literal(node, node.getStart(sf) + 1, node.end - 1, node.text)
    else if (ts.isTemplateExpression(node)) {
      literal(node.head, node.head.getStart(sf) + 1, node.head.end - 2, node.head.text)
      for (const span of node.templateSpans) {
        const tail = ts.isTemplateTail(span.literal)
        literal(span.literal, span.literal.getStart(sf) + 1, span.literal.end - (tail ? 1 : 2), span.literal.text)
      }
    }
    ts.forEachChild(node, visitClassStrings)
  }

  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) visitObject(node)
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'className' && node.initializer) {
      visitClassStrings(node.initializer)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  let output = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end)
  return { rel: path.relative(ROOT, full), source, output, edits }
}

const results = SCAN_ROOTS.flatMap(root => walk(path.join(ROOT, root))).map(scan)
const findings = results.flatMap(result => result.edits.map(edit => ({ file: result.rel, ...edit })))

if (WRITE) {
  for (const result of results) if (result.output !== result.source) fs.writeFileSync(path.join(ROOT, result.rel), result.output, 'utf8')
  console.log(`[validate:rtl-logical-styles] rewrote ${findings.length} physical left/right styles in ${results.filter(r => r.edits.length).length} files.`)
  process.exit(0)
}
if (findings.length) {
  for (const finding of findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) console.error(`${finding.file}:${finding.line}\t${finding.label}`)
  console.error(`[validate:rtl-logical-styles] FAIL — ${findings.length} physical left/right styles do not mirror for Arabic (RTL). Run with --write.`)
  process.exit(1)
}
console.log('[validate:rtl-logical-styles] PASS — UI styling uses logical (direction-aware) properties.')
