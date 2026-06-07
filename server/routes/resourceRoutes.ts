import { Router } from 'express'
import { createCrudController, type ResourceConfig } from '../controllers/crudController.js'
import { authenticate, authorize } from '../middleware/auth.js'

const resources: Record<string, ResourceConfig> = {
  teams: { table: 'teams', ownerScoped: true, writable: ['name', 'slug', 'city', 'division', 'logo_url', 'status'], searchable: ['name', 'city', 'division'] },
  matches: { table: 'matches', ownerScoped: true, writable: ['home_team_id', 'away_team_id', 'starts_at', 'venue', 'status', 'home_score', 'away_score'], searchable: ['venue', 'status'] },
  rankings: { table: 'rankings', ownerScoped: true, writable: ['team_id', 'season', 'position', 'points', 'movement'], searchable: ['season'] },
  content: { table: 'content_items', ownerScoped: true, writable: ['title', 'slug', 'body', 'type', 'channel', 'status', 'published_at'], searchable: ['title', 'body', 'type', 'channel'] },
}

function buildResourceRouter(config: ResourceConfig) {
  const controller = createCrudController(config)
  const router = Router()
  router.use(authenticate)
  router.get('/', controller.list)
  router.get('/:id', controller.get)
  router.post('/', authorize('owner', 'admin', 'editor'), controller.create)
  router.patch('/:id', authorize('owner', 'admin', 'editor'), controller.update)
  router.delete('/:id', authorize('owner', 'admin'), controller.remove)
  return router
}

export const resourceRoutes = Router()

Object.entries(resources).forEach(([name, config]) => {
  resourceRoutes.use(`/${name}`, buildResourceRouter(config))
})
