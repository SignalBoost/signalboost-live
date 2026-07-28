'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const GOLD = '#ffc300'

type Member = {
  id: string
  member_email: string
  member_id: string | null
  role: 'owner' | 'admin' | 'member'
  status: 'pending' | 'active' | 'removed'
  created_at: string
}

type TeamCopy = {
  account: string
  title: string
  subtitle: string
  notAllowedTitle: string
  notAllowedBody: string
  addTitle: string
  emailPlaceholder: string
  add: string
  adding: string
  loading: string
  empty: string
  thatsYou: string
  remove: string
  removeTitle: string
  edit: string
  save: string
  cancel: string
  deleteConfirm: string
  confirmDelete: string
  loadError: string
  genericLoadError: string
  addError: string
  addGenericError: string
  howRolesWork: string
  ownerRule: string
  adminRule: string
  memberRule: string
  pendingNote: string
  roles: Record<string, { label: string; desc: string }>
  statuses: Record<string, string>
}

const COPY: Record<string, TeamCopy> = {
  en: {
    account: uiText('generatedUi.u_7e1b0d5641f2640c'),
    title: uiText('generatedUi.u_459ef18a152b8ba1'),
    subtitle: uiText('generatedUi.u_0a700c292d374813'),
    notAllowedTitle: uiText('generatedUi.u_23a99517ff6f9d1f'),
    notAllowedBody: uiText('generatedUi.u_7a8a65c0a09ea176'),
    addTitle: uiText('generatedUi.u_5dd78053d511b1d4'),
    emailPlaceholder: uiText('generatedUi.u_7039f319f9811cec'),
    add: uiText('generatedUi.u_9fd728c66c9a256b'),
    adding: uiText('generatedUi.u_c6de6f45c827f464'),
    loading: uiText('generatedUi.u_3de47cef246bee33'),
    empty: uiText('generatedUi.u_fbb64e2d2bda2618'),
    thatsYou: uiText('generatedUi.u_0d34bc547e773fed'),
    remove: uiText('generatedUi.u_c3812fc4acb861d5'),
    removeTitle: uiText('generatedUi.u_c3812fc4acb861d5'),
    edit: uiText('generatedUi.u_464c4ffd019e1e96'),
    save: uiText('generatedUi.u_1509f561f2416598'),
    cancel: uiText('generatedUi.u_19766ed6ccb2f4a3'),
    deleteConfirm: uiText('generatedUi.u_c1b15a3712482b37'),
    confirmDelete: uiText('generatedUi.u_eebdd24a77d9ad32'),
    loadError: uiText('generatedUi.u_b57b19d6b0700604'),
    genericLoadError: uiText('generatedUi.u_30a12799f76e147f'),
    addError: uiText('generatedUi.u_221884effddc6568'),
    addGenericError: uiText('generatedUi.u_8278ffd3286a5580'),
    howRolesWork: uiText('generatedUi.u_0b45c92e37513eb1'),
    ownerRule: uiText('generatedUi.u_a164fdac4065a697'),
    adminRule: uiText('generatedUi.u_596eeed11fa8f516'),
    memberRule: uiText('generatedUi.u_0cd2c53462d490c7'),
    pendingNote: uiText('generatedUi.u_380d4f77d0c06c90'),
    roles: {
      owner: { label: uiText('generatedUi.u_4b1b8aa3608a26da'), desc: uiText('generatedUi.u_666865dcc0bcd654') },
      admin: { label: uiText('generatedUi.u_8df5ca22998a696a'), desc: uiText('generatedUi.u_6f2a319d32b4683b') },
      member: { label: uiText('generatedUi.u_7c968fb71f50e335'), desc: uiText('generatedUi.u_729370552a262bea') },
    },
    statuses: {
      pending: uiText('generatedUi.u_a05a295b1cc5d206'),
      active: uiText('generatedUi.u_92340695899bd2d8'),
      removed: uiText('generatedUi.u_4118fb4fed0ecec9'),
    },
  },

  pt: {
    account: 'Conta',
    title: 'Equipe e funções',
    subtitle: 'Adicione pessoas e escolha o que elas podem acessar. Cada pessoa se cadastra com o email adicionado aqui para ativar.',
    notAllowedTitle: 'Gerenciamento da equipe',
    notAllowedBody: 'Somente o proprietário da conta pode gerenciar a equipe.',
    addTitle: 'Adicionar membro da equipe',
    emailPlaceholder: 'nome@email.com',
    add: 'Adicionar',
    adding: 'Adicionando…',
    loading: 'Carregando sua equipe…',
    empty: 'Ainda não há membros na equipe. Adicione alguém acima.',
    thatsYou: 'Esse é você',
    remove: 'Remover',
    removeTitle: 'Remover',
    edit: 'Editar',
    save: 'Salvar',
    cancel: 'Cancelar',
    deleteConfirm: 'Excluir permanentemente?',
    confirmDelete: 'Confirmar',
    loadError: 'Não foi possível carregar sua equipe.',
    genericLoadError: 'Algo deu errado ao carregar sua equipe.',
    addError: 'Não foi possível adicionar o membro.',
    addGenericError: 'Não foi possível adicionar o membro.',
    howRolesWork: 'Como as funções funcionam',
    ownerRule: 'tudo: todas as ferramentas, páginas de TI/admin, cobrança e gerenciamento da equipe.',
    adminRule: 'páginas de sistema/TI e gerenciamento da equipe, além das ferramentas de trabalho diário.',
    memberRule: 'apenas ferramentas de trabalho diário. Sem páginas admin, cobrança ou gerenciamento da equipe.',
    pendingNote: 'Adicionar alguém reserva o assento como Pendente. A pessoa se torna Ativa quando se cadastra com esse email.',
    roles: {
      owner: { label: 'Proprietário', desc: 'Acesso total, incluindo cobrança e gerenciamento da equipe.' },
      admin: { label: 'Admin (TI)', desc: 'Páginas de sistema/TI e gerenciamento da equipe.' },
      member: { label: 'Membro', desc: 'Apenas ferramentas de trabalho diário. Sem admin ou cobrança.' },
    },
    statuses: {
      pending: 'Pendente — aguardando cadastro',
      active: 'Ativo',
      removed: 'Removido',
    },
  },

  es: {
    account: 'Cuenta',
    title: 'Equipo y roles',
    subtitle: 'Agrega personas y elige a qué pueden acceder. Cada persona se registra con el correo que agregas aquí para activarse.',
    notAllowedTitle: 'Gestión del equipo',
    notAllowedBody: 'Solo el propietario de la cuenta puede gestionar el equipo.',
    addTitle: 'Agregar miembro del equipo',
    emailPlaceholder: 'nombre@email.com',
    add: 'Agregar',
    adding: 'Agregando…',
    loading: 'Cargando tu equipo…',
    empty: 'Aún no hay miembros del equipo. Agrega a alguien arriba.',
    thatsYou: 'Ese eres tú',
    remove: 'Eliminar',
    removeTitle: 'Eliminar',
    edit: 'Editar',
    save: 'Guardar',
    cancel: 'Cancelar',
    deleteConfirm: '¿Eliminar permanentemente?',
    confirmDelete: 'Confirmar',
    loadError: 'No se pudo cargar tu equipo.',
    genericLoadError: 'Algo salió mal al cargar tu equipo.',
    addError: 'No se pudo agregar el miembro.',
    addGenericError: 'No se pudo agregar el miembro.',
    howRolesWork: 'Cómo funcionan los roles',
    ownerRule: 'todo: todas las herramientas, páginas de TI/admin, facturación y gestión del equipo.',
    adminRule: 'páginas de sistema/TI y gestión del equipo, además de las herramientas de trabajo diario.',
    memberRule: 'solo herramientas de trabajo diario. Sin páginas admin, facturación ni gestión del equipo.',
    pendingNote: 'Agregar a alguien reserva su asiento como Pendiente. Se vuelve Activo cuando se registra con ese correo.',
    roles: {
      owner: { label: 'Propietario', desc: 'Acceso completo, incluida facturación y gestión del equipo.' },
      admin: { label: 'Admin (TI)', desc: 'Páginas de sistema/TI y gestión del equipo.' },
      member: { label: 'Miembro', desc: 'Solo herramientas de trabajo diario. Sin admin ni facturación.' },
    },
    statuses: {
      pending: 'Pendiente — esperando registro',
      active: 'Activo',
      removed: 'Eliminado',
    },
  },

  pl: {
    account: 'Konto',
    title: 'Zespół i role',
    subtitle: 'Dodaj osoby i wybierz, do czego mają dostęp. Każda osoba aktywuje dostęp, rejestrując się pod dodanym adresem email.',
    notAllowedTitle: 'Zarządzanie zespołem',
    notAllowedBody: 'Tylko właściciel konta może zarządzać zespołem.',
    addTitle: 'Dodaj członka zespołu',
    emailPlaceholder: 'nazwa@email.com',
    add: 'Dodaj',
    adding: 'Dodawanie…',
    loading: 'Ładowanie zespołu…',
    empty: 'Brak członków zespołu. Dodaj kogoś powyżej.',
    thatsYou: 'To Ty',
    remove: 'Usuń',
    removeTitle: 'Usuń',
    edit: 'Edytuj',
    save: 'Zapisz',
    cancel: 'Anuluj',
    deleteConfirm: 'Usunąć trwale?',
    confirmDelete: 'Potwierdź',
    loadError: 'Nie można załadować zespołu.',
    genericLoadError: 'Coś poszło nie tak podczas ładowania zespołu.',
    addError: 'Nie można dodać członka.',
    addGenericError: 'Nie można dodać członka.',
    howRolesWork: 'Jak działają role',
    ownerRule: 'wszystko: wszystkie narzędzia, strony IT/admin, rozliczenia i zarządzanie zespołem.',
    adminRule: 'strony systemowe/IT i zarządzanie zespołem oraz narzędzia codziennej pracy.',
    memberRule: 'tylko narzędzia codziennej pracy. Bez stron admin, rozliczeń i zarządzania zespołem.',
    pendingNote: 'Dodanie osoby rezerwuje jej miejsce jako Oczekujące. Staje się Aktywna po rejestracji tym adresem email.',
    roles: {
      owner: { label: 'Właściciel', desc: 'Pełny dostęp, w tym rozliczenia i zarządzanie zespołem.' },
      admin: { label: 'Admin (IT)', desc: 'Strony systemowe/IT i zarządzanie zespołem.' },
      member: { label: 'Członek', desc: 'Tylko narzędzia codziennej pracy. Bez admina i rozliczeń.' },
    },
    statuses: {
      pending: 'Oczekujące — czeka na rejestrację',
      active: 'Aktywny',
      removed: 'Usunięty',
    },
  },

  ru: {
    account: 'Аккаунт',
    title: 'Команда и роли',
    subtitle: 'Добавьте людей и выберите, к чему у них будет доступ. Каждый активирует доступ, зарегистрировавшись с указанным email.',
    notAllowedTitle: 'Управление командой',
    notAllowedBody: 'Только владелец аккаунта может управлять командой.',
    addTitle: 'Добавить участника команды',
    emailPlaceholder: 'name@email.com',
    add: 'Добавить',
    adding: 'Добавление…',
    loading: 'Загрузка команды…',
    empty: 'Участников команды пока нет. Добавьте кого-нибудь выше.',
    thatsYou: 'Это вы',
    remove: 'Удалить',
    removeTitle: 'Удалить',
    edit: 'Изменить',
    save: 'Сохранить',
    cancel: 'Отмена',
    deleteConfirm: 'Удалить навсегда?',
    confirmDelete: 'Подтвердить',
    loadError: 'Не удалось загрузить команду.',
    genericLoadError: 'Что-то пошло не так при загрузке команды.',
    addError: 'Не удалось добавить участника.',
    addGenericError: 'Не удалось добавить участника.',
    howRolesWork: 'Как работают роли',
    ownerRule: 'всё: все инструменты, страницы IT/admin, биллинг и управление командой.',
    adminRule: 'системные/IT страницы и управление командой, плюс ежедневные рабочие инструменты.',
    memberRule: 'только ежедневные рабочие инструменты. Без admin-страниц, биллинга и управления командой.',
    pendingNote: 'Добавление человека резервирует место как Ожидающее. Он станет Активным после регистрации с этим email.',
    roles: {
      owner: { label: 'Владелец', desc: 'Полный доступ, включая биллинг и управление командой.' },
      admin: { label: 'Admin (IT)', desc: 'Системные/IT страницы и управление командой.' },
      member: { label: 'Участник', desc: 'Только ежедневные рабочие инструменты. Без admin и биллинга.' },
    },
    statuses: {
      pending: 'Ожидает — нужна регистрация',
      active: 'Активен',
      removed: 'Удален',
    },
  },
}

