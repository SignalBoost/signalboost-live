import type { MissionTopic } from './topics.ts'
export interface MissionEventEnvelope<T> { eventId: string; occurredAt: string; correlationId: string; payload: T }
export type MissionEventHandler<T> = (event: MissionEventEnvelope<T>) => void | Promise<void>
export interface MissionEventSubscription { unsubscribe(): void }
export interface MissionEventBus { publish<T>(topic: MissionTopic, event: MissionEventEnvelope<T>): Promise<void>; subscribe<T>(topic: MissionTopic, handler: MissionEventHandler<T>): Promise<MissionEventSubscription> }
export class InMemoryMissionEventBus implements MissionEventBus { private readonly handlers=new Map<MissionTopic, Set<MissionEventHandler<unknown>>>(); async publish<T>(topic: MissionTopic,event: MissionEventEnvelope<T>) { for(const handler of [...(this.handlers.get(topic)??[])]) await handler(event) } async subscribe<T>(topic: MissionTopic,handler: MissionEventHandler<T>): Promise<MissionEventSubscription> { const handlers=this.handlers.get(topic)??new Set(); this.handlers.set(topic,handlers); handlers.add(handler as MissionEventHandler<unknown>); return {unsubscribe:()=>handlers.delete(handler as MissionEventHandler<unknown>) } } }
