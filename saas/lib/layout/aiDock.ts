import type { CSSProperties } from 'react'

export const AI_DOCK_WIDTH_DESKTOP = 400
export const AI_DOCK_WIDTH_TABLET = 320
export const AI_DOCK_COLLAPSED_WIDTH = 56

export const AI_DOCK_CSS_VARS = {
  '--sb-ai-dock-width': `${AI_DOCK_WIDTH_DESKTOP}px`,
  '--sb-ai-dock-tablet-width': `${AI_DOCK_WIDTH_TABLET}px`,
  '--sb-ai-dock-collapsed-width': `${AI_DOCK_COLLAPSED_WIDTH}px`,
} as CSSProperties
