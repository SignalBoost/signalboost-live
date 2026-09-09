import type { Dict } from '@/lib/i18n/loadLanguage'
import en from '@/locales/en.json' with { type: 'json' }
import { DASHBOARD_COPY } from '@/lib/i18n/dashboardCopy'
import { STUDIO_HUB_COPY } from '@/lib/i18n/studioHubCopy'
import { PLATFORM_COPY } from '@/lib/i18n/platformCopy'
import { SUITE_COPY } from '@/lib/i18n/suiteCopy'
import { WORKSPACE_COPY } from '@/lib/i18n/workspaceCopy'
import { BANK_COPY } from '@/lib/i18n/bankCopy'
import { outreachNavLabel } from '@/lib/i18n/outreachCopy'
import { publicBrandText } from '@/lib/public-brand'

export function t(dict: Dict | null | undefined, path: string, fallback = ''): string {
  const lang = (dict as any)?.__lang
  const safeLang = typeof lang === 'string' ? lang : 'en'

  // The legacy locale key is intentionally retained so old components keep
  // working, but its old "Email Outreach" value is no longer authoritative.
  // Outreach is the umbrella workflow; email is one governed channel.
  if (path === 'nav.emailOutreach') return publicBrandText(outreachNavLabel(safeLang))

  const value = lookup(dict, path)
  if (typeof value === 'string') return publicBrandText(value)

  const dashboardForLang = DASHBOARD_COPY[safeLang]
  if (dashboardForLang && typeof dashboardForLang[path] === 'string') {
    return publicBrandText(dashboardForLang[path])
  }

  const studioHubForLang = STUDIO_HUB_COPY[safeLang]
  if (studioHubForLang && typeof studioHubForLang[path] === 'string') {
    return publicBrandText(studioHubForLang[path])
  }

  const workspaceForLang = WORKSPACE_COPY[safeLang]
  if (workspaceForLang && typeof workspaceForLang[path] === 'string') {
    return publicBrandText(workspaceForLang[path])
  }

  const platformForLang = PLATFORM_COPY[safeLang]
  if (platformForLang && typeof platformForLang[path] === 'string') {
    return publicBrandText(platformForLang[path])
  }

  const suiteForLang = SUITE_COPY[safeLang]
  if (suiteForLang && typeof suiteForLang[path] === 'string') {
    return publicBrandText(suiteForLang[path])
  }

  const bankForLang = BANK_COPY[safeLang]
  if (bankForLang && typeof bankForLang[path] === 'string') {
    return publicBrandText(bankForLang[path])
  }

  const englishValue = lookup(en as Dict, path)
  if (typeof englishValue === 'string') return publicBrandText(englishValue)

  if (typeof DASHBOARD_COPY.en[path] === 'string') return publicBrandText(DASHBOARD_COPY.en[path])
  if (typeof STUDIO_HUB_COPY.en[path] === 'string') return publicBrandText(STUDIO_HUB_COPY.en[path])
  if (typeof WORKSPACE_COPY.en[path] === 'string') return publicBrandText(WORKSPACE_COPY.en[path])
  if (typeof PLATFORM_COPY.en[path] === 'string') return publicBrandText(PLATFORM_COPY.en[path])
  if (typeof SUITE_COPY.en[path] === 'string') return publicBrandText(SUITE_COPY.en[path])
  if (BANK_COPY.en && typeof BANK_COPY.en[path] === 'string') return publicBrandText(BANK_COPY.en[path])

  return publicBrandText(fallback || path)
}

function lookup(dict: Dict | null | undefined, path: string): unknown {
  if (!dict) return undefined

  return path
    .split('.')
    .reduce<any>((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict)
}
