import { Router } from 'express'
import { login, me, register } from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'

export const authRoutes = Router()

authRoutes.post('/register', register)
authRoutes.post('/login', login)
authRoutes.get('/me', authenticate, me)
