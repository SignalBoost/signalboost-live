export async function runCouncilMembersConcurrently<T>(
  members: Array<() => Promise<T | null>>,
): Promise<T[]> {
  const results = await Promise.all(members.map(async member => {
    try {
      return await member()
    } catch {
      return null
    }
  }))

  const successful: T[] = []
  for (const result of results) {
    if (result !== null) successful.push(result as T)
  }
  return successful
}
