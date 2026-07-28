// saas/scripts/check-hardcoded-copy.mjs
//
// i18n hardcoded-copy guard (AST-based).
//
// WHAT IT FLAGS
//   A .tsx file under app/ or components/ that renders a LITERAL English string
//   as visible UI: a JsxText node, or a literal placeholder / aria-label / title /
//   alt attribute value.
//
//   The check is PER STRING, not per file. A file that correctly calls t() or
//   useI18n() for its title and still ships a bare <button>Delete account</button>
//   is flagged for that button. Earlier versions skipped the whole file as soon as
//   they saw any i18n mechanism; that hid ~94 real leaks.
//
//   It never flags a JSX EXPRESSION ({item.name}, {t('key','Fallback')}) — so
//   legitimate translation call sites, and data rendered through variables, are
//   invisible to this guard by construction. Literal JSX text is UI copy wherever
//   it sits.
//
// BASELINE
//   scripts/i18n-hardcoded-baseline.json captures day-one debt. Anything already in
//   the baseline is REPORTED but does not block. Anything new fails the build.
//
//   Regenerating the baseline is legitimate exactly once per rule change — to
//   capture pre-existing debt when a STRICTER rule turns on. Regenerating it to
//   sweep away violations someone just introduced under the EXISTING rule defeats
//   the guard entirely. Do not do that.
//
// USAGE
//   node scripts/check-hardcoded-copy.mjs                 # check (exit 1 on new violations)
//   node scripts/check-hardcoded-copy.mjs --write-baseline # regenerate baseline
//   node scripts/check-hardcoded-copy.mjs --list           # print every violation, baselined or not
//
// EXIT CODES
//   0 = no new violations (prints the success sentinel line below)
//   1 = new violations, or the guard itself could not run
//
// SUCCESS SENTINEL (do not change without updating whatever asserts on it):
//   [validate:i18n-copy] PASS

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(APP_ROOT, 'scripts', 'i18n-hardcoded-baseline.json');
const SCAN_ROOTS = ['app', 'components'];
const CHECKED_ATTRS = new Set(['placeholder', 'aria-label', 'title', 'alt']);
const SKIP_DIRS = new Set(['api', 'node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__']);
const SENTINEL = '[validate:i18n-copy] PASS';
const TECHNICAL_LITERALS = new Set([
  'en', 'es', 'pt', 'pl', 'ru', 'fr', 'de', 'it', 'ja', 'ko', 'zh',
  'px', 'ms', 's', 'kb', 'mb', 'gb', 'tb',
]);

let ts;
try {
  ts = require('typescript');
} catch {
  fail(
    'Could not load the TypeScript compiler.\n' +
    'This guard parses real ASTs; it cannot fall back to regex (regex cannot tell\n' +
    'JSX text from generic syntax such as Promise<T>, which is why the previous\n' +
    'regex version produced 250+ false hits and missed every real one).\n' +
    'Run `npm install` and try again.'
  );
}

function fail(message) {
  console.error('\ni18n copy guard could not run:\n');
  console.error(message);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * File discovery
 * ------------------------------------------------------------------ */

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.tsx')) continue;
    if (/\.(test|spec|stories)\.tsx$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) walk(path.join(APP_ROOT, root), files);
  return files.sort();
}

const relPath = (full) => path.relative(APP_ROOT, full).split(path.sep).join('/');

/* ------------------------------------------------------------------ *
 * Detection — the single source of truth.
 * The check and --write-baseline both call this. Two copies of "similar"
 * logic is how a file ends up exempted for the wrong reason.
 * ------------------------------------------------------------------ */

function normalize(raw) {
  return String(raw).replace(/\s+/g, ' ').trim();
}

