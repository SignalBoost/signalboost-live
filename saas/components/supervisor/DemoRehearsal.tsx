// saas/components/supervisor/DemoRehearsal.tsx
//
// THE ON-DEMAND HALF OF THE DEMO — two things a prospect can watch you press.
//
// 1. THE APPROVAL REHEARSAL runs one rehearsal incident per risk category against this
//    deployment's real wiring. A consequential step is REQUIRED to pause; if it ever
//    executed, the run reports FAILED. The approver is notified through the real channel,
//    which means real email actually arrives.
//
// 2. THE INCIDENT DRILL sends a synthetic incident through the REAL intake path — the
//    signed webhook source, real authentication, deduplication, storage, the triage
//    thinker, the policy engine, and the entitlement gate. This is the licence-gated path:
//    with no licence installed it refuses at diagnosis and says so, which is the honest
//    way to demonstrate that the gate exists.
//
// BOTH ARE LABELLED FOR WHAT THEY ARE, everywhere they appear. A rehearsal shown as a
// rehearsal and a drill shown as a drill are honest demonstrations of the gating,
// notification, diagnosis and audit paths. The same output presented as production history
// would be a fabricated audit trail, which is the one thing that would destroy the
// proposition being sold. On screen the two must never look alike.
//
// NEITHER EXECUTES A REPAIR, and the copy says so rather than leaving it to be discovered.
// This deployment configures no execution step runner, so the drill's orchestration ends
// unresolved and records why. That is disclosed behaviour, documented in the integration
// guide, not a defect to be hidden during a demo.

'use client'

import { useState } from 'react'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type Check = { id: string; title: string; passed: boolean; detail: string }
type Run = { category: string; passed: boolean; checks: Check[]; auditEventTypes: string[]; notificationCount?: number; summary: string }
type AcceptanceRecord = {
  ok?: boolean
  passed?: boolean
  ranAt?: string
  productName?: string
  runs?: Run[]
  blocking?: string[]
  meaning?: string
  error?: string
  remedy?: string
}

type DrillRecord = {
  ok?: boolean
  drill?: boolean
  ranAt?: string
  licence?: { configured?: boolean; reason?: string }
  delivery?: { status?: string; incidentId?: string | null; outcome?: string | null; reason?: string | null }
  auditEventTypes?: string[]
  meaning?: string
  error?: string
  remedy?: string
}

type RehearsalCopy = {
  heading: string
  intro: string
  rehearsalBadge: string
  rehearsalNote: string
  runButton: string
  runningButton: string
  runningNote: string
  requestFailed: string
  didNotComplete: string
  notRun: string
  passed: string
  failed: string
  pass: string
  fail: string
  auditEvents: string
  notifications: string
  ranAtLabel: string
  drillHeading: string
  drillIntro: string
  drillBadge: string
  drillNote: string
  drillButton: string
  drillRunningButton: string
  drillRunningNote: string
  deliveryLabel: string
  incidentLabel: string
  outcomeLabel: string
  licenceLabel: string
  licenceOk: string
  licenceMissing: string
}

