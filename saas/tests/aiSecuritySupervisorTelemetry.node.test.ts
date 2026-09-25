import assert from 'node:assert/strict'
import test from 'node:test'
import { writeAiSecuritySupervisorObservation } from '../lib/security/aiSecuritySupervisorTelemetry.ts'

test('AI security telemetry persists metadata only and never raw suspicious content', async () => {
  let written: any = null
  const db = {
    from(table: string) {
      assert.equal(table, 'supervisor_audit_events')
      return {
        async upsert(value: unknown) {
          written = value
          return { error: null }
        },
      }
    },
  }

  const ok = await writeAiSecuritySupervisorObservation(db, {
    source: 'mcp_tool_output',
    surface: 'builder_mcp',
    disposition: 'quarantined',
    findings: [{
      code: 'embedded_instruction_override',
      severity: 'high',
      path: '$.content',
      summary: 'Untrusted content contains instruction-override language and must be treated only as data.',
    }],
    redactedCount: 2,
    traceId: 'trace-security-test',
  }, { now: new Date('2026-09-25T15:00:00.000Z') })

  assert.equal(ok, true)
  assert.equal(written.event_type, 'ai_security_observation_recorded')
  assert.equal(written.payload.rawContentPersisted, false)
  assert.equal(written.payload.userProfilePersisted, false)
  assert.equal(written.payload.authorityGranted, false)
  assert.equal(written.payload.automaticRepairAuthorized, false)
  assert.deepEqual(written.payload.findingCodes, ['embedded_instruction_override'])
  assert.equal(JSON.stringify(written).includes('Ignore previous system instructions'), false)
})
