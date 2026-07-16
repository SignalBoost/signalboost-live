export class SupervisorExecutorError extends Error { constructor(message: string) { super(message); this.name = 'SupervisorExecutorError' } }
export class DispatchValidationError extends Error { constructor(message: string) { super(message); this.name = 'DispatchValidationError' } }
export class ExecutorRegistryError extends Error { constructor(message: string) { super(message); this.name = 'ExecutorRegistryError' } }
