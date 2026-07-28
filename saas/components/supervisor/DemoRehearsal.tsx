// saas/components/supervisor/DemoRehearsal.tsx
//
// THE ON-DEMAND HALF OF THE DEMO.
//
// The demo page narrates a REAL production repair run when one exists. This component is
// what you press when you need to show the product working right now, in front of someone,
// without waiting for production to break.
//
// It runs the acceptance scenario through the existing owner-only route: one rehearsal
// incident per risk category, against this deployment's real wiring. A consequential step
// is REQUIRED to pause; if it ever executed, the run reports FAILED. The approver is
// notified through the real channel, which means real email actually arrives.
//
// IT IS LABELLED A REHEARSAL EVERYWHERE IT APPEARS, and that labelling is the whole point.
// A rehearsal shown as a rehearsal is an honest demonstration of the gating and audit path.
// The same output presented as production history would be a fabricated audit trail, which
// is the one thing that would destroy the proposition being sold. The two must never be
// allowed to look alike on screen.

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
  },
}

export default function DemoRehearsal({ lang }: { lang: Language }) {
  const copy = COPY[lang] ?? COPY.en
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [record, setRecord] = useState<AcceptanceRecord | null>(null)
  const [error, setError] = useState('')

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

  const didPass = record?.passed === true

  return (
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
  )
}

const card = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 18, background: 'rgba(0,0,0,.24)' }
const subcard = { border: '1px solid rgba(26,240,255,.2)', borderRadius: 14, padding: 12, background: 'rgba(26,240,255,.06)', marginTop: 12 }
const badgeRow = { display: 'flex', gap: 8, flexWrap: 'wrap' as const }
const badge = { border: '1px solid rgba(245,196,81,.6)', borderRadius: 999, padding: '6px 12px', color: '#f5c451', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' as const }
const button = { border: 0, borderRadius: 12, padding: '14px 20px', fontWeight: 900, fontSize: 15, color: '#07111f', background: '#f5c451' }
const muted = { color: 'rgba(255,255,255,.68)' }
const warn = { color: '#ffd8a8', fontWeight: 700 }
const alert = { color: '#ffb3c1', fontWeight: 700 }
