// saas/components/hub/pages/UsersPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { HubUser, DEFAULT_ROLES, PERMISSION_GROUPS, Permission, Role } from '@/lib/auth/rbac-types'
import { cardStyle, labelStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export function UsersPage() {
  const { dict } = useI18n()
  const [users, setUsers] = useState<HubUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('viewer')

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      setLoading(true)
      const res = await fetch('/api/hub/users')
      const data = await res.json()

      if (data.ok) {
        setUsers(data.users || [])
      } else {
        setError(data.error || t(dict, 'console.users.err.load', uiCopy('u_c38172463fee4094')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.users.err.loading', uiCopy('u_555da7f9d91f910a')))
    } finally {
      setLoading(false)
    }
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) {
      setError(t(dict, 'console.users.err.emailRequired', uiCopy('u_d9ebc8a0342b0f05')))
      return
    }

    try {
      const res = await fetch('/api/hub/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        setInviteEmail('')
        setInviteRole('viewer')
        setShowInviteForm(false)
        fetchUsers()
        setError(null)
      } else {
        setError(data.error || t(dict, 'console.users.err.invite', uiCopy('u_98686f7e2fe51e7d')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.users.err.inviting', uiCopy('u_5c3ee439842f3f6f')))
    }
  }

  async function updateUserRole(userId: string, newRole: Role) {
    try {
      const res = await fetch('/api/hub/users/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })

      const data = await res.json()

      if (data.ok) {
        fetchUsers()
        setError(null)
      } else {
        setError(data.error || t(dict, 'console.users.err.role', uiCopy('u_d7c53ff468bfb05f')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.users.err.updatingRole', uiCopy('u_25ee3d349c66b7ba')))
    }
  }

  async function removeUser(userId: string) {
    if (!confirm(t(dict, 'console.users.confirmRemove', uiCopy('u_c6e1d3d8adebccb1')))) return

    try {
      const res = await fetch(`/api/hub/users?id=${userId}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        fetchUsers()
        setError(null)
      } else {
        setError(data.error || t(dict, 'console.users.err.remove', uiCopy('u_6fbc934593f3a7fa')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.users.err.removing', uiCopy('u_99ce00c27a0550f6')))
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>
          {t(dict, 'console.users.title', uiCopy('u_2cf0bf287b515110'))}
        </h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          {t(dict, 'console.users.subtitle', uiCopy('u_03e7ea42df59406f'))}
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#1a0000',
            color: '#ff6b6b',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Invite Form */}
      {showInviteForm && (
        <div style={{ ...cardStyle, marginBottom: '2rem' }}>
          <h3 style={{ ...labelStyle, marginBottom: '1rem' }}>{t(dict, 'console.users.inviteTitle', uiCopy('u_1ffbd140b21e09c0'))}</h3>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              {t(dict, 'console.users.emailLabel', uiCopy('u_b036d8f08c9c098b'))}
            </label>
            <input
              type="email"
              placeholder={uiCopy('u_2191478c4ef3f8ce')}
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && inviteUser()}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #333',
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              {t(dict, 'console.users.roleLabel', uiCopy('u_7b9bf8d64e8b35af'))}
            </label>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Role)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #333',
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.9rem',
              }}
            >
              {DEFAULT_ROLES.map(role => (
                <option key={role.id} value={role.name}>
                  {role.description}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={inviteUser}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#1af0ff',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem',
              }}
            >
              {t(dict, 'console.users.sendInvite', uiCopy('u_bf2b926cf8ee18ab'))}
            </button>
            <button
              onClick={() => setShowInviteForm(false)}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#333',
                color: '#aaa',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              {t(dict, 'common.cancel', uiCopy('u_dcc33706dae125c8'))}
            </button>
          </div>
        </div>
      )}

      {!showInviteForm && (
        <button
          onClick={() => setShowInviteForm(true)}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#1af0ff',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginBottom: '1.5rem',
          }}
        >
          {t(dict, 'console.users.inviteMember', uiCopy('u_1391fb8e36d1e628'))}
        </button>
      )}
{/* Users List */}
      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          {t(dict, 'console.users.loading', uiCopy('u_64a284a05adf6e08'))}
        </div>
      ) : users.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          {t(dict, 'console.users.empty', uiCopy('u_1b1817beb961b49e'))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {users.map(user => (
            <UserCard
              key={user.id}
              user={user}
              expanded={expandedUserId === user.id}
              onToggle={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
              onRoleChange={(newRole: Role) => updateUserRole(user.id, newRole)}
              onRemove={() => removeUser(user.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UserCard({
  user,
  expanded,
  onToggle,
  onRoleChange,
  onRemove,
}: {
  user: HubUser
  expanded: boolean
  onToggle: () => void
  onRoleChange: (role: Role) => void
  onRemove: () => void
}) {
  const { dict } = useI18n()
  const roleInfo = DEFAULT_ROLES.find(r => r.name === user.role)

  return (
    <div style={cardStyle}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          paddingBottom: expanded ? '1rem' : '0',
          borderBottom: expanded ? '1px solid #333' : 'none',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.25rem', color: '#fff' }}>
            {user.name || user.email}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem', color: '#888' }}>
            <span>{user.email}</span>
            <span style={{ color: '#1af0ff', fontWeight: 'bold' }}>
              {user.role.toUpperCase()}
            </span>
            {user.mfaEnabled && <span style={{ color: '#22c55e' }}>{uiCopy('u_c2133fceca11b20e')}</span>}
          </div>
        </div>
        <div style={{ fontSize: '1.5rem', color: '#666' }}>
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {expanded && (
        <div style={{ paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          {/* Role Selection */}
          <div>
            <label style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>
              {t(dict, 'console.users.roleLabel', uiCopy('u_892af69a878c85e2'))}
            </label>
            <select
              value={user.role}
              onChange={e => onRoleChange(e.target.value as Role)}
              disabled={user.role === 'owner'}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #333',
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.9rem',
                opacity: user.role === 'owner' ? 0.6 : 1,
                cursor: user.role === 'owner' ? 'not-allowed' : 'pointer',
              }}
            >
              {DEFAULT_ROLES.map(role => (
                <option key={role.id} value={role.name} disabled={user.role === 'owner'}>
                  {role.description}
                </option>
              ))}
            </select>
            {user.role === 'owner' && (
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
                {t(dict, 'console.users.ownerLocked', uiCopy('u_db0afd13d078a65a'))}
              </div>
            )}
          </div>

          {/* Permissions Preview */}
          {roleInfo && (
            <div>
              <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                {t(dict, 'console.users.permissions', uiCopy('u_f0e5d8e764b5d024'))} ({roleInfo.permissions.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {roleInfo.permissions.map(perm => {
                  const permInfo = PERMISSION_GROUPS.flatMap(g => g.permissions).find(p => p.id === perm)
                  return (
                    <div
                      key={perm}
                      style={{
                        padding: '0.5rem',
                        background: '#1a1a2e',
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        color: '#1af0ff',
                      }}
                    >
                      ✓ {permInfo?.label || perm}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                {t(dict, 'console.users.joined', uiCopy('u_1ccc6a438ed3a808'))}
              </div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                {new Date(user.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                {t(dict, 'console.users.lastLogin', uiCopy('u_445a2dff68451ad0'))}
              </div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : t(dict, 'console.users.never', uiCopy('u_111f3973d2fe91fc'))}
              </div>
            </div>
          </div>

          {/* Remove Button */}
          {user.role !== 'owner' && (
            <button
              onClick={onRemove}
              style={{
                padding: '0.75rem',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem',
              }}
            >
              🗑️ {t(dict, 'console.users.removeUser', uiCopy('u_3f87a5c6602718fd'))}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
