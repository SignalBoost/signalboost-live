'use client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import DashboardModules from '@/components/dashboard/DashboardModules'
import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'
import AuthModal from '@/components/AuthModal'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'
import AssistantMessage from '@/components/AssistantMessage'
import { t } from '@/lib/i18n/t'
import {
  getProjects,
  canCreateProject,
  deleteProject,
  updateProjectStatus,
  TYPE_ICONS,
  STATUS_COLORS,
  Project,
} from '@/lib/projects'
import { getGreeting, SupportedLocale } from '@/lib/cultural-calendar'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const BLUE = '#3b82f6'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'
const GOLD = '#ffc300'

type Message = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

type Sketch = {
  headline?: string
  tagline?: string
  cta?: string
  sections?: string[]
  colors?: {
    primary?: string
    accent?: string
    background?: string
    text?: string
  }
}

// Language-aware "terminal-style" formatter.
// English: UPPERCASE_WITH_UNDERSCORES (preserves the dashboard's terminal look).
// Other languages: pass through naturally (avoids breaking accented characters
// and unnatural ALL-CAPS rendering in PT/ES/PL/RU).
function termCase(value: string, lang: string): string {
  if (!value) return ''
  if (lang === 'en') return value.toUpperCase().replace(/ /g, '_')
  return value
}

// Plain upper-case helper that's still safe for non-Latin scripts (e.g. ASCII codes).
// Use only for things like language codes / status enums that are ASCII by design.
function safeUpper(value: string): string {
  return (value || '').toUpperCase()
}

