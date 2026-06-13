// saas/lib/auth/rbac-types.ts
// Role-based access control types and interfaces

export type Role = 'owner' | 'admin' | 'operator' | 'viewer' | 'custom'
export type Permission = 
  | 'vault:read'
  | 'vault:rotate'
  | 'vault:export'
  | 'vault:delete'
  | 'deployments:read'
  | 'deployments:deploy'
  | 'domains:read'
  | 'domains:manage'
  | 'settings:read'
  | 'settings:write'
  | 'users:read'
  | 'users:write'
  | 'logs:read'
  | 'logs:export'
  | 'webhooks:read'
  | 'webhooks:write'
  | 'audit:read'

export interface HubUser {
  id: string
  email: string
  name?: string
  role: Role
  customPermissions?: Permission[]
  mfaEnabled: boolean
  lastLogin?: string
  createdAt: string
  updatedAt: string
  active: boolean
}

export interface HubRole {
  id: string
  name: Role
  description: string
  permissions: Permission[]
  isCustom: boolean
  createdAt: string
}

export interface PermissionGroup {
  group: string
  permissions: {
    id: Permission
    label: string
    description: string
  }[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'Vault Management',
    permissions: [
      { id: 'vault:read', label: 'View Secrets', description: 'Read vault secrets and keys' },
      { id: 'vault:rotate', label: 'Rotate Keys', description: 'Rotate API keys and credentials' },
      { id: 'vault:export', label: 'Export Secrets', description: 'Export credentials (requires approval)' },
      { id: 'vault:delete', label: 'Delete Keys', description: 'Permanently delete credentials' },
    ],
  },
  {
    group: 'Deployments',
    permissions: [
      { id: 'deployments:read', label: 'View Deployments', description: 'View deployment history' },
      { id: 'deployments:deploy', label: 'Deploy Code', description: 'Trigger new deployments' },
    ],
  },
  {
    group: 'Infrastructure',
    permissions: [
      { id: 'domains:read', label: 'View Domains', description: 'View domain and DNS settings' },
      { id: 'domains:manage', label: 'Manage Domains', description: 'Add/modify domains and DNS records' },
    ],
  },
  {
    group: 'Configuration',
    permissions: [
      { id: 'settings:read', label: 'View Settings', description: 'View console settings' },
      { id: 'settings:write', label: 'Modify Settings', description: 'Change security and audit policies' },
    ],
  },
  {
    group: 'Team Management',
    permissions: [
      { id: 'users:read', label: 'View Users', description: 'View team members' },
      { id: 'users:write', label: 'Manage Users', description: 'Invite, remove, and modify users' },
    ],
  },
  {
    group: 'Monitoring',
    permissions: [
      { id: 'logs:read', label: 'View Logs', description: 'View audit logs' },
      { id: 'logs:export', label: 'Export Logs', description: 'Export audit logs' },
      { id: 'audit:read', label: 'View Audit Trail', description: 'Access detailed audit trail' },
    ],
  },
  {
    group: 'Integrations',
    permissions: [
      { id: 'webhooks:read', label: 'View Webhooks', description: 'View webhook endpoints' },
      { id: 'webhooks:write', label: 'Manage Webhooks', description: 'Create/modify webhooks' },
    ],
  },
]

export const DEFAULT_ROLES: HubRole[] = [
  {
    id: 'owner',
    name: 'owner',
    description: 'Full access - cannot be removed',
    permissions: [
      'vault:read',
      'vault:rotate',
      'vault:export',
      'vault:delete',
      'deployments:read',
      'deployments:deploy',
      'domains:read',
      'domains:manage',
      'settings:read',
      'settings:write',
      'users:read',
      'users:write',
      'logs:read',
      'logs:export',
      'webhooks:read',
      'webhooks:write',
      'audit:read',
    ],
    isCustom: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'admin',
    name: 'admin',
    description: 'Administrative access with most permissions',
    permissions: [
      'vault:read',
      'vault:rotate',
      'vault:export',
      'deployments:read',
      'deployments:deploy',
      'domains:read',
      'domains:manage',
      'settings:read',
      'settings:write',
      'users:read',
      'users:write',
      'logs:read',
      'logs:export',
      'webhooks:read',
      'webhooks:write',
      'audit:read',
    ],
    isCustom: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'operator',
    name: 'operator',
    description: 'Can operate vault, manage deployments, view settings',
    permissions: [
      'vault:read',
      'vault:rotate',
      'deployments:read',
      'deployments:deploy',
      'domains:read',
      'logs:read',
      'audit:read',
    ],
    isCustom: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'viewer',
    name: 'viewer',
    description: 'Read-only access - view only, no modifications',
    permissions: [
      'vault:read',
      'deployments:read',
      'domains:read',
      'logs:read',
      'audit:read',
    ],
    isCustom: false,
    createdAt: new Date().toISOString(),
  },
]
