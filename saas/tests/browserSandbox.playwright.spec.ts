import { expect, test } from '@playwright/test'

test('sandbox portal reaches the protected approval boundary without saving', async ({ page }) => {
  await page.goto('/browser-sandbox/login')

  await expect(page.getByText(/SignalBoost Browser Sandbox/i)).toBeVisible()
  await page.getByLabel('Email').fill('mission001@example.test')
  await page.getByLabel('Password').fill('sandbox-only-password')
  await page.getByRole('button', { name: /Sign in/i }).click()

  await expect(page.getByText(/Sandbox dashboard/i)).toBeVisible()
  await page.getByRole('button', { name: /Open settings/i }).click()

  await expect(page.getByText(/Sandbox settings/i)).toBeVisible()
  await expect(page.getByLabel(/Test environment value/i)).toHaveValue('unchanged')
  await expect(page.getByRole('button', { name: /Protected save/i })).toBeVisible()
  await expect(page).toHaveURL(/\/browser-sandbox\/login$/)
})
