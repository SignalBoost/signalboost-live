// saas/lib/supervisor/missions/bull.ts
import { Queue, Worker, type Processor } from 'bullmq'
import type { MissionEventBus, MissionEventEnvelope, MissionEventHandler, MissionEventSubscription } from './event-bus.ts'
import type { MissionStore } from './store.ts'
import { missionDeadLetterTopics, type MissionTopic } from './topics.ts'

export const missionQueueName='mission.events'
export const missionDlqName='mission.dlq'
export class BullMissionPublisher { private readonly store: MissionStore
private readonly queue: Queue<any>
private readonly dlq: Queue<any>
private readonly clock: ()=>string
private readonly maxRetries: number
constructor(store: MissionStore,queue: Queue<any>,dlq: Queue<any>,clock: ()=>string,maxRetries = 3) { this.store = store; this.queue = queue; this.dlq = dlq; this.clock = clock; this.maxRetries = maxRetries;} async publishPending(limit=100){for(const record of await this.store.listPendingOutbox(limit)){try {await this.queue.add(record.topic,record,{jobId:record.eventId,removeOnComplete:true,removeOnFail:false});await this.store.markOutboxPublished(record.eventId,this.clock())}catch(error){const dead=record.retries+1>=this.maxRetries;await this.store.markOutboxFailure(record.eventId,error instanceof Error?error.message:'publish_failed',dead);if(dead)await this.dlq.add(missionDeadLetterTopics.missions,record,{jobId:`dlq-${record.eventId}`,removeOnComplete:false})}}} }
export class BullMissionConsumer implements MissionEventBus { private readonly handlers=new Map<MissionTopic,Set<MissionEventHandler<unknown>>>(); private readonly store: MissionStore
private readonly queue: Queue<any>
private readonly clock: ()=>string
constructor(store: MissionStore,queue: Queue<any>,clock: ()=>string) { this.store = store; this.queue = queue; this.clock = clock;} async publish<T>(topic:MissionTopic,event:MissionEventEnvelope<T>){await this.queue.add(topic,event,{jobId:event.eventId,removeOnComplete:true,removeOnFail:false})} async subscribe<T>(topic:MissionTopic,handler:MissionEventHandler<T>):Promise<MissionEventSubscription>{const set=this.handlers.get(topic)??new Set();this.handlers.set(topic,set);set.add(handler as MissionEventHandler<unknown>);return{unsubscribe:()=>set.delete(handler as MissionEventHandler<unknown>)}} processor():Processor<any>{return async job=>{const event=job.data.payload?job.data.payload:job.data; if(!event?.eventId||!event?.correlationId||!event?.idempotencyKey||!event?.schemaVersion||!Number.isInteger(event?.revision))throw new Error('invalid_mission_event_envelope');if(!await this.store.claimInbox(event.idempotencyKey,this.clock()))return {duplicate:true};const handlers=this.handlers.get(job.name as MissionTopic)??new Set();for(const handler of handlers)await handler(event);return {processed:true}}} createWorker(connection:unknown){return new Worker<any>(missionQueueName,this.processor(),{connection})} }
