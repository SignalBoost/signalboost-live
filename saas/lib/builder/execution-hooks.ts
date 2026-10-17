import type { BuilderRunnerPort, BuilderRunResult } from './contracts.ts'

// Boundary used by the live Builder tool loop, never supplied by model output.
export type BuilderExecutionHook = Readonly<{
  beforeRun?: (input: Readonly<{ workspaceId:string; command:string; fileCount:number }>) => Promise<void> | void
  afterRun?: (input: Readonly<{ workspaceId:string; command:string; result:BuilderRunResult }>) => Promise<void> | void
}>
export function withBuilderExecutionHooks(runner: BuilderRunnerPort, hook: BuilderExecutionHook): BuilderRunnerPort {
  return {
    async run(input) {
      // The host veto is checked before any delegated command.
      await hook.beforeRun?.({workspaceId:input.workspaceId,command:input.command,fileCount:input.files.length})
      let result: BuilderRunResult
      try {
        result=await runner.run(input)
      } catch (error) {
        // Preserve the underlying failure; caller retains durable recovery responsibility.
        throw error
      }
      // Post-run hooks are observational: they must not rewrite command results.
      try {
        await hook.afterRun?.({workspaceId:input.workspaceId,command:input.command,result})
      } catch (error) {
        // Failure to record an execution must not make a successful test look failed.
        console.error('[builder_execution_post_hook_failed]', error instanceof Error ? error.message : 'unknown')
      }
      return result
    },
  }
}
