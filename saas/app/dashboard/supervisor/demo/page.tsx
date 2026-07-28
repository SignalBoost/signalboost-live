// saas/app/dashboard/supervisor/demo/page.tsx
//
// THE DEMO PAGE — one screen a prospect can watch.
//
// It invents nothing. Every value on this page is read from the same
// SupabaseVercelHealthStore the operator console reads, for a real repair run against
// this deployment's own production. The page's only job is to put those values in the
// order the product actually works in, with a sentence of context each, so someone who
// has never seen the console can follow it.
//
// WHEN THERE IS NOTHING TO SHOW IT SAYS SO. A demo that fabricates a run to look good
// is the one thing that cannot be allowed here: the buyer is being asked to trust an
// audit trail, and a staged trail poisons the whole proposition. No runs means an empty
// state and an instruction for how to produce one.
//
// The licence state is shown deliberately. An unlicensed deployment refuses to plan or
// dispatch, and a prospect watching a refusal should be told that is the licence working
// rather than the product failing.

import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import DemoRehearsal from '@/components/supervisor/DemoRehearsal'
import { SupabaseVercelHealthStore } from '@/lib/supervisor/providers/vercel'
import { getSupervisorEntitlement } from '@/self-healing-host/supervisor-entitlement'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type DemoCopy = {
  kicker: string
  title: string
  subtitle: string
  adminOnly: string
  licenceInstalled: string
  licenceMissing: string
  licenceNote: string
  productionTitle: string
  productionNote: string
  emptyTitle: string
  emptyBody: string
  runLabel: string
  stageLabels: string[]
  stageBodies: string[]
  fields: Record<string, string>
  none: string
  auditTitle: string
  auditNote: string
  evidenceTitle: string
  closing: string
}

