import type { ComponentType } from 'react'
import type { PageProps } from '../hub/shared'

export type CommandPageKey = 'dashboard' | 'vault' | 'health' | 'providers'

export type CommandPage = {
  key: CommandPageKey
  icon: string
  title: string
  eyebrow: string
  description: string
  Component: ComponentType<PageProps>
}

export type CommandRailItem = {
  key: string
  icon: string
  label: string
  pageKey?: CommandPageKey
  disabled?: boolean
  badge?: string
}

export type CommandRailSection = {
  title: string
  items: CommandRailItem[]
}
