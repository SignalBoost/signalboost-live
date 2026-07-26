export const ANDROID_PACKAGING_SCHEMA_VERSION = 'signalboost-android-packaging-v1' as const

export type AndroidPackagingState =
  | 'metadata_ready'
  | 'build_ready'
  | 'signed_bundle_ready'
  | 'play_console_published'

export type AndroidShell = 'twa' | 'capacitor'
export type AndroidDisplayMode = 'standalone' | 'fullscreen' | 'minimal-ui'
export type AndroidOrientation = 'portrait' | 'landscape' | 'any'

export interface AndroidIconDescriptor {
  src: string
  sizes: `${number}x${number}`
  purpose: 'any' | 'maskable' | 'any maskable'
}

export interface AndroidPackagingDescriptor {
  schemaVersion: typeof ANDROID_PACKAGING_SCHEMA_VERSION
  portableId: string
  appName: string
  packageName: string
  shell: AndroidShell
  launchUrl: string
  displayMode: AndroidDisplayMode
  orientation: AndroidOrientation
  icons: readonly AndroidIconDescriptor[]
  state: AndroidPackagingState
  signing: Readonly<{
    productionKeyConfigured: boolean
    keyReference?: string
  }>
  distribution: Readonly<{
    playConsoleAppCreated: boolean
    internalTestingPublished: boolean
    productionPublished: boolean
  }>
  notices: readonly string[]
}

const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/
const ICON_SIZE = /^(\d+)x\1$/

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function validateHttpsUrl(value: unknown, name: string): string {
  const normalized = required(value, name)
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${name} must use https`)
  if (url.username || url.password) throw new Error(`${name} must not include credentials`)
  return url.toString()
}

function validateIcon(icon: AndroidIconDescriptor): AndroidIconDescriptor {
  const src = required(icon.src, 'icon src')
  if (!src.startsWith('/')) throw new Error('icon src must be an absolute app path')
  const match = ICON_SIZE.exec(icon.sizes)
  if (!match || Number(match[1]) < 192) throw new Error('icon sizes must be square and at least 192x192')
  return Object.freeze({ src, sizes: icon.sizes, purpose: icon.purpose })
}

export function createAndroidPackagingDescriptor(input: Omit<AndroidPackagingDescriptor, 'schemaVersion'>): AndroidPackagingDescriptor {
  const portableId = required(input.portableId, 'portableId')
  const appName = required(input.appName, 'appName')
  const packageName = required(input.packageName, 'packageName')
  if (!PACKAGE_NAME.test(packageName)) throw new Error('packageName must be a reverse-domain Android identifier')

  const icons = input.icons.map(validateIcon)
  if (icons.length === 0) throw new Error('at least one Android icon is required')
  if (!icons.some((icon) => icon.purpose.includes('maskable'))) throw new Error('a maskable Android icon is required')

  const launchUrl = validateHttpsUrl(input.launchUrl, 'launchUrl')
  const productionState = input.state === 'signed_bundle_ready' || input.state === 'play_console_published'
  if (productionState && !input.signing.productionKeyConfigured) {
    throw new Error('signed or published state requires a production signing key')
  }
  if (input.signing.productionKeyConfigured && !input.signing.keyReference) {
    throw new Error('production signing requires an opaque keyReference')
  }
  if (input.signing.keyReference && /BEGIN |PRIVATE KEY|keystore|password/i.test(input.signing.keyReference)) {
    throw new Error('keyReference must be opaque and must not contain signing material')
  }
  if (input.state === 'play_console_published' && !input.distribution.productionPublished) {
    throw new Error('published state requires productionPublished evidence')
  }
  if (input.distribution.productionPublished && !input.distribution.playConsoleAppCreated) {
    throw new Error('production publication requires a Play Console application')
  }

  return Object.freeze({
    schemaVersion: ANDROID_PACKAGING_SCHEMA_VERSION,
    portableId,
    appName,
    packageName,
    shell: input.shell,
    launchUrl,
    displayMode: input.displayMode,
    orientation: input.orientation,
    icons: Object.freeze(icons),
    state: input.state,
    signing: Object.freeze({ ...input.signing }),
    distribution: Object.freeze({ ...input.distribution }),
    notices: Object.freeze([...input.notices]),
  })
}
