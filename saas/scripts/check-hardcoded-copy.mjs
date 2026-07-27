#!/usr/bin/env node
// saas/scripts/check-hardcoded-copy.mjs
//
// AST-BASED HARDCODED-UI-COPY GUARD.
//
// WHY THIS REPLACES THE OLD SCANNER. The previous version matched `>text<` with a
// regex, which cannot tell JSX text apart from TypeScript generic syntax —
// `Promise<T>` and `Record<K, V>` read as "text between angle brackets" to a regex
// exactly the way `<p>Hello</p>` does. Run against this repository it produced 250+
// hits, nearly all of them generic types in plain .ts library files with no UI at
// all — and it MISSED every one of the real hardcoded pages checked against it by
// hand. A check that is this noisy can never be turned on: the first thing a team
// does with a gate that cries wolf on every PR is stop reading it, which is worse
// than having no gate.
//
// This version parses real syntax trees with the TypeScript compiler (already a
// project dependency), so a JSX text node and a generic type parameter are never
// confused — they are different node kinds to a real parser.
//
// WHAT IT FLAGS: a .tsx file that renders visible text (JSX text content, or a
// placeholder/aria-label/title/alt attribute) while calling NONE of this repo's i18n
// mechanisms — no useI18n()/useTranslation(), no local COPY dictionary, no import
// from lib/i18n/. That is a real, unambiguous defect: the file has literally never
// been wired for translation. It does not attempt to catch a stray bare string
// inside a file that is otherwise correctly wired — that needs judgment about which
// specific text is user data versus UI copy, which a fast CI gate should not guess
// at. Catching the "never wired at all" population already closes most of the gap.
//
// BASELINE, NOT A BIG-BANG GATE. This repository already has known hardcoded-copy
// debt (see i18n-hardcoded-baseline.json) from before this guard existed. Turning
// the guard on as a hard block against that debt would fail every future PR for a
// pre-existing problem nobody touched, which trains people to ignore CI rather than
// fix it. So: files already in the baseline are reported but do not fail the build.
// Any file NOT in the baseline — a new file, or an existing file with new hardcoded
// text added to it — fails immediately. Removing a file from the baseline once it is
// fixed is how the backlog's shrinking size becomes visible progress instead of a
// permanent exemption.

import ts from 'typescript'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.cwd()
const BASELINE_PATH = join(ROOT, 'scripts', 'i18n-hardcoded-baseline.json')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}

function hasWords(text) {
  return /[A-Za-z]{3,}/.test(text) && !/^[\s\d.,:/#%()\-\u2013\u2014+*|]*$/.test(text)
}

function findHardcodedFiles() {
  const roots = ['app', 'components'].map(d => join(ROOT, d)).filter(existsSync)
  const files = roots.flatMap(r => walk(r))
  const hits = []

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    if (src.trim().length < 60) continue

    const usesI18nHook = /\buseI18n\s*\(|\buseTranslation\s*\(/.test(src)
    const hasLocalCopy = /\bconst\s+COPY\s*:/.test(src) || /\bconst\s+copy\s*:/.test(src)
    const importsSharedCopy = /from ['"]@\/lib\/i18n\//.test(src)
    // LocalizedText and the useTranslation hook live under components/i18n/, not
    // lib/i18n/ — a file using only this mechanism is genuinely wired, and missing
    // this path produced a false positive on a file already fixed this session.
    const importsI18nComponent = /from ['"]@\/components\/i18n\//.test(src)
    if (usesI18nHook || hasLocalCopy || importsSharedCopy || importsI18nComponent) continue

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let found = false
    function walkAst(node) {
      if (found) return
      if (ts.isJsxText(node)) {
        if (hasWords(node.getText(sf).trim())) { found = true; return }
      }
      if (ts.isJsxAttribute(node) && node.name && ['placeholder', 'aria-label', 'title', 'alt'].includes(node.name.getText(sf))) {
        if (node.initializer && ts.isStringLiteral(node.initializer) && hasWords(node.initializer.text)) { found = true; return }
      }
      ts.forEachChild(node, walkAst)
    }
    walkAst(sf)
    if (found) hits.push(relative(ROOT, file).split('\\').join('/'))
  }
  return hits.sort()
}

const baseline = existsSync(BASELINE_PATH) ? new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files) : new Set()
const current = findHardcodedFiles()

if (process.argv.includes('--write-baseline')) {
  // Deliberately the SAME findHardcodedFiles() the check itself runs — a baseline
  // generated by separate, drifting logic is how a file gets exempted for the wrong
  // reason, which already happened once while building this guard.
  const payload = {
    _comment: "Known hardcoded-UI-copy debt as of the AST-based guard's introduction. New files are NOT allowed here — the guard fails the build for anything not already listed. Remove an entry once its file is wired for i18n.",
    generatedAt: new Date().toISOString().slice(0, 10),
    files: current,
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`Baseline written: ${current.length} file(s).`)
  process.exit(0)
}

const newViolations = current.filter(f => !baseline.has(f))
const fixed = [...baseline].filter(f => !current.includes(f))

if (newViolations.length > 0) {
  console.error('New hardcoded UI copy detected — these files render visible English text but call no i18n mechanism (useI18n/useTranslation, a local COPY dict, or a lib/i18n import):')
  for (const f of newViolations) console.error(`  - ${f}`)
  console.error('')
  console.error('Wire the file into i18n before merging, OR — if this is genuinely pre-existing debt being')
  console.error(`moved rather than new — add it to ${relative(ROOT, BASELINE_PATH)} explicitly, with a reason.`)
  process.exit(1)
}

if (fixed.length > 0) {
  console.log(`${fixed.length} file(s) no longer hardcoded and can be removed from the baseline:`)
  for (const f of fixed) console.log(`  - ${f}`)
  console.log('(Not failing the build for this — remove them from the baseline file when convenient.)')
}

console.log(`Hardcoded-copy guard passed. ${current.length} file(s) remain in the known baseline; 0 new violations.`)
