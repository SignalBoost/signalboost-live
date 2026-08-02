// saas/lib/browser-runtime/contracts.ts
//
// SHIM. The real module now lives in the portable at
// lib/portable-browser/browser-task-contracts.ts, because four shipped adapters on the buyer
// surface import it and the packager copies only the portable folder.
//
// This file stays so every existing host import keeps working unchanged. Nothing is duplicated
// — it re-exports. New host code should import from the portable directly.
//
// THE DIRECTION IS THE POINT: the host may depend on the portable, never the reverse.

export * from '../portable-browser/browser-task-contracts.ts'
