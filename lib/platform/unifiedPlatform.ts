export type SignalBoostModule = {
  key: 'promote' | 'reviews' | 'calendar' | 'spreadsheets' | 'outreach' | 'assistant' | 'video'
  labelKey: string
  href: string
  icon: string
  descriptionKey: string
  telemetryEvent: string
  cockpitRoleKey: string
  signalsKey: string
}

export const signalBoostModules: SignalBoostModule[] = [
  {
    key: 'promote',
    labelKey: 'dashboard.module.promote.label',
    href: '/dashboard/promote',
    icon: '🚀',
    descriptionKey: 'dashboard.module.promote.description',
    telemetryEvent: 'saas.promote_business.viewed',
    cockpitRoleKey: 'dashboard.module.promote.role',
    signalsKey: 'dashboard.module.promote.signals',
  },
  {
    key: 'reviews',
    labelKey: 'dashboard.module.reviews.label',
    href: '/dashboard/reviews',
    icon: '⭐',
    descriptionKey: 'dashboard.module.reviews.description',
    telemetryEvent: 'saas.reviews.viewed',
    cockpitRoleKey: 'dashboard.module.reviews.role',
    signalsKey: 'dashboard.module.reviews.signals',
  },
  {
    key: 'calendar',
    labelKey: 'dashboard.module.calendar.label',
    href: '/dashboard/calendar',
    icon: '📅',
    descriptionKey: 'dashboard.module.calendar.description',
    telemetryEvent: 'saas.calendar.viewed',
    cockpitRoleKey: 'dashboard.module.calendar.role',
    signalsKey: 'dashboard.module.calendar.signals',
  },
  {
    key: 'spreadsheets',
    labelKey: 'dashboard.module.spreadsheets.label',
    href: '/dashboard/spreadsheets',
    icon: '📊',
    descriptionKey: 'dashboard.module.spreadsheets.description',
    telemetryEvent: 'saas.spreadsheets.viewed',
    cockpitRoleKey: 'dashboard.module.spreadsheets.role',
    signalsKey: 'dashboard.module.spreadsheets.signals',
  },
  {
    key: 'outreach',
    labelKey: 'dashboard.module.outreach.label',
    href: '/dashboard/outreach',
    icon: '📡',
    descriptionKey: 'dashboard.module.outreach.description',
    telemetryEvent: 'saas.outreach.viewed',
    cockpitRoleKey: 'dashboard.module.outreach.role',
    signalsKey: 'dashboard.module.outreach.signals',
  },
  {
    key: 'video',
    labelKey: 'dashboard.module.video.label',
    href: '/dashboard/video',
    icon: '🎬',
    descriptionKey: 'dashboard.module.video.description',
    telemetryEvent: 'saas.video_studio.viewed',
    cockpitRoleKey: 'dashboard.module.video.role',
    signalsKey: 'dashboard.module.video.signals',
  },
  {
    key: 'assistant',
    labelKey: 'dashboard.module.assistant.label',
    href: '/dashboard/assistant',
    icon: '🤖',
    descriptionKey: 'dashboard.module.assistant.description',
    telemetryEvent: 'saas.personal_assistant.viewed',
    cockpitRoleKey: 'dashboard.module.assistant.role',
    signalsKey: 'dashboard.module.assistant.signals',
  },
]

export const cockpitWireframeKeys = ['wireframe.0', 'wireframe.1', 'wireframe.2', 'wireframe.3', 'wireframe.4']

export function getModuleByKey(key: SignalBoostModule['key']) {
  return signalBoostModules.find((module) => module.key === key)
}
