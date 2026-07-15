import { expect, test } from '@playwright/test'

async function openSandboxSettings(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.goto('/browser-sandbox/login')
  await expect(page.getByText(/SignalBoost Browser Sandbox/i)).toBeVisible()
  await page.getByLabel('Email').fill('mission001@example.test')
  await page.getByLabel('Password').fill('sandbox-only-password')
  await page.getByRole('button', { name: /Sign in/i }).click()
  await expect(page.getByText(/Sandbox dashboard/i)).toBeVisible()
  await page.getByRole('button', { name: /Open settings/i }).click()
  await expect(page.getByText(/Sandbox settings/i)).toBeVisible()
}

test('sandbox portal reaches the protected approval boundary without saving automatically', async ({ page }) => {
  await openSandboxSettings(page)

  const input = page.getByLabel(/Test environment value/i)
  await expect(input).toHaveValue('unchanged')
  await input.fill('browser-runtime-test-001')

  await expect(page.getByRole('button', { name: /Protected save/i })).toBeVisible()
  await expect(page.locator('[data-browser-sandbox="save-success"]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/browser-sandbox\/login$/)
})

test('protected save persists the entered sandbox value and exposes a verifiable success state', async ({ page }) => {
  await openSandboxSettings(page)

  await page.getByLabel(/Test environment value/i).fill('browser-runtime-test-001')
  await page.getByRole('button', { name: /Protected save/i }).click()

  const status = page.locator('[data-browser-sandbox="save-success"]')
  await expect(status).toBeVisible()
  await expect(status).toContainText('Saved successfully')
  await expect(page.locator('[data-saved-value]')).toHaveText('browser-runtime-test-001')
})
