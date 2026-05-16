'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import { supabase } from '@/utils/supabase/client'
import { getProjects, createProject, deleteProject, updateProjectStatus, TYPE_ICONS, STATUS_COLORS, Project } from '@/lib/projects'

const LANGS = ['English', 'Português', 'Español', 'Polski', 'Русский']
const BLUE = '#3b82f6'
const BLUE_DIM = 'rgba(59,130,246,0.15)'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'

export default function DashboardOverviewPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
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
      setNewName(''); setNewDesc('')
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

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
          System overview
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          Welcome back{userEmail ? `, ${userEmail}` : ''}. Continue where you left off.
        </p>
      </div>

      {/* Projects */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#fff' }}>Your projects</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Click any project to continue working</p>
          </div>
          <button onClick={() => setShowNewProject(true)}
            style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 12, padding: '8px 18px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            + New project
          </button>
        </div>

        {/* New project form */}
        {showNewProject && (
          <div style={{ background: 'rgba(59,130,246,0.05)', border: `1px solid ${BLUE_BORDER}`, borderRadius: 16, padding: '20px', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input placeholder="Project name *" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
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

        {/* Projects grid — hovering cards */}
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
                  borderRadius: 16, padding: '20px',
                  display: 'flex', flexDirection: 'column', gap: 14,
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(59,130,246,0.2)
