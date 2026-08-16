export async function raceSemanticRetrievalWithBudget<T>(options: {
  work: Promise<T>
  budgetMs: number
  fallback: T
  onTimeout: () => void
}): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const timeoutResult = new Promise<T>(resolve => {
    timeoutHandle = setTimeout(() => {
      options.onTimeout()
      resolve(options.fallback)
    }, options.budgetMs)
  })

  try {
    return await Promise.race([options.work, timeoutResult])
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle)
  }
}
