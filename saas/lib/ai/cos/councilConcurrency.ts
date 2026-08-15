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

  return results.filter((result): result is T => result !== null)
}
