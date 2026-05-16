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

export async function getProjects(userId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('last_edited_at', { ascending: false })

  if (error) return []
  return data as Project[]
}

export async function createProject(userId: string, project: {
  name: string
  type: Project['type']
  language: string
  description?: string
}) {
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
