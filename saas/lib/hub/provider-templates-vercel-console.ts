// saas/lib/hub/provider-templates-vercel-console.ts
// Extra Vercel console templates that keep the Console Catalog aligned with getTemplate().

import type { ProviderTemplate } from './provider-templates'

export const VERCEL_CONSOLE_TEMPLATES: Record<string, ProviderTemplate> = {
  'vercel.list_env_vars': {
    id: 'vercel.list_env_vars',
    label: 'List Env Vars',
    description: 'List project environment variable names and targets. Values remain masked by Vercel.',
    icon: '🔑',
    policyActionId: 'view_env_vars',
    api: { service: 'vercel', method: 'GET', endpoint: '/v9/projects/{projectId}/env' },
    fields: [],
  },
  'vercel.list_domains': {
    id: 'vercel.list_domains',
    label: 'List Domains',
    description: 'List domains attached to the configured Vercel project.',
    icon: '🌐',
    policyActionId: 'read_provider_status',
    api: { service: 'vercel', method: 'GET', endpoint: '/v9/projects/{projectId}/domains' },
    fields: [],
  },
  'vercel.logs': {
    id: 'vercel.logs',
    label: 'Logs Viewer',
    description: 'Open or query the Vercel logs workspace for recent build and runtime events.',
    icon: '📝',
    policyActionId: 'read_provider_status',
    api: { service: 'vercel', method: 'GET', endpoint: '/v6/deployments' },
    fields: [],
  },
}
