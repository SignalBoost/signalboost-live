import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')
const globals = fs.readFileSync(path.join(repoRoot, 'app', 'globals.css'), 'utf8')

test('NASA-style tokens define typography, colors, spacing, shadows, and cockpit effects', () => {
  const requiredTokens = [
    '--sb-font-heading',
    '--sb-font-body',
    '--sb-font-weight-light: 300',
    '--sb-font-weight-medium: 500',
    '--sb-font-weight-bold: 700',
    '--sb-line-height-body',
    '--sb-bg-gradient',
    '--sb-color-primary-neon: #FFD700',
    '--sb-color-secondary-neon: #00FFFF',
    '--sb-color-accent-neon: #FF00FF',
    '--sb-color-text: #FFFFFF',
    '--sb-color-text-muted: #AAAAAA',
    '--sb-space-xs: 4px',
    '--sb-space-sm: 8px',
    '--sb-space-md: 16px',
    '--sb-space-lg: 24px',
    '--sb-space-xl: 32px',
    '--sb-shadow-neon: 0 0 12px currentColor',
    '--sb-shadow-panel-token: 0 4px 12px rgba(0,0,0,0.5)',
    '--sb-glass-background: rgba(255,255,255,0.1)',
    '--sb-glass-blur: blur(12px)',
    '--sb-transition-hover: 200ms ease-in-out',
  ]

  requiredTokens.forEach((token) => assert.ok(globals.includes(token), `Missing ${token}`))
})

test('NASA-style cockpit classes are applied across marketplace, SaaS dashboards, pricing, and CRM data pipeline', () => {
  const files = [
    path.join(repoRoot, 'app', 'page.tsx'),
    path.join(repoRoot, 'app', 'dashboard', 'page.tsx'),
    path.join(repoRoot, 'components', 'dashboard', 'DashboardModules.tsx'),
    path.join(repoRoot, 'app', 'dashboard', 'data', 'page.tsx'),
    path.join(repoRoot, 'app', 'pricing', 'page.tsx'),
  ]

  const combined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  ;['sb-marketplace', 'sb-hero-search', 'sb-pricing-card', 'sb-cockpit-panel', 'sb-telemetry-card', '/api/data-connectors/import'].forEach((needle) => {
    assert.ok(combined.includes(needle), `Missing ${needle}`)
  })
})
