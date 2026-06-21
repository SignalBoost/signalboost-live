// saas/lib/audit/exportCsv.ts
// Pure CSV serialization for report exports. No I/O, no React.
// RFC-4180 quoting + UTF-8 BOM so Excel opens accented text correctly.

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  return '\ufeff' + lines.join('\r\n')
}
