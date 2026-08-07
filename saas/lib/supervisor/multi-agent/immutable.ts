export function immutablePayload<T>(value: T): Readonly<T> {
  const seen = new WeakSet<object>()
  const freeze = (input: unknown): void => {
    if (!input || typeof input !== 'object' || seen.has(input as object)) return
    seen.add(input as object)
    if (Array.isArray(input)) for (const item of input) freeze(item)
    else for (const nested of Object.values(input as Record<string, unknown>)) freeze(nested)
    Object.freeze(input)
  }
  freeze(value)
  return value as Readonly<T>
}