const COPY: Record<Language, DemoCopy> = {
  en: {
    kicker: 'Live run',
    title: 'Self-Healing Supervisor',
    subtitle: 'A real repair run against this deployment. Every value below is read from the audit store, not staged for this page.',
    adminOnly: 'This page is available to administrators.',
    licenceInstalled: 'Licence installed — planning and dispatch are enabled.',
    licenceMissing: 'No licence installed. Incidents are received and recorded, but not diagnosed.',
    licenceNote: 'The gate is fail-closed by design. An unlicensed deployment does not quietly behave like a licensed one.',
    productionTitle: 'Production repair history',
    productionNote: 'Below is a real repair run against this deployment\u2019s own production. Unlike the rehearsal above, it cannot be triggered on demand \u2014 it appears only after a genuine failure has been detected and processed.',
    emptyTitle: 'No repair run has been observed yet',
    emptyBody: 'Nothing is shown here until a real deployment failure has been detected and processed. This page will not invent one.',
    runLabel: 'Run',
    stageLabels: ['Detected', 'Diagnosed', 'Gated', 'Executed', 'Verified', 'Audited'],
    stageBodies: [
      'A failure was observed in production without anyone reporting it.',
      'The supervisor produced a repair plan with verification steps, rather than a guess.',
      'Consequential steps stop for a named human. There is no edition in which they do not.',
      'Only the steps a human approved were carried out.',
      'The result was checked against the verification steps in the plan, not assumed.',
      'Every step above left a record. This is the trail your SIEM receives.',
    ],
    fields: {
      status: 'Status', project: 'Project', environment: 'Environment', deployment: 'Deployment',
      errorCode: 'Error code', severity: 'Severity', plan: 'Plan', channel: 'Channel',
      approvedSteps: 'Approved steps', verification: 'Verification', comparison: 'Comparison',
    },
    none: 'none',
    auditTitle: 'Audit trail',
    auditNote: 'Ordered as it happened. This is a convenience view; the record of account is what reaches your SIEM.',
    evidenceTitle: 'Evidence',
    closing: 'Nothing on this page required a person to be watching when the failure happened.',
  },
  es: {
    kicker: 'Ejecución real',
    title: 'Supervisor de Autorreparación',
    subtitle: 'Una reparación real en este despliegue. Cada valor procede del registro de auditoría, no está preparado para esta página.',
    adminOnly: 'Esta página está disponible para administradores.',
    licenceInstalled: 'Licencia instalada: planificación y ejecución habilitadas.',
    licenceMissing: 'Sin licencia instalada. Los incidentes se reciben y registran, pero no se diagnostican.',
    licenceNote: 'La comprobación falla de forma cerrada por diseño. Un despliegue sin licencia no se comporta discretamente como uno con licencia.',
    productionTitle: 'Historial de reparaciones en producción',
    productionNote: 'A continuación se muestra una reparación real en la producción de este despliegue. A diferencia del ensayo anterior, no puede activarse a voluntad: solo aparece tras detectarse y procesarse un fallo genuino.',
    emptyTitle: 'Todavía no se ha observado ninguna reparación',
    emptyBody: 'Aquí no se muestra nada hasta que se detecte y procese un fallo real de despliegue. Esta página no inventará uno.',
    runLabel: 'Ejecución',
    stageLabels: ['Detectado', 'Diagnosticado', 'Con aprobación', 'Ejecutado', 'Verificado', 'Auditado'],
    stageBodies: [
      'Se observó un fallo en producción sin que nadie lo reportara.',
      'El supervisor generó un plan de reparación con pasos de verificación, no una suposición.',
      'Los pasos consecuentes se detienen ante una persona designada. No existe edición en la que no lo hagan.',
      'Solo se ejecutaron los pasos que una persona aprobó.',
      'El resultado se comprobó contra los pasos de verificación del plan, no se dio por supuesto.',
      'Cada paso anterior dejó un registro. Este es el rastro que recibe su SIEM.',
    ],
    fields: {
      status: 'Estado', project: 'Proyecto', environment: 'Entorno', deployment: 'Despliegue',
      errorCode: 'Código de error', severity: 'Severidad', plan: 'Plan', channel: 'Canal',
      approvedSteps: 'Pasos aprobados', verification: 'Verificación', comparison: 'Comparación',
    },
    none: 'ninguno',
    auditTitle: 'Registro de auditoría',
    auditNote: 'En el orden en que ocurrió. Es una vista de conveniencia; el registro de referencia es el que llega a su SIEM.',
    evidenceTitle: 'Evidencia',
    closing: 'Nada de esta página requirió que alguien estuviera vigilando cuando ocurrió el fallo.',
  },
  pt: {
    kicker: 'Execução real',
    title: 'Supervisor de Autorreparação',
    subtitle: 'Uma reparação real neste ambiente. Cada valor vem do registo de auditoria, não foi preparado para esta página.',
    adminOnly: 'Esta página está disponível para administradores.',
    licenceInstalled: 'Licença instalada — planeamento e execução ativos.',
    licenceMissing: 'Sem licença instalada. Os incidentes são recebidos e registados, mas não diagnosticados.',
    licenceNote: 'A verificação falha de forma fechada por desenho. Um ambiente sem licença não se comporta discretamente como um licenciado.',
    productionTitle: 'Histórico de reparações em produção',
    productionNote: 'Abaixo está uma reparação real na produção deste ambiente. Ao contrário do ensaio acima, não pode ser acionada a pedido: só aparece depois de uma falha genuína ser detetada e processada.',
    emptyTitle: 'Ainda não foi observada nenhuma reparação',
    emptyBody: 'Nada é mostrado aqui até que uma falha real de implantação seja detetada e processada. Esta página não inventará uma.',
    runLabel: 'Execução',
    stageLabels: ['Detetado', 'Diagnosticado', 'Com aprovação', 'Executado', 'Verificado', 'Auditado'],
    stageBodies: [
      'Uma falha foi observada em produção sem que ninguém a reportasse.',
      'O supervisor produziu um plano de reparação com passos de verificação, não um palpite.',
      'Passos consequentes param perante uma pessoa designada. Não há edição em que não parem.',
      'Apenas os passos aprovados por uma pessoa foram executados.',
      'O resultado foi verificado face aos passos do plano, não presumido.',
      'Cada passo acima deixou registo. Este é o rasto que o seu SIEM recebe.',
    ],
    fields: {
      status: 'Estado', project: 'Projeto', environment: 'Ambiente', deployment: 'Implantação',
      errorCode: 'Código de erro', severity: 'Severidade', plan: 'Plano', channel: 'Canal',
      approvedSteps: 'Passos aprovados', verification: 'Verificação', comparison: 'Comparação',
    },
    none: 'nenhum',
    auditTitle: 'Registo de auditoria',
    auditNote: 'Pela ordem em que aconteceu. É uma vista de conveniência; o registo de referência é o que chega ao seu SIEM.',
    evidenceTitle: 'Evidência',
    closing: 'Nada nesta página exigiu que alguém estivesse a observar quando a falha ocorreu.',
  },
  pl: {
    kicker: 'Rzeczywisty przebieg',
    title: 'Nadzorca Samonaprawy',
    subtitle: 'Rzeczywista naprawa w tym wdrożeniu. Każda wartość pochodzi z rejestru audytu, nie została przygotowana na potrzeby tej strony.',
    adminOnly: 'Ta strona jest dostępna dla administratorów.',
    licenceInstalled: 'Licencja zainstalowana — planowanie i wykonanie są włączone.',
    licenceMissing: 'Brak zainstalowanej licencji. Incydenty są odbierane i zapisywane, ale nie diagnozowane.',
    licenceNote: 'Kontrola domyślnie odmawia. Wdrożenie bez licencji nie zachowuje się po cichu jak licencjonowane.',
    productionTitle: 'Historia napraw na produkcji',
    productionNote: 'Poniżej znajduje się rzeczywista naprawa na produkcji tego wdrożenia. W odróżnieniu od powyższej próby nie da się jej uruchomić na żądanie — pojawia się dopiero po wykryciu i przetworzeniu prawdziwej awarii.',
    emptyTitle: 'Nie zaobserwowano jeszcze żadnej naprawy',
    emptyBody: 'Nic nie zostanie tu pokazane, dopóki nie zostanie wykryta i przetworzona rzeczywista awaria wdrożenia. Ta strona jej nie wymyśli.',
    runLabel: 'Przebieg',
    stageLabels: ['Wykryto', 'Zdiagnozowano', 'Zatwierdzenie', 'Wykonano', 'Zweryfikowano', 'Zapisano'],
    stageBodies: [
      'Awaria została zauważona na produkcji, zanim ktokolwiek ją zgłosił.',
      'Nadzorca przygotował plan naprawy z krokami weryfikacji, a nie domysł.',
      'Kroki o istotnych skutkach zatrzymują się przed wskazaną osobą. Nie ma edycji, w której jest inaczej.',
      'Wykonano wyłącznie kroki zatwierdzone przez człowieka.',
      'Wynik sprawdzono względem kroków weryfikacji z planu, a nie założono.',
      'Każdy powyższy krok zostawił zapis. To ślad, który trafia do Twojego SIEM.',
    ],
    fields: {
      status: 'Stan', project: 'Projekt', environment: 'Środowisko', deployment: 'Wdrożenie',
      errorCode: 'Kod błędu', severity: 'Waga', plan: 'Plan', channel: 'Kanał',
      approvedSteps: 'Zatwierdzone kroki', verification: 'Weryfikacja', comparison: 'Porównanie',
    },
    none: 'brak',
    auditTitle: 'Ślad audytowy',
    auditNote: 'W kolejności zdarzeń. To widok pomocniczy; zapisem wiążącym jest ten, który trafia do Twojego SIEM.',
    evidenceTitle: 'Dowody',
    closing: 'Nic na tej stronie nie wymagało, by ktoś patrzył w chwili awarii.',
  },
  ru: {
    kicker: 'Реальный запуск',
    title: 'Супервизор самовосстановления',
    subtitle: 'Реальное восстановление в этом развёртывании. Каждое значение взято из журнала аудита, а не подготовлено для этой страницы.',
    adminOnly: 'Эта страница доступна администраторам.',
    licenceInstalled: 'Лицензия установлена — планирование и выполнение включены.',
    licenceMissing: 'Лицензия не установлена. Инциденты принимаются и записываются, но не диагностируются.',
    licenceNote: 'Проверка по умолчанию запрещает. Развёртывание без лицензии не ведёт себя незаметно так же, как лицензированное.',
    productionTitle: 'История восстановлений в продакшене',
    productionNote: 'Ниже — реальное восстановление в продакшене этого развёртывания. В отличие от репетиции выше, его нельзя запустить по требованию: оно появляется только после того, как настоящий сбой был обнаружен и обработан.',
    emptyTitle: 'Восстановлений пока не наблюдалось',
    emptyBody: 'Здесь ничего не отображается, пока не обнаружен и не обработан реальный сбой развёртывания. Эта страница его не выдумает.',
    runLabel: 'Запуск',
    stageLabels: ['Обнаружено', 'Диагностировано', 'Согласование', 'Выполнено', 'Проверено', 'Зафиксировано'],
    stageBodies: [
      'Сбой в продакшене был замечен до того, как о нём кто-либо сообщил.',
      'Супервизор построил план восстановления с шагами проверки, а не догадку.',
      'Значимые шаги останавливаются перед назначенным человеком. Нет редакции, где это не так.',
      'Выполнены только те шаги, которые одобрил человек.',
      'Результат сверен с шагами проверки из плана, а не принят на веру.',
      'Каждый шаг выше оставил запись. Это тот след, который получает ваша SIEM.',
    ],
    fields: {
      status: 'Статус', project: 'Проект', environment: 'Среда', deployment: 'Развёртывание',
      errorCode: 'Код ошибки', severity: 'Важность', plan: 'План', channel: 'Канал',
      approvedSteps: 'Одобренные шаги', verification: 'Проверка', comparison: 'Сравнение',
    },
    none: 'нет',
    auditTitle: 'Журнал аудита',
    auditNote: 'В порядке событий. Это вспомогательный вид; учётной записью является та, что приходит в вашу SIEM.',
    evidenceTitle: 'Свидетельства',
    closing: 'Ничто на этой странице не потребовало, чтобы кто-то наблюдал в момент сбоя.',
  },
}

