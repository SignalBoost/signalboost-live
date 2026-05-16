'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import { supabase } from '@/utils/supabase/client'
import { getProjects, createProject, deleteProject, updateProjectStatus, TYPE_ICONS, STATUS_COLORS, Project } from '@/lib/projects'

const LANGS = ['English', 'Portugues', 'Espanol', 'Polski', 'Russkiy']
const BLUE = '#3b82f6'
const BLUE_DIM = 'rgba(59,130,246,0.12)'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'

export default function DashboardOverviewPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [firstName, setFirstName] = useState<string | null>(null)
  const [isNewUser, setIsNewUser] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [showNewProject, setShowNewProject] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<Project['type']>('website')
  const [newLang, setNewLang] = useState('English')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id)
        setUserEmail(data.user.email ?? null)
        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        const first = fullName.split(' ')[0] || null
        setFirstName(first)
        const createdAt = new Date(data.user.created_at).getTime()
        setIsNewUser(Date.now() - createdAt < 30000)
        getProjects(data.user.id).then(setProjects)
      }
    })
  }, [])

  async function handleCreate() {
    if (!userId || !newName.trim()) return
    setCreating(true)
    const result = await createProject(userId, {
      name: newName, type: newType, language: newLang, description: newDesc,
    })
    if (result.data) {
      setProjects(prev => [result.data, ...prev])
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

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 32 }}>
        <h1 style={{
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: '-0.02em',
          margin: 0,
          background: 'linear-gradient(90deg, #3b82f6, #ffc300, #3b82f6)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'shimmer 3s linear infinite',
        }}>
          {greeting} {isNewUser ? '🎉' : '👋'}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          {isNewUser
            ? 'Your account is ready. Create your first project below to get started.'
            : 'Here is the operational status of your SignalBoost platform.'}
        </p>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: BLUE }}>{projectsTitle}</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Click any project to continue working</p>
          </div>
          <button onClick={() => setShowNewProject(true)}
            style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 12, padding: '8px 18px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            + New project
          </button>
        </div>

        {showNewProject && (
          <div style={{ background: 'rgba(59,130,246,0.05)', border: `1px solid ${BLUE_BORDER}`, borderRadius: 16, padding: '20px', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input placeholder="Project name *" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' }} />
              <select value={newType} onChange={e => setNewType(e.target.value as Project['type'])}
                style={{ padding: '10px 14px', borderRadius: 10, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' }}>
                <option value="website">Website</option>
                <option value="podcast">Podcast</option>
                <option value="review">Reviews</option>
                <option value="video">Video</option>
              </select>
              <select value={newLang} onChange={e => setNewLang(e.target.value)}
                style={{ padding: '10px 14px', borderRadius: 10, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' }}>
                {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleCreate} disabled={creating || !newName.trim()}
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
          <div style={{ textAlign: 'center', padding: '48px 0', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 6 }}>No projects yet</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>Create your first project to get started</div>
            <button onClick={() => setShowNewProject(true)}
              style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              + New project
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {projects.map(p => (
              <div key={p.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  cursor: 'pointer',
                  transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
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
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{p.language} - {p.type}</div>
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
                  <button style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: BLUE, color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    Open
                  </button>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px' }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Quick actions
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { href: '/dashboard/builder', icon: '🌐', label: 'Site builder' },
              { href: '/dashboard/reviews', icon: '⭐', label: 'Review collector' },
              { href: '/dashboard/audio',   icon: '🎙️', label: 'Native audio' },
              { href: '/dashboard/video',   icon: '🎬', label: 'Video editor' },
            ].map(item => (
              <Link key={item.href} href={item.href}
                style={{ display: 'block', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, textDecoration: 'none', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = BLUE_BORDER)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
                <span style={{ fontSize: 20, display: 'block', marginBottom: 6 }}>{item.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Account balance
          </h2>
          <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.03em', color: BLUE }}>
            750
            <span style={{ fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>credits</span>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <Link href="/dashboard/metrics" style={{ fontSize: 12, fontWeight: 600, color: BLUE, textDecoration: 'none' }}>View analytics</Link>
            <Link href="/pricing" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Buy more credits</Link>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Active sites',      value: projects.filter(p => p.status === 'live').length.toString() },
          { label: 'Reviews collected', value: '0' },
          { label: 'Audio generated',   value: '0 min' },
          { label: 'Videos created',    value: '0' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, fontWeight: 500 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', color: BLUE }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px' }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
          Team members
        </h2>
        {userId ? <TeamManager userId={userId} /> : <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Loading team...</p>}
      </div>

    </div>
  )
}
