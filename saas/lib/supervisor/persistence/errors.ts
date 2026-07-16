export class ExecutionPersistenceError extends Error {
  code: string
  constructor(code: string, message: string) { super(message); this.name = 'ExecutionPersistenceError'; this.code = code }
}
export function fail(code: string, message: string): never { throw new ExecutionPersistenceError(code, message) }
