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
  createProject,
  canCreateProject,
  deleteProject,
  updateProjectStatus,
  TYPE_ICONS,
  STATUS_COLORS,
  Project,
} from '@/lib/projects'
import { getGreeting, SupportedLocale } from '@/lib/cultural-calendar'

const LANGS = [
  'English',
  'Portugues (BR + PT)',
  'Espanol (ES + LATAM)',
  'Polski',
  'Russkiy',
]

const BLUE = '#3b82f6'
const BLUE_DIM = 'rgba(59,130,246,0.06)'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'
const GOLD = '#ffc300'

type Message = {
  role: 'user' | 'assistant'
  content: string
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
  const [showNewProject, setShowNewProject] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeMsg, setUpgradeMsg] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<Project['type']>('website')
  const [newLang, setNewLang] = useState('English')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const [promptInput, setPromptInput] = useState('')
  const [promptMessages, setPromptMessages] = useState<Message[]>([])
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [hasTyped, setHasTyped] = useState(false)

  const promptRef = useRef<HTMLDivElement>(null)

  const QUICK_ACTIONS = [
    {
      type: 'website' as const,
      icon: '🌐',
      label: t(dict, 'dash.actions.website.label', 'Build a website'),
      subline: t(dict, 'dash.actions.website.subline', 'Create or edit your online presence'),
      href: '/dashboard/builder',
    },
    {
      type: 'review' as const,
      icon: '⭐',
      label: t(dict, 'dash.actions.review.label', 'Collect reviews'),
      subline: t(dict, 'dash.actions.review.subline', 'Get feedback and testimonials'),
      href: '/dashboard/reviews',
    },
    {
      type: 'podcast' as const,
      icon: '🎙️',
      label: t(dict, 'dash.actions.podcast.label', 'Generate native audio'),
      subline: t(dict, 'dash.actions.podcast.subline', 'Create voice content in multiple languages'),
      href: '/dashboard/audio',
    },
    {
      type: 'video' as const,
      icon: '🎬',
      label: t(dict, 'dash.actions.video.label', 'Create videos'),
      subline: t(dict, 'dash.actions.video.subline', 'Turn content into visual assets'),
      href: '/dashboard/video',
    },
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
  }, [promptMessages])

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
          content: data.reply,
        },
      ])
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

  async function tryCreate(
    type: Project['type'],
    name: string,
    language = 'English',
    description = ''
  ) {
    if (!userId) return

    setCreating(true)

    const result = await createProject(userId, {
      name,
      type,
      language,
      description,
    })

    if ((result as any).limitReached) {
      setUpgradeMsg((result as any).error)
      setShowUpgrade(true)
    } else if ((result as any).data) {
      setProjects(prev => [(result as any).data, ...prev])
      setShowNewProject(false)
      setNewName('')
      setNewDesc('')
    }

    setCreating(false)
  }

  async function handleDelete(id: string) {
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  async function handleStatus(id: string, status: Project['status']) {
    await updateProjectStatus(id, status)
    setProjects(prev =>
      prev.map(p => (p.id === id ? { ...p, status } : p))
    )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectsLoaded, isLoggedIn, firstName, lang]
  )

  const promptSuggestions = isNewUser
    ? NEW_USER_PROMPTS
    : RETURNING_PROMPTS

  const projectsTitle = firstName
    ? t(dict, 'dash.projectsTitleNamed', "{name}'s projects").replace('{name}', firstName)
    : t(dict, 'dash.projectsTitle', 'Your projects')

  const atLimit = projects.length >= projectLimit
  const usagePercent = Math.min((projects.length / projectLimit) * 100, 100)

  const greetingHidden = hasTyped || promptMessages.length > 0

  const showLoginGate = authChecked && !isLoggedIn

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

        {/* Main Agent Support Command Module */}
        <div className="fathom-glass" style={{ marginBottom: 28, borderRadius: 16, padding: '24px' }}>
          <div style={{ overflow: 'hidden', maxHeight: greetingHidden ? 0 : 200, opacity: greetingHidden ? 0 : 1, marginBottom: greetingHidden ? 0 : 20, transition: 'all .4s ease' }}>
            <h1 className="terminal-text" style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px', background: 'linear-gradient(90deg,#3b82f6,#ffc300,#4ade80,#3b82f6)', backgroundSize: '300% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'shimmer 3s linear infinite', display: 'inline-block' }}>
              {greetingData.headline.toUpperCase()} {greetingData.emoji}
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{greetingData.subline}</p>
          </div>

          {/* Assistant Injection Feed */}
          <div style={{ display: 'flex', gap: 10, marginBottom: promptOpen ? 16 : 0 }}>
            <span className="terminal-text" style={{ color: BLUE, display: 'flex', alignItems: 'center', fontWeight: 700 }}>$</span>
            <input
              value={promptInput}
              onChange={(e) => {
                setPromptInput(e.target.value)
                if (e.target.value.length > 0 && !hasTyped) setHasTyped(true)
              }}
              onKeyDown={(e) => e.key === 'Enter' && sendPrompt()}
              placeholder={t(dict, 'dash.askPlaceholder', 'Ask SignalBoost anything...')}
              className="terminal-text"
              style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, outline: 'none' }}
            />
            <button onClick={() => sendPrompt()} className="terminal-text" style={{ padding: '0 20px', borderRadius: 8, border: 'none', background: BLUE, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              EXECUTE_INQUIRY
            </button>
          </div>

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

        {/* Quick Launch Action Matrices */}
        <div style={{ marginBottom: 32 }}>
          <h2 className="terminal-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 16, letterSpacing: '.08em' }}>
            // FUNCTION_ROUTING_MODULES
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
                <div className="terminal-text" style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 10 }}>{item.label.toUpperCase().replace(' ', '_')}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6, lineHeight: 1.4 }}>{item.subline}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Environmental System Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: t(dict, 'dash.stats.activeSites', 'Active sites'), value: projects.filter(p => p.status === 'live').length },
            { label: t(dict, 'dash.stats.projects', 'Projects'), value: `${projects.length}/${projectLimit === 999 ? '∞' : projectLimit}` },
            { label: t(dict, 'dash.stats.audioGenerated', 'Audio generated'), value: `0 ${t(dict, 'dash.stats.min', 'min')}` },
            { label: t(dict, 'dash.stats.videosCreated', 'Videos created'), value: '0' }
          ].map(stat => (
            <div key={stat.label} className="fathom-glass" style={{ borderRadius: 12, padding: 16, background: 'rgba(6, 9, 19, 0.3)' }}>
              <div className="terminal-text" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                [{stat.label.toUpperCase().replace(' ', '_')}]
              </div>
              <div className="terminal-text" style={{ fontSize: 22, fontWeight: 900, color: BLUE }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Core Matrix Project Database Row */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 className="terminal-text" style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>// MANIFEST_REGISTRY: {projectsTitle.toUpperCase()}</h2>
            </div>
            {atLimit ? (
              <Link href="/pricing" style={{ background: GOLD, color: '#000', padding: '10px 20px', borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontSize: 12, fontFamily: 'monospace' }}>UPGRADE_ALLOCATION</Link>
            ) : (
              <button onClick={() => setShowNewProject(true)} className="terminal-text" style={{ background: GOLD, color: '#000', padding: '10px 20px', border: 'none', borderRadius: 6, fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>+ ALLOCATE_PROJECT</button>
            )}
          </div>

          {projects.length === 0 ? (
            <div className="fathom-glass" style={{ borderStyle: 'dashed', borderRadius: 16, padding: '50px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, opacity: 0.3 }}>📁</div>
              <div className="terminal-text" style={{ marginTop: 10, fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>EMPTY_MANIFEST: NO_NODES_FOUND</div>
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
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div className="terminal-text" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{p.language.toUpperCase()}</div>
                      </div>
                    </div>
                    <div className="terminal-text" style={{ color: STATUS_COLORS[p.status], fontSize: 10, fontWeight: 700 }}>
                      [{p.status.toUpperCase()}]
                    </div>
                  </div>
                  <div className="terminal-text" style={{ marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    MUTATED: {timeAgo(p.last_edited_at).toUpperCase()}
                  </div>
                  <Link
                    href={`/dashboard/${p.type === 'website' ? 'builder' : p.type === 'review' ? 'reviews' : p.type === 'podcast' ? 'audio' : 'video'}`}
                    className="terminal-text"
                    style={{ display: 'block', marginTop: 14, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '8px', borderRadius: 6, textDecoration: 'none', fontSize: 11, fontWeight: 700 }}
                  >
                    ACCESS_INSTANCE
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Team Infrastructure Node Block */}
        <div className="fathom-glass" style={{ borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h2 className="terminal-text" style={{ fontSize: 11, letterSpacing: '.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>
            // SECURITY_ORCHESTRATION_TEAM
          </h2>
          {userId ? <TeamManager userId={userId} /> : <div className="terminal-text" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>SYNCING_TEAM_CLUSTERS...</div>}
        </div>

        <Link href="/dashboard/feedback" style={{ display: 'block', textAlign: 'center', padding: 14, background: 'rgba(255,195,0,.03)', border: '1px solid rgba(255,195,0,.15)', borderRadius: 10, textDecoration: 'none', color: 'rgba(255,195,0,.8)', fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>
          + TRANSMIT_FEEDBACK_DATA_STREAM
        </Link>
      </div>
    </div>
  )
}
