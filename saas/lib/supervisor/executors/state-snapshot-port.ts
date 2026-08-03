// saas/lib/supervisor/executors/state-snapshot-port.ts
//
// SHIM. The real module now lives in the shared kernel at lib/portable/state-snapshot-port.ts,
// because every portable that changes data needs the same checkpoint contract — not just the
// Supervisor. Same precedent as lib/browser-runtime/contracts.ts.
//
// Nothing is duplicated here; this re-exports. Existing supervisor imports keep working.
// New code should import from '@/lib/portable/state-snapshot-port.ts' directly.
export * from '../../portable/state-snapshot-port.ts'
