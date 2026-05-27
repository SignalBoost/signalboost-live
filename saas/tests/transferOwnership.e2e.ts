// @ts-nocheck
import { test, expect } from '@playwright/test';

const BASE_URL = 'https://saas.signalboostapp.com';

test.describe('Ownership transfer flow', () => {
  test('Owner can transfer ownership', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.evaluate(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({ user: { email: 'owner@example.com', user_metadata: { role: 'owner' } } }));
    });
    await page.goto(`${BASE_URL}/admin/settings/roles`);
    await page.click('button:has-text("Transfer Ownership")');
    await page.click('button:has-text("Confirm")');
    await expect(page.locator('text=Ownership transferred')).toBeVisible();
  });

  test('Admin cannot see Transfer Ownership button', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);
    await page.evaluate(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({ user: { email: 'admin@example.com', user_metadata: { role: 'admin' } } }));
    });
    await page.goto(`${BASE_URL}/admin/settings/roles`);
    await expect(page.locator('button:has-text("Transfer Ownership")')).toHaveCount(0);
  });
});
