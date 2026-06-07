import pg from 'pg'
import { env } from './config/env.js'

const { Pool } = pg

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
})

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const result = await pool.query<T>(text, params)
  return result
}
