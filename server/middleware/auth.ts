import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'

export function signAccessToken(payload: { id: string; email: string; role: UserRole; subscriptionStatus: string; plan: string }) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn })
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' })
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret) as Request['user']
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role permissions' })
    return next()
  }
}
