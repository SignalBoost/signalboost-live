import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env.js'
import { query } from './db.js'
import { authRoutes } from './routes/authRoutes.js'
import { paymentRoutes } from './routes/paymentRoutes.js'
import { resourceRoutes } from './routes/resourceRoutes.js'
import { errorHandler, notFound } from './middleware/errors.js'

const app = express()

app.use(helmet())
app.use(cors({ origin: env.frontendUrl, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'))

app.get('/health', async (_req, res) => {
  await query('select 1')
  res.json({ status: 'ok', service: 'signalboost-live-api' })
})

app.use('/api/auth', authRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api', resourceRoutes)

app.use(notFound)
app.use(errorHandler)

app.listen(env.port, () => {
  console.log(`SignalBoost Live API listening on :${env.port}`)
})
