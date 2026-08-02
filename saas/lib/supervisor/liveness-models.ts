// saas/lib/supervisor/liveness-models.ts
//
// "IS IT ALIVE" HAS A DIFFERENT ANSWER FOR EVERY TRIGGER MODEL.
//
// The Supervisor's health check began by asking one question — how long since the last
// heartbeat — which is only meaningful for something that runs continuously. Applied to a
// scheduled job it declared a healthy cron dead between runs. Applied to the systems
// enterprises actually run it would be worse:
//
//   a Kafka consumer idle for an hour on a quiet topic is HEALTHY
//   a webhook receiver is SUPPOSED to be silent
//   a Kubernetes controller that has reconciled nothing has nothing to reconcile
//
// Judging any of those by elapsed time reproduces the same defect on a buyer's payment
// infrastructure instead of on our cron. So the trigger model is DECLARED, and each model
// answers the liveness question in its own terms.
//
// THE RULE THAT MATTERS MOST: silence is only evidence for a puller. For a consumer, absence
// is a stalled POLL or a growing LAG, never the absence of messages. For a receiver, absence
// is unreachability, never quiet. Where a model's evidence is missing entirely, this returns
// UNVERIFIABLE rather than guessing — because "we cannot tell" reported as healthy is how a
// real outage stays invisible, and reported as absent is how an on-call engineer stops
// trusting the alarm.
//
// PURE AND NO IMPORTS, so a buyer gets the same judgement in their own deployment.

export type TriggerSource =
  | 'scheduled'   // cron, Kubernetes CronJob, Airflow — a tick
  | 'queue'       // Kafka, RabbitMQ, SQS, Service Bus, Pub/Sub — a consumer
  | 'workflow'    // Temporal, Camunda, Conductor — an orchestrator
  | 'controller'  // a Kubernetes operator's reconcile loop
  | 'webhook'     // PagerDuty, CloudWatch, ServiceNow — an external event
  | 'continuous'  // a daemon or Windows service

export type LivenessFact = {
  instanceId: string
  triggerSource: TriggerSource

  /** Grace, in multiples of whatever interval the model uses. From the observation policy. */
  stalenessMultiplier?: number | null

  // scheduled / controller / workflow
  intervalSeconds?: number | null
  lastRunAt?: string | null

  // queue
  /** When the consumer last POLLED — not when a message last arrived. */
  lastPollAt?: string | null
  /** How far behind the consumer is, in seconds, as the broker reports it. */
  consumerLagSeconds?: number | null
  maxConsumerLagSeconds?: number | null

  // webhook
  /** Whether the receiver answers. Undefined means nobody checked, which is not "healthy". */
  receiverReachable?: boolean | null

  // continuous
  lastHeartbeatAt?: string | null
  heartbeatGraceSeconds?: number | null
}

export type LivenessVerdict = {
  instanceId: string
  triggerSource: TriggerSource
  /** True only when the model's own evidence says the runtime is not doing its job. */
  absent: boolean
  /** True when the observed state is what this model is supposed to look like. */
  expected: boolean
  /** True when the evidence this model needs was not supplied. Never treated as healthy. */
  unverifiable: boolean
  /** What was actually measured, in the model's own terms. */
  detail: string
  /** The question this model asks, stated so a finding can be read without knowing the code. */
  question: string
}

const DEFAULT_MULTIPLIER = 2.5
const DEFAULT_HEARTBEAT_GRACE_SECONDS = 90

function secondsSince(now: Date, value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? Math.max(0, (now.getTime() - parsed) / 1000) : Number.POSITIVE_INFINITY
}

function minutes(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'never'
  return seconds >= 120 ? `${Math.round(seconds / 60)}m` : `${Math.round(seconds)}s`
}

function verdict(fact: LivenessFact, question: string, parts: Partial<LivenessVerdict>): LivenessVerdict {
  return {
    instanceId: fact.instanceId,
    triggerSource: fact.triggerSource,
    absent: false,
    expected: false,
    unverifiable: false,
    detail: '',
    question,
    ...parts,
  }
}

/**
 * Ask the right question for the declared model.
 *
 * Every branch names the question it asked, so a finding downstream can explain itself to an
 * operator who has never read this file — which is the person it exists for.
 */
