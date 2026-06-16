'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type Role = 'developer' | 'non_developer' | ''
type ItLevel = 'beginner' | 'intermediate' | 'advanced' | ''
type TonePreference = 'friendly' | 'professional' | 'playful' | ''
type DeviceType = 'mobile' | 'desktop' | 'tablet'

type OnboardingAnswers = {
  role: Role
  itLevel: ItLevel
  tonePreference: TonePreference
  consentAiTraining: boolean
}

type AnalyticsPayload = {
  stepName: string
  action: string
  userId?: string
}

const STEPS = [
  { key: 'welcome', label: 'Welcome', kicker: 'Step 1', icon: '👋' },
  { key: 'profiling', label: 'Profiling', kicker: 'Step 2', icon: '🧭' },
  { key: 'consent', label: 'Consent', kicker: 'Step 3', icon: '🛡️' },
  { key: 'tone', label: 'Tone', kicker: 'Step 4', icon: '🎙️' },
  { key: 'confirmation', label: 'Confirmation', kicker: 'Step 5', icon: '✅' },
] as const

const ROLE_OPTIONS = [
  {
    value: 'developer' as Role,
    title: 'Developer',
    body: 'Show me technical controls, logs, deploy details, and code-aware guidance.',
    icon: '⌘',
  },
  {
    value: 'non_developer' as Role,
    title: 'Non-developer',
    body: 'Keep setup guided, plain-English, and focused on outcomes.',
    icon: '✨',
  },
]

const IT_LEVEL_OPTIONS = [
  {
    value: 'beginner' as ItLevel,
    title: 'Beginner',
    body: 'Give me guided checklists, definitions, and one-click defaults.',
  },
  {
    value: 'intermediate' as ItLevel,
    title: 'Intermediate',
    body: 'Balance guidance with configuration shortcuts and examples.',
  },
  {
    value: 'advanced' as ItLevel,
    title: 'Advanced',
    body: 'Prioritize diagnostics, advanced settings, and faster workflows.',
  },
]

const TONE_OPTIONS = [
  {
    value: 'friendly' as TonePreference,
    title: 'Friendly',
    sample: 'I will guide you step by step and keep things clear.',
    emoji: '🙂',
  },
  {
    value: 'professional' as TonePreference,
    title: 'Professional',
    sample: 'I will keep recommendations concise, direct, and business-ready.',
    emoji: '💼',
  },
  {
    value: 'playful' as TonePreference,
    title: 'Playful',
    sample: 'I will keep setup upbeat, creative, and momentum-focused.',
    emoji: '⚡',
  },
]

const DEFAULT_ANSWERS: OnboardingAnswers = {
  role: '',
  itLevel: '',
  tonePreference: 'friendly',
  consentAiTraining: false,
}

const BLUE = '#38bdf8'
const GOLD = '#ffc300'
const PURPLE = '#a78bfa'
const STORAGE_KEY = 'signalboost:onboarding-draft'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    mixpanel?: { track?: (eventName: string, payload?: Record<string, unknown>) => void }
    Sentry?: { captureException?: (error: unknown, context?: Record<string, unknown>) => void }
    LogRocket?: { captureException?: (error: unknown) => void; track?: (eventName: string, payload?: Record<string, unknown>) => void }
  }
}

function getDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop'
  const width = window.innerWidth
  if (width < 768) return 'mobile'
  if (width < 1100) return 'tablet'
  return 'desktop'
}

function getBrowserName() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Edg')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Safari')) return 'Safari'
  return 'Other'
}

