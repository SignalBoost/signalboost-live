import type { WorkItem } from '../coordination/index.ts'
import { ProviderWorkerRegistry } from './provider-worker-registry.ts'
export class ProviderWorkRouter {
  private registry: ProviderWorkerRegistry
  constructor(registry: ProviderWorkerRegistry){ this.registry = registry }
  route(work: WorkItem){ const worker=this.registry.get(work.provider); if(!worker) throw new Error(`unknown provider ${work.provider}`); if(worker.health==='unavailable') throw new Error(`provider worker unavailable ${work.provider}`); if(!worker.supportedWorkItemTypes.includes(work.workItemType)) throw new Error(`unsupported work item type ${work.workItemType}`); return worker }
}
