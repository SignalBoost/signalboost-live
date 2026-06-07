import { Router } from 'express'
import { createMercadoPagoPreference, createStripeCheckout, updateSubscription } from '../controllers/paymentController.js'
import { authenticate } from '../middleware/auth.js'

export const paymentRoutes = Router()

paymentRoutes.use(authenticate)
paymentRoutes.post('/stripe/checkout', createStripeCheckout)
paymentRoutes.post('/mercadopago/preference', createMercadoPagoPreference)
paymentRoutes.patch('/subscription', updateSubscription)
