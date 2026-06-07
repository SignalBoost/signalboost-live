import type { Request, Response } from 'express'
import { query } from '../db.js'

export type ResourceConfig = {
  table: string
  writable: string[]
  searchable?: string[]
  ownerScoped?: boolean
}

function pickBody(body: Record<string, unknown>, allowed: string[]) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)))
}

export function createCrudController(config: ResourceConfig) {
  return {
    async list(req: Request, res: Response) {
      const search = String(req.query.search ?? '')
      const clauses: string[] = []
      const params: unknown[] = []

      if (config.ownerScoped && req.user) {
        params.push(req.user.id)
        clauses.push(`created_by = $${params.length}`)
      }

      if (search && config.searchable?.length) {
        params.push(`%${search}%`)
        const index = params.length
        clauses.push(`(${config.searchable.map((field) => `${field} ilike $${index}`).join(' or ')})`)
      }

      const sql = `select * from ${config.table}${clauses.length ? ` where ${clauses.join(' and ')}` : ''} order by created_at desc limit 100`
      const result = await query(sql, params)
      res.json({ data: result.rows })
    },

    async get(req: Request, res: Response) {
      const params: unknown[] = [req.params.id]
      const ownerClause = config.ownerScoped && req.user ? ' and created_by = $2' : ''
      if (ownerClause) params.push(req.user?.id)
      const result = await query(`select * from ${config.table} where id = $1${ownerClause}`, params)
      if (!result.rows[0]) return res.status(404).json({ error: 'Resource not found' })
      return res.json({ data: result.rows[0] })
    },

    async create(req: Request, res: Response) {
      const payload = pickBody(req.body, config.writable)
      if (config.ownerScoped && req.user) payload.created_by = req.user.id
      const keys = Object.keys(payload)
      if (!keys.length) return res.status(400).json({ error: 'No writable fields supplied' })

      const columns = keys.join(', ')
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ')
      const result = await query(`insert into ${config.table} (${columns}) values (${placeholders}) returning *`, Object.values(payload))
      return res.status(201).json({ data: result.rows[0] })
    },

    async update(req: Request, res: Response) {
      const payload = pickBody(req.body, config.writable)
      const keys = Object.keys(payload)
      if (!keys.length) return res.status(400).json({ error: 'No writable fields supplied' })

      const assignments = keys.map((key, index) => `${key} = $${index + 2}`).join(', ')
      const params = [req.params.id, ...Object.values(payload)]
      const ownerClause = config.ownerScoped && req.user ? ` and created_by = $${params.length + 1}` : ''
      if (ownerClause) params.push(req.user.id)
      const result = await query(`update ${config.table} set ${assignments}, updated_at = now() where id = $1${ownerClause} returning *`, params)
      if (!result.rows[0]) return res.status(404).json({ error: 'Resource not found' })
      return res.json({ data: result.rows[0] })
    },

    async remove(req: Request, res: Response) {
      const params: unknown[] = [req.params.id]
      const ownerClause = config.ownerScoped && req.user ? ' and created_by = $2' : ''
      if (ownerClause) params.push(req.user?.id)
      const result = await query(`delete from ${config.table} where id = $1${ownerClause} returning id`, params)
      if (!result.rows[0]) return res.status(404).json({ error: 'Resource not found' })
      return res.status(204).send()
    },
  }
}
