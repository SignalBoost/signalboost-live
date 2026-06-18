// saas/console-core/index.ts
//
// Public API barrel for the portable Console Core package.
//
// console-core is host-agnostic: it imports nothing app-specific. This barrel
// names its public surface so a consumer (or a future extraction into a
// standalone package) imports from one entrypoint instead of deep paths.
//
//   import { runAction, createHost, registerExecutor } from 'console-core'
//   import 'console-core/executors'   // side-effect: registers bundled providers
//
// Adding this file changes no existing import — the app still uses the deep
// paths it always did; this is purely an additive, extraction-friendly seam.

// Portable contracts: ActionSchema, ActionField, AuthAdapter, LogAdapter,
// ActionExecutor, ConsoleHost, ProviderMeta, etc.
export * from './types'

// The engine pipeline: runAction(), validateInput(), and the Engine* types.
export * from './actionEngine'

// The portable registry + host assembler: registerExecutor(), resolveExecutor(),
// listRegistered(), consoleLogAdapter, createHost(auth, log?).
export * from './defaultHost'

// The operator subsystem (state machine, safety policy, runbook, persona, …),
// namespaced to keep the top-level surface clean and collision-free.
export * as operator from './operator'

// NOTE: the bundled provider executors are intentionally NOT re-exported here.
// They register themselves as a side effect, so wire them explicitly with
// `import 'console-core/executors'` (or import individual providers) from the
// entry point that needs them. This keeps registration opt-in.