function pickLanguage(value?: string): Language {
  const short = (value || 'en').slice(0, 2).toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru'] as Language[]).includes(short as Language) ? (short as Language) : 'en'
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt style={muted}>{k}</dt>
      <dd style={{ margin: 0, wordBreak: 'break-word' }}>{v}</dd>
    </div>
  )
}

function Stage({ index, label, body, children }: { index: number; label: string; body: string; children?: ReactNode }) {
  return (
    <article style={card}>
      <div style={row}>
        <p style={kicker}>{`${index + 1} · ${label}`}</p>
      </div>
      <p style={muted}>{body}</p>
      {children}
    </article>
  )
}

export default async function SupervisorDemoPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const access = await getAccess()
  const lang = pickLanguage((await cookies()).get('sb_locale')?.value)
  const copy = COPY[lang]

  if (!access.isAdmin) {
    return (
      <main style={page}>
        <h1>{copy.title}</h1>
        <p>{copy.adminOnly}</p>
      </main>
    )
  }

  const entitlement = getSupervisorEntitlement()
  const runs = await new SupabaseVercelHealthStore(getAdminSupabase()).listRuns({ limit: 1 }).catch(() => [])
  const run = runs[0]

  return (
    <main style={page}>
      <section style={panel}>
        <p style={kicker}>{copy.kicker}</p>
        <h1>{copy.title}</h1>
        <p style={muted}>{copy.subtitle}</p>

        <p style={entitlement.configured ? notice : warn}>
          {entitlement.configured ? copy.licenceInstalled : `${copy.licenceMissing} (${entitlement.reason})`}
        </p>
        <p style={muted}>{copy.licenceNote}</p>

        <div style={{ marginTop: 20 }}>
          <DemoRehearsal lang={lang} />
        </div>

        <h2 style={{ marginBottom: 4, marginTop: 28 }}>{copy.productionTitle}</h2>
        <p style={muted}>{copy.productionNote}</p>

        {!run ? (
          <section style={card}>
            <h2>{copy.emptyTitle}</h2>
            <p style={muted}>{copy.emptyBody}</p>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
            <p style={muted}>
              {copy.runLabel} <code>{run.runId}</code>
            </p>

            <Stage index={0} label={copy.stageLabels[0]} body={copy.stageBodies[0]}>
              <dl style={grid}>
                <Field k={copy.fields.status} v={run.status} />
                <Field k={copy.fields.project} v={run.projectId} />
                <Field k={copy.fields.environment} v={run.environment} />
                <Field k={copy.fields.deployment} v={run.governance?.deploymentId || run.incident?.affectedResource || copy.none} />
                <Field k={copy.fields.errorCode} v={run.incident?.errorCode || copy.none} />
                <Field k={copy.fields.severity} v={run.incident?.severity || copy.none} />
              </dl>
            </Stage>

            <Stage index={1} label={copy.stageLabels[1]} body={copy.stageBodies[1]}>
              <dl style={grid}>
                <Field k={copy.fields.plan} v={run.plan?.planId || copy.none} />
                <Field k={copy.fields.channel} v={run.selectedChannel} />
              </dl>
            </Stage>

            <Stage index={2} label={copy.stageLabels[2]} body={copy.stageBodies[2]}>
              <dl style={grid}>
                <Field k={copy.fields.approvedSteps} v={run.approvedStepIds.join(', ') || copy.none} />
              </dl>
            </Stage>

            <Stage index={3} label={copy.stageLabels[3]} body={copy.stageBodies[3]}>
              <dl style={grid}>
                <Field k={copy.fields.comparison} v={run.comparisonStatus} />
              </dl>
            </Stage>

            <Stage index={4} label={copy.stageLabels[4]} body={copy.stageBodies[4]}>
              <dl style={grid}>
                <Field k={copy.fields.verification} v={run.verification.status} />
              </dl>
              <p style={muted}>{run.verification.summary}</p>
              {run.evidence.length > 0 && (
                <section style={subcard}>
                  <h3>{copy.evidenceTitle}</h3>
                  <ul>
                    {run.evidence.map(item => (
                      <li key={item.evidenceId}>
                        <strong>{item.kind}</strong> · <code>{item.stepId}</code> — {item.summary}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </Stage>

            <Stage index={5} label={copy.stageLabels[5]} body={copy.stageBodies[5]}>
              <h3>{copy.auditTitle}</h3>
              <ol>
                {run.auditEvents.map(event => (
                  <li key={event.eventId}>
                    <code>{event.eventType}</code> · {event.occurredAt}
                  </li>
                ))}
              </ol>
              <p style={muted}>{copy.auditNote}</p>
            </Stage>

            <p style={notice}>{copy.closing}</p>
          </div>
        )}
      </section>
    </main>
  )
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#07111f,#05070c)' }
const panel = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)' }
const card = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 18, background: 'rgba(0,0,0,.24)' }
const subcard = { border: '1px solid rgba(26,240,255,.2)', borderRadius: 14, padding: 12, background: 'rgba(26,240,255,.06)', marginTop: 12 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }
const row = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }
const muted = { color: 'rgba(255,255,255,.68)' }
const notice = { color: '#b8ffdd', fontWeight: 700 }
const warn = { color: '#ffd8a8', fontWeight: 700 }
const kicker = { color: '#1af0ff', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1 }
