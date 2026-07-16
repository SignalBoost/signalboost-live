export class SupervisorValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupervisorValidationError'
  }
}

export class SupervisorPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupervisorPolicyError'
  }
}

export class SupervisorAuditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupervisorAuditError'
  }
}
