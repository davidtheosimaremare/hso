import { test, expect } from '@playwright/test';

test.describe('HSQ Sinova 3VJ Product E2E Test Suite', () => {
  const email = process.env.TEST_USER_EMAIL || 'davidtheo@hokiindo.co.id';
  const password = process.env.TEST_USER_PASSWORD || 'akucintayesus';

  test('Sidebar Menu & HSQ 3VJ Products View Functional Test', async ({ page }) => {
    // 1. Login
    await page.goto('/');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();
    await page.waitForURL(/\/(dashboard|sales-orders|collaborate|sales-leads)/, { timeout: 15000 });

    // 2. Check sidebar menu item "HSQ Sinova 3VJ"
    const menuLink = page.locator('aside a[href="/hsq-3vj"], a:has-text("HSQ Sinova 3VJ")').first();
    await expect(menuLink).toBeVisible({ timeout: 10000 });

    // 3. Click menu link and navigate
    await menuLink.click();
    await page.waitForURL('/hsq-3vj', { timeout: 10000 });

    // 4. Verify Page Title
    await expect(page.locator('h1:has-text("Detail Produk HSQ 3VJ")')).toBeVisible({ timeout: 10000 });

    // 5. Verify Action Buttons exist
    const downloadBtn = page.locator('button:has-text("Download Excel")');
    await expect(downloadBtn).toBeVisible();
    await expect(page.locator('button:has-text("Perbarui Data")')).toBeVisible();

    // 6. Verify KPI Summary Cards
    await expect(page.locator('text=Total Baris Item')).toBeVisible();
    await expect(page.locator('text=Total Volume Qty')).toBeVisible();
    await expect(page.locator('text=Part Number Unik')).toBeVisible();
    await expect(page.locator('text=Dokumen HSQ')).toBeVisible();

    // 7. Verify Table Header & Columns
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(page.locator('th:has-text("Kode SKU 3VJ")')).toBeVisible();
    await expect(page.locator('th:has-text("Qty")')).toBeVisible();
    await expect(page.locator('th:has-text("Nomor HSQ")')).toBeVisible();
    await expect(page.locator('th:has-text("Tanggal HSQ")')).toBeVisible();
    await expect(page.locator('th:has-text("Nama Produk")')).toBeVisible();
    await expect(page.locator('th:has-text("Customer")')).toBeVisible();

    // 8. Verify Table Row contains 3VJ SKU
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator('td').nth(1)).toContainText('3VJ');

    // 9. Test Year Filter Tabs (2025)
    await page.locator('[data-testid="btn-year-2025"]').click();
    await page.waitForTimeout(500);
    const row2025 = page.locator('tbody tr').first();
    await expect(row2025).toBeVisible();
    await expect(row2025.locator('td').nth(4)).toContainText('2025');

    // Reset to ALL years
    await page.locator('[data-testid="btn-year-ALL"]').click();
    await page.waitForTimeout(300);

    // 10. Test Search Input
    const searchInput = page.locator('input[placeholder*="Cari SKU"]');
    await searchInput.fill('3VJ11');
    await page.waitForTimeout(300);
    const filteredRow = page.locator('tbody tr').first();
    await expect(filteredRow.locator('td').nth(1)).toContainText('3VJ11');

    // 11. Test Group View Mode
    const rekapBtn = page.locator('button:has-text("Rekap per SKU")');
    await rekapBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('th:has-text("Total Qty (pcs)")')).toBeVisible();
    await expect(page.locator('th:has-text("Frekuensi Quote")')).toBeVisible();
  });
});
