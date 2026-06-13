// saas/lib/hub/logs-service.ts
// Real-time audit log fetching and filtering from Supabase

import { createClient } from '@supabase/supabase-js'

export interface AuditLog {
  id: string
  secret_id: string
  action: 'accessed' | 'rotated' | 'verified' | 'created' | 'deleted' | 'revoked' | 'exported'
  user_email: string
  timestamp: string
  status: 'success' | 'failed' | 'pending'
  message: string
  ip_address?: string
  user_agent?: string
}

export interface LogsFilter {
  action?: string
  status?: string
  secretId?: string
  userEmail?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface LogsResponse {
  ok: boolean
  logs?: AuditLog[]
  total?: number
  error?: string
}

/**
 * Fetch audit logs from Supabase with optional filtering
 */
export async function getAuditLogs(filter: LogsFilter): Promise<LogsResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let query = supabase
      .from('hub_vault_audit_log')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false })

    // Apply filters
    if (filter.action) {
      query = query.eq('action', filter.action)
    }

    if (filter.status) {
      query = query.eq('status', filter.status)
    }

    if (filter.secretId) {
      query = query.ilike('secret_id', `%${filter.secretId}%`)
    }

    if (filter.userEmail) {
      query = query.ilike('user_email', `%${filter.userEmail}%`)
    }

    if (filter.startDate) {
      query = query.gte('timestamp', filter.startDate)
    }

    if (filter.endDate) {
      query = query.lte('timestamp', filter.endDate)
    }

    // Pagination
    const limit = filter.limit || 50
    const offset = filter.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      return { ok: false, error: error.message }
    }

    const logs: AuditLog[] = (data || []).map(row => ({
      id: row.id,
      secret_id: row.secret_id,
      action: row.action,
      user_email: row.user_email,
      timestamp: row.timestamp,
      status: row.status,
      message: row.message,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
    }))

    return {
      ok: true,
      logs,
      total: count || 0,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Get log statistics
 */
export async function getLogStats(): Promise<{
  ok: boolean
  stats?: {
    totalActions: number
    successRate: number
    failedActions: number
    uniqueUsers: number
    actionsBy24h: number
  }
  error?: string
}> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, error: 'Supabase credentials not configured' }
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get all logs from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('hub_vault_audit_log')
      .select('*')
      .gte('timestamp', oneDayAgo)

    if (error) {
      return { ok: false, error: error.message }
    }

    const logs = data || []
    const totalActions = logs.length
    const successCount = logs.filter((l: any) => l.status === 'success').length
    const failedCount = logs.filter((l: any) => l.status === 'failed').length
    const uniqueUsers = new Set(logs.map((l: any) => l.user_email)).size

    return {
      ok: true,
      stats: {
        totalActions,
        successRate: totalActions > 0 ? Math.round((successCount / totalActions) * 100) : 0,
        failedActions: failedCount,
        uniqueUsers,
        actionsBy24h: totalActions,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}

/**
 * Export logs as CSV
 */
export async function exportLogsAsCSV(filter: LogsFilter): Promise<{
  ok: boolean
  csv?: string
  error?: string
}> {
  try {
    const result = await getAuditLogs({ ...filter, limit: 10000, offset: 0 })

    if (!result.ok || !result.logs) {
      return { ok: false, error: result.error }
    }

    const headers = ['ID', 'Secret ID', 'Action', 'User Email', 'Timestamp', 'Status', 'Message']
    const rows = result.logs.map(log => [
      log.id,
      log.secret_id,
      log.action,
      log.user_email,
      log.timestamp,
      log.status,
      log.message,
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')

    return { ok: true, csv }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: msg }
  }
}
