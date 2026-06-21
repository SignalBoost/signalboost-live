'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'

type Role = 'user' | 'admin' | 'owner'

type TeamUser = {
  id: string
  email: string
  role: Role
}

const COPY = {
  en: {
    eyebrow: '🛡️ Admin · Roles',
    title: 'Role Management',
    ownerLabel: 'Owner',
    adminsLabel: 'Admins',
    totalLabel: 'Total',
    oneOwner: 'Only one owner is allowed at a time.',
    noAccess: 'You do not have access to Role Management.',
    colEmail: 'Email',
    colRole: 'Role',
    colActions: 'Actions',
    transferBtn: 'Transfer Ownership',
    confirmTitle: 'Confirm ownership transfer',
    confirmBody: (email: string) => `Are you sure you want to transfer ownership to ${email}?`,
    confirmWarning: 'You will lose owner privileges.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    confirming: 'Confirming...',
    transferred: 'Ownership transferred',
    transferFailed: 'Transfer failed',
  },
  es: {
    eyebrow: '🛡️ Admin · Roles',
    title: 'Gestión de roles',
    ownerLabel: 'Propietario',
    adminsLabel: 'Admins',
    totalLabel: 'Total',
    oneOwner: 'Solo se permite un propietario a la vez.',
    noAccess: 'No tiene acceso a la gestión de roles.',
    colEmail: 'Correo',
    colRole: 'Rol',
    colActions: 'Acciones',
    transferBtn: 'Transferir propiedad',
    confirmTitle: 'Confirmar transferencia de propiedad',
    confirmBody: (email: string) => `¿Está seguro de que desea transferir la propiedad a ${email}?`,
    confirmWarning: 'Perderá los privilegios de propietario.',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    confirming: 'Confirmando...',
    transferred: 'Propiedad transferida',
    transferFailed: 'Transferencia fallida',
  },
  pt: {
    eyebrow: '🛡️ Admin · Funções',
    title: 'Gestão de funções',
    ownerLabel: 'Proprietário',
    adminsLabel: 'Admins',
    totalLabel: 'Total',
    oneOwner: 'Apenas um proprietário é permitido por vez.',
    noAccess: 'Você não tem acesso à gestão de funções.',
    colEmail: 'E-mail',
    colRole: 'Função',
    colActions: 'Ações',
    transferBtn: 'Transferir propriedade',
    confirmTitle: 'Confirmar transferência de propriedade',
    confirmBody: (email: string) => `Tem certeza de que deseja transferir a propriedade para ${email}?`,
    confirmWarning: 'Você perderá os privilégios de proprietário.',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    confirming: 'Confirmando...',
    transferred: 'Propriedade transferida',
    transferFailed: 'Transferência falhou',
  },
  pl: {
    eyebrow: '🛡️ Admin · Role',
    title: 'Zarządzanie rolami',
    ownerLabel: 'Właściciel',
    adminsLabel: 'Admini',
    totalLabel: 'Łącznie',
    oneOwner: 'Dozwolony jest tylko jeden właściciel na raz.',
    noAccess: 'Nie masz dostępu do zarządzania rolami.',
    colEmail: 'E-mail',
    colRole: 'Rola',
    colActions: 'Akcje',
    transferBtn: 'Przenieś własność',
    confirmTitle: 'Potwierdź przeniesienie własności',
    confirmBody: (email: string) => `Czy na pewno chcesz przenieść własność do ${email}?`,
    confirmWarning: 'Utracisz uprawnienia właściciela.',
    cancel: 'Anuluj',
    confirm: 'Potwierdź',
    confirming: 'Potwierdzanie...',
    transferred: 'Własność przeniesiona',
    transferFailed: 'Przeniesienie nie powiodło się',
  },
  ru: {
    eyebrow: '🛡️ Админ · Роли',
    title: 'Управление ролями',
    ownerLabel: 'Владелец',
    adminsLabel: 'Администраторы',
    totalLabel: 'Всего',
    oneOwner: 'Одновременно допускается только один владелец.',
    noAccess: 'У вас нет доступа к управлению ролями.',
    colEmail: 'Email',
    colRole: 'Роль',
    colActions: 'Действия',
    transferBtn: 'Передать права',
    confirmTitle: 'Подтвердить передачу прав',
    confirmBody: (email: string) => `Вы уверены, что хотите передать права владельца пользователю ${email}?`,
    confirmWarning: 'Вы потеряете привилегии владельца.',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    confirming: 'Подтверждение...',
    transferred: 'Права переданы',
    transferFailed: 'Передача не удалась',
  },
}

function getLang(): keyof typeof COPY {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language?.slice(0, 2)
  if (lang === 'es') return 'es'
  if (lang === 'pt') return 'pt'
  if (lang === 'pl') return 'pl'
  if (lang === 'ru') return 'ru'
  return 'en'
}

