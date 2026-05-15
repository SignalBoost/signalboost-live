// lib/credits.ts
import { supabase } from './supabaseClient'

export async function getCredits(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('Error fetching credits:', error)
    return 0
  }

  return data?.credits || 0
}
