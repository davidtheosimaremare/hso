import { test, expect } from '@playwright/test';

test.describe('HSO Sinova 3VJ Product E2E Test Suite', () => {
  const email = process.env.TEST_USER_EMAIL || 'davidtheo@hokiindo.co.id';
  const password = process.env.TEST_USER_PASSWORD || 'akucintayesus';

  test('Sidebar Menu & HSO 3VJ Products View Functional Test', async ({ page }) => {
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 1. Login
    await page.goto('/');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();
    await page.waitForURL(/\/(dashboard|sales-orders|collaborate|sales-leads)/, { timeout: 20000 });

    // 2. Check sidebar menu item "HSO Sinova 3VJ"
    const menuLink = page.locator('aside a[href="/hso-3vj"], a:has-text("HSO Sinova 3VJ")').first();
    await expect(menuLink).toBeVisible({ timeout: 10000 });

    // 3. Click menu link and navigate
    await menuLink.click();
    await page.waitForURL('/hso-3vj', { timeout: 10000 });

    // 4. Verify Page Title
    await expect(page.locator('h1:has-text("Detail Produk HSO Sinova 3VJ")')).toBeVisible({ timeout: 10000 });

    // 5. Verify Action Buttons exist
    const downloadBtn = page.locator('button:has-text("Download Excel")');
    await expect(downloadBtn).toBeVisible();
    await expect(page.locator('button:has-text("Perbarui Data")')).toBeVisible();

    // 6. Verify KPI Summary Cards
    await expect(page.locator('text=Total Baris Item')).toBeVisible();
    await expect(page.locator('text=Total Volume Qty')).toBeVisible();
    await expect(page.locator('text=Part Number Unik')).toBeVisible();
    await expect(page.locator('text=Dokumen HSO')).toBeVisible();

    // 7. Verify Table Header & Columns
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(page.locator('th:has-text("Kode SKU 3VJ")')).toBeVisible();
    await expect(page.locator('th:has-text("Qty")')).toBeVisible();
    await expect(page.locator('th:has-text("Nomor HSO")')).toBeVisible();
    await expect(page.locator('th:has-text("Tanggal HSO")')).toBeVisible();
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
    await page.waitForTimeout(500);

    // 10. Test View Mode Toggle to "Rekap per SKU"
    await page.locator('button:has-text("Rekap per SKU")').click();
    await page.waitForTimeout(500);
    await expect(page.locator('th:has-text("Part Number (SKU 3VJ)")')).toBeVisible();
    await expect(page.locator('th:has-text("Total Qty (pcs)")')).toBeVisible();
    await expect(page.locator('th:has-text("Frekuensi Order")')).toBeVisible();
    await expect(page.locator('th:has-text("Daftar Nomor HSO Terkait")')).toBeVisible();

    // 11. Switch back to "List Item"
    await page.locator('button:has-text("List Item")').click();
    await page.waitForTimeout(500);
    await expect(page.locator('th:has-text("Nomor HSO")')).toBeVisible();
  });
});
