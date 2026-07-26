// saas/scripts/package-portable.mjs
//
// Builds a versioned, buyer-installable release of ONE portable.
//
// It does not trust a hand-written file list. It walks the real import graph
// from the portable's declared buyer entry points, copies exactly the modules a
// buyer would load, and refuses to ship if the graph reaches something the spec
// did not declare.
//
// Usage (run from saas/):
//   node scripts/package-portable.mjs portable-release/self-healing.release.json
//   node scripts/package-portable.mjs portable-release/self-healing.release.json --no-archive
//
// Output: dist/portables/<id>/<version>/
//   payload/            the copied source tree, buyer-relative paths preserved
//   manifest.json       what this release is, what it needs, what it does not include
//   SHA256SUMS          one line per payload file
//   sbom.json           CycloneDX 1.5, external + runtime dependencies
//   package.json        so the payload is npm/tarball installable
//   RELEASE-NOTES.md    copied from the spec
//   <id>-<version>.tgz  the release archive (unless --no-archive)
//   <id>-<version>.tgz.sha256

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SPEC_PATH = process.argv[2];
const NO_ARCHIVE = process.argv.includes('--no-archive');

if (!SPEC_PATH) {
  fail('usage: node scripts/package-portable.mjs <spec.json> [--no-archive]');
}

const ROOT = process.cwd();
const SOURCE_EXTS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];

// ---------------------------------------------------------------- helpers

function fail(msg) {
  console.error(`\n  RELEASE BLOCKED: ${msg}\n`);
  process.exit(1);
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isRelative(spec) {
  return spec.startsWith('./') || spec.startsWith('../');
}

function isBuiltin(spec) {
  const bare = spec.startsWith('node:') ? spec.slice(5) : spec;
  return (
    spec.startsWith('node:') ||
    ['fs', 'path', 'crypto', 'url', 'util', 'os', 'events', 'stream', 'buffer', 'child_process', 'assert', 'timers', 'zlib', 'http', 'https', 'net', 'tls', 'worker_threads', 'perf_hooks'].includes(bare)
  );
}

// Static import extraction. Deliberately regex-based and deliberately greedy:
// it must also catch `await import('...')` lazy loads, because a lazy platform
// import is exactly the kind of coupling that has to appear in the manifest.
function specifiersIn(source) {
  const found = new Set();
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) found.add(m[1]);
  }
  return [...found];
}

// Resolve a relative specifier the way both tsc and node-with-ts would.
function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base];
  for (const ext of SOURCE_EXTS) candidates.push(base + ext);
  // '.js' written in source but '.ts' on disk (NodeNext style)
  if (base.endsWith('.js')) {
    for (const ext of ['.ts', '.tsx']) candidates.push(base.slice(0, -3) + ext);
  }
  for (const ext of SOURCE_EXTS) candidates.push(path.join(base, 'index' + ext));
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------- spec

if (!fs.existsSync(SPEC_PATH)) fail(`spec not found: ${SPEC_PATH}`);
const spec = JSON.parse(read(SPEC_PATH));

for (const required of ['id', 'version', 'entryPoints', 'payloadRoot']) {
  if (!spec[required]) fail(`spec is missing "${required}"`);
}
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(spec.version)) {
  fail(`version "${spec.version}" is not semantic versioning`);
}

const hostFallbacks = new Set(spec.hostFallbacks || []);
// Naming exceptions may be a bare path or { path, reason }. The reason is
// carried into the manifest so a buyer's security reviewer reads the
// justification in the artifact, not in a chat log.
const namingExceptionReasons = new Map();
for (const e of spec.knownNamingExceptions || []) {
  if (typeof e === 'string') namingExceptionReasons.set(e, '');
  else namingExceptionReasons.set(e.path, e.reason || '');
}
const knownNamingExceptions = new Set(namingExceptionReasons.keys());
const namingPattern = new RegExp(spec.namingPattern || 'signalboost', 'i');

// ---------------------------------------------------------------- graph walk

const visited = new Map(); // absPath -> { rel, source }
const externals = new Map(); // specifier -> Set of importing files
const builtins = new Set();
const unresolved = []; // { from, spec }
const queue = [];

for (const entry of spec.entryPoints) {
  const abs = path.resolve(ROOT, entry);
  if (!fs.existsSync(abs)) fail(`entry point does not exist: ${entry}`);
  queue.push(abs);
}

