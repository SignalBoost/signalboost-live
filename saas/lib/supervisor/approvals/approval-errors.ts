export class ApprovalQueueError extends Error { code: string; constructor(code: string, message = code) { super(message); this.code = code } }
