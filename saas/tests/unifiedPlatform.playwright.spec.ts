import { expect, test } from '@playwright/test'

test.describe('Unified SignalBoost public shell', () => {
  test('admin route keeps guest users outside the restricted console', async ({ page }) => {
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('banner', { name: /Owner Console/i })).toHaveCount(0)
  })

  test('the COS-first home accepts keyboard prompts without the duplicate dock', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
    await page.route('**/api/concierge', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Marketplace outreach forecast is ready for review.' }),
      })
    })

    await page.goto('/')
    await expect(page.getByRole('complementary', { name: /Concierge/i })).toHaveCount(0)

    const prompt = page.getByLabel(/Ask COS/i)
    await prompt.fill('Show outreach campaign forecasts for marketplace partners')
    await page.keyboard.press('Enter')
    await expect(page.locator('.thread-wrap')).toContainText(/Marketplace outreach forecast/i)
  })

  test('homepage source plus test uploads enter the durable Builder job with decoded file contents', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
    const jobId = '11111111-1111-4111-8111-111111111111'
    const workspaceId = '22222222-2222-4222-8222-222222222222'
    let postedBody: any = null

    await page.route('**/api/builder**', async route => {
      const request = route.request()
      if (request.method() === 'POST') {
        postedBody = request.postDataJSON()
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ jobId, workspaceId, status: 'queued', reply: 'COS Builder accepted the job.' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId,
          workspaceId,
          status: 'succeeded',
          reply: 'Debugged `src/math.ts` using 2 supplied files. Verification exit code: 0',
          files: [],
          trace: [],
        }),
      })
    })

    await page.goto('/')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([
      {
        name: 'src-math.ts',
        mimeType: 'text/typescript',
        buffer: Buffer.from('export function add(a:number,b:number){ return a-b }\n'),
      },
      {
        name: 'src-math.test.ts',
        mimeType: 'text/typescript',
        buffer: Buffer.from("import { add } from './src-math.ts'\nif (add(2,3) !== 5) throw new Error('wrong sum')\n"),
      },
    ])

    await expect(page.locator('.attachments')).toContainText('src-math.ts')
    await expect(page.locator('.attachments')).toContainText('src-math.test.ts')
    const prompt = page.getByLabel(/Ask COS/i)
    await prompt.fill('Fix the attached source and test.')
    await page.keyboard.press('Enter')

    await expect(page.locator('.thread-wrap')).toContainText(/Verification exit code: 0/, { timeout: 15_000 })
    expect(postedBody?.objective).toBe('Fix the attached source and test.\n\n📎 src-math.ts, src-math.test.ts')
    expect(postedBody?.files).toEqual([
      { path: 'src-math.ts', content: 'export function add(a:number,b:number){ return a-b }\n' },
      { path: 'src-math.test.ts', content: "import { add } from './src-math.ts'\nif (add(2,3) !== 5) throw new Error('wrong sum')\n" },
    ])
  })

  test('the COS-first home is localized in all five supported languages', async ({ page }) => {
    const cases = [
      ['en', /How can I help you today\?/],
      ['pt', /Como posso ajudar você hoje\?/],
      ['es', /¿Cómo puedo ayudarte hoy\?/],
      ['pl', /Jak mogę Ci dziś pomóc\?/],
      ['ru', /Чем я могу помочь вам сегодня\?/],
    ] as const

    for (const [lang, headline] of cases) {
      await page.addInitScript((value) => localStorage.setItem('signalboost_language', value), lang)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toContainText(headline)
    }
  })
})
