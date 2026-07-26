import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const SHA40 = /^[0-9a-f]{40}$/
const RELEASE_INPUTS = Object.freeze([
  'provider-hub-core',
  'provider-hub-host',
  'examples/provider-hub-reference',
  '../docs/portables/provider-hub-byok-portable.md',
  '../docs/portables/provider-hub-security-operations-acceptance.md',
])

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function packageProviderHubRelease({ version, sourceCommitSha, outputDirectory = 'dist/provider-hub' }) {
  if (!VERSION.test(version ?? '')) throw new Error('A semantic release version is required.')
  if (!SHA40.test(sourceCommitSha ?? '')) throw new Error('A lowercase 40-character source commit SHA is required.')

  const saasRoot = resolve(import.meta.dirname, '..')
  const outputRoot = resolve(saasRoot, outputDirectory)
  const archiveName = `signalboost-provider-hub-${version}.tar.gz`
  const archivePath = join(outputRoot, archiveName)
  const manifestPath = `${archivePath}.manifest.json`
  const stagingRoot = mkdtempSync(join(tmpdir(), 'signalboost-provider-hub-'))
  const packageRoot = join(stagingRoot, `signalboost-provider-hub-${version}`)

  try {
    mkdirSync(packageRoot, { recursive: true })
    for (const relativePath of RELEASE_INPUTS) {
      const sourcePath = resolve(saasRoot, relativePath)
      if (!existsSync(sourcePath)) throw new Error(`Missing release input: ${relativePath}`)
      const destinationPath = join(packageRoot, relativePath.replace(/^\.\.\//, ''))
      mkdirSync(resolve(destinationPath, '..'), { recursive: true })
      cpSync(sourcePath, destinationPath, { recursive: true, preserveTimestamps: false })
    }

    const releaseMetadata = Object.freeze({
      schemaVersion: 'signalboost-provider-hub-source-release.v1',
      productId: 'provider-hub',
      version,
      sourceCommitSha,
      inputs: RELEASE_INPUTS,
      signingEnabled: false,
      uploadEnabled: false,
      publicationEnabled: false,
      productionExecutionEnabled: false,
    })
    writeFileSync(join(packageRoot, 'RELEASE.json'), `${JSON.stringify(releaseMetadata, null, 2)}\n`, 'utf8')
    mkdirSync(outputRoot, { recursive: true })

    execFileSync('tar', [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '-czf',
      archivePath,
      '-C',
      stagingRoot,
      basename(packageRoot),
    ], { stdio: 'inherit', env: { ...process.env, GZIP: '-n' } })

    const manifest = Object.freeze({
      schemaVersion: 'portable-package-manifest.v1',
      productId: 'provider-hub',
      version,
      sourceCommitSha,
      artifactName: archiveName,
      mediaType: 'application/gzip',
      sha256: sha256(archivePath),
      sizeBytes: statSync(archivePath).size,
      createdBy: 'saas/scripts/package-provider-hub-release.mjs',
      signingEnabled: false,
      uploadEnabled: false,
      publicationEnabled: false,
      productionExecutionEnabled: false,
    })
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    return Object.freeze({ archivePath, manifestPath, manifest })
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const version = process.argv[2]
  const sourceCommitSha = process.argv[3]
  const result = packageProviderHubRelease({ version, sourceCommitSha })
  process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`)
}
