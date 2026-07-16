import type { OriginId } from './provider-origin.ts'

export type NavigationId =
  | 'deployment-list'
  | 'deployment-detail'
  | 'project-settings'
  | 'domains'
  | 'environment-metadata'
  | 'logs'

export interface NavigationProfile {
  id: NavigationId
  origin: OriginId
  pathTemplate: string
  readOnly: true
  schemaVersion: '1.0.0'
}

export function createNavigationRegistry(items: readonly NavigationProfile[]) {
  const values: Readonly<NavigationProfile>[] = [...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => Object.freeze({ ...item }))
  const map = new Map<NavigationId, Readonly<NavigationProfile>>(
    values.map(item => [item.id, item]),
  )

  return Object.freeze({
    get(id: NavigationId) {
      const value = map.get(id)
      if (!value) throw new Error('unknown_navigation')
      return value
    },
    list() {
      return [...values]
    },
  })
}