export function evaluateLiveness(fact: LivenessFact, now: Date = new Date()): LivenessVerdict {
  const multiplier = Number(fact.stalenessMultiplier || 0) > 0 ? Number(fact.stalenessMultiplier) : DEFAULT_MULTIPLIER

  if (fact.triggerSource === 'queue') {
    const question = 'Is the consumer still polling, and is it keeping up?'
    const lag = fact.consumerLagSeconds
    const maxLag = Number(fact.maxConsumerLagSeconds || 0)
    const sincePoll = secondsSince(now, fact.lastPollAt)
    const pollWindow = Number(fact.intervalSeconds || 0) * multiplier

    if (!fact.lastPollAt && (lag === null || lag === undefined)) {
      return verdict(fact, question, {
        unverifiable: true,
        detail: 'Neither a last-poll time nor a consumer lag was supplied. Message silence is not evidence either way on a queue.',
      })
    }
    if (maxLag > 0 && Number(lag) > maxLag) {
      return verdict(fact, question, {
        absent: true,
        detail: `Consumer lag is ${minutes(Number(lag))} against a ${minutes(maxLag)} limit — it is running but falling behind.`,
      })
    }
    if (pollWindow > 0 && sincePoll > pollWindow) {
      return verdict(fact, question, {
        absent: true,
        detail: `No poll for ${minutes(sincePoll)} against a ${minutes(Number(fact.intervalSeconds))} poll interval — the consumer has stopped, whether or not messages exist.`,
      })
    }
    return verdict(fact, question, {
      expected: true,
      detail: lag === null || lag === undefined
        ? `Polled ${minutes(sincePoll)} ago. A quiet topic is not an unhealthy one.`
        : `Polled ${minutes(sincePoll)} ago, lag ${minutes(Number(lag))}. A quiet topic is not an unhealthy one.`,
    })
  }

  if (fact.triggerSource === 'webhook') {
    const question = 'Does the receiver answer? (Elapsed time since the last event is not evidence.)'
    if (fact.receiverReachable === true) {
      return verdict(fact, question, { expected: true, detail: 'The receiver is reachable. Silence is the expected state for an event-driven source.' })
    }
    if (fact.receiverReachable === false) {
      return verdict(fact, question, { absent: true, detail: 'The receiver did not answer, so events would be dropped rather than queued.' })
    }
    // Deliberately not "healthy". Nobody probed it, and an unprobed receiver that has been
    // quiet for a week looks identical to one that has been down for a week.
    return verdict(fact, question, {
      unverifiable: true,
      detail: 'Receiver reachability was not checked. Time since the last event says nothing about a webhook source.',
    })
  }

  if (fact.triggerSource === 'continuous') {
    const question = 'Is the heartbeat current?'
    const grace = Number(fact.heartbeatGraceSeconds || 0) > 0 ? Number(fact.heartbeatGraceSeconds) : DEFAULT_HEARTBEAT_GRACE_SECONDS
    const since = secondsSince(now, fact.lastHeartbeatAt || fact.lastRunAt)
    if (!Number.isFinite(since)) {
      return verdict(fact, question, { unverifiable: true, detail: 'No heartbeat has ever been recorded for this runtime.' })
    }
    if (since > grace) {
      return verdict(fact, question, { absent: true, detail: `No heartbeat for ${minutes(since)} from a continuously-running instance (grace ${minutes(grace)}).` })
    }
    return verdict(fact, question, { detail: `Heartbeat is ${minutes(since)} old, within a ${minutes(grace)} grace.` })
  }

  // scheduled, controller and workflow all answer the same question — did the thing that is
  // supposed to happen on an interval happen — but they are kept as distinct declarations
  // because the interval means a tick, a reconcile and an orchestrator heartbeat
  // respectively, and an operator reading the finding needs to know which.
  const question = fact.triggerSource === 'controller'
    ? 'Has the reconcile loop run within its expected interval?'
    : fact.triggerSource === 'workflow'
      ? 'Has the orchestrator reported within its expected interval?'
      : 'Has the scheduled run fired within its expected window?'

  const interval = Number(fact.intervalSeconds || 0)
  const since = secondsSince(now, fact.lastRunAt || fact.lastHeartbeatAt)

  if (!interval) {
    return verdict(fact, question, {
      unverifiable: true,
      detail: 'No interval is declared for this runtime, so there is nothing to be late against.',
    })
  }
  if (!Number.isFinite(since)) {
    return verdict(fact, question, { unverifiable: true, detail: 'No run has ever been recorded for this runtime.' })
  }

  const window = interval * multiplier
  if (since > window) {
    return verdict(fact, question, {
      absent: true,
      detail: `Last activity ${minutes(since)} ago against a ${minutes(interval)} interval — the window was missed.`,
    })
  }
  return verdict(fact, question, {
    expected: true,
    detail: `Last activity ${minutes(since)} ago against a ${minutes(interval)} interval — within the expected window.`,
  })
}

/**
 * What each model needs before it can answer at all.
 *
 * Returned to the console so a buyer configuring a source is told which fact is missing,
 * rather than discovering later that a runtime has been reported unverifiable for a month.
 */
export function requiredEvidenceFor(source: TriggerSource): string[] {
  if (source === 'queue') return ['lastPollAt or consumerLagSeconds', 'intervalSeconds (expected poll interval)', 'maxConsumerLagSeconds (optional but recommended)']
  if (source === 'webhook') return ['receiverReachable (from a reachability probe)']
  if (source === 'continuous') return ['lastHeartbeatAt']
  return ['lastRunAt', 'intervalSeconds']
}

export const TRIGGER_SOURCES: TriggerSource[] = ['scheduled', 'queue', 'workflow', 'controller', 'webhook', 'continuous']

/** Plain-language description for the setup screen, in the buyer's own vocabulary. */
export const TRIGGER_SOURCE_DESCRIPTIONS: Record<TriggerSource, string> = {
  scheduled: 'A tick fires the run — cron, a Kubernetes CronJob, an Airflow DAG. Judged by whether the run fired.',
  queue: 'A consumer reads a broker — Kafka, RabbitMQ, SQS, Service Bus, Pub/Sub. Judged by polling and lag, never by message silence.',
  workflow: 'An orchestrator drives it — Temporal, Camunda, Conductor. Judged by the workflow’s own heartbeat.',
  controller: 'A reconcile loop, as a Kubernetes operator runs. Judged by the last successful reconcile.',
  webhook: 'An external system pushes events — PagerDuty, CloudWatch, ServiceNow. Judged by receiver reachability, because silence is expected.',
  continuous: 'A long-running process — a daemon, a Windows service. Judged by heartbeat.',
}