const COPY: Record<Language, RehearsalCopy> = {
  en: {
    heading: 'Run a rehearsal now',
    intro: "Runs one rehearsal incident per risk category against this deployment's real wiring. A safe step executes, a consequential step must pause, the approver is notified through the real channel, and an audit trail is produced. Nothing consequential can execute — the dangerous step is required to pause.",
    rehearsalBadge: 'Rehearsal',
    rehearsalNote: 'This is a rehearsal, not a production repair. It proves the gating, notification and audit path work here. It is not evidence that a real incident was fixed.',
    runButton: 'Run rehearsal',
    runningButton: 'Running all three categories…',
    runningNote: 'Real notifications are being sent. This takes a few seconds.',
    requestFailed: 'Request failed',
    didNotComplete: 'The request did not complete',
    notRun: 'Not run',
    passed: 'Passed',
    failed: 'Failed',
    pass: 'PASS',
    fail: 'FAIL',
    auditEvents: 'Audit events',
    notifications: 'Notifications sent',
    ranAtLabel: 'Run at',
    drillHeading: 'Raise a drill incident',
    drillIntro: 'Sends a synthetic incident through the same path a monitoring alert takes: signed webhook, authentication, deduplication, storage, triage, and the policy engine. Nothing is stubbed and nothing is bypassed.',
    drillBadge: 'Drill',
    drillNote: 'No repair is executed. This deployment configures no execution step runner, so the run ends unresolved and records why, rather than claiming a fix that did not happen.',
    drillButton: 'Raise drill incident',
    drillRunningButton: 'Delivering…',
    drillRunningNote: 'The incident is being authenticated, stored and diagnosed.',
    deliveryLabel: 'Delivery',
    incidentLabel: 'Incident',
    outcomeLabel: 'Outcome',
    licenceLabel: 'Licence',
    licenceOk: 'installed',
    licenceMissing: 'not installed — diagnosis refuses',
  },
  es: {
    heading: 'Ejecutar un ensayo ahora',
    intro: 'Ejecuta un incidente de ensayo por cada categoría de riesgo contra el cableado real de este despliegue. Un paso seguro se ejecuta, un paso consecuente debe detenerse, la persona aprobadora recibe aviso por el canal real y se produce un registro de auditoría. Nada consecuente puede ejecutarse: el paso peligroso está obligado a detenerse.',
    rehearsalBadge: 'Ensayo',
    rehearsalNote: 'Esto es un ensayo, no una reparación en producción. Demuestra que la aprobación, el aviso y la auditoría funcionan aquí. No es prueba de que se haya resuelto un incidente real.',
    runButton: 'Ejecutar ensayo',
    runningButton: 'Ejecutando las tres categorías…',
    runningNote: 'Se están enviando avisos reales. Tarda unos segundos.',
    requestFailed: 'La solicitud falló',
    didNotComplete: 'La solicitud no se completó',
    notRun: 'No ejecutado',
    passed: 'Superado',
    failed: 'Fallido',
    pass: 'CORRECTO',
    fail: 'FALLO',
    auditEvents: 'Eventos de auditoría',
    notifications: 'Avisos enviados',
    ranAtLabel: 'Ejecutado el',
    drillHeading: 'Generar un incidente de prueba',
    drillIntro: 'Envía un incidente sintético por la misma ruta que sigue una alerta de monitorización: webhook firmado, autenticación, deduplicación, almacenamiento, triaje y motor de políticas. Nada está simulado ni se omite.',
    drillBadge: 'Prueba',
    drillNote: 'No se ejecuta ninguna reparación. Este despliegue no configura ningún ejecutor de pasos, por lo que la ejecución termina sin resolver y registra el motivo, en lugar de afirmar una corrección que no ocurrió.',
    drillButton: 'Generar incidente de prueba',
    drillRunningButton: 'Entregando…',
    drillRunningNote: 'El incidente se está autenticando, almacenando y diagnosticando.',
    deliveryLabel: 'Entrega',
    incidentLabel: 'Incidente',
    outcomeLabel: 'Resultado',
    licenceLabel: 'Licencia',
    licenceOk: 'instalada',
    licenceMissing: 'no instalada: el diagnóstico se rechaza',
  },
  pt: {
    heading: 'Executar um ensaio agora',
    intro: 'Executa um incidente de ensaio por categoria de risco contra a ligação real deste ambiente. Um passo seguro é executado, um passo consequente tem de parar, o aprovador é avisado pelo canal real e é produzido um registo de auditoria. Nada de consequente pode ser executado: o passo perigoso é obrigado a parar.',
    rehearsalBadge: 'Ensaio',
    rehearsalNote: 'Isto é um ensaio, não uma reparação em produção. Prova que a aprovação, o aviso e a auditoria funcionam aqui. Não é prova de que um incidente real foi resolvido.',
    runButton: 'Executar ensaio',
    runningButton: 'A executar as três categorias…',
    runningNote: 'Estão a ser enviados avisos reais. Demora alguns segundos.',
    requestFailed: 'O pedido falhou',
    didNotComplete: 'O pedido não foi concluído',
    notRun: 'Não executado',
    passed: 'Aprovado',
    failed: 'Reprovado',
    pass: 'OK',
    fail: 'FALHA',
    auditEvents: 'Eventos de auditoria',
    notifications: 'Avisos enviados',
    ranAtLabel: 'Executado em',
    drillHeading: 'Levantar um incidente de treino',
    drillIntro: 'Envia um incidente sintético pelo mesmo caminho de um alerta de monitorização: webhook assinado, autenticação, deduplicação, armazenamento, triagem e motor de políticas. Nada é simulado nem contornado.',
    drillBadge: 'Treino',
    drillNote: 'Nenhuma reparação é executada. Este ambiente não configura um executor de passos, por isso a execução termina por resolver e regista o motivo, em vez de alegar uma correção que não aconteceu.',
    drillButton: 'Levantar incidente de treino',
    drillRunningButton: 'A entregar…',
    drillRunningNote: 'O incidente está a ser autenticado, armazenado e diagnosticado.',
    deliveryLabel: 'Entrega',
    incidentLabel: 'Incidente',
    outcomeLabel: 'Resultado',
    licenceLabel: 'Licença',
    licenceOk: 'instalada',
    licenceMissing: 'não instalada — o diagnóstico é recusado',
  },
  pl: {
    heading: 'Uruchom próbę teraz',
    intro: 'Uruchamia jeden próbny incydent dla każdej kategorii ryzyka na rzeczywistej konfiguracji tego wdrożenia. Bezpieczny krok zostaje wykonany, krok o istotnych skutkach musi się zatrzymać, osoba zatwierdzająca otrzymuje powiadomienie prawdziwym kanałem, a ślad audytowy zostaje zapisany. Nic istotnego nie może się wykonać — niebezpieczny krok musi się zatrzymać.',
    rehearsalBadge: 'Próba',
    rehearsalNote: 'To jest próba, a nie naprawa na produkcji. Dowodzi, że zatwierdzanie, powiadomienia i audyt działają tutaj. Nie jest dowodem, że rzeczywisty incydent został naprawiony.',
    runButton: 'Uruchom próbę',
    runningButton: 'Trwa wykonywanie trzech kategorii…',
    runningNote: 'Wysyłane są prawdziwe powiadomienia. Zajmuje to kilka sekund.',
    requestFailed: 'Żądanie nie powiodło się',
    didNotComplete: 'Żądanie nie zostało ukończone',
    notRun: 'Nie uruchomiono',
    passed: 'Zaliczone',
    failed: 'Niezaliczone',
    pass: 'OK',
    fail: 'BŁĄD',
    auditEvents: 'Zdarzenia audytowe',
    notifications: 'Wysłane powiadomienia',
    ranAtLabel: 'Uruchomiono',
    drillHeading: 'Zgłoś incydent ćwiczebny',
    drillIntro: 'Wysyła syntetyczny incydent tą samą drogą co alert z monitoringu: podpisany webhook, uwierzytelnienie, deduplikacja, zapis, triaż i silnik polityk. Nic nie jest zasymulowane ani pominięte.',
    drillBadge: 'Ćwiczenie',
    drillNote: 'Żadna naprawa nie zostaje wykonana. To wdrożenie nie konfiguruje modułu wykonawczego, więc przebieg kończy się bez rozwiązania i zapisuje powód, zamiast twierdzić, że coś naprawiono.',
    drillButton: 'Zgłoś incydent ćwiczebny',
    drillRunningButton: 'Dostarczanie…',
    drillRunningNote: 'Incydent jest uwierzytelniany, zapisywany i diagnozowany.',
    deliveryLabel: 'Dostarczenie',
    incidentLabel: 'Incydent',
    outcomeLabel: 'Wynik',
    licenceLabel: 'Licencja',
    licenceOk: 'zainstalowana',
    licenceMissing: 'brak — diagnoza jest odrzucana',
  },
  ru: {
    heading: 'Запустить репетицию сейчас',
    intro: 'Запускает по одному репетиционному инциденту на каждую категорию риска на реальной конфигурации этого развёртывания. Безопасный шаг выполняется, значимый шаг обязан остановиться, согласующий получает уведомление по реальному каналу, и формируется журнал аудита. Ничего значимого выполниться не может — опасный шаг обязан остановиться.',
    rehearsalBadge: 'Репетиция',
    rehearsalNote: 'Это репетиция, а не восстановление в продакшене. Она доказывает, что согласование, уведомление и аудит здесь работают. Она не является доказательством того, что реальный инцидент был устранён.',
    runButton: 'Запустить репетицию',
    runningButton: 'Выполняются все три категории…',
    runningNote: 'Отправляются реальные уведомления. Это занимает несколько секунд.',
    requestFailed: 'Запрос не выполнен',
    didNotComplete: 'Запрос не был завершён',
    notRun: 'Не запускалось',
    passed: 'Пройдено',
    failed: 'Не пройдено',
    pass: 'ОК',
    fail: 'СБОЙ',
    auditEvents: 'События аудита',
    notifications: 'Отправлено уведомлений',
    ranAtLabel: 'Запущено',
    drillHeading: 'Создать учебный инцидент',
    drillIntro: 'Отправляет синтетический инцидент по тому же пути, что и реальное оповещение мониторинга: подписанный вебхук, аутентификация, дедупликация, хранение, триаж и движок политик. Ничего не заглушено и не обойдено.',
    drillBadge: 'Учение',
    drillNote: 'Восстановление не выполняется. В этом развёртывании не настроен исполнитель шагов, поэтому запуск завершается без решения и записывает причину, а не заявляет об исправлении, которого не было.',
    drillButton: 'Создать учебный инцидент',
    drillRunningButton: 'Доставка…',
    drillRunningNote: 'Инцидент аутентифицируется, сохраняется и диагностируется.',
    deliveryLabel: 'Доставка',
    incidentLabel: 'Инцидент',
    outcomeLabel: 'Итог',
    licenceLabel: 'Лицензия',
    licenceOk: 'установлена',
    licenceMissing: 'не установлена — в диагностике отказано',
  },
}

