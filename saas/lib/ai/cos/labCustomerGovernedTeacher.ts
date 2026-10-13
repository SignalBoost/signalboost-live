// saas/lib/ai/cos/labCustomerGovernedTeacher.ts
// Governed teacher generation for customer LAB runs, on the customer's own provider key.
//
// What a provider charges is between the customer and that provider: the platform does not price, budget or reserve
// it. What the platform does govern, inside the Platform Harness:
//   * one call per prompt (max 128 prompts, each capped at 4,000 characters by parsePrompts),
//   * every answer capped at LAB_TEACHER_MAX_OUTPUT_TOKENS,
//   * at most 4 calls at a time, all of them inside the Harness deadline,
//   * the provider endpoint must be public https (no internal network reach through a customer endpoint).
import { assertPublicHttpUrl } from '../../security/publicFetchGuard.ts'
import { generateWithUniversityTeacher } from './cosUniversityTeacherAdapters.ts'
import { customerTeacherDefinition, CUSTOMER_TEACHER_CREDENTIAL_ENV } from './labCustomerProviderCatalog.ts'
import { buildCustomerTeacherRows, LAB_TEACHER_SYSTEM_PROMPT, type TeacherRow } from './labCustomerTraining.ts'
import { withCustomerLabTeacherHarness } from '../../../platform-harness/adapters/lab-customer-teacher.ts'

export const LAB_TEACHER_MAX_OUTPUT_TOKENS = 1024

export async function runGovernedTeacher(input: {
  organizationId: string
  trainingRunId: string
  teacher: { providerKind: string; model: string; endpoint: string | null; apiKey: string }
  prompts: readonly string[]
  concurrency?: number
  // test seams
  harness?: typeof withCustomerLabTeacherHarness
  generate?: typeof generateWithUniversityTeacher
}): Promise<{ rows: TeacherRow[]; datasetHash: string; failures: number }> {
  if (!input.prompts.length) throw new Error('lab_prompts_count_invalid')
  const definition = customerTeacherDefinition({ kind: input.teacher.providerKind, model: input.teacher.model, endpoint: input.teacher.endpoint })
  const concurrency = Math.max(1, Math.min(4, input.concurrency ?? 4))
  const harness = input.harness ?? withCustomerLabTeacherHarness
  const generate = input.generate ?? generateWithUniversityTeacher
  const env = { [CUSTOMER_TEACHER_CREDENTIAL_ENV]: input.teacher.apiKey } // never process.env
  return harness({
    organizationId: input.organizationId, trainingRunId: input.trainingRunId, providerKind: input.teacher.providerKind,
    maxCalls: input.prompts.length, concurrency,
    operation: async (_manifest, signal) => buildCustomerTeacherRows({
      teacher: { id: definition.id, provider: definition.provider, model: definition.model },
      prompts: input.prompts, concurrency,
      generate: async prompt => {
        if (signal.aborted) throw new Error('harness_deadline_exceeded')
        const result = await generate({
          teacher: definition as any,
          request: { system: LAB_TEACHER_SYSTEM_PROMPT, prompt, maxOutputTokens: LAB_TEACHER_MAX_OUTPUT_TOKENS },
          env,
          fetchImpl: (async (url: any, init: any) => {
            await assertPublicHttpUrl(String(url))
            return fetch(url, { ...init, signal, redirect: 'error' })
          }) as typeof fetch,
        })
        return result.text
      },
    }),
  })
}
