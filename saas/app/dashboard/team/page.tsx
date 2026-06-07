'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

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
    account: 'Account',
    title: 'Team & roles',
    subtitle: 'Add people and choose what they can access. Each person signs up with the email you add here to activate.',
    notAllowedTitle: 'Team management',
    notAllowedBody: 'Only the account owner can manage the team.',
    addTitle: 'Add a team member',
    emailPlaceholder: 'name@email.com',
    add: 'Add',
    adding: 'Adding…',
    loading: 'Loading your team…',
    empty: 'No team members yet. Add someone above.',
    thatsYou: "That's you",
    remove: 'Remove',
    removeTitle: 'Remove',
    loadError: 'Could not load your team.',
    genericLoadError: 'Something went wrong loading your team.',
    addError: 'Could not add member.',
    addGenericError: 'Could not add the member.',
    howRolesWork: 'How roles work',
    ownerRule: 'everything: all tools, IT/admin pages, billing, and team management.',
    adminRule: 'system/IT pages and team management, plus the daily-work tools.',
    memberRule: 'daily-work tools only. No admin pages, no billing, no team management.',
    pendingNote: 'Adding someone reserves their seat as Pending. They become Active when they sign up with that email.',
    roles: {
      owner: { label: 'Owner', desc: 'Full access, including billing and team management.' },
      admin: { label: 'Admin (IT)', desc: 'System/IT pages and team management.' },
      member: { label: 'Member', desc: 'Daily work tools only. No admin or billing.' },
    },
    statuses: {
      pending: 'Pending — awaiting sign-up',
      active: 'Active',
      removed: 'Removed',
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

  async function changeRole(id: string, newRole: 'admin' | 'member') {
    setMembers((previous) => previous.map((member) => (member.id === id ? { ...member, role: newRole } : member)))

    await fetch('/api/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role: newRole }),
    })
  }

  async function remove(id: string) {
    setMembers((previous) => previous.filter((member) => member.id !== id))
    await fetch(`/api/team?id=${id}`, { method: 'DELETE' })
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

            return (
              <article
                key={member.id}
                className="sb-card"
                style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: '#fff' }}>{member.member_email}</strong>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 999, background: roleStyle.bg, color: roleStyle.color }}>
                      {roleCopy.label}
                    </span>
                  </div>

                  <div className="sb-caption" style={{ marginTop: 4, color: statusStyle.color }}>
                    {statusLabel}
                  </div>
                </div>

                {isOwnerRow ? (
                  <span className="sb-caption" style={{ opacity: 0.6 }}>{copy.thatsYou}</span>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={member.role}
                      onChange={(event) => changeRole(member.id, event.target.value as 'admin' | 'member')}
                      style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: '#fff', border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer' }}
                    >
                      <option value="member" style={{ background: '#0f1117' }}>{copy.roles.member.label}</option>
                      <option value="admin" style={{ background: '#0f1117' }}>{copy.roles.admin.label}</option>
                    </select>

                    <button
                      onClick={() => remove(member.id)}
                      title={copy.removeTitle}
                      style={{ background: 'transparent', border: '1px solid rgba(252,165,165,.3)', color: '#fca5a5', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
                    >
                      {copy.remove}
                    </button>
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
