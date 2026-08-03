// saas/lib/supervisor/executors/state-snapshot-adapters.ts
//
// SHIM. The adapters moved to lib/portable/state-snapshot-adapters.ts alongside the port
// they implement — a Marketing and Sales repair needs the SQL savepoint adapter exactly as
// much as an infrastructure repair does, and neither should reach into the other's folder.
export * from '../../portable/state-snapshot-adapters.ts'
