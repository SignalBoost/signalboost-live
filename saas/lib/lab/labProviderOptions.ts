// saas/lib/lab/labProviderOptions.ts
// The options of every LAB provider dropdown: all providers, alphabetical ("Other (OpenAI-compatible)" last).
// An option is selectable only when the provider can do the job AND the workspace has a saved key for it;
// otherwise it stays visible with the reason, so a dropdown is never empty.
export type ProviderLike = Readonly<{ kind: string; name: string; supports: Readonly<Record<string, boolean>> }>
export type ProviderOption = Readonly<{ kind: string; name: string; blocked: 'teacher_only' | 'needs_key' | 'unsupported' | null }>
export type ProviderCapability = 'teacher.generate' | 'training.execute'

export function sortProviders<T extends ProviderLike>(catalog: readonly T[], language = 'en'): T[] {
  return [...catalog].sort((a, b) => a.kind === 'openai_compatible' ? 1 : b.kind === 'openai_compatible' ? -1 : a.name.localeCompare(b.name, language))
}

export function providerOptions(catalog: readonly ProviderLike[], connectedKinds: ReadonlySet<string>, capability: ProviderCapability, language = 'en'): ProviderOption[] {
  return sortProviders(catalog, language)
    // A provider that cannot be a teacher is not a teacher option at all; one that cannot train is shown as "teacher only".
    .filter(item => capability === 'training.execute' || item.supports['teacher.generate'])
    .map(item => ({
      kind: item.kind, name: item.name,
      blocked: !item.supports[capability] ? (item.supports['teacher.generate'] ? 'teacher_only' : 'unsupported') : connectedKinds.has(item.kind) ? null : 'needs_key',
    }))
}