export default function DemoRehearsal({ lang }: { lang: Language }) {
  const copy = COPY[lang] ?? COPY.en

  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [record, setRecord] = useState<AcceptanceRecord | null>(null)
  const [error, setError] = useState('')

  const [drillState, setDrillState] = useState<'idle' | 'running' | 'done'>('idle')
  const [drill, setDrill] = useState<DrillRecord | null>(null)
  const [drillError, setDrillError] = useState('')

  async function run() {
    if (state === 'running') return
    setState('running')
    setError('')
    setRecord(null)
    try {
      const response = await fetch('/api/autonomous-supervisor/acceptance', { method: 'POST' })
      const payload = (await response.json()) as AcceptanceRecord
      setRecord(payload)
      // A 409 is a real answer — a failed check, or a host context that could not be built.
      // Only a missing payload is a transport problem.
      if (!response.ok && !payload) setError(`${copy.requestFailed} (${response.status})`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.didNotComplete)
    } finally {
      setState('done')
    }
  }

  async function raiseDrill() {
    if (drillState === 'running') return
    setDrillState('running')
    setDrillError('')
    setDrill(null)
    try {
      const response = await fetch('/api/supervisor/demo/incident', { method: 'POST' })
      const payload = (await response.json()) as DrillRecord
      setDrill(payload)
      if (!response.ok && !payload) setDrillError(`${copy.requestFailed} (${response.status})`)
    } catch (cause) {
      setDrillError(cause instanceof Error ? cause.message : copy.didNotComplete)
    } finally {
      setDrillState('done')
    }
  }

  const didPass = record?.passed === true
  const licenceOk = drill?.licence?.configured === true

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={card}>
        <div style={badgeRow}>
          <span style={badge}>{copy.rehearsalBadge}</span>
        </div>
        <h2 style={{ margin: '8px 0' }}>{copy.heading}</h2>
        <p style={muted}>{copy.intro}</p>
        <p style={warn}>{copy.rehearsalNote}</p>

        <button type="button" onClick={run} disabled={state === 'running'} style={{ ...button, cursor: state === 'running' ? 'wait' : 'pointer' }}>
          {state === 'running' ? copy.runningButton : copy.runButton}
        </button>
        {state === 'running' ? <p style={muted}>{copy.runningNote}</p> : null}
        {error ? <p role="alert" style={alert}>{error}</p> : null}

        {record?.error ? (
          <section style={{ ...subcard, borderColor: '#ffb020' }}>
            <h3 style={{ marginTop: 0, color: '#ffcf7a' }}>{copy.notRun}</h3>
            <p>{record.error}</p>
            {record.remedy ? <p style={muted}>{record.remedy}</p> : null}
          </section>
        ) : null}

        {record?.runs?.length ? (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <section style={{ ...subcard, borderColor: didPass ? '#38f2a4' : '#ff5c7a' }}>
              <h3 style={{ marginTop: 0, color: didPass ? '#71ffc1' : '#ff8ca2' }}>{didPass ? copy.passed : copy.failed}</h3>
              {record.meaning ? <p>{record.meaning}</p> : null}
              {record.blocking?.length ? (
                <ul>
                  {record.blocking.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <p style={muted}>
                {copy.ranAtLabel} {record.ranAt}
              </p>
            </section>

            {record.runs.map(item => (
              <section key={item.category} style={subcard}>
                <h3 style={{ marginTop: 0 }}>{item.category}</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {item.checks.map(check => (
                    <li key={check.id}>
                      <strong style={{ color: check.passed ? '#71ffc1' : '#ff8ca2' }}>{check.passed ? copy.pass : copy.fail}</strong>{' '}
                      {check.title}
                      <div style={muted}>{check.detail}</div>
                    </li>
                  ))}
                </ul>
                <p style={muted}>
                  {copy.auditEvents}: {item.auditEventTypes.join(', ')}
                </p>
                {typeof item.notificationCount === 'number' ? (
                  <p style={muted}>
                    {copy.notifications}: {item.notificationCount}
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        ) : null}
      </section>

      <section style={card}>
        <div style={badgeRow}>
          <span style={badge}>{copy.drillBadge}</span>
        </div>
        <h2 style={{ margin: '8px 0' }}>{copy.drillHeading}</h2>
        <p style={muted}>{copy.drillIntro}</p>
        <p style={warn}>{copy.drillNote}</p>

        <button type="button" onClick={raiseDrill} disabled={drillState === 'running'} style={{ ...button, cursor: drillState === 'running' ? 'wait' : 'pointer' }}>
          {drillState === 'running' ? copy.drillRunningButton : copy.drillButton}
        </button>
        {drillState === 'running' ? <p style={muted}>{copy.drillRunningNote}</p> : null}
        {drillError ? <p role="alert" style={alert}>{drillError}</p> : null}

        {drill?.error ? (
          <section style={{ ...subcard, borderColor: '#ffb020' }}>
            <h3 style={{ marginTop: 0, color: '#ffcf7a' }}>{copy.notRun}</h3>
            <p>{drill.error}</p>
            {drill.remedy ? <p style={muted}>{drill.remedy}</p> : null}
          </section>
        ) : null}

        {drill?.delivery ? (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <section style={subcard}>
              <dl style={grid}>
                <div>
                  <dt style={muted}>{copy.deliveryLabel}</dt>
                  <dd style={dd}>{drill.delivery.status}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.incidentLabel}</dt>
                  <dd style={dd}>{drill.delivery.incidentId}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.outcomeLabel}</dt>
                  <dd style={dd}>{drill.delivery.outcome}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.licenceLabel}</dt>
                  <dd style={{ ...dd, color: licenceOk ? '#71ffc1' : '#ffd8a8' }}>
                    {licenceOk ? copy.licenceOk : `${copy.licenceMissing} (${drill.licence?.reason})`}
                  </dd>
                </div>
              </dl>
              {drill.delivery.reason ? <p style={muted}>{drill.delivery.reason}</p> : null}
            </section>

            {drill.auditEventTypes?.length ? (
              <section style={subcard}>
                <p style={muted}>
                  {copy.auditEvents}: {drill.auditEventTypes.join(', ')}
                </p>
              </section>
            ) : null}

            {drill.meaning ? <p style={muted}>{drill.meaning}</p> : null}
            <p style={muted}>
              {copy.ranAtLabel} {drill.ranAt}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}

const card = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 18, background: 'rgba(0,0,0,.24)' }
const subcard = { border: '1px solid rgba(26,240,255,.2)', borderRadius: 14, padding: 12, background: 'rgba(26,240,255,.06)', marginTop: 12 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }
const dd = { margin: 0, wordBreak: 'break-word' as const, fontWeight: 700 }
const badgeRow = { display: 'flex', gap: 8, flexWrap: 'wrap' as const }
const badge = { border: '1px solid rgba(245,196,81,.6)', borderRadius: 999, padding: '6px 12px', color: '#f5c451', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' as const }
const button = { border: 0, borderRadius: 12, padding: '14px 20px', fontWeight: 900, fontSize: 15, color: '#07111f', background: '#f5c451' }
const muted = { color: 'rgba(255,255,255,.68)' }
const warn = { color: '#ffd8a8', fontWeight: 700 }
const alert = { color: '#ffb3c1', fontWeight: 700 }
