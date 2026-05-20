'use client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import AuthModal from '@/components/AuthModal'
import { supabase } from '@/utils/supabase/client'
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
import { getGreetingForUser } from '@/lib/cultural-calendar'

const LANGS = [
  'English',
  'Portugues (BR + PT)',
  'Espanol (ES + LATAM)',
  'Polski',
  'Russkiy',
]

const BLUE = '#3b82f6'
const BLUE_DIM = 'rgba(59,130,246,0.12)'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'
const GOLD = '#ffc300'

const QUICK_ACTIONS = [
  {
    type: 'website' as const,
    icon: '🌐',
    label: 'Build a website',
    subline: 'Create or edit your online presence',
    href: '/dashboard/builder',
  },
  {
    type: 'review' as const,
    icon: '⭐',
    label: 'Collect reviews',
    subline: 'Get feedback and testimonials',
    href: '/dashboard/reviews',
  },
  {
    type: 'podcast' as const,
    icon: '🎙️',
    label: 'Generate native audio',
    subline: 'Create voice content in multiple languages',
    href: '/dashboard/audio',
  },
  {
    type: 'video' as const,
    icon: '🎬',
    label: 'Create videos',
    subline: 'Turn content into visual assets',
    href: '/dashboard/video',
  },
]

const NEW_USER_PROMPTS = [
  'What plan is right for me?',
  'How do I build my first website?',
  'What languages do you support?',
  'How does the free plan work?',
]

