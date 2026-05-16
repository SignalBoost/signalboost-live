import { createClient } from '@/utils/supabase/client'

export const PLAN_SEATS: Record<string, number> = {
  free:     1,
  starter:  1,
  pro:      3,
  business: 10,
}

export async function getUserSubscription(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) return null
  return data
}

export async function getTeamMembers(ownerId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'active')

  if (error) return []
  return data
}

export async function canAddMember(ownerId: string): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase
    .rpc('can_add_member', { owner: ownerId })

  if (error) return false
  return data
}

export async function inviteMember(ownerId: string, email: string) {
  const supabase = createClient()

  const canAdd = await canAddMember(ownerId)
  if (!canAdd) {
    return { error: 'Seat limit reached. Upgrade your plan to add more members.' }
  }

  const { error } = await supabase
    .from('team_members')
    .insert({
      owner_id: ownerId,
      member_email: email,
      status: 'pending',
    })

  if (error) return { error: error.message }
  return { success: true }
}

export async function removeMember(ownerId: string, memberId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('team_members')
    .update({ status: 'removed' })
    .eq('owner_id', ownerId)
    .eq('id', memberId)

  if (error) return { error: error.message }
  return { success: true }
}
