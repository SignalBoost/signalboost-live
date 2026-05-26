'use client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import AuthModal from '@/components/AuthModal'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'
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

const BLUE = '#3b82f6'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'
const GOLD = '#ffc300'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type Sketch = {
  headline?: string
  tagline?: string
  colors?: {
    primary?: string
    accent?: string
    background?: string
    text?: string
  }
  sections?: string[]
  cta?: string
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
        title: 'SignalBoost Concierge',
        message: 'Loading your workspace and checking what needs attention.'
      }
    }

    if (projects.length === 0) {
      return {
        icon: '👋',
        title: 'SignalBoost Concierge',
        message: 'Welcome. Start by creating your first project, or ask SignalBoost what to build first.'
      }
    }

    const liveProjects = projects.filter(p => p.status === 'live')
    const draftProjects = projects.filter(p => p.status === 'draft')

    if (draftProjects.length > 0) {
      return {
        icon: '🧭',
        title: 'SignalBoost Concierge',
        message: `You have ${draftProjects.length} draft project${draftProjects.length > 1 ? 's' : ''}. Open one and publish when ready.`
      }
    }

    if (liveProjects.length > 0) {
      return {
        icon: '🚀',
        title: 'SignalBoost Concierge',
        message: `You have ${liveProjects.length} live project${liveProjects.length > 1 ? 's' : ''}. Next step: promote, collect reviews, or create content.`
      }
    }

    return {
      icon: '💡',
      title: 'SignalBoost Concierge',
      message: 'Need help choosing the next move? Ask SignalBoost below.'
    }
  }, [projects, projectsLoaded])

  const promptRef = useRef<HTMLDivElement>(null)

  const QUICK_ACTIONS = [
    { type: 'website' as const, icon: '🌐', label: t(dict, 'dash.actions.website.label', 'Build a website'), subline: t(dict, 'dash.actions.website.subline', 'Create or edit your online presence'), href: '/dashboard/builder' },
    { type: 'review' as const, icon: '⭐', label: t(dict, 'dash.actions.review.label', 'Collect reviews'), subline: t(dict, 'dash.actions.review.subline', 'Get feedback and testimonials'), href: '/dashboard/reviews' },
    { type: 'podcast' as const, icon: '🎙️', label: t(dict, 'dash.actions.podcast.label', 'Generate native audio'), subline: t(dict, 'dash.actions.podcast.subline', 'Create voice content in multiple languages'), href: '/dashboard/audio' },
    { type: 'video' as const, icon: '🎬', label: t(dict, 'dash.actions.video.label', 'Create videos'), subline: t(dict, 'dash.actions.video.subline', 'Turn content into visual assets'), href: '/dashboard/video' },
  ]

  const NEW_USER_PROMPTS = [
    t(dict, 'dash.prompts.new.p1', 'What plan is right for me?'),
    t(dict, 'dash.prompts.new.p2', 'How do I build my first website?'),
    t(dict, 'dash.prompts.new.p3', 'What languages do you support?'),
    t(dict, 'dash.prompts.new.p4', 'How does the free plan work?'),
  ]

  const RETURNING_PROMPTS = [
    t(dict, 'dash.prompts.returning.p1', 'How do I add a new language?'),
    t(dict, 'dash.prompts.returning.p2', 'How do I upload a podcast episode?'),
    t(dict, 'dash.prompts.returning.p3', 'How do I collect reviews?'),
    t(dict, 'dash.prompts.returning.p4', 'How do I upgrade my plan?'),
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
      { role: 'user', content },
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

      const data = await res.json()

      setPromptMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || t(dict, 'dash.connectionError', 'Having trouble connecting. Please try again.'),
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
          content: t(dict, 'dash.connectionError', 'Having trouble connecting. Please try again.'),
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

    if (days > 0) return `${days}${t(dict, 'dash.time.daysShort', 'd')} ${t(dict, 'dash.time.ago', 'ago')}`
    if (hours > 0) return `${hours}${t(dict, 'dash.time.hoursShort', 'h')} ${t(dict, 'dash.time.ago', 'ago')}`
    if (mins > 0) return `${mins}${t(dict, 'dash.time.minsShort', 'm')} ${t(dict, 'dash.time.ago', 'ago')}`

    return t(dict, 'dash.time.justNow', 'Just now')
  }

  const isNewUser = projectsLoaded && projects.length === 0

  const greetingData = useMemo(
    () => getGreeting(lang as SupportedLocale, { firstName, isNewUser, isLoggedIn }),
    [projectsLoaded, isLoggedIn, firstName, lang]
  )

  const promptSuggestions = isNewUser ? NEW_USER_PROMPTS : RETURNING_PROMPTS

  const projectsTitle = firstName
    ? t(dict, 'dash.projectsTitleNamed', "{name}'s projects").replace('{name}', firstName)
    : t(dict, 'dash.projectsTitle', 'Your projects')

  const atLimit = projects.length >= projectLimit
  const greetingHidden = hasTyped || promptMessages.length > 0
  const showLoginGate = authChecked && !isLoggedIn

  const sketchColors = {
    primary: sketch?.colors?.primary || '#1B4332',
    accent: sketch?.colors?.accent || '#F4A400',
    background: sketch?.colors?.background || '#FDF6EC',
    text: sketch?.colors?.text || '#2C1A0E',
  }

  // Translated labels
  const L = {
    quickActions: t(dict, 'dash.preview.quickActions', 'QUICK_ACTIONS'),
    yourProjects: t(dict, 'dash.preview.yourProjects', 'YOUR_PROJECTS'),
    createProject: t(dict, 'dash.preview.createProject', '+ CREATE_PROJECT'),
    openProject: t(dict, 'dash.preview.openProject', 'OPEN_PROJECT'),
    updated: t(dict, 'dash.preview.updated', 'UPDATED'),
    execute: t(dict, 'dash.preview.execute', 'EXECUTE_INQUIRY'),
    thinking: t(dict, 'dash.preview.thinking', 'THINKING...'),
    thinkingMsg: t(dict, 'dash.preview.thinkingMsg', 'SignalBoost is thinking...'),
    livePreview: t(dict, 'dash.preview.label', 'LIVE_PREVIEW'),
    close: t(dict, 'dash.preview.close', 'CLOSE'),
    openInBuilder: t(dict, 'dash.preview.openInBuilder', 'OPEN_IN_BUILDER →'),
    upgrade: t(dict, 'dash.upgrade', 'Upgrade'),
    team: t(dict, 'dash.team', 'Team'),
    loadingTeam: t(dict, 'dash.loadingTeam', 'Loading team...'),
    noProjects: t(dict, 'dash.noProjects', 'No projects yet'),
    noProjectsSub: t(dict, 'dash.noProjectsSub', 'Create your first project above'),
    feedback: t(dict, 'dash.feedback', 'Share feedback — every message helps improve SignalBoost'),
  }

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '0 20px' }}>
      <style>{`
        body {
          background-color: #060913 !important;
          background-image:
            radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.12) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(255, 195, 0, 0.05) 0px, transparent 50%) !important;
          background-attachment: fixed;
        }
        .fathom-glass {
          background: rgba(6, 9, 19, 0.61);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .terminal-text {
          font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
        }
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 300% center; }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {showLoginGate && <AuthModal onClose={() => {}} />}

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
                width: 44,
                height: 44,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.08)',
                fontSize: 24,
                flex: '0 0 auto',
              }}
            >
              {conciergeMessage.icon}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="terminal-text"
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: BLUE,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                {conciergeMessage.title}
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 13,
                  color: 'rgba(255,255,255,.72)',
                  lineHeight: 1.45,
                }}
              >
                {conciergeMessage.message}
              </div>
            </div>

            <button
              onClick={() => {
                setPromptOpen(true)
                setPromptInput('What should I do next?')
              }}
              className="terminal-text"
              style={{
                border: '1px solid rgba(255,195,0,.25)',
                background: 'rgba(255,195,0,.08)',
                color: GOLD,
                borderRadius: 999,
                padding: '9px 12px',
                fontSize: 10,
                fontWeight: 900,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ASK_NEXT
            </button>
          </div>

          <div className="fathom-glass" style={{ flex: sketch ? '1 1 380px' : '1 1 100%', minWidth: 320, borderRadius: 16, padding: 24 }}>
            <div style={{ overflow: 'hidden', maxHeight: greetingHidden ? 0 : 200, opacity: greetingHidden ? 0 : 1, marginBottom: greetingHidden ? 0 : 20, transition: 'all .4s ease' }}>
              <h1 className="terminal-text" style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px', background: 'linear-gradient(90deg,#3b82f6,#ffc300,#4ade80,#3b82f6)', backgroundSize: '300% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shimmer 3s linear infinite', display: 'inline-block' }}>
                {greetingData.headline.toUpperCase()} {greetingData.emoji}
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                {greetingData.subline}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: promptOpen ? 16 : 0 }}>
              <span className="terminal-text" style={{ color: BLUE, display: 'flex', alignItems: 'center', fontWeight: 700 }}>$</span>
              <input
                value={promptInput}
                onChange={(e) => {
                  setPromptInput(e.target.value)
                  if (e.target.value.length > 0 && !hasTyped) setHasTyped(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendPrompt()
                }}
                placeholder={t(dict, 'dash.askPlaceholder', 'Ask SignalBoost anything...')}
                className="terminal-text"
                style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, outline: 'none' }}
              />

              <button
                onClick={() => sendPrompt()}
                disabled={promptLoading}
                className="terminal-text"
                style={{ padding: '0 20px', borderRadius: 8, border: 'none', background: BLUE, color: '#fff', fontWeight: 700, fontSize: 12, cursor: promptLoading ? 'wait' : 'pointer', opacity: promptLoading ? 0.7 : 1 }}
              >
                {promptLoading ? L.thinking : L.execute}
              </button>
            </div>

            {promptOpen && (
              <div ref={promptRef} style={{ maxHeight: 320, overflowY: 'auto', padding: 14, borderRadius: 12, background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', marginTop: 14 }}>
                {promptMessages.map((m, idx) => (
                  <div key={`${m.role}-${idx}`} style={{ marginBottom: 12, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '82%', whiteSpace: 'pre-wrap', lineHeight: 1.6, padding: '10px 12px', borderRadius: 12, background: m.role === 'user' ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13 }}>
                      {m.content}
                    </div>
                  </div>
                ))}

                {promptLoading && (
                  <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13 }}>
                    {L.thinkingMsg}
                  </div>
                )}
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
                  // {L.livePreview}
                </div>
                <button
                  onClick={() => setSketch(null)}
                  className="terminal-text"
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: 4, fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}
                >
                  {L.close}
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
                      {sketch.headline || 'Your Headline Here'}
                    </div>
                    {sketch.tagline && (
                      <div style={{ fontSize: 14, marginTop: 8, opacity: 0.8 }}>
                        {sketch.tagline}
                      </div>
                    )}
                    {sketch.cta && (
                      <button style={{ marginTop: 18, background: sketchColors.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '10px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                        {sketch.cta}
                      </button>
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
                    <div className="terminal-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                      {hex}
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/dashboard/builder"
                className="terminal-text"
                style={{ display: 'block', textAlign: 'center', marginTop: 14, background: GOLD, color: '#000', padding: 12, borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontSize: 12 }}
              >
                {L.openInBuilder}
              </Link>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 32 }}>
          <h2 className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 16, letterSpacing: '.08em' }}>
            // {L.quickActions}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
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
                  {item.label.toUpperCase().replace(' ', '_')}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.4 }}>
                  {item.subline}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: t(dict, 'dash.stats.activeSites', 'Active sites'), value: projects.filter(p => p.status === 'live').length },
            { label: t(dict, 'dash.stats.projects', 'Projects'), value: `${projects.length}/${projectLimit === 999 ? '∞' : projectLimit}` },
            { label: t(dict, 'dash.stats.audioGenerated', 'Audio generated'), value: `0 ${t(dict, 'dash.stats.min', 'min')}` },
            { label: t(dict, 'dash.stats.videosCreated', 'Videos created'), value: '0' },
          ].map(stat => (
            <div key={stat.label} className="fathom-glass" style={{ borderRadius: 12, padding: 16, background: 'rgba(6, 9, 19, 0.3)' }}>
              <div className="terminal-text" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                [{stat.label.toUpperCase().replace(' ', '_')}]
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
              // {L.yourProjects}: {projectsTitle.toUpperCase()}
            </h2>

            {atLimit ? (
              <Link href="/pricing" style={{ background: GOLD, color: '#000', padding: '10px 20px', borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontSize: 12, fontFamily: 'monospace' }}>
                {L.upgrade.toUpperCase()}
              </Link>
            ) : (
              <Link href="/dashboard/builder" className="terminal-text" style={{ background: GOLD, color: '#000', padding: '10px 20px', border: 'none', borderRadius: 6, fontWeight: 800, fontSize: 11, textDecoration: 'none' }}>
                {L.createProject}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
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
                          {p.language.toUpperCase()}
                        </div>
                      </div>
                    </div>

                    <div className="terminal-text" style={{ color: STATUS_COLORS[p.status], fontSize: 10, fontWeight: 700 }}>
                      [{p.status.toUpperCase()}]
                    </div>
                  </div>

                  <div className="terminal-text" style={{ marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    {L.updated}: {timeAgo(p.last_edited_at).toUpperCase()}
                  </div>

                  <Link
                    href={`/dashboard/${p.type === 'website' ? 'builder' : p.type === 'review' ? 'reviews' : p.type === 'podcast' ? 'audio' : 'video'}`}
                    className="terminal-text"
                    style={{ display: 'block', marginTop: 14, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: 8, borderRadius: 6, textDecoration: 'none', fontSize: 11, fontWeight: 700 }}
                  >
                    {L.openProject}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fathom-glass" style={{ borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h2 className="terminal-text" style={{ fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>
            // {L.team.toUpperCase()}
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