const RETURNING_PROMPTS = [
  'How do I add a new language?',
  'How do I upload a podcast episode?',
  'How do I collect reviews?',
  'How do I upgrade my plan?',
]

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export default function DashboardOverviewPage() {
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
          content: 'Having trouble connecting. Please try again.',
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

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (mins > 0) return `${mins}m ago`

    return 'Just now'
  }

  const isNewUser = projectsLoaded && projects.length === 0

  const greetingData = useMemo(
    () => getGreetingForUser({ firstName, isNewUser, isLoggedIn }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectsLoaded, isLoggedIn, firstName]
  )

  const promptSuggestions = isNewUser
    ? NEW_USER_PROMPTS
    : RETURNING_PROMPTS

  const projectsTitle = firstName
    ? `${firstName}'s projects`
    : 'Your projects'

  const atLimit = projects.length >= projectLimit
  const usagePercent = Math.min((projects.length / projectLimit) * 100, 100)

  const greetingHidden = hasTyped || promptMessages.length > 0

  const showLoginGate = authChecked && !isLoggedIn

  return (
    <div
      style={{
        color: 'var(--text-primary)',
        fontFamily: 'system-ui',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 300% center; }
        }

        @keyframes cardIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {showLoginGate && (
        <AuthModal
          onClose={() => {
            /* gate cannot be dismissed without logging in */
          }}
        />
      )}

      <div
        style={{
          opacity: showLoginGate ? 0.2 : 1,
          pointerEvents: showLoginGate ? 'none' : 'auto',
          filter: showLoginGate ? 'blur(2px)' : 'none',
          transition: 'opacity 0.3s ease, filter 0.3s ease',
        }}
      >
        <div
          style={{
            marginBottom: 28,
            background: 'var(--surface-1)',
            border: '1px solid var(--border-medium)',
            borderRadius: 20,
            padding: '28px',
          }}
        >
          <div
            style={{
              overflow: 'hidden',
              maxHeight: greetingHidden ? 0 : 200,
              opacity: greetingHidden ? 0 : 1,
              marginBottom: greetingHidden ? 0 : 20,
              transition:
                'max-height .5s ease, opacity .4s ease, margin-bottom .5s ease',
            }}
          >
            <h1
              style={{
                fontSize: 28,
                fontWeight: 900,
                margin: '0 0 6px',
                background:
                  'linear-gradient(90deg,#3b82f6,#ffc300,#4ade80,#3b82f6)',
                backgroundSize: '300% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'shimmer 3s linear infinite',
                display: 'inline-block',
              }}
            >
              {greetingData.headline} {greetingData.emoji}
            </h1>

            <p
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              {greetingData.subline}
            </p>
          </div>

          <div
            style={{
              display:'flex',
              gap:10,
              marginBottom: promptOpen ? 16 : 0
            }}
          >
            <input
              value={promptInput}
              onChange={(e)=>{
                setPromptInput(e.target.value)

                if (
                  e.target.value.length > 0 &&
                  !hasTyped
                ) {
                  setHasTyped(true)
                }
              }}
              onKeyDown={(e)=>
                e.key==='Enter' && sendPrompt()
              }
              placeholder="Ask SignalBoost anything..."
              style={{
                flex:1,
                padding:'12px 16px',
                borderRadius:12,
                background:'var(--surface-3)',
                border:'1px solid var(--border-medium)',
                color:'#fff',
                outline:'none'
              }}
            />

            <button
              onClick={()=>sendPrompt()}
              style={{
                padding:'12px 20px',
                borderRadius:12,
                border:'none',
                background:BLUE,
                color:'#fff',
                fontWeight:700,
                cursor:'pointer'
              }}
            >
              Ask →
            </button>
          </div>

          {!promptOpen && (
            <div
              style={{
                display:'flex',
                gap:8,
                flexWrap:'wrap'
              }}
            >
              {promptSuggestions.map(q=>(
                <button
                  key={q}
                  onClick={()=>sendPrompt(q)}
                  style={{
                    padding:'6px 14px',
                    borderRadius:999,
                    border:'1px solid var(--border-medium)',
                    background:'var(--surface-2)',
                    color:'var(--text-muted)',
                    cursor:'pointer'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{marginBottom:32}}>
          <h2
            style={{
              fontSize:11,
              color:'var(--text-muted)',
              marginBottom:16,
              letterSpacing:'.08em',
              textTransform:'uppercase'
            }}
          >
            Start here
          </h2>

          <div
            style={{
              display:'grid',
              gridTemplateColumns:'repeat(4,1fr)',
              gap:14
            }}
          >
            {QUICK_ACTIONS.map(item=>(
              <Link
                key={item.type}
                href={item.href}
                onMouseEnter={()=>
                  setHoveredAction(item.type)
                }
                onMouseLeave={()=>
                  setHoveredAction(null)
                }
                style={{
                  background:
                    hoveredAction===item.type
                    ?BLUE_DIM
                    :'var(--surface-1)',

                  border:`1px solid ${
                    hoveredAction===item.type
                    ?BLUE_BORDER
                    :'var(--border-medium)'
                  }`,

                  borderRadius:16,
                  padding:20,
                  textDecoration:'none',
                  transition:'all .2s'
                }}
              >
                <div style={{fontSize:28}}>
                  {item.icon}
                </div>

                <div
                  style={{
                    fontSize:14,
                    fontWeight:800,
                    color:'#fff',
                    marginTop:10
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    fontSize:12,
                    color:'var(--text-muted)',
                    marginTop:6,
                    lineHeight:1.5
                  }}
                >
                  {item.subline}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div
          style={{
            display:'grid',
            gridTemplateColumns:'repeat(4,1fr)',
            gap:12,
            marginBottom:28
          }}
        >
          {[
            {
              label:'Active sites',
              value:projects.filter(
                p=>p.status==='live'
              ).length
            },
            {
              label:'Projects',
              value:`${projects.length}/${projectLimit===999?'∞':projectLimit}`
            },
            {
              label:'Audio generated',
              value:'0 min'
            },
            {
              label:'Videos created',
              value:'0'
            }
          ].map(stat=>(
            <div
              key={stat.label}
              style={{
                background:'var(--surface-1)',
                border:'1px solid var(--border-medium)',
                borderRadius:16,
                padding:20
              }}
            >
              <div
                style={{
                  fontSize:11,
                  color:'var(--text-muted)',
                  marginBottom:10
                }}
              >
                {stat.label}
              </div>

              <div
                style={{
                  fontSize:28,
                  fontWeight:900,
                  color:BLUE
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display:'flex',
              alignItems:'center',
              justifyContent:'space-between',
              marginBottom:16
            }}
          >
            <div>
              <h2
                style={{
                  fontSize:18,
                  fontWeight:800,
                  margin:0
                }}
              >
                {projectsTitle}
              </h2>

              <p
                style={{
                  fontSize:12,
                  color:'var(--text-muted)',
                  marginTop:4
                }}
              >
                Continue where you left off
              </p>
            </div>

            {atLimit ? (
              <Link
                href="/pricing"
                style={{
                  background:GOLD,
                  color:'#000',
                  padding:'12px 24px',
                  borderRadius:999,
                  textDecoration:'none',
                  fontWeight:800
                }}
              >
                Upgrade
              </Link>
            ) : (
              <button
                onClick={()=>setShowNewProject(true)}
                style={{
                  background:GOLD,
                  color:'#000',
                  padding:'12px 24px',
                  border:'none',
                  borderRadius:999,
                  fontWeight:800,
                  cursor:'pointer'
                }}
              >
                + New project
              </button>
            )}
          </div>

          {projects.length===0 ? (
            <div
              style={{
                background:'var(--surface-1)',
                border:'1px dashed var(--border-medium)',
                borderRadius:20,
                padding:'50px',
                textAlign:'center'
              }}
            >
              <div style={{fontSize:40}}>
                📁
              </div>

              <div
                style={{
                  marginTop:10,
                  fontWeight:700
                }}
              >
                No projects yet
              </div>

              <div
                style={{
                  color:'var(--text-muted)',
                  marginTop:6
                }}
              >
                Create your first project above
              </div>
            </div>
          ) : (
            <div
              style={{
                display:'grid',
                gridTemplateColumns:'repeat(3,1fr)',
                gap:16
              }}
            >
              {projects.map((p,i)=>(
                <div
                  key={p.id}
                  style={{
                    background:'var(--surface-1)',
                    border:'1px solid var(--border-medium)',
                    borderRadius:16,
                    padding:20,
                    animation:
                      `cardIn .3s ease ${i*.06}s both`
                  }}
                >
                  <div
                    style={{
                      display:'flex',
                      justifyContent:'space-between'
                    }}
                  >
