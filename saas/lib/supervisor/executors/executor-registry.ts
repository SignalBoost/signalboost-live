import { isExecutorKind, type ExecutorKind, type SupervisorExecutor } from './executor-types.ts'
import { ExecutorRegistryError } from './errors.ts'

export class ExecutorRegistry {
  private readonly executors = new Map<ExecutorKind, SupervisorExecutor>()
  register(kind: ExecutorKind, executor: SupervisorExecutor, options: { replace?: boolean } = {}): void {
    if (!isExecutorKind(kind)) throw new ExecutorRegistryError(`Unknown executor kind: ${String(kind)}`)
    if (executor.kind !== kind) throw new ExecutorRegistryError('Executor kind mismatch')
    if (this.executors.has(kind) && options.replace !== true) throw new ExecutorRegistryError(`Executor already registered for ${kind}`)
    this.executors.set(kind, executor)
  }
  resolve(kind: ExecutorKind): SupervisorExecutor {
    if (!isExecutorKind(kind)) throw new ExecutorRegistryError(`Unknown executor kind: ${String(kind)}`)
    const executor = this.executors.get(kind)
    if (!executor) throw new ExecutorRegistryError(`Missing executor for ${kind}`)
    return executor
  }
  supports(kind: ExecutorKind | string): boolean { return isExecutorKind(kind) && this.executors.has(kind) }
  unregister(kind: ExecutorKind): void { this.executors.delete(kind) }
}
