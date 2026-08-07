import type { AuditEvent, AuditSink } from '../execution-contracts.ts'
import { MerkleAuditLedger, type MerkleAppendResult } from './merkle-audit-ledger.ts'

export class MerkleAuditSink implements AuditSink {
  private lastAppend?: MerkleAppendResult

  constructor(
    readonly ledger: MerkleAuditLedger,
    private readonly downstream?: AuditSink,
  ) {}

  async write(event: Readonly<AuditEvent>): Promise<void> {
    this.lastAppend = await this.ledger.append(event)
    await this.downstream?.write(event)
  }

  latestEvidence(): MerkleAppendResult | undefined {
    return this.lastAppend ? { ...this.lastAppend } : undefined
  }
}
