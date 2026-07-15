import { expect, test } from '@playwright/test'

test('pricing checkout prepares a mocked Stripe handoff without a real payment', async ({ page }) => {
  let checkoutRequest: { plan?: string; productLine?: string } | null = null

  await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
  await page.route('**/api/checkout', async route => {
    checkoutRequest = route.request().postDataJSON()
    const origin = new URL(route.request().url()).origin
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: `${origin}/pricing?checkout=mock` }),
    })
  })

  await page.goto('/pricing')
  await page.getByRole('tab', { name: /Core Platform/i }).click()
  await page.getByRole('button', { name: /Upgrade Now/i }).first().click()

  await expect(page).toHaveURL(/\/pricing\?checkout=mock$/)
  expect(checkoutRequest).toEqual({ plan: 'launch', productLine: 'platform' })
})
