import { test, expect } from '@playwright/test';

test.describe('PO Siemens Sinova Product-First E2E Test Suite', () => {
  const email = process.env.TEST_USER_EMAIL || 'admin@hokiindo.co.id';
  const password = process.env.TEST_USER_PASSWORD || 'akucintayesus';

  test('Sidebar Menu & PO Siemens Sinova Products View Functional Test', async ({ page }) => {
    // 1. Login
    await page.goto('/');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();
    await page.waitForURL(/\/(dashboard|sales-orders|collaborate|sales-leads)/, { timeout: 15000 });

    // 2. Check sidebar menu item "PO Siemens Sinova" under Setting
    const menuLink = page.locator('aside a[href="/po-siemens-sinova"], a:has-text("PO Siemens Sinova")').first();
    await expect(menuLink).toBeVisible({ timeout: 10000 });

    // 3. Click menu link and navigate
    await menuLink.click();
    await page.waitForURL('/po-siemens-sinova', { timeout: 10000 });

    // 4. Verify Page Title & Badges
    await expect(page.locator('h1:has-text("PO Siemens Sinova")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=List Produk: 3VJ • 3MT • 3MU • 3WJ • 5TJ')).toBeVisible();

    // 5. Wait for data to load
    await expect(page.locator('text=Sedang memuat data')).not.toBeVisible({ timeout: 15000 });

    // 6. Verify Product-Centric KPI Cards are rendered
    await expect(page.locator('text=Item Dipesan').first()).toBeVisible();
    await expect(page.locator('text=Total Kuantitas').first()).toBeVisible();
    await expect(page.locator('text=Pabrik / Forwarder').first()).toBeVisible();
    await expect(page.locator('text=Transit / ETA Port').first()).toBeVisible();
    await expect(page.locator('text=Gudang Siemens').first()).toBeVisible();
    await expect(page.locator('text=Tiba di Hokiindo').first()).toBeVisible();

    // 7. Verify Product Table Header & Columns (Product is Primary Data)
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(page.locator('th:has-text("Kode SKU / Part Number")')).toBeVisible();
    await expect(page.locator('th:has-text("Nama & Spesifikasi Produk")')).toBeVisible();
    await expect(page.locator('th:has-text("Qty")')).toBeVisible();
    await expect(page.locator('th:has-text("Nomor HPO")')).toBeVisible();
    await expect(page.locator('th:has-text("Vendor")')).toBeVisible();
    await expect(page.locator('th:has-text("Status Logistik")')).toBeVisible();
    await expect(page.locator('th:has-text("Jadwal Logistik")')).toBeVisible();

    // 8. Verify First Row contains a Sinova SKU (starts with 3VJ, 3MT, 3MU, 3WJ, or 5TJ)
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator('td').nth(1)).toContainText(/(3VJ|3MT|3MU|3WJ|5TJ)/);

    // 9. Test Filter by SKU Category Pill (e.g. 3VJ)
    const btn3VJ = page.locator('button:has-text("3VJ")').first();
    await btn3VJ.click();
    await page.waitForTimeout(500);

    // Verify filtered table shows 3VJ products
    const filteredRow = page.locator('tbody tr').first();
    await expect(filteredRow.locator('td').nth(1)).toContainText('3VJ');

    // Reset back to "Semua Produk"
    const btnAll = page.locator('button:has-text("Semua Produk")').first();
    await btnAll.click();
    await page.waitForTimeout(500);

    // 10. Test View Mode Toggle: Rekap per Part Number
    const btnRekap = page.locator('button:has-text("Rekap per Part Number")');
    await btnRekap.click();
    await page.waitForTimeout(500);
    await expect(page.locator('th:has-text("Total Dipesan")')).toBeVisible();
    await expect(page.locator('th:has-text("Jumlah HPO")')).toBeVisible();

    // Toggle back to List Produk (Utama)
    const btnList = page.locator('button:has-text("List Produk (Utama)")');
    await btnList.click();
    await page.waitForTimeout(500);
    await expect(page.locator('th:has-text("Kode SKU / Part Number")')).toBeVisible();

    // 11. Test Quick Product Detail Modal
    const infoBtn = page.locator('tbody tr').first().locator('button[title="Lihat Detail Produk"]');
    await infoBtn.click();
    await expect(page.locator('div[role="dialog"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Jadwal & Riwayat Logistik')).toBeVisible();

    // Close modal
    const closeBtn = page.locator('button:has-text("Tutup")');
    await closeBtn.scrollIntoViewIfNeeded();
    await closeBtn.click({ force: true });
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
  });
});