export default function DashboardOverviewPage() {
  const { dict, lang } = useI18n()

  const [userId, setUserId] = useState<string | null>(null)
  const [firstName, setFirstName] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [plan, setPlan] = useState('free')
  const [projectLimit, setProjectLimit] = useState(1)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)

  const [promptInput, setPromptInput] = useState('')
  const [promptMessages, setPromptMessages] = useState<Message[]>([])
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [hasTyped, setHasTyped] = useState(false)

  const [sketch, setSketch] = useState<Sketch | null>(null)

  const conciergeMessage = useMemo(() => {
    if (!projectsLoaded) {
      return {
        icon: '🛰️',
        title: t(dict, 'dash.concierge.title', uiCopy('u_d8ac3b158ef95e30')),
        message: t(dict, 'dash.concierge.loading', uiCopy('u_20d6dd5f4c3831c5'))
      }
    }

    if (projects.length === 0) {
      return {
        icon: '👋',
        title: t(dict, 'dash.concierge.title', uiCopy('u_5ac5ed9c7976038a')),
        message: t(dict, 'dash.concierge.welcome', uiCopy('u_0f90b87d32f1eab5'))
      }
    }

    const liveProjects = projects.filter(p => p.status === 'live')
    const draftProjects = projects.filter(p => p.status === 'draft')

    if (draftProjects.length > 0) {
      return {
        icon: '🧭',
        title: t(dict, 'dash.concierge.title', uiCopy('u_999e24395f19f75e')),
        message: draftProjects.length > 1
          ? t(dict, 'dash.concierge.drafts.many', uiCopy('u_d903bcd9f41cba27')).replace('{count}', String(draftProjects.length))
          : t(dict, 'dash.concierge.drafts.one', uiCopy('u_4711ea35d8a5a8a6'))
      }
    }

    if (liveProjects.length > 0) {
      return {
        icon: '🚀',
        title: t(dict, 'dash.concierge.title', uiCopy('u_6090fbcc1d3bbfa0')),
        message: liveProjects.length > 1
          ? t(dict, 'dash.concierge.live.many', uiCopy('u_ff1476b90fc636cc')).replace('{count}', String(liveProjects.length))
          : t(dict, 'dash.concierge.live.one', uiCopy('u_91a4c2affccd691b'))
      }
    }

    return {
      icon: '💡',
      title: t(dict, 'dash.concierge.title', uiCopy('u_47a5e6c9de50d7d3')),
      message: t(dict, 'dash.concierge.help', uiCopy('u_578002b64088bb23'))
    }
  }, [dict, projects, projectsLoaded])

  const promptRef = useRef<HTMLDivElement>(null)

  const QUICK_ACTIONS = [
    { type: 'website' as const, icon: '🌐', label: t(dict, 'dash.actions.website.label', uiCopy('u_a0b24f92e9133217')), subline: t(dict, 'dash.actions.website.subline', uiCopy('u_e9ead4cd40a02e00')), href: '/dashboard/builder' },
    { type: 'review' as const, icon: '⭐', label: t(dict, 'dash.actions.review.label', uiCopy('u_da70fdf5fcdca570')), subline: t(dict, 'dash.actions.review.subline', uiCopy('u_326d63debe6da8da')), href: '/dashboard/reviews' },
    { type: 'podcast' as const, icon: '🎙️', label: t(dict, 'dash.actions.podcast.label', uiCopy('u_f4b8bf83c09e0395')), subline: t(dict, 'dash.actions.podcast.subline', uiCopy('u_0372628b331222ef')), href: '/dashboard/audio' },
    { type: 'video' as const, icon: '🎬', label: t(dict, 'dash.actions.video.label', uiCopy('u_99034581bc7afdd2')), subline: t(dict, 'dash.actions.video.subline', uiCopy('u_8f5d02a7b2580cfc')), href: '/dashboard/video' },
  ]

  const NEW_USER_PROMPTS = [
    t(dict, uiCopy('u_283fbeb48d06439f'), uiCopy('u_c56bb50df1fd4191')),
    t(dict, uiCopy('u_32d6461c65a2c77f'), uiCopy('u_7ef09bb1674f2209')),
    t(dict, uiCopy('u_984feb60a34b960c'), uiCopy('u_d1488603d5e379a6')),
    t(dict, uiCopy('u_43d7dfd63c8f4414'), uiCopy('u_27428353f93db530')),
  ]

  const RETURNING_PROMPTS = [
    t(dict, uiCopy('u_f99e2557f24136f5'), uiCopy('u_fc4e4df7d542e6d6')),
    t(dict, uiCopy('u_ad98392e828fe39c'), uiCopy('u_fd1d7209f7d4c745')),
    t(dict, uiCopy('u_9fecd7958f3df5a3'), uiCopy('u_78fbbd7e002436aa')),
    t(dict, uiCopy('u_9168a1ae86c117f3'), uiCopy('u_aa233c9c3055c9d0')),
  ]

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setIsLoggedIn(true)
        setUserId(data.user.id)

        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        setFirstName(fullName.split(' ')[0] || null)

        getProjects(data.user.id).then(p => {
          setProjects(p)
          setProjectsLoaded(true)
        })

        canCreateProject(data.user.id).then(res => {
          setPlan(res.plan)
          setProjectLimit(res.limit === Infinity ? 999 : res.limit)
        })
      } else {
        setIsLoggedIn(false)
        setProjectsLoaded(true)
      }

      setAuthChecked(true)
    })
  }, [])

  useEffect(() => {
    if (promptRef.current) {
      promptRef.current.scrollTop = promptRef.current.scrollHeight
    }
  }, [promptMessages, promptLoading])

  async function sendPrompt(text?: string) {
    const content = text || promptInput.trim()
    if (!content || promptLoading) return

    setPromptInput('')
    setPromptOpen(true)
    setHasTyped(true)

    const newMessages: Message[] = [
      ...promptMessages,
      { role: uiCopy('u_2822e22665bb91ba'), content },
    ]

    setPromptMessages(newMessages)
    setPromptLoading(true)

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          context: {
            userName: firstName,
            currentPage: 'Dashboard',
            userPlan: plan,
            language: lang,
          },
        }),
      })

      const data = (await res.json()) as { reply?: string; sketch?: Sketch }

      setPromptMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || t(dict, 'dash.connectionError', uiCopy('u_af9d0e957a5157ed')),
        },
      ])

      if (data.sketch) {
        setSketch(data.sketch)
      }
    } catch {
      setPromptMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: t(dict, 'dash.connectionError', uiCopy('u_62b54d88e055fd23')),
        },
      ])
    }

    setPromptLoading(false)
  }

  async function handleDelete(id: string) {
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  async function handleStatus(id: string, status: Project['status']) {
    await updateProjectStatus(id, status)
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, status } : p)))
  }

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}${t(dict, 'dash.time.daysShort', 'd')} ${t(dict, 'dash.time.ago', uiCopy('u_e020bc7db895fe82'))}`
    if (hours > 0) return `${hours}${t(dict, 'dash.time.hoursShort', 'h')} ${t(dict, 'dash.time.ago', uiCopy('u_f6edb238b3436b9e'))}`
    if (mins > 0) return `${mins}${t(dict, 'dash.time.minsShort', 'm')} ${t(dict, 'dash.time.ago', uiCopy('u_aa7fd53ec401c906'))}`

    return t(dict, 'dash.time.justNow', uiCopy('u_a5457d6a8a5ce636'))
  }

  const isNewUser = projectsLoaded && projects.length === 0

  const greetingData = useMemo(
    () => getGreeting(lang as SupportedLocale, { firstName, isNewUser, isLoggedIn }),
    [projectsLoaded, isLoggedIn, firstName, lang]
  )

  const promptSuggestions = isNewUser ? NEW_USER_PROMPTS : RETURNING_PROMPTS

  const projectsTitle = firstName
    ? t(dict, 'dash.projectsTitleNamed', uiCopy('u_fe9337f4984a21e9')).replace('{name}', firstName)
    : t(dict, 'dash.projectsTitle', uiCopy('u_3c977813be6ff01d'))

  const atLimit = projects.length >= projectLimit
  const greetingHidden = hasTyped || promptMessages.length > 0
  const showLoginGate = authChecked && !isLoggedIn

  const sketchColors = {
    primary: sketch?.colors?.primary || '#1B4332',
    accent: sketch?.colors?.accent || '#F4A400',
    background: sketch?.colors?.background || '#FDF6EC',
    text: sketch?.colors?.text || '#2C1A0E',
  }

  // Translated labels. Defaults are English values; for the terminal aesthetic,
  // termCase(value, lang) handles language-aware casing in render — so JSON
  // values should be NATURAL (e.g. "Quick actions"), not pre-shouted.
  const L = {
    quickActions: t(dict, 'dash.preview.quickActions', uiCopy('u_ac45fa49dc9d61a8')),
    yourProjects: t(dict, 'dash.preview.yourProjects', uiCopy('u_bf039b8d761e9b73')),
    createProject: t(dict, 'dash.preview.createProject', uiCopy('u_0abe21f8dcca3b61')),
    openProject: t(dict, 'dash.preview.openProject', uiCopy('u_957f1c1192a3df8a')),
    updated: t(dict, 'dash.preview.updated', uiCopy('u_adc62c361a4390ab')),
    execute: t(dict, 'dash.preview.execute', uiCopy('u_eaceadb56b59dd8a')),
    thinking: t(dict, 'dash.preview.thinking', uiCopy('u_40f69f348ec0d58b')),
    thinkingMsg: t(dict, 'dash.preview.thinkingMsg', uiCopy('u_910b5d13e3f09ad4')),
    livePreview: t(dict, 'dash.preview.label', uiCopy('u_34e6fac40d879f3e')),
    close: t(dict, 'dash.preview.close', uiCopy('u_e22e0ba8f7820440')),
    openInBuilder: t(dict, 'dash.preview.openInBuilder', uiCopy('u_33eb46b827b10d70')),
    upgrade: t(dict, 'dash.upgrade', uiCopy('u_38b9b7c8491c0960')),
    team: t(dict, 'dash.team', uiCopy('u_0405d5430c14b459')),
    loadingTeam: t(dict, 'dash.loadingTeam', uiCopy('u_64116e768be05aa3')),
    noProjects: t(dict, 'dash.noProjects', uiCopy('u_fad08ae257c3edb3')),
    noProjectsSub: t(dict, 'dash.noProjectsSub', uiCopy('u_4c107bc247a3a838')),
    feedback: t(dict, 'dash.feedback', uiCopy('u_7ee9f2f1f650c8cd')),
    headlineFallback: t(dict, 'dash.sketch.headlineFallback', uiCopy('u_750ec85e898b4641')),
  }
return (
    <div style={{ color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '0 20px' }}>
      <style>{uiCopy('u_a4ba98f7ce17ecde')}</style>

      {showLoginGate && <AuthModal onClose={() => {}} />}

      <DashboardModules />

      <OrchestrationPanel module="dashboard" />

      <div style={{ opacity: showLoginGate ? 0.2 : 1, pointerEvents: showLoginGate ? 'none' : 'auto', filter: showLoginGate ? 'blur(2px)' : 'none', transition: 'all 0.3s' }}>

        <div style={{ display: 'flex', gap: 16, marginBottom: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          <div
            className="fathom-glass"
            style={{
              width: '100%',
              borderRadius: 16,
              padding: '16px 18px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'linear-gradient(90deg, rgba(59,130,246,.10), rgba(255,195,0,.05))',
              border: '1px solid rgba(59,130,246,.18)',
              boxShadow: '0 18px 50px rgba(0,0,0,.18)',
            }}
          >
            <div
              style={{
                width: 44, height: 44, borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)',
                fontSize: 24, flex: '0 0 auto',
              }}
            >
              {conciergeMessage.icon}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="terminal-text"
                style={{ fontSize: 11, fontWeight: 900, color: BLUE, letterSpacing: '.08em', textTransform: lang === 'en' ? 'uppercase' : 'none' }}
              >
                {conciergeMessage.title}
              </div>

              <div style={{ marginTop: 5, fontSize: 13, color: 'rgba(255,255,255,.72)', lineHeight: 1.45 }}>
                {conciergeMessage.message}
              </div>
            </div>

            <button
              onClick={() => { setPromptOpen(true); setPromptInput(t(dict, 'dash.prompt.nextAction', uiCopy('u_dd00bdf557b794bf'))) }}
              className="terminal-text"
              style={{ border: '1px solid rgba(255,195,0,.25)', background: 'rgba(255,195,0,.08)', color: GOLD, borderRadius: 999, padding: '9px 12px', fontSize: 10, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {termCase(t(dict, 'dash.concierge.askNext', uiCopy('u_128aa5ed0b8398bb')), lang)}
            </button>
          </div>

          <div className="fathom-glass" style={{ flex: sketch ? '1 1 380px' : '1 1 100%', minWidth: 320, borderRadius: 16, padding: 24 }}>
            <div style={{ overflow: 'hidden', maxHeight: greetingHidden ? 0 : 200, opacity: greetingHidden ? 0 : 1, marginBottom: greetingHidden ? 0 : 20, transition: 'all .4s ease' }}>
              <h1 className="terminal-text" style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px', background: 'linear-gradient(90deg,#3b82f6,#ffc300,#4ade80,#3b82f6)', backgroundSize: '300% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shimmer 3s linear infinite', display: 'inline-block', textTransform: lang === 'en' ? 'uppercase' : 'none' }}>
                {greetingData.headline} {greetingData.emoji}
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                {greetingData.subline}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: promptOpen ? 16 : 0 }}>
              <span className="terminal-text" style={{ color: BLUE, display: 'flex', alignItems: 'center', fontWeight: 700 }}>$</span>
              <input
                value={promptInput}
                onChange={(e) => { setPromptInput(e.target.value); if (e.target.value.length > 0 && !hasTyped) setHasTyped(true) }}
                onKeyDown={(e) => { if (e.key === 'Enter') sendPrompt() }}
                placeholder={t(dict, 'dash.askPlaceholder', uiCopy('u_025bdbc9b47cb6c9'))}
                className="terminal-text"
                style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={() => sendPrompt()}
                disabled={promptLoading}
                className="terminal-text"
                style={{ padding: '0 20px', borderRadius: 8, border: 'none', background: BLUE, color: '#fff', fontWeight: 700, fontSize: 12, cursor: promptLoading ? 'wait' : 'pointer', opacity: promptLoading ? 0.7 : 1 }}
              >
                {termCase(promptLoading ? L.thinking : L.execute, lang)}
              </button>
            </div>

            {promptOpen && (
              <div ref={promptRef} style={{ maxHeight: 320, overflowY: 'auto', padding: 14, borderRadius: 12, background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', marginTop: 14 }}>
                {promptMessages.map((m, idx) => (
                  <div key={`${m.role}-${idx}`} style={{ marginBottom: 12, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: m.role === 'user' ? '82%' : '100%', width: m.role === 'assistant' ? '100%' : 'auto', whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal', lineHeight: 1.6, padding: '10px 12px', borderRadius: 12, background: m.role === 'user' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13 }}>
                      {m.role === 'assistant' ? <AssistantMessage content={m.content} /> : m.content}
                    </div>
                  </div>
                ))}
                {promptLoading && <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13 }}>{L.thinkingMsg}</div>}
              </div>
            )}

            {!promptOpen && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                {promptSuggestions.map(q => (
                  <button key={q} onClick={() => sendPrompt(q)} className="terminal-text" style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {sketch && (
            <div className="fathom-glass" style={{ flex: '1 1 420px', minWidth: 340, borderRadius: 16, padding: 16, animation: 'cardIn .4s ease both' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '.08em' }}>
                  // {termCase(L.livePreview, lang)}
                </div>
                <button onClick={() => setSketch(null)} className="terminal-text" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: 4, fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}>
                  {termCase(L.close, lang)}
                </button>
              </div>

              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ background: '#1a1a1a', padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56', display: 'inline-block' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f', display: 'inline-block' }} />
                </div>

                <div style={{ background: sketchColors.background, color: sketchColors.text, padding: '32px 24px', minHeight: 360 }}>
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: sketchColors.primary, lineHeight: 1.2 }}>
                      {sketch.headline || L.headlineFallback}
                    </div>
                    {sketch.tagline && <div style={{ fontSize: 14, marginTop: 8, opacity: 0.8 }}>{sketch.tagline}</div>}
                    {sketch.cta && (
                      <span role="presentation" style={{ display: 'inline-block', marginTop: 18, background: sketchColors.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '10px 22px', fontWeight: 700, fontSize: 14, cursor: 'default' }}>
                        {sketch.cta}
                      </span>
                    )}
                  </div>

                  {sketch.sections && sketch.sections.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sketch.sections.map((s, i) => (
                        <div key={i} style={{ background: 'rgba(0,0,0,0.06)', borderLeft: `4px solid ${sketchColors.primary}`, padding: '12px 14px', borderRadius: 4, fontWeight: 600, fontSize: 14 }}>
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {Object.entries(sketchColors).map(([name, hex]) => (
                  <div key={name} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: 28, borderRadius: 4, background: hex, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <div className="terminal-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{hex}</div>
                  </div>
                ))}
              </div>

              <Link href="/dashboard/builder" className="terminal-text" style={{ display: 'block', textAlign: 'center', marginTop: 14, background: GOLD, color: '#000', padding: 12, borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontSize: 12 }}>
                {termCase(L.openInBuilder, lang)}
              </Link>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 32 }}>
          <h2 className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 16, letterSpacing: '.08em' }}>
            // {termCase(L.quickActions, lang)}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {QUICK_ACTIONS.map(item => (
              <Link
                key={item.type}
                href={item.href}
                onMouseEnter={() => setHoveredAction(item.type)}
                onMouseLeave={() => setHoveredAction(null)}
                className="fathom-glass"
                style={{ borderRadius: 12, padding: 20, textDecoration: 'none', transition: 'all .2s', borderColor: hoveredAction === item.type ? BLUE_BORDER : 'rgba(255,255,255,0.06)', background: hoveredAction === item.type ? 'rgba(59,130,246,0.04)' : 'rgba(6, 9, 19, 0.4)' }}
              >
                <div style={{ fontSize: 24 }}>{item.icon}</div>
                <div className="terminal-text" style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 10 }}>
                  {termCase(item.label, lang)}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.4 }}>
                  {item.subline}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: t(dict, 'dash.stats.activeSites', uiCopy('u_6f1bc9465f51e610')), value: projects.filter(p => p.status === 'live').length },
            { label: t(dict, 'dash.stats.projects', uiCopy('u_6fdf2fb16d445375')), value: `${projects.length}/${projectLimit === 999 ? '∞' : projectLimit}` },
            { label: t(dict, 'dash.stats.audioGenerated', uiCopy('u_8e282c2cf7050ba7')), value: `0 ${t(dict, 'dash.stats.min', uiCopy('u_832f1a45a905f06b'))}` },
            { label: t(dict, 'dash.stats.videosCreated', uiCopy('u_ea9d210a5b776c73')), value: '0' },
          ].map(stat => (
            <div key={stat.label} className="fathom-glass" style={{ borderRadius: 12, padding: 16, background: 'rgba(6, 9, 19, 0.3)' }}>
              <div className="terminal-text" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                [{termCase(stat.label, lang)}]
              </div>
              <div className="terminal-text" style={{ fontSize: 22, fontWeight: 900, color: BLUE }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="terminal-text" style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              // {termCase(L.yourProjects, lang)}: {termCase(projectsTitle, lang)}
            </h2>

            {atLimit ? (
              <Link href="/pricing" style={{ background: GOLD, color: '#000', padding: '10px 20px', borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontSize: 12, fontFamily: 'monospace', textTransform: lang === 'en' ? 'uppercase' : 'none' }}>
                {L.upgrade}
              </Link>
            ) : (
              <Link href="/dashboard/builder" className="terminal-text" style={{ background: GOLD, color: '#000', padding: '10px 20px', border: 'none', borderRadius: 6, fontWeight: 800, fontSize: 11, textDecoration: 'none' }}>
                {termCase(L.createProject, lang)}
              </Link>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="fathom-glass" style={{ borderStyle: 'dashed', borderRadius: 16, padding: 50, textAlign: 'center' }}>
              <div style={{ fontSize: 32, opacity: 0.3 }}>📁</div>
              <div className="terminal-text" style={{ marginTop: 10, fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                {L.noProjects}. {L.noProjectsSub}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {projects.map((p, i) => (
                <div key={p.id} className="fathom-glass" style={{ borderRadius: 12, padding: 20, animation: `cardIn .3s ease ${i * .04}s both`, background: 'rgba(6, 9, 19, 0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(59,130,246,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {TYPE_ICONS[p.type]}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </div>
                        <div className="terminal-text" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                          {safeUpper(p.language)}
                        </div>
                      </div>
                    </div>

                    <div className="terminal-text" style={{ color: STATUS_COLORS[p.status], fontSize: 10, fontWeight: 700 }}>
                      [{safeUpper(p.status)}]
                    </div>
                  </div>

                  <div className="terminal-text" style={{ marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    {L.updated}: {timeAgo(p.last_edited_at)}
                  </div>

                  <Link
                    href={`/dashboard/${p.type === 'website' ? 'builder' : p.type === 'review' ? 'reviews' : p.type === 'podcast' ? 'audio' : 'video'}`}
                    className="terminal-text"
                    style={{ display: 'block', marginTop: 14, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: 8, borderRadius: 6, textDecoration: 'none', fontSize: 11, fontWeight: 700 }}
                  >
                    {termCase(L.openProject, lang)}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fathom-glass" style={{ borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h2 className="terminal-text" style={{ fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>
            // {termCase(L.team, lang)}
          </h2>
          {userId ? <TeamManager userId={userId} /> : <div className="terminal-text" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{L.loadingTeam}</div>}
        </div>

        <Link href="/dashboard/feedback" style={{ display: 'block', textAlign: 'center', padding: 14, background: 'rgba(255,195,0,.03)', border: '1px solid rgba(255,195,0,.15)', borderRadius: 10, textDecoration: 'none', color: 'rgba(255,195,0,.8)', fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>
          {L.feedback}
        </Link>
      </div>
    </div>
  )
}
