import type { BuilderRunnerPort, BuilderRunResult } from './contracts.ts'

// Host-only boundaries. No model-generated action can configure or bypass these hooks.
export type BuilderExecutionEvent = Readonly<{
  workspaceId: string
  command: string
  fileCount: number
  phase: 'before' | 'after' | 'error'
  result?: BuilderRunResult
  error?: string
}>
export type BuilderExecutionHook = Readonly<{
  beforeRun?: (input: Readonly<{ workspaceId:string; command:string; fileCount:number }>) => Promise<void> | void
  afterRun?: (input: Readonly<{ workspaceId:string; command:string; result:BuilderRunResult }>) => Promise<void> | void
  onError?: (input: Readonly<{ workspaceId:string; command:string; error:string }>) => Promise<void> | void
}>
function recordSafely(task: Promise<void>|void, label: string): Promise<void> {
 return Promise.resolve(task).catch(error=>{
   console.error('[builder_execution_'+label+'_failed]',error instanceof Error?error.message:'unknown')
 })
}
export function withBuilderExecutionHooks(runner: BuilderRunnerPort, hook: BuilderExecutionHook): BuilderRunnerPort {
  return {
    async run(input) {
      // Pre-run veto MUST propagate, including async denial.
      await hook.beforeRun?.({workspaceId:input.workspaceId,command:input.command,fileCount:input.files.length})
      let result: BuilderRunResult
      try {
        result=await runner.run(input)
      } catch (error) {
        const message=error instanceof Error?error.message:'unknown'
        if (hook.onError) {
          try { await recordSafely(hook.onError({workspaceId:input.workspaceId,command:input.command,error:message}),'error_hook') }
          catch { /* instrumentation cannot overwrite the original exception */ }
        }
        throw error
      }
      // Observational only. A recorder outage cannot falsify a test result.
      if (hook.afterRun) {
        try {
          await recordSafely(hook.afterRun({workspaceId:input.workspaceId,command:input.command,result}),'post_hook')
        } catch { /* retain actual runner result */ }
      }
      return result
    },
  }
}
