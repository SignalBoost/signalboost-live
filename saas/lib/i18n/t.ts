import type { Dict } from '@/lib/i18n/loadLanguage'
import en from '@/locales/en.json'
import { DASHBOARD_COPY } from '@/lib/i18n/dashboardCopy'
import { STUDIO_HUB_COPY } from '@/lib/i18n/studioHubCopy'
import { PLATFORM_COPY } from '@/lib/i18n/platformCopy'
import { SUITE_COPY } from '@/lib/i18n/suiteCopy'
import { WORKSPACE_COPY } from '@/lib/i18n/workspaceCopy'
import { BANK_COPY } from '@/lib/i18n/bankCopy'

export function t(dict: Dict | null | undefined, path: string, fallback: string): string {
  const value = lookup(dict, path)
  if (typeof value === 'string') return value

  const lang = (dict as any)?.__lang
  const safeLang = typeof lang === 'string' ? lang : 'en'

  const dashboardForLang = DASHBOARD_COPY[safeLang]
  if (dashboardForLang && typeof dashboardForLang[path] === 'string') {
    return dashboardForLang[path]
  }

  const studioHubForLang = STUDIO_HUB_COPY[safeLang]
  if (studioHubForLang && typeof studioHubForLang[path] === 'string') {
    return studioHubForLang[path]
  }

  const workspaceForLang = WORKSPACE_COPY[safeLang]
  if (workspaceForLang && typeof workspaceForLang[path] === 'string') {
    return workspaceForLang[path]
  }

  const platformForLang = PLATFORM_COPY[safeLang]
  if (platformForLang && typeof platformForLang[path] === 'string') {
    return platformForLang[path]
  }

  const suiteForLang = SUITE_COPY[safeLang]
  if (suiteForLang && typeof suiteForLang[path] === 'string') {
    return suiteForLang[path]
  }

  const bankForLang = BANK_COPY[safeLang]
  if (bankForLang && typeof bankForLang[path] === 'string') {
    return bankForLang[path]
  }

  const englishValue = lookup(en as Dict, path)
  if (typeof englishValue === 'string') return englishValue

  if (typeof DASHBOARD_COPY.en[path] === 'string') return DASHBOARD_COPY.en[path]
  if (typeof STUDIO_HUB_COPY.en[path] === 'string') return STUDIO_HUB_COPY.en[path]
  if (typeof WORKSPACE_COPY.en[path] === 'string') return WORKSPACE_COPY.en[path]
  if (typeof PLATFORM_COPY.en[path] === 'string') return PLATFORM_COPY.en[path]
  if (typeof SUITE_COPY.en[path] === 'string') return SUITE_COPY.en[path]
  if (BANK_COPY.en && typeof BANK_COPY.en[path] === 'string') return BANK_COPY.en[path]

  return fallback || path
}

function lookup(dict: Dict | null | undefined, path: string): unknown {
  if (!dict) return undefined

  return path
    .split('.')
    .reduce<any>((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict)
}
