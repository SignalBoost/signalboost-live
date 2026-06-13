// saas/lib/hub/settings-service.ts
// Hub console settings, policies, and configuration management

import { createClient } from '@supabase/supabase-js'

export interface ConsoleSettings {
  id: string
  requireMFA: boolean
  requireApprovalForRotation: boolean
  requireApprovalForExport: boolean
  auditLogRetentionDays: number
  sessionTimeoutMinutes: number
  allowedIPs?: string[]
  notifyOnUnauthorizedAccess: boolean
  notifyOnKeyRotation: boolean
  notifyOnKeyExpiry: boolean
  autoRotateKeys: boolean
  autoRotateIntervalDays: number
  allowPublicURLs: boolean
  encryptionEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ApprovalPolicy {
  id: string
  action: 'rotation' | 'export' | 'deletion' | 'access'
  requireApproval: boolean
  requireMultipleApprovers: number
  approvalTimeoutHours: number
  notifyApprovers: boolean
  createdAt: string
}

export interface AuditPolicy {
  id: string
  logLevel: 'basic' | 'detailed' | 'verbose'
  retentionDays: number
  encryptLogs: boolean
  exportableByUsers: boolean
  createdAt: string
}

export interface SettingsResponse {
  ok: boolean
  settings?: ConsoleSettings
  policies?: ApprovalPolicy[]
  error?: string
}

/**
 * Get console settings
 */
export async function getConsoleSettings(): Promise<SettingsResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch or create default settings
    let { data: settings, error } = await supabase
      .from('hub_console_settings')
      .select('*')
      .single()

    if (error && error.code === 'PGRST116') {
      // Settings don't exist, create defaults
      const defaults: ConsoleSettings = {
        id: 'default',
        requireMFA: true,
        requireApprovalForRotation: false,
        requireApprovalForExport: true,
        auditLogRetentionDays: 90,
        sessionTimeoutMinutes: 60,
        notifyOnUnauthorizedAccess: true,
        notifyOnKeyRotation: true,
        notifyOnKeyExpiry: true,
        autoRotateKeys: false,
        autoRotateIntervalDays: 90,
        allowPublicURLs: false,
        encryptionEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const { data: created, error: createError } = await supabase
        .from('hub_console_settings')
        .insert([defaults])
        .select()
        .single()

      if (createError) {
        return { ok: false, error: createError.message }
      }

      settings = created
    } else if (error) {
      return { ok: false, error: error.message }
    }

    // Fetch approval policies
    const { data: policies } = await supabase
      .from('hub_approval_policies')
      .select('*')

    return {
      ok: true,
      settings,
      policies: policies || [],
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Update console settings
 */
export async function updateConsoleSettings(updates: Partial<ConsoleSettings>): Promise<{
  ok: boolean
  settings?: ConsoleSettings
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_console_settings')
      .update({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', 'default')
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, settings: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Update approval policy
 */
export async function updateApprovalPolicy(
  action: string,
  policy: Partial<ApprovalPolicy>
): Promise<{
  ok: boolean
  policy?: ApprovalPolicy
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('hub_approval_policies')
      .upsert([
        {
          action,
          ...policy,
          createdAt: new Date().toISOString(),
        },
      ])
      .eq('action', action)
      .select()
      .single()

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, policy: data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
