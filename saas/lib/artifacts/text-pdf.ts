const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const LEFT = 52
const TOP = 742
const LEADING = 14
const MAX_LINE_CHARS = 88
const MAX_LINES_PER_PAGE = 47

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?')
}

function wrapLine(value: string): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? current + ' ' + word : word
    if (next.length <= MAX_LINE_CHARS || !current) {
      current = next
      continue
    }
    lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

function linesForPdf(value: string): string[] {
  const normalized = String(value || '').replace(/\0/g, '').replace(/\r/g, '').trim().slice(0, 80_000)
  const lines: string[] = []
  for (const paragraph of normalized.split('\n')) lines.push(...wrapLine(paragraph))
  return lines.length ? lines : ['']
}

function contentStream(lines: readonly string[]): string {
  const commands = ['BT', '/F1 11 Tf', `${LEFT} ${TOP} Td`, `${LEADING} TL`]
  for (const line of lines) commands.push(`(${escapePdfText(line)}) Tj`, 'T*')
  commands.push('ET')
  return commands.join('\n')
}

/** Creates a bounded, single-font PDF for a text document without shelling out. */
export function textPdfBase64(value: string): string {
  const lines = linesForPdf(value)
  const pages: string[][] = []
  for (let index = 0; index < lines.length; index += MAX_LINES_PER_PAGE) pages.push(lines.slice(index, index + MAX_LINES_PER_PAGE))

  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2)
  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  pages.forEach((page, index) => {
    const pageNumber = 4 + index * 2
    const contentNumber = pageNumber + 1
    const stream = contentStream(page)
    objects[pageNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`
    objects[contentNumber] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`
  })

  let document = '%PDF-1.4\n%????\n'
  const offsets: number[] = [0]
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(document, 'utf8')
    document += `${index} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xref = Buffer.byteLength(document, 'utf8')
  document += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let index = 1; index < objects.length; index += 1) document += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  document += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(document, 'utf8').toString('base64')
}
