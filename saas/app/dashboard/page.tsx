'use client'
import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import TeamManager from '@/components/TeamManager'
import { supabase } from '@/utils/supabase/client'
import { getProjects, createProject, canCreateProject, deleteProject, updateProjectStatus, TYPE_ICONS, STATUS_COLORS, Project } from '@/lib/projects'

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
  const [newName, set
