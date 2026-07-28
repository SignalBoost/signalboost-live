'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
  { key: 'welcome', label: uiCopy('u_2b612a6f864ea749'), kicker: uiCopy('u_fc0c101cd542ab26'), icon: '👋' },
  { key: 'profiling', label: uiCopy('u_d43c69a931c8e0a5'), kicker: uiCopy('u_80f26781e262bb3c'), icon: '🧭' },
  { key: 'consent', label: uiCopy('u_04ec09eaf4669a9b'), kicker: uiCopy('u_b927597e75c4f6d8'), icon: '🛡️' },
  { key: 'tone', label: uiCopy('u_e1b1dd0a9e7cc490'), kicker: uiCopy('u_41570a1f13d12b8b'), icon: '🎙️' },
  { key: 'confirmation', label: uiCopy('u_840d30e8e6564380'), kicker: uiCopy('u_e38bb1c96b9a4669'), icon: '✅' },
] as const

const ROLE_OPTIONS = [
  {
    value: 'developer' as Role,
    title: uiCopy('u_ae8b6d5948c0d0c6'),
    body: uiCopy('u_a12e9c338c284b19'),
    icon: '⌘',
  },
  {
    value: 'non_developer' as Role,
    title: uiCopy('u_20480f5489b7d1a9'),
    body: uiCopy('u_2d49844d04559eb6'),
    icon: '✨',
  },
]

const IT_LEVEL_OPTIONS = [
  {
    value: 'beginner' as ItLevel,
    title: uiCopy('u_61d737d375c5a679'),
    body: uiCopy('u_a0c7c3b658f84109'),
  },
  {
    value: 'intermediate' as ItLevel,
    title: uiCopy('u_382129d064bd2996'),
    body: uiCopy('u_dcd4a04085719b29'),
  },
  {
    value: 'advanced' as ItLevel,
    title: uiCopy('u_34115a204b8c790b'),
    body: uiCopy('u_9505190c568bc59c'),
  },
]

