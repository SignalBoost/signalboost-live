export const MAIN_SITE_ORIGIN = 'https://signalboostapp.com'
export const SAAS_SITE_ORIGIN = 'https://saas.signalboostapp.com'

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '')
}

function normalizeNextPath(nextPath: string) {
  return nextPath.startsWith('/') ? nextPath : `/${nextPath}`
}

export function getSaasSiteOrigin(currentOrigin?: string) {
  if (process.env.NEXT_PUBLIC_SIGNALBOOST_SAAS_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_SIGNALBOOST_SAAS_URL)
  }

  if (currentOrigin?.includes('localhost') || currentOrigin?.includes('127.0.0.1')) {
    return trimTrailingSlash(currentOrigin)
  }

  return SAAS_SITE_ORIGIN
}

export function getSaasAuthCallbackUrl(nextPath = '/onboarding', currentOrigin?: string) {
  const url = new URL('/auth/callback', getSaasSiteOrigin(currentOrigin))
  url.searchParams.set('next', normalizeNextPath(nextPath))
  return url.toString()
}
