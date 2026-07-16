import type { CoordinationStore } from './index.ts'
export async function reconcileSupervisorCoordination(store: CoordinationStore, now = new Date()) { return store.reconcileExpiredLeases(now) }