while (queue.length) {
  const abs = queue.shift();
  if (visited.has(abs)) continue;

  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (rel.startsWith('..')) fail(`import graph escaped the repo: ${rel}`);

  const source = read(abs);
  visited.set(abs, { rel, source });

  for (const s of specifiersIn(source)) {
    if (isBuiltin(s)) {
      builtins.add(s);
      continue;
    }
    if (!isRelative(s)) {
      // Bare or aliased. If the spec declared it as a host fallback we record
      // it and stop; otherwise it is a real runtime dependency of the payload.
      if (hostFallbacks.has(s)) {
        if (!externals.has(s)) externals.set(s, new Set());
        externals.get(s).add(rel);
        continue;
      }
      if (s.startsWith('@/') || s.startsWith('~/')) {
        unresolved.push({ from: rel, spec: s });
        continue;
      }
      if (!externals.has(s)) externals.set(s, new Set());
      externals.get(s).add(rel);
      continue;
    }
    const target = resolveRelative(abs, s);
    if (!target) {
      unresolved.push({ from: rel, spec: s });
      continue;
    }
    queue.push(target);
  }
}

// ---------------------------------------------------------------- gates

if (unresolved.length) {
  const lines = unresolved.map((u) => `    ${u.from}  ->  ${u.spec}`).join('\n');
  fail(
    `the buyer import graph reaches ${unresolved.length} specifier(s) that cannot be\n` +
      `  packaged and were not declared in "hostFallbacks". A buyer extracting this\n` +
      `  archive would get an unresolvable import:\n\n${lines}\n\n` +
      `  Either make the module host-agnostic, or declare the specifier in the spec's\n` +
      `  hostFallbacks with an explanation of what the buyer must supply.`,
  );
}

if (spec.minModules && visited.size < spec.minModules) {
  fail(
    `graph walk reached only ${visited.size} modules but the spec expects at least ` +
      `${spec.minModules}. A short walk usually means an entry point moved or an import ` +
      `style changed — it must not silently ship a partial payload.`,
  );
}

// Naming gate: the build platform's name must not land in a buyer's artifacts.
// Known violations are declared per-file in the spec so that a NEW one blocks
// the release while the tracked ones stay visible in the manifest.
const namingHits = [];
for (const { rel, source } of visited.values()) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (namingPattern.test(stripped)) namingHits.push(rel);
}
const newNamingHits = namingHits.filter((r) => !knownNamingExceptions.has(r));
if (newNamingHits.length) {
  fail(
    `the build platform's name appears in ${newNamingHits.length} payload file(s) that are\n` +
      `  not declared in "knownNamingExceptions":\n\n` +
      newNamingHits.map((r) => `    ${r}`).join('\n') +
      `\n\n  This name reaches a buyer's evidence records, logs and SIEM. Remove it, or\n` +
      `  declare the file with a reason if it is tracked work.`,
  );
}

// ---------------------------------------------------------------- write

const outDir = path.resolve(ROOT, 'dist', 'portables', spec.id, spec.version);
fs.rmSync(outDir, { recursive: true, force: true });
const payloadDir = path.join(outDir, 'payload');
fs.mkdirSync(payloadDir, { recursive: true });

const payloadRoot = spec.payloadRoot.replace(/\/+$/, '') + '/';
const files = [];

for (const { rel, source } of [...visited.values()].sort((a, b) => a.rel.localeCompare(b.rel))) {
  if (!rel.startsWith(payloadRoot)) {
    fail(
      `graph reached "${rel}", which is outside the declared payloadRoot "${payloadRoot}".\n` +
        `  Widen payloadRoot only if that module genuinely belongs to this portable.`,
    );
  }
  const buyerRel = rel.slice(payloadRoot.length);
  const dest = path.join(payloadDir, buyerRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, source);
  files.push({
    path: `payload/${buyerRel}`,
    bytes: Buffer.byteLength(source),
    sha256: sha256(source),
  });
}

