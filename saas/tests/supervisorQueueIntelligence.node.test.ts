import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateQueueHealth, type WorkItem } from '../lib/supervisor/index.ts'
const now=new Date('2026-07-18T20:00:00.000Z')
const item=(o:Partial<WorkItem>={}):WorkItem=>({workItemId:`w-${Math.random()}`,workItemType:'observe',incidentId:'i-1',provider:'github',environment:'production',state:'queued',priority:1,createdAt:'2026-07-18T19:59:00.000Z',availableAt:'2026-07-18T19:59:00.000Z',attempt:0,maxAttempts:3,policyVersion:'p1',schemaVersion:'supervisor-work-item-v1',...o})
test('empty queue is healthy',()=>{const r=evaluateQueueHealth({workItems:[],now});assert.equal(r.status,'healthy');assert.equal(r.score,100)})
test('old queued work is critical starvation',()=>{const r=evaluateQueueHealth({workItems:[item({availableAt:'2026-07-18T19:20:00.000Z'})],now});assert.equal(r.status,'critical');assert.equal(r.issues.some(i=>i.code==='queue_starvation'),true)})
test('warning depth creates degraded backlog',()=>{const r=evaluateQueueHealth({workItems:Array.from({length:25},(_,i)=>item({workItemId:`w-${i}`})),now});assert.equal(r.status,'degraded');assert.equal(r.providers[0].depth,25)})
test('stale processing work is critical',()=>{const r=evaluateQueueHealth({workItems:[item({state:'processing',availableAt:'2026-07-18T19:30:00.000Z'})],now});assert.equal(r.status,'critical');assert.equal(r.totals.stuck,1)})
test('terminal work is excluded',()=>{const r=evaluateQueueHealth({workItems:[item({state:'completed',availableAt:'2026-07-18T18:00:00.000Z'})],now});assert.equal(r.status,'healthy');assert.equal(r.totals.providers,0)})
test('providers are evaluated independently',()=>{const r=evaluateQueueHealth({workItems:[item(),item({provider:'vercel',availableAt:'2026-07-18T19:20:00.000Z'})],now});assert.equal(r.providers.find(p=>p.provider==='github')?.status,'healthy');assert.equal(r.providers.find(p=>p.provider==='vercel')?.status,'critical')})
