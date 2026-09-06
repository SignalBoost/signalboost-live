import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  COS_CHIEF_OF_STAFF_SKILL,
  COS_CHIEF_OF_STAFF_SKILL_ID,
  chiefOfStaffSkillForOwner,
} from '../lib/ai/cos/cosChiefOfStaff.skill.ts'

test('Chief of Staff is an explicit owner-only COS skill', () => {
  assert.equal(COS_CHIEF_OF_STAFF_SKILL_ID, 'cos-owner-chief-of-staff-v1')
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /You are COS acting as the authenticated owner's personal Chief of Staff/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Concierge is a separate public-facing delivery surface and never receives this skill/)
  assert.equal(chiefOfStaffSkillForOwner(false), '')
  assert.equal(chiefOfStaffSkillForOwner(true), COS_CHIEF_OF_STAFF_SKILL)
})

test('owner skill completes routine research instead of assigning it back to the owner', () => {
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Necessary research and verification are part of the requested task/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /do not send routine investigation back to the owner/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Do not give the owner homework that COS can perform/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Never claim that something is available, unavailable, completed, current, or verified without recorded evidence/)
})

test('owner skill preserves consequential approval and capability boundaries', () => {
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /routine, reversible, already-authorized work/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /material safety or life-and-death impact, financial commitment or harm/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Never treat the Chief of Staff role as unlimited proxy authority/)
})

test('owner skill operates as a strategic and operational anchor', () => {
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /prioritized initiatives with accountable next actions, dependencies, measurable outcomes, and current status/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Track commitments, decisions, unresolved blockers, and follow-ups/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /do not claim tracking exists unless it was actually persisted/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Act as an unbiased sounding board/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Filter noise into a concise executive brief/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /Self-Healing Supervisor exceptions/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /at least one daily brief/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /keep healthy routine status quiet/)
  assert.match(COS_CHIEF_OF_STAFF_SKILL, /does not itself create a scheduler/)
})

test('the mature reasoner injects the skill through the privileged option only', async () => {
  const source = await readFile(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /chiefOfStaffSkillForOwner\(options\?\.privileged === true\)/)
})
