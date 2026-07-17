declare module 'bullmq' {
  export type JobsOptions = Record<string, unknown>
  export type WorkerOptions = { concurrency?: number; connection?: unknown; [key: string]: unknown }
  export type Processor<T = unknown, R = unknown, N extends string = string> = (job: Job<T, R, N>) => Promise<R> | R
  export class Job<T = unknown, R = unknown, N extends string = string> { id?: string; name: N; data: T }
  export class Queue<T = unknown> {
    constructor(name: string, opts?: unknown)
    add(name: string, data: T, opts?: unknown): Promise<Job<T>>
    getWaitingCount(): Promise<number>
    getDelayedCount(): Promise<number>
    close(): Promise<void>
  }
  export class Worker<T = unknown> {
    constructor(name: string, processor: Processor<T>, opts?: unknown)
    on(event: 'completed', listener: (job: Job<T>) => void): this
    on(event: 'failed', listener: (job: Job<T> | undefined, error: Error) => void): this
    on(event: 'error', listener: (error: Error) => void): this
    close(): Promise<void>
  }
}
