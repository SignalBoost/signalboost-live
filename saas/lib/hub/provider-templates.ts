  // === VERCEL ===
  'vercel.view_env': {
    id: 'vercel.view_env',
    label: 'View Env Variables',
    description: 'List Vercel project environment variable names, IDs, and targets. Secret values stay hidden.',
    icon: '📋',
    api: { service: 'vercel', method: 'GET', endpoint: '/v9/projects/{projectId}/env' },
    fields: []
  },
  'vercel.list_deployments': {
    id: 'vercel.list_deployments',
    label: 'Deployments Panel',
    description: 'Inspect running build tracks, commit records, and production target assignments.',
    icon: '🚀',
    api: { service: 'vercel', method: 'GET', endpoint: '/v6/deployments' },
    fields: []
  },
  'vercel.trigger_rollback': {
    id: 'vercel.trigger_rollback',
    label: 'Rollback Deploy',
    description: 'Instantly point production edge domain targets back to a historical deployment hash.',
    icon: '↩️',
    requiresConfirm: true,
    previewBeforeSubmit: true,
    api: { service: 'vercel', method: 'POST', endpoint: '/v13/deployments/{deploymentId}/promote' },
    fields: [
      { id: 'deploymentId', label: 'Deployment ID', type: 'text', required: true, placeholder: 'dpl_...' }
    ]
  },
  'vercel.add_env_var': {
    id: 'vercel.add_env_var',
    label: 'Add Env Variable',
    description: 'Add a Vercel environment variable to Production, Preview, or Development.',
    icon: '🔑',
    requiresConfirm: true,
    previewBeforeSubmit: true,
    api: { service: 'vercel', method: 'POST', endpoint: '/v10/projects/{projectId}/env' },
    fields: [
      { id: 'key', label: 'Variable Key', type: 'text', required: true, placeholder: 'NEXT_PUBLIC_API_URL' },
      { id: 'value', label: 'Variable Value', type: 'secret', required: true },
      {
        id: 'target',
        label: 'Environment',
        type: 'select',
        required: true,
        defaultValue: 'preview',
        options: [
          { label: 'Production', value: 'production' },
          { label: 'Preview', value: 'preview' },
          { label: 'Development', value: 'development' }
        ]
      }
    ]
  },
  'vercel.delete_env_var': {
    id: 'vercel.delete_env_var',
    label: 'Delete Env Variable',
    description: 'Remove an environment variable from the Vercel project by variable ID.',
    icon: '🗑️',
    requiresConfirm: true,
    previewBeforeSubmit: true,
    api: { service: 'vercel', method: 'DELETE', endpoint: '/v9/projects/{projectId}/env/{id}' },
    fields: [
      { id: 'id', label: 'Env Variable ID', type: 'text', required: true, placeholder: 'Use View Env Variables to find the ID' }
    ]
  },
  'vercel.sync_dns_domain': {
    id: 'vercel.sync_dns_domain',
    label: 'Domains/DNS',
    description: 'Configure canonical configurations, alias paths, or trigger edge SSL certification rules.',
    icon: '🌐',
    requiresConfirm: true,
    previewBeforeSubmit: true,
    api: { service: 'vercel', method: 'POST', endpoint: '/v10/projects/{projectId}/domains' },
    fields: [
      { id: 'domain', label: 'Domain Address', type: 'text', required: true, placeholder: 'app.domain.com' }
    ]
  },
