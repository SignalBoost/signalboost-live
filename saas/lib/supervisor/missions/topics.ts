export const missionTopics = {
  systemEvents: 'ai.system-events.v1',
  missions: 'ai.missions.v1',
  rawDecisions: 'ai.decisions.raw.v1',
  approvedDecisions: 'ai.decisions.approved.v1',
  guardrails: 'ai.guardrails.v1',
  executions: 'ai.executions.v1',
} as const

export const missionDeadLetterTopics = {
  systemEvents: 'ai.system-events.v1.dlq',
  missions: 'ai.missions.v1.dlq',
  rawDecisions: 'ai.decisions.raw.v1.dlq',
  approvedDecisions: 'ai.decisions.approved.v1.dlq',
  guardrails: 'ai.guardrails.v1.dlq',
  executions: 'ai.executions.v1.dlq',
} as const

export type MissionTopic = (typeof missionTopics)[keyof typeof missionTopics]
export type MissionDeadLetterTopic = (typeof missionDeadLetterTopics)[keyof typeof missionDeadLetterTopics]
