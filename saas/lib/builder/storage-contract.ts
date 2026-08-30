/**
 * Builder persistence contract.
 *
 * Postgres text cannot store U+0000. Reject the actual byte before a database
 * write; never silently alter user source. Escaped text such as "\\0" and
 * "\\u0000" remains valid code and must be preserved.
 */
export const NULL_BYTE = '\0'
export const POSTGRES_NULL_BYTE_ERROR = 'invalid byte sequence for encoding "UTF8": 0x00'
export const BUILDER_NULL_BYTE_ERROR = 'builder_file_contains_null_byte'

export function containsNullByte(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.includes(NULL_BYTE)
}

export function assertPersistable(content: string, path = ''): void {
  if (!containsNullByte(content)) return
  const where = path ? ` in ${path}` : ''
  throw new Error(`${BUILDER_NULL_BYTE_ERROR}: ${POSTGRES_NULL_BYTE_ERROR}${where}`)
}
