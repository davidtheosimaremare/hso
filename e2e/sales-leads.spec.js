import { test, expect } from '@playwright/test';

test.describe('HIR Workspace Real Login & Sales Leads E2E Suite', () => {

  const email = process.env.TEST_USER_EMAIL || 'admin@hokiindo.co.id';
  const password = process.env.TEST_USER_PASSWORD || 'akucintayesus';

  test('1. Real Supabase Login Test', async ({ page }) => {
    await page.goto('/');
    
    // Fill credentials from .env
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);

    // Click Login
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();

    // Verify successful login redirect to dashboard
    await expect(page).toHaveURL(/\/(dashboard|sales-orders|collaborate|sales-leads)/, { timeout: 15000 });
  });

  test('2. Real Sales Leads Full CRUD & Navigation Flow', async ({ page }) => {
    // Auto-accept confirmation dialogs
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Step 1: Login
    await page.goto('/');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();
    await page.waitForURL(/\/(dashboard|sales-orders|collaborate|sales-leads)/, { timeout: 15000 });

    // Step 2: Navigate to Sales Leads
    await page.goto('/sales-leads');
    await expect(page.locator('h1:has-text("Database Lead Sales")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Memuat database lead...')).not.toBeVisible({ timeout: 10000 });

    // --- CREATE ---
    const addBtn = page.getByRole('button', { name: 'Tambah Data Lead' });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Wait for modal form
    const form = page.locator('form');
    await expect(form).toBeVisible();

    const testCompanyName = `PT E2E Live Test ${Date.now()}`;
    await form.locator('input[placeholder*="Elektrika"]').fill(testCompanyName);
    await form.locator('input[placeholder*="Budi"]').fill('Pak David (Procurement)');
    await form.locator('input[placeholder*="081234567890"]').fill('081234567890');
    await form.locator('input[placeholder*="budi@elektrika"]').fill('david.e2e@hokiindo.co.id');
    await form.locator('input[placeholder*="Surabaya"]').fill('Jakarta Barat');
    await form.locator('input[placeholder*="Industri Raya"]').fill('Jl. Daan Mogot No. 100');

    // Click Submit in form
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('form')).not.toBeVisible({ timeout: 10000 });

    // --- READ ---
    await expect(page.locator('table')).toContainText(testCompanyName, { timeout: 10000 });

    // --- UPDATE ---
    const row = page.locator('tr', { hasText: testCompanyName });
    await row.locator('button[title="Edit Lead"]').click();

    const updatedCompanyName = `${testCompanyName} (VERIFIED)`;
    const editForm = page.locator('form');
    await expect(editForm).toBeVisible();
    await editForm.locator('input[placeholder*="Elektrika"]').fill(updatedCompanyName);
    await editForm.locator('button[type="submit"]').click();
    await expect(editForm).not.toBeVisible({ timeout: 10000 });

    // Verify update in table
    await expect(page.locator('table')).toContainText(updatedCompanyName, { timeout: 10000 });

    // --- ACTIVITY LOG ---
    const updatedRow = page.locator('tr', { hasText: updatedCompanyName });
    await updatedRow.locator('button[title*="Aktivitas Sales"]').click();

    await page.fill('textarea[placeholder*="Tuliskan aktivitas"]', 'Pengetesan E2E otomatis dengan akun nyata Supabase');
    await page.getByRole('button', { name: 'Simpan Catatan Aktivitas' }).click();

    // Verify activity history note
    await expect(page.locator('h3:has-text("Riwayat & Catatan Aktivitas Sales")')).toBeVisible();
    await expect(page.locator('p:has-text("Pengetesan E2E otomatis dengan akun nyata Supabase")')).toBeVisible();

    // Close activity modal
    await page.locator('div.fixed.z-50 button').first().click();

    // --- DELETE ---
    await updatedRow.locator('button[title="Hapus Lead"]').click();

    // Verify lead is deleted (table removed or text absent)
    await expect(page.locator('body')).not.toContainText(updatedCompanyName);
  });

});
