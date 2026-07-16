export type SelectorGroup =
  | 'deployments'
  | 'domains'
  | 'projects'
  | 'logs'
  | 'settings'
  | 'authentication'

export interface ProviderSelector {
  id: string
  group: SelectorGroup
  selector: string
  readOnly: true
  schemaVersion: '1.0.0'
}

export function createSelectorRegistry(items: readonly ProviderSelector[]) {
  const values: Readonly<ProviderSelector>[] = [...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => Object.freeze({ ...item }))
  const map = new Map<string, Readonly<ProviderSelector>>(
    values.map(item => [item.id, item]),
  )

  return Object.freeze({
    get(id: string) {
      const value = map.get(id)
      if (!value) throw new Error('unknown_selector')
      return value
    },
    list() {
      return [...values]
    },
  })
}
