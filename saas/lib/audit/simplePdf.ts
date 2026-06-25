// saas/lib/audit/simplePdf.ts
// Dependency-free PDF writer for audit/report downloads.
// It intentionally produces a plain, printable report instead of requiring
// puppeteer/pdfkit, so it works in the current Next.js runtime and package set.

export type PdfSection = {
  heading?: string
  lines: string[]
}

export type PdfDoc = {
  title: string
  subtitle?: string
  sections: PdfSection[]
  footer?: string
}

const PAGE_W = 612
const PAGE_H = 792
const LEFT = 54
const TOP = 742
const LINE = 14
const MAX_CHARS = 92

function clean(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    // Built-in PDF Helvetica is WinAnsi-like; keep output stable by replacing
    // unsupported glyphs instead of generating a corrupt PDF.
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
}

function wrap(input: unknown, width = MAX_CHARS): string[] {
  const text = clean(input)
  if (!text) return ['']
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= width) cur += ' ' + w
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

function esc(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function drawText(text: string, x: number, y: number, size = 10, bold = false): string {
  const font = bold ? 'F2' : 'F1'
  return `BT /${font} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET\n`
}

function paginate(doc: PdfDoc): string[][] {
  const pages: string[][] = [[]]
  let y = TOP
  const add = (text: string, opts?: { size?: number; bold?: boolean; gap?: number }) => {
    const size = opts?.size ?? 10
    const gap = opts?.gap ?? LINE
    if (y < 60) { pages.push([]); y = TOP }
    pages[pages.length - 1].push(drawText(text, LEFT, y, size, !!opts?.bold))
    y -= gap
  }

  add(clean(doc.title), { size: 18, bold: true, gap: 22 })
  if (doc.subtitle) {
    for (const l of wrap(doc.subtitle, 82)) add(l, { size: 10, gap: 13 })
    y -= 8
  }
  add(`Generated: ${new Date().toISOString()}`, { size: 9, gap: 20 })

  for (const section of doc.sections) {
    if (section.heading) {
      y -= 6
      add(clean(section.heading), { size: 12, bold: true, gap: 18 })
    }
    for (const raw of section.lines) {
      for (const l of wrap(raw)) add(l, { size: 10, gap: 13 })
    }
  }

  if (doc.footer) {
    y -= 8
    for (const l of wrap(doc.footer, 86)) add(l, { size: 8, gap: 11 })
  }

  return pages
}

export function createSimplePdf(doc: PdfDoc): Buffer {
  const pages = paginate(doc)
  const objects: string[] = []
  const addObj = (body: string): number => { objects.push(body); return objects.length }

  const catalogId = addObj('')
  const pagesId = addObj('')
  const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const boldFontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')
  const pageIds: number[] = []

  for (let i = 0; i < pages.length; i++) {
    const footer = drawText(`Page ${i + 1} of ${pages.length}`, PAGE_W - 110, 32, 8, false)
    const stream = pages[i].join('') + footer
    const contentId = addObj(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`)
    const pageId = addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    pageIds.push(pageId)
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'utf8')
}

export function objectLines(obj: unknown, depth = 0): string[] {
  if (obj == null) return []
  if (depth > 3) return [clean(obj)]
  if (typeof obj !== 'object') return [clean(obj)]
  if (Array.isArray(obj)) {
    const lines: string[] = []
    for (const item of obj.slice(0, 40)) {
      if (item && typeof item === 'object') lines.push(...objectLines(item, depth + 1))
      else lines.push(`- ${clean(item)}`)
    }
    if (obj.length > 40) lines.push(`... ${obj.length - 40} more item(s)`)
    return lines
  }
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>).slice(0, 80)) {
    if (v == null || typeof v !== 'object') lines.push(`${k}: ${clean(v)}`)
    else if (Array.isArray(v)) {
      lines.push(`${k}: ${v.length} item(s)`)
      for (const sub of v.slice(0, 12)) lines.push(`  - ${clean(typeof sub === 'object' ? JSON.stringify(sub).slice(0, 180) : sub)}`)
    } else {
      lines.push(`${k}:`)
      for (const sub of objectLines(v, depth + 1).slice(0, 20)) lines.push(`  ${sub}`)
    }
  }
  return lines
}
