import { expect, test } from '@playwright/test'

test.describe('Unified NASA-style SignalBoost cockpit', () => {
  test('admin overview renders accessible executive cockpit', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('banner', { name: /Executive Dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Marketplace Monitor/i })).toBeVisible()
    await expect(page.getByRole('region', { name: /Cockpit panels/i })).toBeVisible()
  })

  test('concierge supports keyboard-driven marketplace and SaaS prompts', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Concierge/i }).click()
    await expect(page.getByRole('dialog', { name: /AI Concierge/i })).toBeVisible()
    await page.getByLabel(/Ask anything/i).fill('Show outreach campaign forecasts for marketplace partners')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('log')).toContainText(/Outreach|Marketplace|forecast/i)
  })
})
