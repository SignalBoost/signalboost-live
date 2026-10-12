// saas/lib/lab/labProviderOptions.ts
// The options of every LAB provider dropdown: all providers, alphabetical ("Other (OpenAI-compatible)" last).
// A provider is selectable whenever it can do the job; a missing key is added right from the account dropdown,
// so hasKey only changes the label. Only a provider that cannot do the job is disabled, with the reason.
export type ProviderLike = Readonly<{ kind: string; name: string; supports: Readonly<Record<string, boolean>> }>
export type ProviderOption = Readonly<{ kind: string; name: string; hasKey: boolean; blocked: 'teacher_only' | 'unsupported' | null }>
export type ProviderCapability = 'teacher.generate' | 'training.execute'

export function sortProviders<T extends ProviderLike>(catalog: readonly T[], language = 'en'): T[] {
  return [...catalog].sort((a, b) => a.kind === 'openai_compatible' ? 1 : b.kind === 'openai_compatible' ? -1 : a.name.localeCompare(b.name, language))
}

export function providerOptions(catalog: readonly ProviderLike[], connectedKinds: ReadonlySet<string>, capability: ProviderCapability, language = 'en'): ProviderOption[] {
  return sortProviders(catalog, language)
    // A provider that cannot be a teacher is not a teacher option at all; one that cannot train is shown as "teacher only".
    .filter(item => capability === 'training.execute' || item.supports['teacher.generate'])
    .map(item => ({
      kind: item.kind, name: item.name, hasKey: connectedKinds.has(item.kind),
      blocked: item.supports[capability] ? null : item.supports['teacher.generate'] ? 'teacher_only' : 'unsupported',
    }))
}

/** Value of the "+ Add a new key" entry in an account dropdown. Never a credential id (those are UUIDs). */
export const ADD_KEY_OPTION = '__add_key__'
