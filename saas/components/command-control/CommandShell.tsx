'use client'

import type { ReactNode } from 'react'
import CommandRail from './CommandRail'
import MissionBar from './MissionBar'
import type { CommandPage, CommandPageKey, CommandRailSection } from './types'
import type { HubData, Lang } from '../hub/shared'

type CommandShellProps = {
  sections: CommandRailSection[]
  activePage: CommandPage
  activePageKey: CommandPageKey
  lang: Lang
  data: HubData | null
  loading: boolean
  onNavigate: (pageKey: CommandPageKey) => void
  onLanguageChange: (lang: Lang) => void
  onRefresh: () => void
  children: ReactNode
}

export default function CommandShell({ sections, activePage, activePageKey, lang, data, loading, onNavigate, onLanguageChange, onRefresh, children }: CommandShellProps) {
  return (
    <div className="command-shell" style={{ display: 'flex', gap: 16, width: '100%', height: '100%', minHeight: 0 }}>
      <CommandRail sections={sections} activePage={activePageKey} onNavigate={onNavigate} />
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MissionBar activePage={activePage} lang={lang} data={data} loading={loading} onLanguageChange={onLanguageChange} onRefresh={onRefresh} />
        <div className="command-stage" style={{ position: 'relative', overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </main>
    </div>
  )
}
