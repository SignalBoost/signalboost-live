// saas/lib/outreach/adLandingPages.ts
// Canonical landing pages for public outreach/ad placements.
// Keep newspaper/classified ad CTAs here so they are easy to reuse and audit.

export type AdLandingPageGoal = 'website_optimization' | 'cybersecurity_preview' | 'audit_console'

export type AdLandingPage = {
  goal: AdLandingPageGoal
  label: string
  url: string
  route: string
  publicSafe: boolean
  recommendedForNewspaperAds: boolean
  description: string
}

export const AD_LANDING_PAGES: Record<AdLandingPageGoal, AdLandingPage> = {
  website_optimization: {
    goal: 'website_optimization',
    label: 'Free Website Optimization Scan',
    url: 'https://www.saas.signalboostapp.com/website-optimizer',
    route: '/website-optimizer',
    publicSafe: true,
    recommendedForNewspaperAds: true,
    description: 'Public free utility for performance, SEO, accessibility, security, and conversion preview.',
  },
  cybersecurity_preview: {
    goal: 'cybersecurity_preview',
    label: 'Free Cybersecurity Preview',
    url: 'https://www.saas.signalboostapp.com/cybersecurity-check',
    route: '/cybersecurity-check',
    publicSafe: true,
    recommendedForNewspaperAds: true,
    description: 'Public free utility for safe website security signal checks. No exploit testing or private access.',
  },
  audit_console: {
    goal: 'audit_console',
    label: 'Audit Console',
    url: 'https://www.saas.signalboostapp.com/dashboard/audit',
    route: '/dashboard/audit',
    publicSafe: false,
    recommendedForNewspaperAds: false,
    description: 'Logged-in dashboard audit console. Keep as internal/reference link, not the default newspaper ad CTA.',
  },
}

export const DEFAULT_NEWSPAPER_AD_LANDING_GOAL: AdLandingPageGoal = 'website_optimization'

export function getAdLandingPage(goal?: string | null): AdLandingPage {
  if (goal && goal in AD_LANDING_PAGES) {
    return AD_LANDING_PAGES[goal as AdLandingPageGoal]
  }
  return AD_LANDING_PAGES[DEFAULT_NEWSPAPER_AD_LANDING_GOAL]
}

export function getNewspaperAdLandingPageOptions(): AdLandingPage[] {
  return Object.values(AD_LANDING_PAGES)
}
