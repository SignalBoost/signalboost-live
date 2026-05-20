'use client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import TeamManager from '@/components/TeamManager'
import AuthModal from '@/components/AuthModal'
import { supabase } from '@/utils/supabase/client'
import { getProjects, createProject, canCreateProject, deleteProject, updateProjectStatus, TYPE_ICONS, STATUS_COLORS, Project } from '@/lib/projects'
import { getGreetingForUser } from '@/lib/cultural-calendar'

const LANGS = ['English', 'Portugues (BR + PT)', 'Espanol (ES + LATAM)', 'Polski', 'Russkiy']
const BLUE = '#3b82f6'
const BLUE_DIM = 'rgba(59,130,246,0.12)'
const BLUE_BORDER = 'rgba(59,130,246,0.3)'
const GOLD = '#ffc300'

const QUICK_ACTIONS = [
  { type: 'website' as const, icon: '🌐', label: 'Site builder',     href: '/dashboard/builder' },
  { type: 'review'  as const, icon: '⭐', label: 'Review collector', href: '/dashboard/reviews' },
  { type: 'podcast' as const, icon: '🎙️', label: 'Native audio',     href: '/dashboard/audio'  },
  { type: 'video'   as const, icon: '🎬', label: 'Video editor',     href: '/dashboard/video'  },
]

const NEW_USER_PROMPTS = [
  'What plan is right for me?',
  'How do I build my first website?',
  'What languages do you support?',
  'How does the free trial work?',
]

const RETURNING_PROMPTS = [
  'How do I add a new language?',
  'How do I upload a podcast episode?',
  'How do I collect reviews?',
  'How do I upgrade my plan?',
]

type Message = { role: 'user' | 'assistant'; content: string }

export default function DashboardOverviewPage() {
  const router = useRouter()
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

  // AI prompt
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
    const newMessages: Message[] = [...promptMessages, { role: 'user', content }]
    setPromptMessages(newMessages)
    setPromptLoading(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          context: { userName: firstName, currentPage: 'Dashboard', userPlan: plan }
        })
      })
      const data = await res.json()
      setPromptMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setPromptMessages(prev => [...prev, { role: 'assistant', content: 'Having trouble connecting. Please try again.' }])
    }
    setPromptLoading(false)
  }

  async function tryCreate(type: Project['type'], name: string, language = 'English', description = '') {
    if (!userId) return
    setCreating(true)
    const result = aw
