import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { SupabaseExecutionRecordStore } from '@/lib/supervisor/persistence'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, {
  kicker: string
  title: string
  subtitle: string
  noRecords: string
  adminRequired: string
  colExecution: string
  colIncident: string
  colEnvironment: string
  colStatus: string
  colVerification: string
  colStarted: string
  colFinished: string
  colCheckpoint: string
  colSteps: string
  colFailure: string
  stepsCompleted: string
  sandbox: string
}> = {
  en: {
    kicker: 'Read-only sandbox audit',
    title: 'Supervisor execution history',
    subtitle: 'Durable records are sanitized audit history only. They cannot approve, replay, resume, or execute browser tasks. Paused browser sessions remain memory-only and do not survive restart.',
    noRecords: 'No sandbox execution records found.',
    adminRequired: 'Admin access required.',
    colExecution: 'Execution',
    colIncident: 'Incident / provider',
    colEnvironment: 'Environment',
    colStatus: 'Status',
    colVerification: 'Verification',
    colStarted: 'Started',
    colFinished: 'Finished',
    colCheckpoint: 'Checkpoint',
    colSteps: 'Steps',
    colFailure: 'Failure',
    stepsCompleted: 'completed',
    sandbox: 'SANDBOX',
  },
  es: {
    kicker: 'Auditoría de sandbox de solo lectura',
    title: 'Historial de ejecución del supervisor',
    subtitle: 'Los registros duraderos son solo historial de auditoría saneado. No pueden aprobar, reproducir, reanudar ni ejecutar tareas del navegador. Las sesiones de navegador pausadas permanecen solo en memoria y no sobreviven al reinicio.',
    noRecords: 'No se encontraron registros de ejecución de sandbox.',
    adminRequired: 'Se requiere acceso de administrador.',
    colExecution: 'Ejecución',
    colIncident: 'Incidente / proveedor',
    colEnvironment: 'Entorno',
    colStatus: 'Estado',
    colVerification: 'Verificación',
    colStarted: 'Iniciado',
    colFinished: 'Finalizado',
    colCheckpoint: 'Punto de control',
    colSteps: 'Pasos',
    colFailure: 'Fallo',
    stepsCompleted: 'completados',
    sandbox: 'SANDBOX',
  },
  pt: {
    kicker: 'Auditoria de sandbox somente leitura',
    title: 'Histórico de execução do supervisor',
    subtitle: 'Os registros duráveis são apenas histórico de auditoria saneado. Eles não podem aprovar, reproduzir, retomar ou executar tarefas do navegador. As sessões de navegador pausadas permanecem apenas na memória e não sobrevivem ao reinício.',
    noRecords: 'Nenhum registro de execução de sandbox encontrado.',
    adminRequired: 'Acesso de administrador necessário.',
    colExecution: 'Execução',
    colIncident: 'Incidente / provedor',
    colEnvironment: 'Ambiente',
    colStatus: 'Status',
    colVerification: 'Verificação',
    colStarted: 'Iniciado',
    colFinished: 'Finalizado',
    colCheckpoint: 'Ponto de verificação',
    colSteps: 'Etapas',
    colFailure: 'Falha',
    stepsCompleted: 'concluídas',
    sandbox: 'SANDBOX',
  },
  pl: {
    kicker: 'Audyt piaskownicy tylko do odczytu',
    title: 'Historia wykonania nadzorcy',
    subtitle: 'Trwałe rekordy to wyłącznie oczyszczona historia audytu. Nie mogą zatwierdzać, odtwarzać, wznawiać ani wykonywać zadań przeglądarki. Wstrzymane sesje przeglądarki pozostają tylko w pamięci i nie przeżywają restartu.',
    noRecords: 'Nie znaleziono rekordów wykonania piaskownicy.',
    adminRequired: 'Wymagany dostęp administratora.',
    colExecution: 'Wykonanie',
    colIncident: 'Incydent / dostawca',
    colEnvironment: 'Środowisko',
    colStatus: 'Status',
    colVerification: 'Weryfikacja',
    colStarted: 'Rozpoczęto',
    colFinished: 'Zakończono',
    colCheckpoint: 'Punkt kontrolny',
    colSteps: 'Kroki',
    colFailure: 'Błąd',
    stepsCompleted: 'ukończonych',
    sandbox: 'PIASKOWNICA',
  },
  ru: {
    kicker: 'Аудит песочницы только для чтения',
    title: 'История выполнения супервизора',
    subtitle: 'Постоянные записи — это только очищенная история аудита. Они не могут одобрять, воспроизводить, возобновлять или выполнять задачи браузера. Приостановленные сеансы браузера хранятся только в памяти и не переживают перезапуск.',
    noRecords: 'Записи выполнения песочницы не найдены.',
    adminRequired: 'Требуется доступ администратора.',
    colExecution: 'Выполнение',
    colIncident: 'Инцидент / провайдер',
    colEnvironment: 'Среда',
    colStatus: 'Статус',
    colVerification: 'Проверка',
    colStarted: 'Начато',
    colFinished: 'Завершено',
    colCheckpoint: 'Контрольная точка',
    colSteps: 'Шаги',
    colFailure: 'Сбой',
    stepsCompleted: 'завершено',
    sandbox: 'ПЕСОЧНИЦА',
  },
}

