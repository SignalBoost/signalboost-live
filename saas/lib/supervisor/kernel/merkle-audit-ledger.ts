import * as crypto from 'crypto'
import type { AuditEvent } from '../execution-contracts.ts'
import { canonicalJson } from './canonical-json.ts'

export interface MerkleProofStep { hash: string; position: 'left' | 'right' }
export interface MerkleProof { leafHash: string; leafIndex: number; auditPath: MerkleProofStep[]; rootHash: string }
export interface MerkleAppendResult { leafHash: string; merkleRoot: string; leafIndex: number }

export interface MerkleCheckpointSink {
  checkpoint(input: { merkleRoot: string; leafCount: number; eventId: string; occurredAt: string }): Promise<void> | void
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export class MerkleAuditLedger {
  private readonly events: AuditEvent[] = []
  private readonly leaves: string[] = []
  private tree: string[][] = []

  constructor(private readonly checkpointSink?: MerkleCheckpointSink) {}

  async append(event: Readonly<AuditEvent>): Promise<MerkleAppendResult> {
    const copy = structuredClone(event) as AuditEvent
    const leafHash = hash(canonicalJson(copy))
    this.events.push(copy)
    this.leaves.push(leafHash)
    this.rebuild()
    const merkleRoot = this.rootHash()
    await this.checkpointSink?.checkpoint({ merkleRoot, leafCount: this.leaves.length, eventId: event.eventId, occurredAt: event.occurredAt })
    return { leafHash, merkleRoot, leafIndex: this.leaves.length - 1 }
  }

  rootHash(): string {
    if (this.leaves.length === 0) return hash('EMPTY_SUPERVISOR_AUDIT_LEDGER')
    return this.tree[this.tree.length - 1][0]
  }

  leafCount(): number { return this.leaves.length }

  getInclusionProof(index: number): MerkleProof {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length) throw new Error('Merkle proof index out of bounds')
    const auditPath: MerkleProofStep[] = []
    let currentIndex = index
    for (let level = 0; level < this.tree.length - 1; level += 1) {
      const nodes = this.tree[level]
      const isRight = currentIndex % 2 === 1
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1
      const siblingHash = siblingIndex < nodes.length ? nodes[siblingIndex] : nodes[currentIndex]
      auditPath.push({ hash: siblingHash, position: isRight ? 'left' : 'right' })
      currentIndex = Math.floor(currentIndex / 2)
    }
    return { leafHash: this.leaves[index], leafIndex: index, auditPath, rootHash: this.rootHash() }
  }

  static verifyProof(proof: MerkleProof): boolean {
    let current = proof.leafHash
    for (const step of proof.auditPath) current = hash(step.position === 'left' ? step.hash + current : current + step.hash)
    return current === proof.rootHash
  }

  static verifyEvent(event: Readonly<AuditEvent>, proof: MerkleProof): boolean {
    return hash(canonicalJson(event)) === proof.leafHash && MerkleAuditLedger.verifyProof(proof)
  }

  private rebuild(): void {
    this.tree = [this.leaves.slice()]
    let current = this.leaves.slice()
    while (current.length > 1) {
      const next: string[] = []
      for (let index = 0; index < current.length; index += 2) {
        const left = current[index]
        const right = index + 1 < current.length ? current[index + 1] : left
        next.push(hash(left + right))
      }
      this.tree.push(next)
      current = next
    }
  }
}
