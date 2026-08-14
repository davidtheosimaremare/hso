# AGENTS.md - HSO (Hokiindo System Operations) Guidelines

Welcome AI Agents! This file outlines the key context, tech stack, codebase structure, and conventions for the **HSO** repository to ensure efficient, token-saving interaction.

---

## 🚀 Quick Reference Commands
ta
- **Development Server**: `npm run dev` (Runs Vite dev server at `http://localhost:5173`)
- **Production Build**: `npm run build` (Compiles assets into `dist/`)
- **E2E Testing**: `npx playwright test` (Runs Playwright automated E2E tests)
- **Interactive UI Testing**: `npx playwright test --ui`

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: Vue 3 (Composition API `<script setup>`), Vue Router 4, Tailwind CSS, Lucide Icons (`lucide-vue-next`).
- **Backend & Database**: Supabase JS Client (`@supabase/supabase-js`), PostgreSQL with RLS & Realtime enabled.
- **Build Tool**: Vite 7.
- **E2E Testing**: Playwright (`@playwright/test`).
- **Architecture Graph**: Indexed in `graphify-out/` (Use `graphify` query for deep structural relationship checks).

---

## 📁 Folder Structure

```
hso/
├── e2e/                      # Playwright E2E integration tests (e.g. sales-leads.spec.js)
├── graphify-out/             # Pre-built Knowledge Graph analysis index for token-efficient architecture queries
├── src/
│   ├── assets/               # Commits metadata & static assets
│   ├── components/           # Reusable Vue components (UI elements, modals)
│   ├── layouts/              # MainLayout.vue (RBAC sidebar), PublicLayout.vue
│   ├── lib/                  # supabase.js (Supabase client instance)
│   ├── router/               # index.js (Vue Router setup & RBAC navigation guard)
│   └── views/                # Feature Views (SalesLeadsView, DashboardView, HsqListView, etc.)
├── supabase/
│   └── migrations/           # SQL Migration files (e.g. sales_leads schema, RBAC tables)
└── playwright.config.js      # Playwright test config (configured for baseURL http://localhost:5173)
```

---

## 📐 Development Conventions & Rules

1. **UI & Styling**:
   - Use Tailwind CSS with clean, modern aesthetics (rounded cards, soft badges, dark mode support).
   - Ensure fluid response across screen sizes without content shifting.

2. **Data & Supabase Integration**:
   - Maintain **Optimistic UI Updates** pattern for seamless user experience. Update local reactive state (`ref`) instantly and sync with Supabase asynchronously.
   - Maintain `localStorage` caching fallback (e.g., `sales_leads_cache`) so UI remains functional even during offline / network hiccups.

3. **Authentication & RBAC**:
   - Route access is guarded by `router.beforeEach` in `src/router/index.js`.
   - Single active session per user is tracked via `hir_active_session_id`.
   - E2E testing supports `window.__E2E_TEST__ = true` for fast isolated test execution.

4. **Database Migrations**:
   - Place all SQL updates in `supabase/migrations/YYYYMMDDHHMMSS_description.sql`.
   - Ensure RLS policies and publication updates (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`) are included where realtime is needed.

5. **E2E Testing**:
   - All tests in `e2e/` must be self-cleaning (e.g. delete created test items before finishing).
   - Read test credentials safely from `.env` (`TEST_USER_EMAIL` and `TEST_USER_PASSWORD`).

---
