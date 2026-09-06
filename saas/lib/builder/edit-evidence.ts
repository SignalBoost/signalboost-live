/** Remove unchanged context from a complete recorded replacement; never infer omitted source. */
export function builderEditEvidence(change: unknown) {
  const value = change && typeof change === 'object' ? change as Record<string, unknown> : {}
  if (value.truncated !== false || typeof value.search !== 'string' || typeof value.replace !== 'string') {
    return { complete: false, note: 'Exact added and removed text is unavailable.' }
  }
  const before = value.search.split('\n')
  const after = value.replace.split('\n')
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--; endAfter--
  }
  return { complete: true, removedText: before.slice(start, endBefore).join('\n'),
    addedText: after.slice(start, endAfter).join('\n'),
    note: 'Unchanged leading and trailing context is excluded. Added text may still contain unchanged interior lines; this is a contiguous replacement delta, not a semantic test count.' }
}