const TONE_OPTIONS = [
  {
    value: 'friendly' as TonePreference,
    title: uiCopy('u_ddd774b726159f28'),
    sample: 'I will guide you step by step and keep things clear.',
    emoji: '🙂',
  },
  {
    value: 'professional' as TonePreference,
    title: uiCopy('u_1d6ed373b14b9ed3'),
    sample: 'I will keep recommendations concise, direct, and business-ready.',
    emoji: '💼',
  },
  {
    value: 'playful' as TonePreference,
    title: uiCopy('u_4eab7c0a2f6ce614'),
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
        {t(dict, 'onboarding.loading', uiCopy('u_5c5ad174af59899a'))}
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
        <div className="brand">{uiCopy('u_0cd570cb222a964e')}<span style={{ color: GOLD }}>{uiCopy('u_4697325d881aa657')}</span></div>
        <button className="skipButton" onClick={() => finish(true)} disabled={saving}>{t(dict, 'onboarding.skip', uiCopy('u_cf45f7a4a7060eaa'))}</button>
      </header>

      <section className="layout" aria-label={uiCopy('u_ac9f6ee3a4683fa2')}>
        <aside className="sidebar" aria-label={uiCopy('u_f5ffe41a1e7655dc')}>
          <strong>{t(dict, 'onboarding.progressComplete', uiCopy('u_944c25f56709f4de')).replace(uiCopy('u_1e8f076dc904596d'), String(Math.round(progress)))}</strong>
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
              <h1>{t(dict, 'onboarding.welcome.title', uiCopy('u_011e243e170b5c1e')).replace(uiCopy('u_27fda04f2e5ba487'), firstName)}</h1>
              <p>{t(dict, 'onboarding.welcome.intro', uiCopy('u_0e0b19ab29e7e9c2'))}</p>
              <div className="workshopPreview">
                <strong>{t(dict, 'onboarding.welcome.storyboardLabel', uiCopy('u_74a2577b6f124e42'))}</strong>
                <p style={{ marginBottom: 0 }}>{t(dict, 'onboarding.welcome.storyboardBody', uiCopy('u_892da35ce389fb60'))}</p>
              </div>
              <div className="footerActions">
                <button className="primaryButton" onClick={() => goTo(1)}>{t(dict, 'onboarding.welcome.start', uiCopy('u_289c44aee60e3427'))}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'profiling' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.profiling.heading', uiCopy('u_808e5abb0c58edd7'))}</h2>
              <p>{t(dict, 'onboarding.profiling.intro', uiCopy('u_ba23ec30f8e30fba'))}</p>
              <div className="optionGrid">
                {ROLE_OPTIONS.map((option) => (
                  <button key={option.value} className={`optionCard ${answers.role === option.value ? 'optionCardActive' : ''}`} onClick={() => setAnswers((current) => ({ ...current, role: option.value }))}>
                    <span style={{ fontSize: '1.7rem' }}>{option.icon}</span>
                    <h3>{t(dict, 'onboarding.roles.' + option.value + '.title', option.title)}</h3>
                    <p>{t(dict, 'onboarding.roles.' + option.value + '.body', option.body)}</p>
                  </button>
                ))}
              </div>
              <strong>{t(dict, 'onboarding.profiling.itComfort', uiCopy('u_b1ce9dbaf61fa288'))}</strong>
              <div className="levelGrid">
                {IT_LEVEL_OPTIONS.map((option) => (
                  <button key={option.value} className={`optionCard ${answers.itLevel === option.value ? 'optionCardActive' : ''}`} onClick={() => setAnswers((current) => ({ ...current, itLevel: option.value }))}>
                    <h3>{t(dict, 'onboarding.itLevels.' + option.value + '.title', option.title)}</h3>
                    <p>{t(dict, 'onboarding.itLevels.' + option.value + '.body', option.body)}</p>
                  </button>
                ))}
              </div>
              <div className="footerActions">
                <button className="ghostButton" onClick={() => goTo(0, 'back')}>{t(dict, 'onboarding.common.back', uiCopy('u_4f6437bbbca087be'))}</button>
                <button className="primaryButton" onClick={() => goTo(2)} disabled={!canContinue}>{t(dict, 'onboarding.common.continue', uiCopy('u_bbb5b450368cbfba'))}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'consent' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.consent.heading', uiCopy('u_0712d84786192f5a'))}</h2>
              <p>{t(dict, 'onboarding.consent.intro', uiCopy('u_6f0bd1ae550a005a'))}</p>
              <label className="consentBox">
                <input type="checkbox" checked={answers.consentAiTraining} onChange={(event) => setAnswers((current) => ({ ...current, consentAiTraining: event.target.checked }))} />
                <span>
                  <strong>{t(dict, 'onboarding.consent.checkboxLabel', uiCopy('u_0ac6448542d96df7'))}</strong>
                  <p style={{ margin: '.35rem 0 0' }}>{t(dict, 'onboarding.consent.checkboxBody', uiCopy('u_91d2d538b6e4ab72'))}</p>
                </span>
              </label>
              <div className="footerActions">
                <button className="ghostButton" onClick={() => goTo(1, 'back')}>{t(dict, 'onboarding.common.back', uiCopy('u_1739a25e1e0879af'))}</button>
                <button className="primaryButton" onClick={() => goTo(3)}>{answers.consentAiTraining ? t(dict, 'onboarding.consent.save', uiCopy('u_de31e99d97b39c6b')) : t(dict, 'onboarding.consent.continueWithout', uiCopy('u_61ade22ccde07c0a'))}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'tone' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.tone.heading', uiCopy('u_79ca8cbfdeff184b'))}</h2>
              <p>{t(dict, 'onboarding.tone.intro', uiCopy('u_a3eec0548d5bf6ff'))}</p>
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
                <button className="ghostButton" onClick={() => goTo(2, 'back')}>{t(dict, 'onboarding.common.back', uiCopy('u_07f939854367f0d6'))}</button>
                <button className="primaryButton" onClick={() => goTo(4)} disabled={!canContinue}>{t(dict, 'onboarding.common.continue', uiCopy('u_1aadcd32444d0e4d'))}</button>
              </div>
            </div>
          )}

          {activeStep.key === 'confirmation' && (
            <div>
              <div className="kicker">{activeStep.kicker}</div>
              <h2>{t(dict, 'onboarding.confirm.heading', uiCopy('u_dd9b5b056332c677'))}</h2>
              <p>{t(dict, 'onboarding.confirm.intro', uiCopy('u_c2748314453e3031'))}</p>
              <div className="summaryGrid">
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.role', uiCopy('u_5322322d37315305'))}</span><h3>{answers.role === 'developer' ? t(dict, 'onboarding.roles.developer.title', uiCopy('u_90eb625804e1d852')) : t(dict, 'onboarding.roles.non_developer.title', uiCopy('u_45a9da974a9304cf'))}</h3></div>
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.itLevel', uiCopy('u_1801af2e6f4178f2'))}</span><h3>{answers.itLevel ? t(dict, 'onboarding.itLevels.' + answers.itLevel + '.title', answers.itLevel) : t(dict, 'onboarding.confirm.notSelected', uiCopy('u_b037e1a341a49b72'))}</h3></div>
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.tone', uiCopy('u_2d1548fc22da194a'))}</span><h3>{t(dict, 'onboarding.tones.' + (answers.tonePreference || 'friendly') + '.title', answers.tonePreference || 'friendly')}</h3></div>
                <div className="summaryCard"><span>{t(dict, 'onboarding.confirm.consent', uiCopy('u_d8f68c312a6f282e'))}</span><h3>{answers.consentAiTraining ? t(dict, 'onboarding.confirm.granted', uiCopy('u_99659229ae3bab26')) : t(dict, 'onboarding.confirm.notGranted', uiCopy('u_fea784ced20dfc41'))}</h3></div>
              </div>
              <div className="workshopPreview">
                <strong>{t(dict, 'onboarding.confirm.previewLabel', uiCopy('u_b6efc7ee16066254'))}</strong>
                <p style={{ marginBottom: 0 }}>{answers.itLevel === 'advanced' ? t(dict, 'onboarding.confirm.previewAdvanced', uiCopy('u_ac60977f1edee76c')) : answers.itLevel === 'intermediate' ? t(dict, 'onboarding.confirm.previewIntermediate', uiCopy('u_926197316a22384d')) : t(dict, 'onboarding.confirm.previewBeginner', uiCopy('u_44124c2da711d527'))}</p>
              </div>
              <div className="footerActions">
                <button className="ghostButton" onClick={() => goTo(3, 'back')}>{t(dict, 'onboarding.confirm.editTone', uiCopy('u_6985ec667cb300d8'))}</button>
                <button className="primaryButton" onClick={() => finish()} disabled={saving}>{saving ? t(dict, 'onboarding.confirm.saving', uiCopy('u_2ce1e68a5654f617')) : t(dict, 'onboarding.confirm.complete', uiCopy('u_6eed779448353e6c'))}</button>
              </div>
            </div>
          )}
        </article>
      </section>
    </main>
  )
}
