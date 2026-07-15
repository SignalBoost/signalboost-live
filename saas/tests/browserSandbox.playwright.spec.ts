import { expect, test } from '@playwright/test'

test('sandbox portal prepares a value but blocks protected save before approval', async ({ page }) => {
  await page.goto('/browser-sandbox/login')

  await expect(page.getByText(/SignalBoost Browser Sandbox/i)).toBeVisible()
  await page.getByLabel('Email').fill('mission001@example.test')
  await page.getByLabel('Password').fill('sandbox-only-password')
  await page.getByRole('button', { name: /Sign in/i }).click()

  await expect(page.getByText(/Sandbox dashboard/i)).toBeVisible()
  await page.getByRole('button', { name: /Open settings/i }).click()

  await expect(page.getByText(/Sandbox settings/i)).toBeVisible()
  const valueInput = page.getByLabel(/Test environment value/i)
  const savedValue = page.locator('[data-sandbox-saved-value]')
  const protectedSave = page.getByRole('button', { name: /Protected save/i })

  await expect(valueInput).toHaveValue('unchanged')
  await valueInput.fill('browser-runtime-test-001')
  await expect(valueInput).toHaveValue('browser-runtime-test-001')
  await expect(savedValue).toHaveText(/Saved value: unchanged/i)

  await protectedSave.click()

  await expect(page.getByRole('status')).toHaveText(/Protected save blocked: owner approval is required/i)
  await expect(valueInput).toHaveValue('browser-runtime-test-001')
  await expect(savedValue).toHaveText(/Saved value: unchanged/i)
  await expect(page).toHaveURL(/\/browser-sandbox\/login$/)
})
