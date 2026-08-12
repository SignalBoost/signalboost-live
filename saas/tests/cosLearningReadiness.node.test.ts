import assert from 'node:assert/strict'
import test from 'node:test'
import { autonomousLearningReadiness, recurringTechnologyCurriculum } from '../lib/cos/dailyAutonomousLearning.ts'

test('learning readiness explains when autonomous learning is disabled',()=>{const status=autonomousLearningReadiness({COS_AUTONOMOUS_LEARNING_ENABLED:'false'} as NodeJS.ProcessEnv);assert.equal(status.autonomousEnabled,false);assert.equal(status.ready,false);assert.ok(status.warnings.some(item=>item.includes('COS_AUTONOMOUS_LEARNING_ENABLED')))})

test('external learning is enabled by default without the legacy live-source flag',()=>{const status=autonomousLearningReadiness({COS_AUTONOMOUS_LEARNING_ENABLED:'true',YOUTUBE_API_KEY:'configured'} as NodeJS.ProcessEnv);assert.equal(status.autonomousEnabled,true);assert.equal(status.liveSourcesEnabled,true);assert.equal(status.youtubeConfigured,true);assert.equal(status.youtubeTranscriptConfigured,false);assert.ok(status.liveAdapters>=7);assert.equal(status.ready,true)})

test('explicit false remains an emergency external-learning kill switch',()=>{const status=autonomousLearningReadiness({COS_AUTONOMOUS_LEARNING_ENABLED:'true',COS_LIVE_SOURCES_ENABLED:'false',YOUTUBE_API_KEY:'configured'} as NodeJS.ProcessEnv);assert.equal(status.liveSourcesEnabled,false);assert.equal(status.liveAdapters,0);assert.equal(status.ready,false)})

test('recurring curriculum proactively studies concrete enterprise engineering mechanisms',()=>{const curriculum=recurringTechnologyCurriculum();assert.ok(curriculum.length>=8);const text=curriculum.map(item=>`${item.subject} ${item.question}`).join(' ').toLowerCase();for(const term of ['p95 latency','connection pools','lock contention','kubernetes','cybersecurity','ai agents'])assert.ok(text.includes(term),`missing curriculum term: ${term}`)})
