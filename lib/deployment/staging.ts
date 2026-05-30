import { signalBoostModules } from '@/lib/platform/unifiedPlatform'

export const stagingDeployment = {
  project: 'signalboost-live',
  purpose: 'Temporary staging deployment for SaaS testing.',
  environment: process.env.NEXT_PUBLIC_SIGNALBOOST_STAGE || process.env.VERCEL_ENV || 'staging',
  releaseLabel: process.env.NEXT_PUBLIC_SIGNALBOOST_RELEASE || 'saas-staging-wireframes',
  routes: ['/', '/pricing', '/dashboard', '/staging'],
  locales: ['en', 'es', 'pt', 'pl', 'ru'],
  checks: [
    'Marketplace homepage loads with localized navigation and cockpit CTAs.',
    'Unified pricing links every plan into the in-repo SaaS dashboard modules.',
    'Dashboard module cards open Promote, Reviews, Calendar, Spreadsheets, Outreach, and Assistant workspaces.',
    'Concierge and admin telemetry routes remain available for Marketplace + SaaS QA.',
  ],
}

export function getStagingModules() {
  return signalBoostModules.map((module) => ({
    key: module.key,
    label: module.label,
    href: module.href,
    telemetryEvent: module.telemetryEvent,
  }))
}
