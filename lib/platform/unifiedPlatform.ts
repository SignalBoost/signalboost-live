export type SignalBoostModule = {
  key: 'promote' | 'reviews' | 'calendar' | 'spreadsheets' | 'outreach' | 'assistant' | 'video'
  label: string
  href: string
  icon: string
  description: string
  telemetryEvent: string
  cockpitRole: string
  signals: string[]
}

export const signalBoostModules: SignalBoostModule[] = [
  {
    key: 'promote',
    label: 'Promote Business',
    href: '/dashboard/promote',
    icon: '🚀',
    description: 'Plan multilingual campaigns, launch offers, and connect promotions to Marketplace demand signals.',
    telemetryEvent: 'saas.promote_business.viewed',
    cockpitRole: 'Growth launch control',
    signals: ['Campaign objective', 'Audience language', 'Marketplace category', 'Launch readiness'],
  },
  {
    key: 'reviews',
    label: 'Reviews',
    href: '/dashboard/reviews',
    icon: '⭐',
    description: 'Collect, triage, translate, and reuse customer proof inside brand and Marketplace workflows.',
    telemetryEvent: 'saas.reviews.viewed',
    cockpitRole: 'Trust and reputation desk',
    signals: ['Review velocity', 'Sentiment', 'Response status', 'Reusable proof'],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    href: '/dashboard/calendar',
    icon: '📅',
    description: 'Schedule SaaS launches, outreach windows, local holidays, review asks, and Marketplace booking moments.',
    telemetryEvent: 'saas.calendar.viewed',
    cockpitRole: 'Mission timeline',
    signals: ['7-day plan', 'Cultural timing', 'Booked moments', 'Follow-up windows'],
  },
  {
    key: 'spreadsheets',
    label: 'Spreadsheets',
    href: '/dashboard/spreadsheets',
    icon: '📊',
    description: 'Import CSV lists, normalize contacts, track KPIs, and route spreadsheet rows into Outreach.',
    telemetryEvent: 'saas.spreadsheets.viewed',
    cockpitRole: 'Data operations grid',
    signals: ['CSV readiness', 'Column mapping', 'Lead status', 'KPI rollups'],
  },
  {
    key: 'outreach',
    label: 'Outreach',
    href: '/dashboard/outreach',
    icon: '📡',
    description: 'Coordinate email, partner notifications, social prompts, and review follow-ups from one cockpit.',
    telemetryEvent: 'saas.outreach.viewed',
    cockpitRole: 'Communications console',
    signals: ['Queue health', 'Approval status', 'Channel mix', 'Response trend'],
  },

  {
    key: 'video',
    label: 'Video Studio',
    href: '/dashboard/video',
    icon: '🎬',
    description: 'Edit multilingual videos with canvas captions, timing controls, queued FFmpeg exports, and billing-aware quotas.',
    telemetryEvent: 'saas.video_studio.viewed',
    cockpitRole: 'Caption render bay',
    signals: ['Caption sync', 'Render queue', 'Storage usage', 'Billing overage'],
  },
  {
    key: 'assistant',
    label: 'Personal Assistant',
    href: '/dashboard/assistant',
    icon: '🤖',
    description: 'Ask Concierge AI about Marketplace partners, bookings, pricing, SaaS modules, and next actions.',
    telemetryEvent: 'saas.personal_assistant.viewed',
    cockpitRole: 'Concierge guidance layer',
    signals: ['User intent', 'Marketplace context', 'SaaS module match', 'Telemetry trail'],
  },
]

export const marketplaceSignals = [
  'partner discovery',
  'category selection',
  'booking intent',
  'customer proof',
  'localized campaign demand',
]

export const cockpitWireframe = [
  'LEFT RAIL: Promote Business | Reviews | Calendar | Spreadsheets | Outreach | Video Studio | Personal Assistant',
  'CENTER DECK: selected module workspace with NASA-style mission cards and checklists',
  'RIGHT RAIL: Concierge AI answers across Marketplace + SaaS and writes telemetry events',
  'VIDEO BAY: canvas caption editor, storage queue, FFmpeg worker, and download-ready renders',
  'ADMIN CONSOLE: SaaS usage stream rolls up module views, Concierge intents, and Marketplace context',
]

export function getModuleByKey(key: SignalBoostModule['key']) {
  return signalBoostModules.find((module) => module.key === key)
}
