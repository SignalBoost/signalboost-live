import fs from 'fs'
import path from 'path'

const ROOT = path.resolve('saas')
const LOCALES_DIR = path.join(ROOT, 'locales')
const APP_DIR = path.join(ROOT, 'app')
const COMPONENTS_DIR = path.join(ROOT, 'components')

const langs = ['en','pt','es','pl','ru']
const locale = Object.fromEntries(langs.map(l => [l, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${l}.json`), 'utf8'))]))

function flatten(obj, prefix='') {
  let out = {}
  for (const [k,v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key))
    else out[key] = v
  }
  return out
}

const flat = Object.fromEntries(langs.map(l => [l, flatten(locale[l])]))
const allKeys = new Set(Object.keys(flat.en))
const missing = {}
for (const l of langs) {
  missing[l] = [...allKeys].filter(k => !(k in flat[l]))
}

function walk(dir, acc=[]) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir,f)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (f === 'node_modules' || f === '.next') continue
      walk(p, acc)
    } else if (/\.(tsx|ts|jsx|js)$/.test(f)) acc.push(p)
  }
  return acc
}

const files = [...walk(APP_DIR), ...walk(COMPONENTS_DIR)]
const hardcoded = []
const hrefs = []
for (const file of files) {
  const txt = fs.readFileSync(file,'utf8')
  const rel = path.relative(ROOT,file)
  const regex = />\s*([A-Za-z][^<{]{2,})\s*</g
  let m
  while ((m = regex.exec(txt))) {
    const s = m[1].trim()
    if (!s.includes('{') && !s.includes('t(') && !s.startsWith('//')) hardcoded.push({file: rel, text: s.slice(0,80)})
  }
  const hrefRe = /href=["']([^"'#?][^"']*)["']/g
  while ((m = hrefRe.exec(txt))) hrefs.push({file: rel, href: m[1]})
}

function routeExists(href) {
  if (!href.startsWith('/')) return true
  const clean = href.replace(/\/$/,'') || '/'
  if (clean === '/') return fs.existsSync(path.join(APP_DIR, 'page.tsx'))
  const seg = clean.slice(1)
  const opts = [
    path.join(APP_DIR, seg, 'page.tsx'),
    path.join(APP_DIR, seg + '.tsx'),
  ]
  return opts.some(fs.existsSync)
}

const deadLinks = hrefs.filter(x => !routeExists(x.href))

const report = {
  generatedAt: new Date().toISOString(),
  localeKeyCount: Object.keys(flat.en).length,
  missingKeysByLang: Object.fromEntries(Object.entries(missing).map(([l,v]) => [l, v.length])),
  hardcodedSamples: hardcoded.slice(0,120),
  hardcodedCount: hardcoded.length,
  deadLinks: deadLinks.slice(0,120),
  deadLinksCount: deadLinks.length,
}

fs.writeFileSync(path.join(ROOT, 'docs/i18n-audit-report.json'), JSON.stringify(report, null, 2))
console.log('wrote report')