export default function RolesManagementPage() {
  const { lang: activeLang } = useI18n()
  const [users, setUsers] = useState<TeamUser[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: Role } | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<TeamUser | null>(null)
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const c = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]

  useEffect(() => {
    async function bootstrap() {
      const { data } = await supabase.auth.getUser()
      const authUser = data.user
      if (!authUser?.id || !authUser.email) return
      const role = (authUser.user_metadata?.role || 'user') as Role
      setCurrentUser({ id: authUser.id, email: authUser.email, role })
      setUsers([{ id: authUser.id, email: authUser.email, role }])
    }
    bootstrap()
  }, [])

  const isOwner = currentUser?.role === 'owner'

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.email.localeCompare(b.email))
  }, [users])

  async function confirmTransfer() {
    if (!pendingTransfer || !currentUser) return
    setLoading(true)
    setMessage('')
    try {
      const transferTarget = users.find(u => u.id === pendingTransfer.id)
      const oldRole = transferTarget?.role ?? 'user'
      const res = await fetch('/api/admin/roles/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorUserId: currentUser.id,
          actorEmail: currentUser.email,
          targetUserId: pendingTransfer.id,
          targetEmail: pendingTransfer.email,
          oldRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || c.transferFailed)
      setUsers(prev =>
        prev.map(u => {
          if (u.id === currentUser.id) return { ...u, role: 'admin' }
          if (u.id === pendingTransfer.id) return { ...u, role: 'owner' }
          return u
        })
      )
      setCurrentUser(prev => (prev ? { ...prev, role: 'admin' } : prev))
      setMessage(c.transferred)
      setPendingTransfer(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : c.transferFailed)
    } finally {
      setLoading(false)
    }
  }

  if (currentUser && currentUser.role === 'user') {
    return <div style={{ color: 'rgba(255,255,255,.6)', padding: 16 }}>{c.noAccess}</div>
  }

  const roleCount = (role: string) => sortedUsers.filter(u => u.role === role).length

  const thBase: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,.45)',
    padding: '12px 4px',
    textAlign: 'left',
  }

  return (
    <div>
      <header className="sb-console" style={{ paddingBottom: 12 }}>
        <div className="sb-console__row">
          <div style={{ minWidth: 0 }}>
            <span className="sb-eyebrow">{c.eyebrow}</span>
            <h1 style={{ fontSize: 22, margin: '4px 0' }}>{c.title}</h1>
          </div>
          <div className="sb-telemetry" style={{ marginTop: 0, borderTop: 0 }}>
            <div style={{ paddingTop: 0 }}><b className="gold">{roleCount('owner')}</b><span>{c.ownerLabel}</span></div>
            <div style={{ paddingTop: 0 }}><b>{roleCount('admin')}</b><span>{c.adminsLabel}</span></div>
            <div style={{ paddingTop: 0 }}><b>{sortedUsers.length}</b><span>{c.totalLabel}</span></div>
          </div>
        </div>
      </header>

      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'rgba(255,255,255,.5)' }}>{c.oneOwner}</p>

      {message && (
        <div style={{ borderLeft: '2px solid rgba(26,240,255,.5)', paddingLeft: 14, marginBottom: 14, fontSize: 13, color: '#fff' }}>
          {message}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,.12)' }}>
              <th style={thBase}>{c.colEmail}</th>
              <th style={thBase}>{c.colRole}</th>
              <th style={{ ...thBase, textAlign: 'right' }}>{c.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map(user => (
              <tr key={user.id} style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
                <td style={{ padding: '12px 4px', fontSize: 14 }}>{user.email}</td>
                <td style={{ padding: '12px 4px', fontSize: 14 }}>
                  <span
                    className={user.role === 'owner' ? 'sb-chip sb-chip--gold' : user.role === 'admin' ? 'sb-chip' : ''}
                    style={user.role === 'user' ? { color: 'rgba(255,255,255,.5)', textTransform: 'capitalize' } : { textTransform: 'capitalize' }}
                  >
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: '12px 4px', fontSize: 14, textAlign: 'right' }}>
                  {isOwner && user.id !== currentUser?.id && (
                    <button
                      onClick={() => setPendingTransfer(user)}
                      style={{
                        background: 'rgba(37,99,235,.85)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {c.transferBtn}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingTransfer && (
        <div
          onClick={() => setPendingTransfer(null)}
          style={{
            position: 'fixed',
            top: 80,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.6)',
            padding: 16,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              padding: 24,
              background: 'linear-gradient(160deg, rgba(15,23,42,.96), rgba(3,7,18,.98))',
              border: '1px solid rgba(26,240,255,.25)',
              borderRadius: 20,
              boxShadow: '0 32px 110px rgba(0,0,0,.6)',
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px', color: '#fff' }}>{c.confirmTitle}</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.85)', margin: '0 0 8px' }}>
              {c.confirmBody(pendingTransfer.email)}
            </p>
            <p style={{ fontSize: 13, color: '#fbbf24', margin: '0 0 20px' }}>{c.confirmWarning}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setPendingTransfer(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,.2)',
                  color: 'rgba(255,255,255,.8)',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {c.cancel}
              </button>
              <button
                onClick={confirmTransfer}
                disabled={loading}
                style={{
                  background: loading ? 'rgba(220,38,38,.4)' : 'rgba(220,38,38,.85)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? c.confirming : c.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
