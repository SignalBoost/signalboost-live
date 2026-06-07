import type { UserRole } from '../middleware/auth.js'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: UserRole
        subscriptionStatus: string
        plan: string
      }
    }
  }
}
