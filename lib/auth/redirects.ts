export const MAIN_SITE_ORIGIN = 'https://signalboostapp.com'
export const SAAS_SITE_ORIGIN = 'https://saas.signalboostapp.com'

const MAIN_AUTH_CALLBACK_PATH = '/auth/callback'
const SAAS_AUTH_CALLBACK_PATH = '/auth/callback'

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '')
}

function normalizeNextPath(nextPath: string) {
  return nextPath.startsWith('/') ? nextPath : `/${nextPath}`
}

function callbackUrl(origin: string, nextPath: string) {
  const url = new URL(MAIN_AUTH_CALLBACK_PATH, trimTrailingSlash(origin))
  url.searchParams.set('next', normalizeNextPath(nextPath))
  return url.toString()
}

export function getMainSiteOrigin(currentOrigin?: string) {
  if (process.env.NEXT_PUBLIC_SIGNALBOOST_SITE_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_SIGNALBOOST_SITE_URL)
  }

  if (currentOrigin?.includes('localhost') || currentOrigin?.includes('127.0.0.1')) {
    return trimTrailingSlash(currentOrigin)
  }

  return MAIN_SITE_ORIGIN
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

export function getMainAuthCallbackUrl(nextPath = '/dashboard/promote', currentOrigin?: string) {
  return callbackUrl(getMainSiteOrigin(currentOrigin), nextPath)
}

export function getSaasAuthCallbackUrl(nextPath = '/onboarding', currentOrigin?: string) {
  const url = new URL(SAAS_AUTH_CALLBACK_PATH, getSaasSiteOrigin(currentOrigin))
  url.searchParams.set('next', normalizeNextPath(nextPath))
  return url.toString()
}