function pickLocale(v?: string): Lang {
  const l = String(v || 'en').slice(0, 2).toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(l) ? l : 'en') as Lang
}

export default async function SupervisorExecutionsPage() {
  const user = await getCurrentUser()
  const access = await getAccess()
  if (!user) redirect('/login')
  const locale = pickLocale((await cookies()).get('sb_locale')?.value)
  const c = COPY[locale]
  if (!access.isAdmin) return (
    <main style={{ padding: 32, color: '#fff' }}>
      <h1>{c.title}</h1>
      <p>{c.adminRequired}</p>
    </main>
  )
  const store = new SupabaseExecutionRecordStore(getAdminSupabase())
  const { items } = await store.listExecutions({ limit: 50, environment: 'sandbox' })
  const cols = [c.colExecution, c.colIncident, c.colEnvironment, c.colStatus, c.colVerification, c.colStarted, c.colFinished, c.colCheckpoint, c.colSteps, c.colFailure]
  return (
    <main style={{ minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#06111f,#05070c)' }}>
      <section style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <p style={{ color: '#1af0ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{c.kicker}</p>
        <h1 style={{ margin: '6px 0 12px', fontSize: 34 }}>{c.title}</h1>
        <p style={{ color: 'rgba(255,255,255,.72)', maxWidth: 920 }}>{c.subtitle}</p>
        <div style={{ overflowX: 'auto', marginTop: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                {cols.map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 10px', color: '#ffc300', borderBottom: '1px solid rgba(255,255,255,.14)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.executionId}>
                  <td style={cell}><code>{item.executionId}</code><div style={{ color: '#1af0ff', fontSize: 12 }}>{c.sandbox}</div></td>
                  <td style={cell}>{item.incidentId}<br /><span style={muted}>{item.provider}</span></td>
                  <td style={cell}>{item.targetEnvironment}<br /><span style={muted}>{item.targetOrigin}</span></td>
                  <td style={cell}>{item.status}</td>
                  <td style={cell}>{item.verificationStatus}</td>
                  <td style={cell}>{item.startedAt}</td>
                  <td style={cell}>{item.completedAt || item.failedAt || '—'}</td>
                  <td style={cell}>{item.checkpointStatus}</td>
                  <td style={cell}>{item.completedStepIds.length} {c.stepsCompleted}</td>
                  <td style={cell}>{item.sanitizedErrorMessage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? <p style={{ color: 'rgba(255,255,255,.66)' }}>{c.noRecords}</p> : null}
        </div>
      </section>
    </main>
  )
}

const cell = { padding: '12px 10px', borderBottom: '1px solid rgba(255,255,255,.08)', verticalAlign: 'top' as const, color: 'rgba(255,255,255,.88)', fontSize: 13 }
const muted = { color: 'rgba(255,255,255,.55)', fontSize: 12 }
