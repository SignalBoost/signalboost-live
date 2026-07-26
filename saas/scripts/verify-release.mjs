// Independently verifies a packaged portable release without reusing packer logic.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const releaseDir = process.argv[2];
if (!releaseDir) {
  console.error('usage: node scripts/verify-release.mjs <release-directory>');
  process.exit(1);
}

const root = path.resolve(process.cwd(), releaseDir);
const fail = (message) => {
  console.error(`\n  RELEASE VERIFICATION FAILED: ${message}\n`);
  process.exit(1);
};
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const readJson = (name) => {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) fail(`${name} is missing`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`release directory not found: ${releaseDir}`);

const manifest = readJson('manifest.json');
const sbom = readJson('sbom.json');
const packageJson = readJson('package.json');

if (manifest.schema !== 'signalboost.portable-release/1') fail(`unsupported manifest schema: ${manifest.schema}`);
if (!manifest.id || !manifest.version || !Array.isArray(manifest.files)) fail('manifest is missing id, version, or files');
if (packageJson.name !== manifest.id && packageJson.version !== manifest.version) {
  if (packageJson.version !== manifest.version) fail('package.json version does not match manifest');
}
if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5') fail('sbom.json is not CycloneDX 1.5');
if (sbom.metadata?.component?.version !== manifest.version) fail('SBOM component version does not match manifest');

const declared = new Set();
for (const entry of manifest.files) {
  if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string' || typeof entry.bytes !== 'number') {
    fail('manifest contains an invalid file entry');
  }
  if (entry.path.startsWith('/') || entry.path.split('/').includes('..')) fail(`unsafe manifest path: ${entry.path}`);
  if (declared.has(entry.path)) fail(`duplicate manifest path: ${entry.path}`);
  declared.add(entry.path);
  const absolute = path.resolve(root, entry.path);
  if (!absolute.startsWith(root + path.sep)) fail(`manifest path escapes release root: ${entry.path}`);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`declared file is missing: ${entry.path}`);
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== entry.bytes) fail(`byte count mismatch for ${entry.path}`);
  if (sha256(bytes) !== entry.sha256) fail(`SHA-256 mismatch for ${entry.path}`);
}

const checksumFile = path.join(root, 'SHA256SUMS');
if (!fs.existsSync(checksumFile)) fail('SHA256SUMS is missing');
const checksumLines = fs.readFileSync(checksumFile, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const checksums = new Map();
for (const line of checksumLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) fail(`invalid SHA256SUMS line: ${line}`);
  checksums.set(match[2], match[1]);
}
if (checksums.size !== declared.size) fail('SHA256SUMS entry count does not match manifest');
for (const entry of manifest.files) {
  if (checksums.get(entry.path) !== entry.sha256) fail(`SHA256SUMS disagrees with manifest for ${entry.path}`);
}

const payloadRoot = path.join(root, 'payload');
if (!fs.existsSync(payloadRoot) || !fs.statSync(payloadRoot).isDirectory()) fail('payload directory is missing');
const actualPayloadFiles = [];
const walk = (directory) => {
  for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, dirent.name);
    if (dirent.isSymbolicLink()) fail(`symbolic links are not allowed: ${path.relative(root, absolute)}`);
    if (dirent.isDirectory()) walk(absolute);
    else if (dirent.isFile()) actualPayloadFiles.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
};
walk(payloadRoot);
for (const file of actualPayloadFiles) {
  if (!declared.has(file)) fail(`payload contains an undeclared file: ${file}`);
}

for (const required of ['RELEASE-NOTES.md', 'manifest.json', 'SHA256SUMS', 'sbom.json', 'package.json']) {
  if (!fs.existsSync(path.join(root, required))) fail(`${required} is missing`);
}

console.log(`verified ${manifest.id} ${manifest.version}: ${manifest.files.length} declared files, ${actualPayloadFiles.length} payload files`);
