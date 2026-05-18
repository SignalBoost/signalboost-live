import { supabase } from '@/utils/supabase/client'

export type Project = {
  id: string
  user_id: string
  name: string
  description: string | null
  type: 'website' | 'podcast' | 'review' | 'video'
  language: string
  status: 'draft' | 'live' | 'paused'
  thumbnail: string | null
  last_edited_at: string
  created_at: string
}

export const TYPE_ICONS: Record<string, string> = {
  website: '🌐',
  podcast: '🎙️',
  review:  '⭐',
  video:   '🎬',
}

export const STATUS_COLORS: Record<string, string> = {
  draft:  'rgba(255,255,255,0.3)',
  live:   '#4ade80',
  paused: '#ffc300',
}

export const PLAN_PROJECT_LIMITS: Record<string, number> = {
  free:     3,
  starter:  10,
  pro:      30,
  business: Infinity,
}

export const PLAN_STORAGE_LIMITS: Record<string, string> = {
  free:     '100MB',
  starter:  '1GB',
  pro:      '10GB',
  business: '50GB',
}

export async function getProjects(userId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('last_edited_at', { ascending: false })
  if (error) return []
  return data as Project[]
}

export async function getUserPlan(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return 'free'
  return data.plan
}

export async function canCreateProject(userId: string): Promise<{
  allowed: boolean
  plan: string
  limit: number
  current: number
}> {
  const [projects, plan] = await Promise.all([
    getProjects(userId),
    getUserPlan(userId),
  ])
  const limit = PLAN_PROJECT_LIMITS[plan] ?? 3
  const current = projects.length
  const allowed = current < limit
  return { allowed, plan, limit, current }
}

export async function createProject(userId: string, project: {
  name: string
  type: Project['type']
  language: string
  description?: string
}) {
  const { allowed, plan, limit, current } = await canCreateProject(userId)
  if (!allowed) {
    return {
      error: `You have reached the ${limit} project limit on the ${plan} plan. Upgrade to add more projects.`,
      limitReached: true,
      plan,
      limit,
      current,
    }
  }
  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name: project.name,
      type: project.type,
      language: project.language,
      description: project.description || null,
      status: 'draft',
      last_edited_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function deleteProject(projectId: string) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateProjectStatus(projectId: string, status: Project['status']) {
  const { error } = await supabase
    .from('projects')
    .update({ status, last_edited_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) return { error: error.message }
  return { success: true }
}
