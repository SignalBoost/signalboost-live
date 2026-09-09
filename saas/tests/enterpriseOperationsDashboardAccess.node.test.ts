import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const routeUrl = new URL('../app/api/internal/enterprise/operations/route.ts', import.meta.url)
const pageUrl = new URL('../app/dashboard/operations/page.tsx', import.meta.url)
const loaderUrl = new URL('../components/enterprise/ExecutiveOperationsDashboardLoader.tsx', import.meta.url)
const stateCopyUrl = new URL('../lib/i18n/operationsDashboardStateCopy.ts', import.meta.url)
const securityUrl = new URL('../lib/outreach/security.ts', import.meta.url)
const directedStudyUrl = new URL('../app/dashboard/cos-directed-study/page.tsx', import.meta.url)
const authCookieUrl = new URL('../lib/auth/cookies.ts', import.meta.url)
const dashboardRoot = new URL('../app/dashboard/', import.meta.url)
const ownerAccessRoots = [
  new URL('../app/api/admin/', import.meta.url),
  new URL('../app/auth/', import.meta.url),
  new URL('../lib/auth/', import.meta.url),
]

async function source(url: URL) {
  return readFile(url, 'utf8').then(hydrateLocalizedSource)
}

async function runtimeSourceFiles(root: URL): Promise<URL[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, root)
    if (entry.isDirectory()) return runtimeSourceFiles(url)
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [url] : []
  }))
  return nested.flat()
}

test('operations API remains admin-only and returns only validated stored snapshots', async () => {
  const route = await source(routeUrl)

  assert.match(route, /const auth = await requireAdmin\(\)/)
  assert.match(route, /if \(auth instanceof NextResponse\) return auth/)
  assert.match(route, /new SupabaseOperationsSnapshotStore\(auth\.admin\)/)
  assert.match(route, /await store\.getLatest\(organizationId\)/)
  assert.match(route, /operations-intelligence-response-v1/)
  assert.match(route, /status: 400/)
  assert.match(route, /status: 404/)
  assert.match(route, /status: 503/)

  assert.doesNotMatch(route, /buildOperationsIntelligenceSnapshot/)
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete)\s*\(/)
})

test('shared admin guard denies unauthenticated and non-admin users before service-role access', async () => {
  const security = await source(securityUrl)

  assert.match(security, /if \(!user\).*status: 401/)
  assert.match(security, /if \(!access\.isAdmin\).*status: 403/s)
  assert.match(security, /const admin = getAdminSupabase\(\)/)
  assert.match(security, /return \{ user, admin \}/)

  const deniedIndex = security.indexOf('if (!access.isAdmin)')
  const serviceRoleIndex = security.indexOf('const admin = getAdminSupabase()')
  assert.ok(deniedIndex >= 0 && serviceRoleIndex > deniedIndex)
})

test('owner and admin access seams derive their canonical origin from iTMounts', async () => {
  const [directedStudy, authCookies] = await Promise.all([
    source(directedStudyUrl),
    source(authCookieUrl),
  ])

  assert.match(directedStudy, /PUBLIC_BRAND\.siteUrl/)
  assert.match(authCookies, /PUBLIC_BRAND\.siteUrl/)
  assert.doesNotMatch(directedStudy, /https:\/\/saas\.signalboostapp\.com/)
  assert.doesNotMatch(authCookies, /https:\/\/saas\.signalboostapp\.com/)

  const legacyOriginLiteral = /['"`]https:\/\/saas\.signalboostapp\.com/
  const accessFiles = (await Promise.all(ownerAccessRoots.map(runtimeSourceFiles))).flat()
  for (const file of accessFiles) {
    const text = await readFile(file, 'utf8')
    assert.doesNotMatch(text, legacyOriginLiteral, `legacy access origin remains in ${file.pathname}`)
  }

  const hostSensitiveMarker = /(?:location\.hostname|\.hostname\b|CANONICAL_HOST|canonicalHost|hostMismatch|canonicalHostAvailable|ownerSessionRequired)/
  for (const file of await runtimeSourceFiles(dashboardRoot)) {
    const text = await readFile(file, 'utf8')
    if (!hostSensitiveMarker.test(text)) continue
    assert.doesNotMatch(text, legacyOriginLiteral, `legacy host gate remains in ${file.pathname}`)
  }
})

test('dashboard page passes only the organization scope into the read-only loader', async () => {
  const page = await source(pageUrl)

  assert.match(page, /params\.organizationId/)
  assert.match(page, /<ExecutiveOperationsDashboardLoader organizationId=\{organizationId\}/)
  assert.doesNotMatch(page, /OperationsIntelligenceSnapshot/)
  assert.doesNotMatch(page, /buildOperationsIntelligenceSnapshot/)
  assert.doesNotMatch(page, /repair|approve|resume|retry|execute/i)
})

test('dashboard loader uses GET-only no-store reads and exposes five-language fail-closed states', async () => {
  const [loader, stateCopy] = await Promise.all([source(loaderUrl), source(stateCopyUrl)])

  assert.match(loader, /getOperationsDashboardStateCopy\(lang\)/)
  for (const locale of ['en', 'es', 'pt', 'pl', 'ru']) {
    assert.match(stateCopy, new RegExp(`\\b${locale}: \\{`))
  }

  assert.match(loader, /fetch\(`\/api\/internal\/enterprise\/operations\?organizationId=/)
  assert.match(loader, /cache: 'no-store'/)
  assert.match(loader, /encodeURIComponent\(organizationId\)/)
  assert.match(loader, /if \(!response\.ok \|\| !body\.snapshot\) throw/)
  assert.match(loader, /role="alert"/)
  assert.match(loader, /controller\.abort\(\)/)

  assert.doesNotMatch(loader, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/)
  assert.doesNotMatch(loader, /buildOperationsIntelligenceSnapshot/)
  assert.doesNotMatch(loader, /repair|approve|resume|retry|execute/i)
})