function reportClientError(error: unknown, userId?: string) {
  if (typeof window !== 'undefined') {
    window.Sentry?.captureException?.(error, { tags: { area: 'onboarding' }, user: { id: userId } })
    window.LogRocket?.captureException?.(error)
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const { dict } = useI18n()
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState('there')
  const [userId, setUserId] = useState<string | undefined>()
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULT_ANSWERS)

  const activeStep = STEPS[step]
  const progress = ((step + 1) / STEPS.length) * 100
  const canContinue = useMemo(() => {
    if (activeStep.key === 'profiling') return Boolean(answers.role && answers.itLevel)
    if (activeStep.key === 'tone') return Boolean(answers.tonePreference)
    return true
  }, [activeStep.key, answers.itLevel, answers.role, answers.tonePreference])

  useEffect(() => {
    let mounted = true

    async function hydrate() {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return

      if (!data?.user) {
        router.push('/')
        return
      }

      const meta = data.user.user_metadata
      const fullName = meta?.full_name || meta?.name || ''
      setFirstName(fullName.split(' ')[0] || 'there')
      setUserId(data.user.id)

      const storedDraft = window.localStorage.getItem(STORAGE_KEY)
      if (storedDraft) {
        setAnswers({ ...DEFAULT_ANSWERS, ...JSON.parse(storedDraft) })
      }

      const { data: profile, error } = await supabase
        .from('user_profile')
        .select('role,it_level,tone_preference,consent_ai_training,onboarding_completed')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (!mounted) return

      if (!error && profile) {
        setAnswers({
          role: (profile.role || '') as Role,
          itLevel: (profile.it_level || '') as ItLevel,
          tonePreference: (profile.tone_preference || 'friendly') as TonePreference,
          consentAiTraining: Boolean(profile.consent_ai_training),
        })

        if (profile.onboarding_completed) {
          router.push('/dashboard')
          return
        }
      }

      setChecking(false)
      trackEvent({ stepName: STEPS[0].key, action: 'viewed', userId: data.user.id })
    }

    hydrate().catch((error) => {
      reportClientError(error, userId)
      setChecking(false)
    })

    return () => {
      mounted = false
    }
  }, [router])

  useEffect(() => {
    if (!checking) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
    }
  }, [answers, checking])

  async function trackEvent({ stepName, action, userId: eventUserId = userId }: AnalyticsPayload) {
    const payload = {
      step_name: stepName,
      action,
      user_id: eventUserId,
      device_type: getDeviceType(),
      browser: getBrowserName(),
    }

    if (typeof window !== 'undefined') {
      window.gtag?.('event', `onboarding_${action}`, payload)
      window.mixpanel?.track?.('Onboarding Event', payload)
      window.LogRocket?.track?.('Onboarding Event', payload)
    }

    if (eventUserId) {
      const { error } = await supabase.from('onboarding_analytics').insert(payload)
      if (error) reportClientError(error, eventUserId)
    }
  }

  async function persistProfile(overrides: Partial<OnboardingAnswers> = {}, completed = false) {
    if (!userId) return
    const nextAnswers = { ...answers, ...overrides }
    const consentTimestamp = nextAnswers.consentAiTraining ? new Date().toISOString() : null

    const { error } = await supabase.from('user_profile').upsert({
      user_id: userId,
      role: nextAnswers.role || null,
      it_level: nextAnswers.itLevel || null,
      tone_preference: nextAnswers.tonePreference || 'friendly',
      consent_ai_training: nextAnswers.consentAiTraining,
      consent_timestamp: consentTimestamp,
      onboarding_completed: completed,
      onboarding_completed_at: completed ? new Date().toISOString() : null,
    })

    if (error) reportClientError(error, userId)
  }

  async function goTo(nextStep: number, action = 'continued') {
    await persistProfile()
    await trackEvent({ stepName: activeStep.key, action })
    setStep(nextStep)
    await trackEvent({ stepName: STEPS[nextStep].key, action: 'viewed' })
  }

  async function finish(skipped = false) {
    setSaving(true)
    await persistProfile(undefined, true)
    await supabase.from('profiles').upsert({ id: userId, onboarded: true })
    await trackEvent({ stepName: activeStep.key, action: skipped ? 'skipped' : 'completed' })
    window.localStorage.removeItem(STORAGE_KEY)
    router.push('/dashboard')
  }

  if (checking) {
    return (
      <main style={{ minHeight: '100vh', background: '#080b18', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.64)' }}>
        {t(dict, 'onboarding.loading', 'Loading onboarding…')}
      </main>
    )
  }

  return (
    <main className="onboardingShell">
      <style>{`
        .onboardingShell { min-height: 100vh; color: #fff; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 18% 16%, rgba(56, 189, 248, 0.22), transparent 32rem), radial-gradient(circle at 80% 8%, rgba(255, 195, 0, 0.16), transparent 24rem), linear-gradient(135deg, #060914 0%, #111827 55%, #1d1534 100%); padding: clamp(1rem, 3vw, 2rem); }
        .topbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; max-width: 1120px; margin: 0 auto clamp(1.5rem, 5vw, 3.5rem); }
        .brand { font-size: 1.05rem; font-weight: 900; letter-spacing: -0.04em; }
        .skipButton, .ghostButton, .primaryButton { min-height: 44px; border-radius: 999px; padding: 0.75rem 1rem; font-weight: 800; cursor: pointer; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
        .skipButton, .ghostButton { background: rgba(255,255,255,.07); color: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.12); }
        .primaryButton { background: linear-gradient(135deg, ${BLUE}, ${GOLD}); color: #08111f; border: 0; box-shadow: 0 16px 48px rgba(56,189,248,.25); }
        .primaryButton:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
        .skipButton:hover, .ghostButton:hover, .primaryButton:not(:disabled):hover { transform: translateY(-1px); }
        .layout { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); gap: clamp(1rem, 4vw, 2rem); align-items: start; }
        .sidebar, .panel, .summaryCard { border: 1px solid rgba(255,255,255,.12); background: linear-gradient(145deg, rgba(255,255,255,.14), rgba(255,255,255,.045)); box-shadow: 0 24px 80px rgba(0,0,0,.32); backdrop-filter: blur(22px); border-radius: 28px; }
        .sidebar { padding: 1rem; position: sticky; top: 1rem; }
        .progressTrack { height: .45rem; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; margin: .75rem 0 1rem; }
        .progressFill { height: 100%; background: linear-gradient(90deg, ${BLUE}, ${PURPLE}, ${GOLD}); transition: width .25s ease; }
        .stepItem { display: grid; grid-template-columns: 2.25rem 1fr; gap: .75rem; align-items: center; padding: .85rem; border-radius: 18px; color: rgba(255,255,255,.58); }
        .stepItemActive { background: rgba(56,189,248,.12); color: #fff; border: 1px solid rgba(56,189,248,.24); }
        .panel { padding: clamp(1.25rem, 5vw, 3rem); min-height: 560px; }
        .kicker { color: ${GOLD}; text-transform: uppercase; letter-spacing: .16em; font-size: .75rem; font-weight: 900; }
        h1 { font-size: clamp(2.1rem, 7vw, 4.7rem); line-height: .95; letter-spacing: -0.07em; margin: .75rem 0 1rem; }
        h2 { font-size: clamp(1.8rem, 4vw, 3rem); line-height: 1; letter-spacing: -0.05em; margin: .5rem 0 1rem; }
        p { color: rgba(255,255,255,.68); line-height: 1.7; }
        .optionGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .85rem; margin: 1.5rem 0; }
        .levelGrid, .toneGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .85rem; margin: 1rem 0 1.5rem; }
        .optionCard { text-align: left; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #fff; border-radius: 22px; padding: 1rem; cursor: pointer; min-height: 112px; }
        .optionCardActive { border-color: ${GOLD}; background: rgba(255,195,0,.12); box-shadow: inset 0 0 0 1px rgba(255,195,0,.18), 0 14px 44px rgba(255,195,0,.08); }
        .consentBox { display: flex; gap: 1rem; align-items: flex-start; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.07); border-radius: 24px; padding: 1rem; margin: 1.5rem 0; }
        .consentBox input { width: 24px; height: 24px; accent-color: ${GOLD}; flex: 0 0 auto; }
        .footerActions { display: flex; gap: .8rem; flex-wrap: wrap; margin-top: 2rem; }
        .summaryGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .85rem; margin: 1.5rem 0; }
        .summaryCard { padding: 1rem; }
        .workshopPreview { border: 1px solid rgba(56,189,248,.25); background: rgba(56,189,248,.1); border-radius: 24px; padding: 1rem; margin-top: 1rem; }
        @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .sidebar { position: static; } .stepList { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .35rem; } .stepItem { grid-template-columns: 1fr; text-align: center; padding: .6rem .35rem; font-size: .76rem; } .stepItem small { display: none; } .optionGrid, .levelGrid, .toneGrid, .summaryGrid { grid-template-columns: 1fr; } .panel { min-height: auto; } }
        @media (max-width: 560px) { .topbar { align-items: flex-start; } .brand { margin-top: .6rem; } .skipButton { padding-inline: .8rem; font-size: .85rem; } .footerActions > * { width: 100%; } }
      `}</style>

      <header className="topbar">
        <div className="brand">signal<span style={{ color: GOLD }}>boost</span></div>
        <button className="skipButton" onClick={() => finish(true)} disabled={saving}>{t(dict, 'onboarding.skip', 'Skip to dashboard →')}</button>
      </header>

      <section className="layout" aria-label="SignalBoost onboarding flow">
        <aside className="sidebar" aria-label="Onboarding progress">
          <strong>{t(dict, 'onboarding.progressComplete', '{pct}% complete').replace('{pct}', String(Math.round(progress)))}</strong>
          <div className="progressTrack" aria-hidden="true"><div className="progressFill" style={{ width: `${progress}%` }} /></div>
          <div className="stepList">
            {STEPS.map((item, index) => (
              <div key={item.key} className={`stepItem ${index === step ? 'stepItemActive' : ''}`}>
                <span>{item.icon}</span>
                <span><strong>{t(dict, 'onboarding.steps.' + item.key + '.label', item.label)}</strong><small style={{ display: 'block' }}>{t(dict, 'onboarding.steps.' + item.key + '.kicker', item.kicker)}</small></span>
              </div>
            ))}
          </div>
        </aside>

        <article className="panel">
          {activeStep.key === 'welcome' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h1>{t(dict, 'onboarding.welcome.title', 'Welcome, {name}. Build faster with a smarter setup.').replace('{name}', firstName)}</h1>
              <p>{t(dict, 'onboarding.welcome.intro', 'SignalBoost will tailor Apprentice Workshop guidance, AI tone, and product defaults from four quick preferences. Every choice can be changed later in settings.')}</p>
              <div className="workshopPreview">
                <strong>{t(dict, 'onboarding.welcome.storyboardLabel', 'Storyboard')}</strong>
                <p style={{ marginBottom: 0 }}>{t(dict, 'onboarding.welcome.storyboardBody', 'Welcome → profile your skill level → choose privacy consent → pick the assistant tone → confirm your setup.')}</p>
              </div>
              <div className="footerActions">
                <button className="primaryButton" onClick={() => goTo(1)}>{t(dict, 'onboarding.welcome.start', 'Start onboarding →')}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'profiling' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.profiling.heading', 'Help us adapt the Apprentice Workshop.')}</h2>
              <p>{t(dict, 'onboarding.profiling.intro', 'Choose the path that best matches how you want SignalBoost to explain setup, dashboards, and technical decisions.')}</p>
              <div className="optionGrid">
                {ROLE_OPTIONS.map((option) => (
                  <button key={option.value} className={`optionCard ${answers.role === option.value ? 'optionCardActive' : ''}`} onClick={() => setAnswers((current) => ({ ...current, role: option.value }))}>
                    <span style={{ fontSize: '1.7rem' }}>{option.icon}</span>
                    <h3>{t(dict, 'onboarding.roles.' + option.value + '.title', option.title)}</h3>
                    <p>{t(dict, 'onboarding.roles.' + option.value + '.body', option.body)}</p>
                  </button>
                ))}
              </div>
              <strong>{t(dict, 'onboarding.profiling.itComfort', 'IT comfort level')}</strong>
              <div className="levelGrid">
                {IT_LEVEL_OPTIONS.map((option) => (
                  <button key={option.value} className={`optionCard ${answers.itLevel === option.value ? 'optionCardActive' : ''}`} onClick={() => setAnswers((current) => ({ ...current, itLevel: option.value }))}>
                    <h3>{t(dict, 'onboarding.itLevels.' + option.value + '.title', option.title)}</h3>
                    <p>{t(dict, 'onboarding.itLevels.' + option.value + '.body', option.body)}</p>
                  </button>
                ))}
              </div>
              <div className="footerActions">
                <button className="ghostButton" onClick={() => goTo(0, 'back')}>{t(dict, 'onboarding.common.back', '← Back')}</button>
                <button className="primaryButton" onClick={() => goTo(2)} disabled={!canContinue}>{t(dict, 'onboarding.common.continue', 'Continue →')}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'consent' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.consent.heading', 'Choose your AI training preference.')}</h2>
              <p>{t(dict, 'onboarding.consent.intro', 'Consent is optional and unchecked by default. SignalBoost can still personalize your account without using your data for AI training.')}</p>
              <label className="consentBox">
                <input type="checkbox" checked={answers.consentAiTraining} onChange={(event) => setAnswers((current) => ({ ...current, consentAiTraining: event.target.checked }))} />
                <span>
                  <strong>{t(dict, 'onboarding.consent.checkboxLabel', 'I consent to SignalBoost using my onboarding preferences to improve AI training.')}</strong>
                  <p style={{ margin: '.35rem 0 0' }}>{t(dict, 'onboarding.consent.checkboxBody', 'We store this preference with a timestamp, provide opt-out controls later, and avoid selling personal data.')}</p>
                </span>
              </label>
              <div className="footerActions">
                <button className="ghostButton" onClick={() => goTo(1, 'back')}>{t(dict, 'onboarding.common.back', '← Back')}</button>
                <button className="primaryButton" onClick={() => goTo(3)}>{answers.consentAiTraining ? t(dict, 'onboarding.consent.save', 'Save consent →') : t(dict, 'onboarding.consent.continueWithout', 'Continue without consent →')}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'tone' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.tone.heading', 'Pick your assistant tone.')}</h2>
              <p>{t(dict, 'onboarding.tone.intro', 'This preference follows you into content generation, support copy, and Apprentice Workshop explanations.')}</p>
              <div className="toneGrid">
                {TONE_OPTIONS.map((option) => (
                  <button key={option.value} className={`optionCard ${answers.tonePreference === option.value ? 'optionCardActive' : ''}`} onClick={() => setAnswers((current) => ({ ...current, tonePreference: option.value }))}>
                    <span style={{ fontSize: '2rem' }}>{option.emoji}</span>
                    <h3>{t(dict, 'onboarding.tones.' + option.value + '.title', option.title)}</h3>
                    <p>“{t(dict, 'onboarding.tones.' + option.value + '.sample', option.sample)}”</p>
                  </button>
                ))}
              </div>
              <div className="footerActions">
                <button className="ghostButton" onClick={() => goTo(2, 'back')}>{t(dict, 'onboarding.common.back', '← Back')}</button>
                <button className="primaryButton" onClick={() => goTo(4)} disabled={!canContinue}>{t(dict, 'onboarding.common.continue', 'Continue →')}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'confirmation' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.confirm.heading', 'Confirm your personalized setup.')}</h2>
              <p>{t(dict, 'onboarding.confirm.intro', 'Review the onboarding summary before opening your dashboard. Your choices are stored in profile settings and used by Apprentice Workshop.')}</p>
              <div className="summaryGrid">
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.role', 'Role')}</span><h3>{answers.role === 'developer' ? t(dict, 'onboarding.roles.developer.title', 'Developer') : t(dict, 'onboarding.roles.non_developer.title', 'Non-developer')}</h3></div>
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.itLevel', 'IT level')}</span><h3>{answers.itLevel ? t(dict, 'onboarding.itLevels.' + answers.itLevel + '.title', answers.itLevel) : t(dict, 'onboarding.confirm.notSelected', 'Not selected')}</h3></div>
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.tone', 'Tone')}</span><h3>{t(dict, 'onboarding.tones.' + (answers.tonePreference || 'friendly') + '.title', answers.tonePreference || 'friendly')}</h3></div>
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.consent', 'AI training consent')}</span><h3>{answers.consentAiTraining ? t(dict, 'onboarding.confirm.granted', 'Granted') : t(dict, 'onboarding.confirm.notGranted', 'Not granted')}</h3></div>
              </div>
              <div className="workshopPreview">
                <strong>{t(dict, 'onboarding.confirm.previewLabel', 'Apprentice Workshop preview')}</strong>
                <p style={{ marginBottom: 0 }}>{answers.itLevel === 'advanced' ? t(dict, 'onboarding.confirm.previewAdvanced', 'You will see faster technical paths, diagnostics, and deployment checks.') : answers.itLevel === 'intermediate' ? t(dict, 'onboarding.confirm.previewIntermediate', 'You will see balanced guidance with configurable shortcuts.') : t(dict, 'onboarding.confirm.previewBeginner', 'You will see beginner-friendly lessons, definitions, and safe defaults.')}</p>
              </div>
              <div className="footerActions">
                <button className="ghostButton" onClick={() => goTo(3, 'back')}>{t(dict, 'onboarding.confirm.editTone', '← Edit tone')}</button>
                <button className="primaryButton" onClick={() => finish()} disabled={saving}>{saving ? t(dict, 'onboarding.confirm.saving', 'Saving…') : t(dict, 'onboarding.confirm.complete', 'Complete onboarding →')}</button>
              </div>
            </div>
          )}
        </article>
      </section>
    </main>
  )
}
