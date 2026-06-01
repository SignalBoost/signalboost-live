import { createClient } from '@supabase/supabase-js'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

export type AdminRecord = {
  id: string
  email: string
  role: 'admin'
  is_primary: boolean
  created_at: string
}

export type AdminSession = {
  role: 'admin' | 'user'
  user: {
    id: string
    email: string
    is_primary: boolean
  } | null
  admin: AdminRecord | null
}

const ADMIN_SELECT = 'id,email,role,is_primary,created_at'

export function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceRoleKey || anonKey

  if (!supabaseUrl || !key) return null

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getAdminByEmail(email: string | null | undefined): Promise<AdminRecord | null> {
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) return null

  const supabase = createAdminSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('admin')
    .select(ADMIN_SELECT)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (error || !data) return null
  return data as AdminRecord
}

export async function getCurrentAdminSession(): Promise<AdminSession> {
  try {
    const authSupabase = await createMarketingServerSupabase()
    const { data, error } = await authSupabase.auth.getUser()
    const user = error ? null : data.user
    const admin = await getAdminByEmail(user?.email)

    if (!user || !admin) {
      return { role: 'user', user: user?.email ? { id: user.id, email: user.email.toLowerCase(), is_primary: false } : null, admin: null }
    }

    return {
      role: 'admin',
      user: { id: user.id, email: user.email!.toLowerCase(), is_primary: admin.is_primary },
      admin,
    }
  } catch {
    return { role: 'user', user: null, admin: null }
  }
}

export async function listAdmins(): Promise<AdminRecord[]> {
  const supabase = createAdminSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('admin')
    .select(ADMIN_SELECT)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data as AdminRecord[]
}

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase()
}
