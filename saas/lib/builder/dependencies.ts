type File = Readonly<{ path: string; content: string }>
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i
const VERSION = /^[~^]?\d+(?:\.(?:\d+|x|\*)){0,2}(?:-[a-z0-9.-]+)?$/i

export function validateBuilderLock(content: string): void {
  const lock = JSON.parse(content)
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages || typeof lock.packages !== 'object') throw new Error('builder_dependency_lock_invalid')
  for (const [path, value] of Object.entries(lock.packages)) {
    if (!path) continue
    const item = value as { resolved?: string; integrity?: string; link?: boolean }
    if (item.link || !path.startsWith('node_modules/') || path.split('/').some(part => part === '..')) throw new Error('builder_dependency_source_disallowed')
    const url = new URL(item.resolved || '')
    if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password
      || !/^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/.test(item.integrity || '')) throw new Error('builder_dependency_source_disallowed')
  }
}

/** Only registry dependencies reach the installer. Scripts/config/source are staged after egress closes. */
export function builderDependencyPlan(files: readonly File[]): { manifest: string; lock: string | null; command: 'ci' | 'install' } | null {
  const file = files.find(file => file.path === 'package.json')
  if (!file) return null
  const raw = JSON.parse(file.content)
  const clean: Record<string, unknown> = { name: 'builder-workspace', version: '1.0.0', private: true }
  let count = 0
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const entries = raw[field]
    if (entries === undefined) continue
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('builder_dependency_manifest_invalid')
    for (const [name, version] of Object.entries(entries)) {
      if (!PACKAGE.test(name) || typeof version !== 'string' || !VERSION.test(version)) throw new Error('builder_dependency_source_disallowed')
      count += 1
    }
    clean[field] = entries
  }
  if (!count) return null
  if (count > 100 || raw.workspaces || raw.overrides) throw new Error('builder_dependency_manifest_unsupported')
  if (files.some(file => ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'].includes(file.path))
    && !files.some(file => file.path === 'package-lock.json')) throw new Error('builder_dependency_package_manager_unsupported')
  const lock = files.find(file => file.path === 'package-lock.json')?.content || null
  if (lock) validateBuilderLock(lock)
  return { manifest: JSON.stringify(clean), lock, command: lock ? 'ci' : 'install' }
}