const ROLE_STYLE: Record<string, { color: string; bg: string }> = {
  owner: { color: '#ffc300', bg: 'rgba(255,195,0,.14)' },
  admin: { color: '#7dd3fc', bg: 'rgba(125,211,252,.14)' },
  member: { color: '#86efac', bg: 'rgba(134,239,172,.14)' },
}

const STATUS_STYLE: Record<string, { color: string }> = {
  pending: { color: '#fde68a' },
  active: { color: '#86efac' },
  removed: { color: 'rgba(255,255,255,.4)' },
}

function copyFor(lang: string): TeamCopy {
  return COPY[lang] || COPY.en
}

export default function TeamPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)
const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notAllowed, setNotAllowed] = useState(false)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [adding, setAdding] = useState(false)

  // Inline row editing + fast delete confirmation.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftRole, setDraftRole] = useState<'admin' | 'member'>('member')
  const [draftStatus, setDraftStatus] = useState<'active' | 'removed'>('active')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/team', { cache: 'no-store' })

      if (res.status === 403 || res.status === 401) {
        setNotAllowed(true)
        setLoading(false)
        return
      }

      const data = await res.json()

      if (!res.ok) setError(data?.error || copy.loadError)

      setMembers(Array.isArray(data.members) ? data.members : [])
    } catch {
      setError(copy.genericLoadError)
    } finally {
      setLoading(false)
    }
  }, [copy.genericLoadError, copy.loadError])

  useEffect(() => {
    load()
  }, [load])

  async function addMember() {
    if (!email.trim() || adding) return

    setAdding(true)
    setError('')

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.error || copy.addError)
        setAdding(false)
        return
      }

      setEmail('')
      setRole('member')
      await load()
    } catch {
      setError(copy.addGenericError)
    } finally {
      setAdding(false)
    }
  }

  function startEdit(member: Member) {
    setConfirmingId(null)
    setEditingId(member.id)
    setDraftRole(member.role === 'admin' ? 'admin' : 'member')
    setDraftStatus(member.status === 'active' ? 'active' : 'removed')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    setBusyId(id)
    setError('')
    const res = await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role: draftRole, status: draftStatus }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error || copy.loadError)
    }
    setEditingId(null)
    setBusyId(null)
    await load()
  }

  function askDelete(id: string) {
    setEditingId(null)
    setConfirmingId(id)
  }

  function cancelDelete() {
    setConfirmingId(null)
  }

  async function confirmDeleteMember(id: string) {
    setBusyId(id)
    setError('')
    const res = await fetch(`/api/team?id=${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error || copy.loadError)
    }
    setConfirmingId(null)
    setBusyId(null)
    await load()
  }

  if (notAllowed) {
    return (
      <main style={{ padding: 24, color: '#fff', maxWidth: 720, margin: '0 auto' }}>
        <div className="sb-card" style={{ padding: 28, textAlign: 'center' }}>
          <h1 className="sb-h3" style={{ marginTop: 0 }}>{copy.notAllowedTitle}</h1>
          <p className="sb-body" style={{ margin: 0 }}>{copy.notAllowedBody}</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, color: '#fff', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <span className="sb-eyebrow">{copy.account}</span>
        <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 2 }}>{copy.title}</h1>
        <p className="sb-body" style={{ margin: 0 }}>{copy.subtitle}</p>
      </div>

      {error && <p className="sb-caption" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}

      <section className="sb-card" style={{ padding: 20, marginBottom: 22 }}>
        <h2 className="sb-h3" style={{ marginTop: 0 }}>{copy.addTitle}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, alignItems: 'center' }}>
          <input
            className="sb-input"
            style={{ padding: 12 }}
            type="email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addMember()
            }}
          />

          <select
            className="sb-input"
            style={{ padding: 12 }}
            value={role}
            onChange={(event) => setRole(event.target.value as 'admin' | 'member')}
          >
            <option value="member">{copy.roles.member.label}</option>
            <option value="admin">{copy.roles.admin.label}</option>
          </select>

          <button
            onClick={addMember}
            disabled={adding || !email.trim()}
            className="sb-button-primary"
            style={{ opacity: adding || !email.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            {adding ? copy.adding : copy.add}
          </button>
        </div>

        <p className="sb-caption" style={{ marginTop: 10 }}>{copy.roles[role]?.desc}</p>
      </section>

      {loading && <p className="sb-body">{copy.loading}</p>}

      {!loading && (
        <div style={{ display: 'grid', gap: 12 }}>
          {members.length === 0 && (
            <div className="sb-card" style={{ padding: 24, textAlign: 'center' }}>
              <p className="sb-body" style={{ margin: 0 }}>{copy.empty}</p>
            </div>
          )}

          {members.map((member) => {
            const roleStyle = ROLE_STYLE[member.role] || ROLE_STYLE.member
            const statusStyle = STATUS_STYLE[member.status] || STATUS_STYLE.pending
            const roleCopy = copy.roles[member.role] || copy.roles.member
            const statusLabel = copy.statuses[member.status] || member.status
            const isOwnerRow = member.role === 'owner'
            const isEditing = editingId === member.id
            const isConfirming = confirmingId === member.id
            const isBusy = busyId === member.id

            const editSelect = { fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: '#fff', border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer' } as const
            const opt = { background: '#0f1117' } as const
            const ghost = { background: 'transparent', border: '1px solid rgba(255,255,255,.18)', color: 'rgba(255,255,255,.8)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700 } as const

            return (
              <article
                key={member.id}
                className="sb-card"
                style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: '#fff' }}>{member.member_email}</strong>
                    {!isEditing && (
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 999, background: roleStyle.bg, color: roleStyle.color }}>
                        {roleCopy.label}
                      </span>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="sb-caption" style={{ marginTop: 4, color: statusStyle.color }}>
                      {statusLabel}
                    </div>
                  )}
                </div>

                {isOwnerRow ? (
                  <span className="sb-caption" style={{ opacity: 0.6 }}>{copy.thatsYou}</span>
                ) : isEditing ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={draftRole} onChange={(e) => setDraftRole(e.target.value as 'admin' | 'member')} style={editSelect}>
                      <option value="member" style={opt}>{copy.roles.member.label}</option>
                      <option value="admin" style={opt}>{copy.roles.admin.label}</option>
                    </select>
                    <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as 'active' | 'removed')} style={editSelect}>
                      <option value="active" style={opt}>{copy.statuses.active}</option>
                      <option value="removed" style={opt}>{copy.statuses.removed}</option>
                    </select>
                    <button onClick={() => saveEdit(member.id)} disabled={isBusy} className="sb-button-primary" style={{ padding: '6px 14px', opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>{copy.save}</button>
                    <button onClick={cancelEdit} disabled={isBusy} style={ghost}>{copy.cancel}</button>
                  </div>
                ) : isConfirming ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="sb-caption" style={{ color: '#fca5a5', whiteSpace: 'nowrap' }}>{copy.deleteConfirm}</span>
                    <button onClick={() => confirmDeleteMember(member.id)} disabled={isBusy} style={{ background: 'rgba(252,165,165,.16)', border: '1px solid rgba(252,165,165,.45)', color: '#fca5a5', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 800, opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>{copy.confirmDelete}</button>
                    <button onClick={cancelDelete} disabled={isBusy} style={ghost}>{copy.cancel}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => startEdit(member)} style={{ background: 'transparent', border: '1px solid rgba(26,240,255,.35)', color: '#1af0ff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>{copy.edit}</button>
                    <button onClick={() => askDelete(member.id)} title={copy.removeTitle} style={{ background: 'transparent', border: '1px solid rgba(252,165,165,.3)', color: '#fca5a5', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>{copy.remove}</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <section className="sb-card" style={{ padding: 18, marginTop: 22 }}>
        <h3 className="sb-h3" style={{ marginTop: 0, fontSize: 15 }}>{copy.howRolesWork}</h3>

        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'rgba(255,255,255,.75)', fontSize: 13, lineHeight: 1.7 }}>
          <li><strong style={{ color: ROLE_STYLE.owner.color }}>{copy.roles.owner.label}</strong> — {copy.ownerRule}</li>
          <li><strong style={{ color: ROLE_STYLE.admin.color }}>{copy.roles.admin.label}</strong> — {copy.adminRule}</li>
          <li><strong style={{ color: ROLE_STYLE.member.color }}>{copy.roles.member.label}</strong> — {copy.memberRule}</li>
        </ul>

        <p className="sb-caption" style={{ marginTop: 12 }}>{copy.pendingNote}</p>
      </section>
    </main>
  )
}
