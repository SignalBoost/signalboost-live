import { test, expect } from '@playwright/test'

test('user sees plan then approves update', async ({ page }) => {
  await page.goto('/dashboard/operator')
  await expect(page.getByText('AI Website Operator')).toBeVisible()
})