// Extra buyer-facing files (integration guide, licence, notes) copied verbatim.
for (const extra of spec.includeFiles || []) {
  const from = path.resolve(ROOT, extra.from);
  if (!fs.existsSync(from)) fail(`includeFiles: missing ${extra.from}`);
  const dest = path.join(outDir, extra.to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = fs.readFileSync(from);
  fs.writeFileSync(dest, buf);
  files.push({ path: extra.to, bytes: buf.length, sha256: sha256(buf) });
}

const entryMap = {};
for (const [name, target] of Object.entries(spec.buyerEntryPoints || {})) {
  entryMap[name] = target;
}

const manifest = {
  schema: 'signalboost.portable-release/1',
  id: spec.id,
  name: spec.name || spec.id,
  version: spec.version,
  description: spec.description || '',
  license: spec.license || 'SEE LICENSE IN LICENSE',
  builtAt: new Date().toISOString(),
  sourceCommit: gitCommit(),
  entryPoints: entryMap,
  moduleCount: visited.size,
  files,
  runtime: {
    nodeBuiltins: [...builtins].sort(),
    externalDependencies: [...externals.keys()].sort().map((s) => ({
      specifier: s,
      hostFallback: hostFallbacks.has(s),
      importedBy: [...externals.get(s)].sort(),
    })),
  },
  buyerMustSupply: spec.buyerMustSupply || [],
  notIncluded: spec.notIncluded || [],
  supportedPlatforms: spec.supportedPlatforms || [],
  upgradeCompatibility: spec.upgradeCompatibility || {},
  knownLimitations: spec.knownLimitations || [],
  acceptance: spec.acceptance || {},
  namingExceptions: namingHits
    .sort()
    .map((p) => ({ path: p, reason: namingExceptionReasons.get(p) || '' })),
};

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

fs.writeFileSync(
  path.join(outDir, 'SHA256SUMS'),
  files.map((f) => `${f.sha256}  ${f.path}`).join('\n') + '\n',
);

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    timestamp: manifest.builtAt,
    component: {
      type: 'library',
      'bom-ref': `${spec.id}@${spec.version}`,
      name: spec.id,
      version: spec.version,
      description: manifest.description,
    },
  },
  components: [...externals.keys()].sort().map((s) => ({
    type: 'library',
    'bom-ref': s,
    name: s,
    scope: hostFallbacks.has(s) ? 'optional' : 'required',
    description: hostFallbacks.has(s)
      ? 'Host fallback — not shipped; buyer supplies an implementation or an alternative.'
      : 'Runtime dependency of the payload.',
  })),
};
fs.writeFileSync(path.join(outDir, 'sbom.json'), JSON.stringify(sbom, null, 2) + '\n');

fs.writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify(
    {
      name: spec.packageName || `@portable/${spec.id}`,
      version: spec.version,
      description: manifest.description,
      license: manifest.license,
      type: 'module',
      files: ['payload', 'manifest.json', 'SHA256SUMS', 'sbom.json', 'RELEASE-NOTES.md', 'docs'],
      engines: spec.engines || { node: '>=20' },
      peerDependencies: Object.fromEntries(
        [...externals.keys()].filter((s) => !hostFallbacks.has(s)).map((s) => [s, '*']),
      ),
    },
    null,
    2,
  ) + '\n',
);

if (spec.releaseNotes) {
  const from = path.resolve(ROOT, spec.releaseNotes);
  if (!fs.existsSync(from)) fail(`releaseNotes not found: ${spec.releaseNotes}`);
  fs.copyFileSync(from, path.join(outDir, 'RELEASE-NOTES.md'));
}

let archive = null;
if (!NO_ARCHIVE) {
  const tgz = `${spec.id}-${spec.version}.tgz`;
  const archivePath = path.join(path.dirname(outDir), tgz);
  execFileSync(
    'tar',
    ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', archivePath, '-C', outDir, '.'],
    { cwd: ROOT },
  );
  fs.renameSync(archivePath, path.join(outDir, tgz));
  const buf = fs.readFileSync(path.join(outDir, tgz));
  fs.writeFileSync(path.join(outDir, `${tgz}.sha256`), `${sha256(buf)}  ${tgz}\n`);
  archive = tgz;
}

// ---------------------------------------------------------------- report

console.log(`\n  ${manifest.name}  ${spec.version}`);
console.log(`  commit        ${manifest.sourceCommit}`);
console.log(`  modules       ${visited.size}`);
console.log(`  payload files ${files.length}`);
console.log(`  externals     ${externals.size} (${[...externals.keys()].filter((s) => hostFallbacks.has(s)).length} host fallbacks)`);
if (namingHits.length) {
  console.log(`  naming        ${namingHits.length} tracked exception(s):`);
  for (const r of namingHits.sort()) console.log(`                  ${r}`);
}
console.log(`  output        ${path.relative(ROOT, outDir)}`);
if (archive) console.log(`  archive       ${archive}`);
console.log('');
