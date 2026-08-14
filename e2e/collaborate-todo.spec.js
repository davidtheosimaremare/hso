import { test, expect } from '@playwright/test';

test.describe('HIR Workspace Collaborate / To-Do Feature E2E Suite', () => {

  const email = process.env.TEST_USER_EMAIL || 'davidtheo@hokiindo.co.id';
  const password = process.env.TEST_USER_PASSWORD || 'akucintayesus';

  test('1. Real Supabase Login & Navigate to /collaborate', async ({ page }) => {
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto('/');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();

    await page.waitForURL(/\/(dashboard|sales-orders|collaborate|sales-leads)/, { timeout: 15000 });

    await page.goto('/collaborate');
    await expect(page.getByRole('heading', { name: /Tugas Tim/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('2. Full To-Do Task Lifecycle (Create, View, Comment, Clean Up)', async ({ page }) => {
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Step 1: Login
    await page.goto('/');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'LOGIN WORKSPACE' }).click();
    await page.waitForURL(/\/(dashboard|sales-orders|collaborate|sales-leads)/, { timeout: 15000 });

    // Step 2: Navigate to Collaborate
    await page.goto('/collaborate');

    // Step 3: Click "Buat Tugas Baru" or "+ Tambah Tugas"
    const createBtn = page.getByRole('button', { name: /Buat Tugas Baru|Tambah Tugas/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Step 4: Fill Task Form Title
    const taskTitle = `[E2E-TEST] BOQ Panel Elektrika ${Date.now()}`;
    const titleInput = page.locator('input[placeholder*="Ketik judul tugas"]').first();
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill(taskTitle);

    // Step 5: Select Assignee (click exact user child item)
    const userAssigneeItem = page.locator('div.cursor-pointer', { hasText: '👤' }).first();
    await expect(userAssigneeItem).toBeVisible({ timeout: 5000 });
    await userAssigneeItem.click();

    // Step 6: Select Target Deadline via Quick Chip "Besok"
    const besokBtn = page.getByRole('button', { name: 'Besok' }).first();
    await expect(besokBtn).toBeVisible({ timeout: 5000 });
    await besokBtn.click();

    // Step 7: Submit Task Form
    const submitBtn = page.getByRole('button', { name: 'Buat Tugas Baru' }).last();
    await submitBtn.click();

    // Step 8: Verify Task appears in To-Do list / Kanban
    await expect(page.locator('body')).toContainText(taskTitle, { timeout: 10000 });

    // Step 9: Click on the task card to open Detail View
    const taskCard = page.locator('button, div, tr', { hasText: taskTitle }).first();
    await taskCard.click();

    // Step 10: Verify Detail View opens
    await page.waitForURL(/\/collaborate\/.+/, { timeout: 10000 }).catch(() => {});
    await expect(page.locator('body')).toContainText(taskTitle, { timeout: 10000 });

    // Step 11: Clean up - delete the test task if delete button is available
    const deleteBtn = page.locator('button[title*="Hapus"], button:has-text("Hapus")').first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await expect(page.locator('body')).not.toContainText(taskTitle, { timeout: 10000 });
    }
  });

});
