'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import { supabase } from '@/utils/supabase/client'
import { getProjects, createProject, canCreateProject, deleteProject, updateProjectStatus, TYPE_ICONS, STATUS_COLORS, PLAN_PROJECT_LIMITS, Project } from '@/lib/projects'

const LANGS = ['English', 'Portugues', 'Espanol', 'Polski', 'Russkiy']
const BLUE = '#3b82f6'
const BLUE_DIM = 'rgba(59,130,246,0.12)'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'

const QUICK_ACTIONS = [
  { type: 'website' as const, icon: '🌐', label: 'Site builder',     href: '/dashboard/builder' },
  { type: 'review'  as const, icon: '⭐', label: 'Review collector', href: '/dashboard/reviews' },
  { type: 'podcast' as const, icon: '🎙️', label: 'Native audio',     href: '/dashboard/audio'  },
  { type: 'video'   as const, icon: '🎬', label: 'Video editor',     href: '/dashboard/video'  },
]

export default function DashboardOverviewPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [firstName, setFirstName] = useState<string | null>(null)
  const [isNewUser, setIsNewUser] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [plan, setPlan] = useState('free')
  const [projectLimit, setProjectLimit] = useState(3)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [upgradeMsg, setUpgradeMsg] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<Project['type']>('website')
  const [newLang, setNewLang] = useState('English')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id)
        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        setFirstName(fullName.split(' ')[0] || null)
        const createdAt = new Date(data.user.created_at).getTime()
        setIsNewUser(Date.now() - createdAt < 30000)
        getProjects(data.user.id).then(setProjects)
        canCreateProject(data.user.id).then(res => {
          setPlan(res.plan)
          setProjectLimit(res.limit === Infinity ? 999 : res.limit)
        })
      }
    })
  }, [])

  async function tryCreate(type: Project['type'], name: string, language = 'English', description = '') {
    if (!userId) return
    setCreating(true)
    const result = await createProject(userId, { name, type, language, description })
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
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p))
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

  const greeting = isNewUser
    ? `Welcome to SignalBoost${firstName ? ', ' + firstName : ''}!`
    : `Welcome back${firstName ? ', ' + firstName : ''}!`

  const projectsTitle = firstName ? `${firstName}'s projects` : 'Your projects'
  const atLimit = projects.length >= projectLimit
  const usagePercent = Math.min((projects.length / projectLimit) * 100, 100)

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 300% center; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(0.99); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {showUpgrade && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowUpgrade(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111118', border: '1px solid rgba(255,195,0,0.3)', borderRadius: 20, padding: '36px 32px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>Project limit reached</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 8, lineHeight: 1.6 }}>{upgradeMsg}</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 28, lineHeight: 1.6 }}>
              You are on the <strong style={{ color: '#ffc300' }}>{plan}</strong> plan ({projects.length}/{projectLimit === 999 ? 'unlimited' : projectLimit} projects).
              Upgrade to store more projects and media files.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Link href="/pricing" style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 28px', borderRadius: 999, textDecoration: 'none' }}>
                See upgrade plans
              </Link>
              <button onClick={() => setShowUpgrade(false)}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 32 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', margin: 0,
          background: 'linear-gradient(90deg, #3b82f6, #ffc300, #4ade80, #3b82f6)',
          backgroundSize: '300% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'shimmer 2.5s linear infinite, blink 2s ease-in-out infinite',
          display: 'inline-block',
        }}>
          {greeting} {isNewUser ? '🎉' : '👋'}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
          {isNewUser
            ? 'Your account is ready. Click a tool below to start your first project.'
            : 'Click any tool to start a new project, or pick up where you left off.'}
        </p>
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          Start a new project
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {QUICK_ACTIONS.map(item => (
            <div key={item.type}
              onMouseEnter={() => setHoveredAction(item.type)}
              onMouseLeave={() => setHoveredAction(null)}
              onClick={() => atLimit
                ? (setUpgradeMsg(`You have reached the ${projectLimit} project limit on the ${plan} plan. Upgrade to add more projects.`), setShowUpgrade(true))
                : tryCreate(item.type, `New ${item.label}`)
              }
              style={{
                padding: '20px 16px',
                background: hoveredAction === item.type ? BLUE_DIM : 'rgba(255,255,255,0.02)',
                border: `1px solid ${atLimit ? 'rgba(239,68,68,0.2)' : hoveredAction === item.type ? BLUE_BORDER : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 14, cursor: 'pointer', transition: 'all 0.18s',
                transform: hoveredAction === item.type ? 'translateY(-3px)' : 'translateY(0)',
                boxShadow: hoveredAction === item.type ? '0 8px 32px rgba(59,130,246,0.2)' : 'none',
                textAlign: 'center', position: 'relative',
              }}>
              {atLimit && hoveredAction === item.type && (
                <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                  LIMIT REACHED
                </div>
              )}
              <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>{item.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: hoveredAction === item.type ? '#fff' : 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 6 }}>
                {item.label}
              </span>
              {hoveredAction === item.type && (
                <span style={{ fontSize: 10, color: atLimit ? '#f87171' : BLUE, fontWeight: 600 }}>
                  {atLimit ? 'Upgrade to add more' : 'Click to create project'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Projects section */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: BLUE }}>{projectsTitle}</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
              {projects.length === 0 ? 'Click a tool above to create your first project' : 'Click any project to continue working'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: atLimit ? '#f87171' : 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
                {projects.length} / {projectLimit === 999 ? 'unlimited' : projectLimit} projects
              </div>
              <div style={{ width: 100, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                <div style={{ width: `${usagePercent}%`, height: '100%', background: atLimit ? '#ef4444' : BLUE, borderRadius: 999, transition: 'width 0.3s' }} />
              </div>
            </div>
            <button
              onClick={() => atLimit
                ? (setUpgradeMsg(`You have reached the ${projectLimit} project limit. Upgrade to add more.`), setShowUpgrade(true))
                : setShowNewProject(true)
              }
              style={{ background: atLimit ? 'rgba(239,68,68,0.15)' : BLUE, color: atLimit ? '#f87171' : '#fff', fontWeight: 800, fontSize: 12, padding: '8px 18px', borderRadius: 999, border: atLimit ? '1px solid rgba(239,68,68,0.3)' : 'none', cursor: 'pointer' }}>
              {atLimit ? 'Limit reached' : '+ New project'}
            </button>
          </div>
        </div>

        {atLimit && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,100,100,0.9)' }}>
              You have reached the <strong>{projectLimit}-project limit</strong> on the <strong>{plan}</strong> plan. Delete a project or upgrade to continue.
            </div>
            <Link href="/pricing" style={{ color: '#ffc300', fontWeight: 700, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap', marginLeft: 16 }}>
              Upgrade now
            </Link>
          </div>
        )}

        {showNewProject && (
          <div style={{ background: 'rgba(59,130,246,0.05)', border: `1px solid ${BLUE_BORDER}`, borderRadius: 16, padding: '20px', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input placeholder="Project name *" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && tryCreate(newType, newName, newLang, newDesc)}
                style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' }} />
              <select value={newType} onChange={e => setNewType(e.target.value as Project['type'])}
                style={{ padding: '10px 14px', borderRadius: 10, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' }}>
                <option value="website">🌐 Website</option>
                <option value="podcast">🎙️ Podcast</option>
                <option value="review">⭐ Reviews</option>
                <option value="video">🎬 Video</option>
              </select>
              <select value={newLang} onChange={e => setNewLang(e.target.value)}
                style={{ padding: '10px 14px', borderRadius: 10, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' }}>
                {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => tryCreate(newType, newName, newLang, newDesc)} disabled={creating || !newName.trim()}
                style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 13, padding: '9px 24px', borderRadius: 10, border: 'none', cursor: 'pointer', opacity: creating || !newName.trim() ? 0.6 : 1 }}>
                {creating ? 'Creating...' : 'Create project'}
              </button>
              <button onClick={() => setShowNewProject(false)}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 6 }}>No projects yet</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Click a tool above to get started instantly</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {projects.map((p, i) => (
              <div key={p.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16, padding: '20px',
                  display: 'flex', flexDirection: 'column', gap: 14,
                  cursor: 'pointer',
                  transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                  animation: `cardIn 0.3s ease-out ${i * 0.06}s both`,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-5px)'
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(59,130,246,0.2)'
                  e.currentTarget.style.borderColor = BLUE_BORDER
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: BLUE_DIM, border: `1px solid ${BLUE_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {TYPE_ICONS[p.type]}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{p.language} · {p.type}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 999, padding: '3px 10px' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[p.status], flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: STATUS_COLORS[p.status], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {p.status}
                    </span>
                  </div>
                </div>
                {p.description && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{p.description}</div>
                )}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                  Last edited {timeAgo(p.last_edited_at)}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link
                    href={`/dashboard/${p.type === 'website' ? 'builder' : p.type === 'review' ? 'reviews' : p.type === 'podcast' ? 'audio' : 'video'}`}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: BLUE, color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                    Open
                  </Link>
                  <select value={p.status} onChange={e => handleStatus(p.id, e.target.value as Project['status'])}
                    style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, cursor: 'pointer', outline: 'none' }}>
                    <option value="draft">Draft</option>
                    <option value="live">Live</option>
                    <option value="paused">Paused</option>
                  </select>
                  <button onClick={() => handleDelete(p.id)}
                    style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active sites',    value: projects.filter(p => p.status === 'live').length.toString() },
          { label: 'Total projects',  value: `${projects.length}/${projectLimit === 999 ? 'unlimited' : projectLimit}` },
          { label: 'Audio generated', value: '0 min' },
          { label: 'Videos created',  value: '0' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, fontWeight: 500 }}>{stat.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', color: BLUE }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Account + Team + Feedback */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Account balance
          </h2>
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.03em', color: BLUE }}>
            750
            <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>credits</span>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <Link href="/dashboard/metrics" style={{ fontSize: 12, fontWeight: 600, color: BLUE, textDecoration: 'none' }}>View analytics</Link>
            <Link href="/pricing" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Buy credits</Link>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px' }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Quick links
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/dashboard/feedback', icon: '💬', label: 'Give feedback' },
              { href: '/docs',               icon: '📖', label: 'Documentation' },
              { href: '/pricing',            icon: '💳', label: 'Upgrade plan' },
              { href: '/podcasters',         icon: '🎙️', label: 'Podcast plans' },
            ].map(item => (
              <Link key={item.href} href={item.href}
                style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', padding: '6px 0', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ background: 'rgba(255,195,0,0.04)', border: '1px solid rgba(255,195,0,0.15)', borderRadius: 16, padding: '24px' }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,195,0,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Share your feedback
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
            We are in development. Your feedback shapes what we build next.
          </p>
          <Link href="/dashboard/feedback"
            style={{ display: 'block', textAlign: 'center', background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 13, padding: '10px 0', borderRadius: 10, textDecoration: 'none' }}>
            💬 Give feedback
          </Link>
        </div>
      </div>

      {/* Team */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px' }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
          Team members
        </h2>
        {userId ? <TeamManager userId={userId} /> : <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Loading team...</p>}
      </div>

    </div>
  )
}
