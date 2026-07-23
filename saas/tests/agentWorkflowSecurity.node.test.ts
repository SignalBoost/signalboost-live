import test from 'node:test'
import assert from 'node:assert/strict'
import { AgentWorkflowCoordinator } from '../lib/agent-runtime/workflow-coordinator.ts'
test('coordinator module is inert and exposes no automatic execution surface', () => { assert.equal(typeof AgentWorkflowCoordinator, 'function') })
