import { test, expect } from '@playwright/test';

test.describe('HIR Component Converter Suite (Schneider & ABB to Siemens)', () => {

  const email = process.env.TEST_USER_EMAIL || 'admin@hokiindo.co.id';
  const password = process.env.TEST_USER_PASSWORD || 'akucintayesus';

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();
    await page.waitForURL(/\/(dashboard|sales-orders|collaborate|sales-leads|tools)/, { timeout: 15000 });
  });

  test('1. Verify Component Converter Single Mode (Schneider & ABB to Siemens)', async ({ page }) => {
    await page.goto('/tools/converter');
    await expect(page.locator('h1:has-text("Konversi Schneider & ABB ke Siemens")')).toBeVisible({ timeout: 10000 });

    // Verify initial auto-converted sample (LC1D25M7)
    await expect(page.locator('text=3RT2026-1AP00').first()).toBeVisible();
    await expect(page.locator('text=11kW').first()).toBeVisible();

    // Test Schneider MCB Conversion: A9F74316
    const searchInput = page.locator('input[placeholder*="Ketik tipe atau spesifikasi"]');
    await searchInput.fill('A9F74316');
    await page.getByRole('button', { name: 'KONVERSI' }).click();

    await expect(page.locator('text=5SL6316-7CC').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=3 Pole (3P)').first()).toBeVisible();
    await expect(page.locator('text=16 A').first()).toBeVisible();

    // Test ABB Contactor Conversion: AF26-30-00-13
    await searchInput.fill('AF26-30-00-13');
    await page.getByRole('button', { name: 'KONVERSI' }).click();
    await expect(page.locator('text=3RT2026-1AP00')).toBeVisible({ timeout: 5000 });
  });

  test('2. Verify Batch & BOQ Multi-Item Converter', async ({ page }) => {
    await page.goto('/tools/converter');
    
    // Switch to Batch sub-tab
    await page.getByRole('button', { name: 'Batch / BOQ Multi-Item' }).click();
    await expect(page.locator('text=Batch & BOQ Multi-Item Converter')).toBeVisible();

    // Click sample tender button
    await page.getByRole('button', { name: 'Muat Contoh BOQ Tender (25 Item)' }).click();

    // Check table results
    await expect(page.locator('table')).toContainText('5SL6316-7CC', { timeout: 8000 });
    await expect(page.locator('table')).toContainText('3RT2026-1AP00');
    await expect(page.locator('text=Terkonversi Sukses')).toBeVisible();
  });

  test('3. Verify Accurate Database Catalog Browser', async ({ page }) => {
    await page.goto('/tools/converter');

    // Switch to Database catalog tab
    await page.getByRole('button', { name: /Katalog Accurate Siemens/ }).click();
    await expect(page.locator('text=Katalog Master Accurate Siemens')).toBeVisible();

    // Check catalog table presence
    await expect(page.locator('table')).toBeVisible();
  });
});