// Canonical form used ONLY for baseline comparison, so a whitespace or quote-style
// difference between the baseline and a rescan cannot manufacture a false failure.
function canonical(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isUserFacingCopy(value) {
  const text = normalize(value);
  if (!text) return false;
  if (TECHNICAL_LITERALS.has(text.toLowerCase())) return false;
  if (/^(&[a-zA-Z]+;|&#\d+;|\s)+$/.test(text)) return false; // entity-only, e.g. &nbsp;
  if (!/[A-Za-z]{2,}/.test(text)) return false;               // punctuation, digits, bullets, single letters
  return true;
}

function attributeName(node, sourceFile) {
  if (!node.name) return '';
  if (ts.isIdentifier(node.name)) return node.name.text;
  try {
    return node.name.getText(sourceFile);
  } catch {
    return '';
  }
}

function detectHardcodedStrings(fullPath, sourceText) {
  const sourceFile = ts.createSourceFile(
    fullPath,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );

  const hits = [];
  const seen = new Set();

  const record = (node, value, kind) => {
    const text = normalize(value);
    if (!isUserFacingCopy(text)) return;
    let line = 0;
    try {
      line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    } catch {
      line = 0;
    }
    const key = `${kind}:${line}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({ text, line, kind });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      record(node, node.text, 'jsx-text');
    } else if (ts.isJsxAttribute(node)) {
      const name = attributeName(node, sourceFile);
      if (CHECKED_ATTRS.has(name) && node.initializer) {
        const init = node.initializer;
        if (ts.isStringLiteral(init)) {
          record(init, init.text, `attr:${name}`);
        } else if (
          ts.isJsxExpression(init) &&
          init.expression &&
          ts.isStringLiteral(init.expression)
        ) {
          record(init.expression, init.expression.text, `attr:${name}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  hits.sort((a, b) => a.line - b.line || a.text.localeCompare(b.text));
  return hits;
}

function scanRepo() {
  const results = new Map(); // relPath -> hits[]
  const files = collectFiles();

  // A detector that finds nothing everywhere is a bug signal, not a clean repo.
  // If the roots resolved wrong, this guard would "pass" while scanning nothing.
  if (!files.length) {
    fail(
      `No .tsx files found under ${SCAN_ROOTS.join(', ')} in ${APP_ROOT}.\n` +
      'The guard scanned nothing, so a pass here would be meaningless.\n' +
      'Run it from the saas app (it expects to live at saas/scripts/).'
    );
  }

  for (const full of files) {
    let sourceText;
    try {
      sourceText = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const hits = detectHardcodedStrings(full, sourceText);
    if (hits.length) results.set(relPath(full), hits);
  }
  return results;
}

/* ------------------------------------------------------------------ *
 * Baseline loading — deliberately shape-tolerant.
 * Accepts:  ["app/x.tsx", ...]
 *           [{ file|path, strings? }, ...]
 *           { "app/x.tsx": ["..."] | 3 | true | false }
 *           { files: <any of the above> }
 * Per-string data is used when present; otherwise the file is exempt wholesale.
 * ------------------------------------------------------------------ */

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    fail(
      `Baseline not found: ${relPath(BASELINE_PATH)}\n` +
      'Refusing to pass without it — a missing baseline would silently exempt nothing\n' +
      'and fail every file, or (worse) be "fixed" by disabling the guard.\n' +
      'Regenerate with: node scripts/check-hardcoded-copy.mjs --write-baseline'
    );
  }

  let parsed;
  const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(
      `Baseline is not valid JSON: ${relPath(BASELINE_PATH)}\n${error.message}\n` +
      'If this file was pasted over with something else, restore it before trusting a green build.'
    );
  }

  const container =
    parsed && !Array.isArray(parsed) && typeof parsed === 'object' && parsed.files !== undefined
      ? parsed.files
      : parsed;

  const strings = new Map(); // relPath -> Set<canonical> | null (null = whole-file exemption)

  const addEntry = (file, value) => {
    if (typeof file !== 'string' || !file) return;
    const key = file.split(path.sep).join('/').replace(/^\.\//, '');
    if (value === false) return; // explicitly "not in baseline"
    if (Array.isArray(value)) {
      const set = new Set();
      for (const item of value) {
        if (typeof item === 'string') set.add(canonical(item));
        else if (item && typeof item === 'object' && typeof item.text === 'string') set.add(canonical(item.text));
      }
      strings.set(key, set.size ? set : null);
      return;
    }
    strings.set(key, null); // true / number / object / undefined -> file-level exemption
  };

  if (Array.isArray(container)) {
    for (const entry of container) {
      if (typeof entry === 'string') addEntry(entry, null);
      else if (entry && typeof entry === 'object') {
        const file = entry.file ?? entry.path ?? entry.filePath;
        addEntry(file, entry.strings ?? entry.violations ?? null);
      }
    }
  } else if (container && typeof container === 'object') {
    for (const [file, value] of Object.entries(container)) addEntry(file, value);
  } else {
    fail(`Baseline has an unrecognized shape: ${relPath(BASELINE_PATH)}`);
  }

  return strings;
}

/* ------------------------------------------------------------------ *
 * Modes
 * ------------------------------------------------------------------ */

function writeBaseline(results) {
  const files = {};
  for (const [file, hits] of [...results.entries()].sort()) {
    files[file] = hits.map((hit) => hit.text);
  }
  const payload = {
    _path: 'saas/scripts/i18n-hardcoded-baseline.json',
    _note:
      'Known hardcoded-copy debt, captured by scripts/check-hardcoded-copy.mjs. ' +
      'Files listed here are reported but do not fail the build. Regenerate ONLY when the ' +
      'detection rule itself gets stricter — never to clear violations someone just added.',
    generatedAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    files,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const total = Object.values(files).reduce((sum, list) => sum + list.length, 0);
  console.log(`Wrote ${relPath(BASELINE_PATH)}: ${Object.keys(files).length} files, ${total} strings.`);
  console.log('Commit this only if the detection rule changed. Otherwise you just disabled the guard.');
}

function report(results, baseline, listEverything) {
  const violations = [];
  let baselinedFiles = 0;
  let baselinedStrings = 0;

  for (const [file, hits] of [...results.entries()].sort()) {
    const known = baseline.get(file);
    const inBaseline = baseline.has(file);
    if (inBaseline) baselinedFiles += 1;

    for (const hit of hits) {
      const isKnown = inBaseline && (known === null || known.has(canonical(hit.text)));
      if (isKnown) {
        baselinedStrings += 1;
        if (listEverything) console.log(`  known    ${file}:${hit.line}  ${JSON.stringify(hit.text)}`);
      } else {
        violations.push({ file, ...hit });
        if (listEverything) console.log(`  NEW      ${file}:${hit.line}  ${JSON.stringify(hit.text)}`);
      }
    }
  }

  if (!violations.length) {
    console.log(
      `${SENTINEL} — ${results.size} files with known copy debt ` +
      `(${baselinedFiles} baselined, ${baselinedStrings} strings), 0 new violations.`
    );
    return 0;
  }

  console.error('\nHardcoded UI copy that is not in the i18n baseline:\n');
  let currentFile = '';
  for (const violation of violations) {
    if (violation.file !== currentFile) {
      currentFile = violation.file;
      console.error(`  ${currentFile}`);
    }
    console.error(`    line ${violation.line}  [${violation.kind}]  ${JSON.stringify(violation.text)}`);
  }
  console.error(
    `\n${violations.length} new hardcoded string(s) across ` +
    `${new Set(violations.map((v) => v.file)).size} file(s).\n`
  );
  console.error(
    'This is checked per string, so it applies even inside a file that already calls\n' +
    "t() or useI18n() elsewhere. Route each string through this repo's i18n:\n" +
    "  t('some.key', 'English fallback')            lib/i18n/t.ts\n" +
    '  <LocalizedText fallback="English" />         components/i18n/LocalizedText.tsx\n' +
    '  a per-component COPY dictionary keyed by language\n\n' +
    'Do NOT regenerate the baseline to make this pass. The baseline exists to hold\n' +
    'day-one debt, not to absorb new debt.\n'
  );
  return 1;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  const wantsBaseline = args.includes('--write-baseline');
  const listEverything = args.includes('--list');

  const results = scanRepo();

  if (wantsBaseline) {
    writeBaseline(results);
    return 0;
  }

  return report(results, loadBaseline(), listEverything);
}

try {
  process.exit(main());
} catch (error) {
  // A guard that dies quietly is not a guard. Any unexpected failure is a build failure.
  console.error('\ni18n copy guard crashed:\n');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
