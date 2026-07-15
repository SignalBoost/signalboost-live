import { test, expect } from '@playwright/test';

test('Stripe payment checkout flow', async ({ page }) => {
  // Use relative path
  await page.goto('/pricing');
  
  // Click upgrade
  const upgradeButton = page.getByRole('link', { name: /Upgrade Now|Get Started/i }).first();
  await upgradeButton.click();

  // Wait for payment provider page
  await page.waitForURL(/.*stripe.*/);

  // Fill test card details
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Card number').fill('4242' + '4242' + '4242' + '4242');
  await page.getByLabel('Expiry').fill('12/26');
  await page.getByLabel('CVC').fill('123');
  await page.getByLabel('Name on card').fill('Test User');
  
  // Pay
  await page.getByRole('button', { name: /Pay/i }).click();

  // Success check
  await expect(page).toHaveURL(/.*success.*/);
});
