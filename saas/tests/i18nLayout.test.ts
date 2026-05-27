import fs from 'fs'
import path from 'path'

describe('SignalBoost i18n + layout verification', () => {
  const repoRoot = path.resolve(__dirname, '..')

  test('No hardcoded English workflow strings remain in app/components code', () => {
    const files = walk(repoRoot).filter((file) =>
      /\.(tsx|ts|js|jsx)$/.test(file) && !file.includes('node_modules') && !file.includes('/tests/')
    )

    const englishRegex = /\b(Promote business|Create site|Collect reviews|Generate audio|Create videos|Workshop Apprentice)\b/
    const offenders: string[] = []

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8')
      if (englishRegex.test(content)) offenders.push(path.relative(repoRoot, file))
    })

    expect(offenders).toEqual([])
  })

  test('Layout uses hero-layout container', () => {
    const layoutFile = path.join(repoRoot, 'app', 'layout.tsx')
    const content = fs.readFileSync(layoutFile, 'utf8')
    expect(content.includes('className="hero-layout"')).toBe(true)
  })
})

function walk(dir: string): string[] {
  let results: string[] = []
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      if (file === '.git' || file === 'node_modules' || file === '.next') return
      results = results.concat(walk(fullPath))
    } else {
      results.push(fullPath)
    }
  })
  return results
}
