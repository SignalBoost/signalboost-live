import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { signAccessToken, type UserRole } from '../middleware/auth.js'

function serializeUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    plan: row.plan,
    subscriptionStatus: row.subscription_status,
  }
}

export async function register(req: Request, res: Response) {
  const { email, password, name, role = 'owner' } = req.body
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Email and an 8+ character password are required' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const result = await query(
    `insert into users (email, password_hash, name, role)
     values ($1, $2, $3, $4)
     returning id, email, name, role, plan, subscription_status`,
    [email.toLowerCase(), passwordHash, name ?? null, role],
  )
  const user = serializeUser(result.rows[0])
  const token = signAccessToken({ id: user.id, email: user.email, role: user.role as UserRole, plan: user.plan, subscriptionStatus: user.subscriptionStatus })
  return res.status(201).json({ user, token })
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body
  const result = await query('select id, email, password_hash, name, role, plan, subscription_status from users where email = $1', [String(email ?? '').toLowerCase()])
  const userRow = result.rows[0]
  if (!userRow) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password ?? '', userRow.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const user = serializeUser(userRow)
  const token = signAccessToken({ id: user.id, email: user.email, role: user.role as UserRole, plan: user.plan, subscriptionStatus: user.subscriptionStatus })
  return res.json({ user, token })
}

export async function me(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  const result = await query('select id, email, name, role, plan, subscription_status from users where id = $1', [req.user.id])
  return res.json({ user: serializeUser(result.rows[0]) })
}
