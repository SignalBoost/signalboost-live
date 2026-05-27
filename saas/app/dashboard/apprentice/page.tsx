'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'pt' | 'es' | 'pl' | 'ru'

type WorkshopModule = {
  id: string
  icon: string
  title: Record<Lang, string>
  description: Record<Lang, string>
  time: string
  href: string
  steps: Record<Lang, string[]>
}

const LANGS: Lang[] = ['en', 'pt', 'es', 'pl', 'ru']

const COPY: Record<Lang, {
  badge: string
  title: string
  subtitle: string
  promise: string
  workshopTitle: string
  workshopTagline: string
  goalTitle: string
  goalItems: string[]
  examplesTitle: string
  pick: string
  experienceTitle: string
  experienceSubtitle: string
  start: string
  stepLabel: string
  beginner: string
  intermediate: string
  comfortable: string
  advanced: string
  noTech: string
  guided: string
  realOutput: string
  stepHints: {
    beginner: string
    intermediate: string
    comfortable: string
    advanced: string
  }
  nav: {
    promote: string
    site: string
    reviews: string
    audio: string
    video: string
    lab: string
  }
}> = {
  en: {
    badge: 'Apprentice Workshop',
    title: 'Learn while building.',
    subtitle: 'No technical experience needed. Choose what you want to create and SignalBoost will guide you one simple step at a time.',
    promise: 'Start from zero. Leave with something real.',
    workshopTitle: 'SignalBoost Apprentice Workshop',
    workshopTagline: 'Learn while building.',
    goalTitle: 'Goal',
    goalItems: ['Teach while creating', 'Guide step-by-step', 'Remove technical fear', 'Convert goals into workflows'],
    examplesTitle: 'Examples',
    pick: 'What do you want to build first?',
    experienceTitle: 'How much experience do you have?',
    experienceSubtitle: 'This helps SignalBoost decide how much explanation to show. You can change it later.',
    start: 'Start guide',
    stepLabel: 'First steps',
    beginner: 'Never used these tools',
    intermediate: 'A little experience',
    comfortable: 'Comfortable',
    advanced: 'Advanced',
    noTech: 'No technical terms first',
    guided: 'Simple guided steps',
    realOutput: 'Built into real SignalBoost tools',
    stepHints: {
      beginner: 'We’ll explain each step with simple examples.',
      intermediate: 'We’ll add quick tips and shortcuts.',
      comfortable: 'You’ll see concise steps without extra detail.',
      advanced: 'Just the checklist — no explanations.'
    },
    nav: {
      promote: 'Promote business',
      site: 'Create site',
      reviews: 'Collect reviews',
      audio: 'Generate audio',
      video: 'Create videos',
      lab: 'Lab'
    }
  },
  // …repeat for pt, es, pl, ru with localized text (including stepHints + nav)
}

const MODULES: WorkshopModule[] = [
  // …your modules (website, podcast, customers, reviews, campaign, video)
]

export default function ApprenticeWorkshopPage() {
  const { lang } = useI18n()
  const activeLang = (LANGS.includes(lang as Lang) ? lang : 'en') as Lang
  const copy = COPY[activeLang]
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'comfortable' | 'advanced'>('beginner')
  const [selected, setSelected] = useState(MODULES[0].id)
  const activeModule = useMemo(() => MODULES.find(item => item.id === selected) || MODULES[0], [selected])
  const levels = [copy.beginner, copy.intermediate, copy.comfortable, copy.advanced]

  const workshopNav = [
    { label: copy.nav.promote, href: '/dashboard/promote' },
    { label: copy.nav.site, href: '/dashboard/builder' },
    { label: copy.nav.reviews, href: '/dashboard/reviews' },
    { label: copy.nav.audio, href: '/dashboard/audio' },
    { label: copy.nav.video, href: '/dashboard/video' },
    { label: copy.nav.lab, href: '/dashboard/lab' },
  ]

  return (
    <main className="sb-page">
      {/* Experience selector */}
      {/* Core feature section */}
      {/* Module grid */}
      {/* Step tracker with localized hints */}
      {/* Navigation bar */}
    </main>
  )
}
