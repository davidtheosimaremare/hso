# Graph Report - .  (2026-08-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1753 nodes · 2312 edges · 139 communities (99 shown, 40 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `00cf944b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MarketingHubView.vue
- PermintaanView.vue
- SalesOrderDetailView.vue
- PermintaanDetailView.vue
- SalesOrderView.vue
- CartView.vue
- LogisticsDbView.vue
- DashboardView.vue
- PurchaseOrderListView.vue
- DeliveryOrderListView.vue
- ReceiveItemListView.vue
- HsqListView.vue
- SettingsView.vue
- InvoicePriorityCard.vue
- HsqDetailView.vue
- HSOPriorityCard.vue
- dropdown-menu/index.js
- TrackingView.vue
- select/index.js
- MainLayout.vue
- dialog/index.js
- HpbListView.vue
- sheet/index.js
- getHpoEntries
- PurchaseOrderDetailView.vue
- utils.js
- DevUpdatesView.vue
- ReceiveItemDetailView.vue
- components.json
- HSQPriorityCard.vue
- TargetTrajectoryChart.vue
- cn
- NotificationsView.vue
- dependencies
- TabsTrigger.vue
- PublicTrackingView.vue
- isDisplayedFullyShipped
- accurate-webhook-handler/index.ts
- devDependencies
- HpbDetailView.vue
- parseMeta
- parseMeta
- supabase.js
- filterTasksByPeriod
- RichTextEditor.vue
- useAccurateSync.js
- MonthlyTargetCard.vue
- DeliveryOrderDetailView.vue
- router/index.js
- AccurateSyncWidget.vue
- getLocalData
- fetchDetail
- sync-accurate-pos-recent/index.ts
- exportToExcel
- sync-accurate-po-single/index.ts
- scripts
- badge/index.js
- Checkbox.vue
- fetchEvents
- getDisplayAssignees
- package.json
- DropdownMenuCheckboxItem.vue
- DropdownMenuSubContent.vue
- get-stock-availability/index.ts
- check_shipments.cjs
- compilerOptions
- button/index.js
- DropdownMenuItem.vue
- SelectScrollDownButton.vue
- Separator.vue
- stopTyping
- submitForm
- exportToPDF
- imports
- imports
- check_so_116.mjs
- fetchHsqTrackingData
- formatUserName
- getLocalDate
- submitIdea
- updateStatus
- openEditModal
- ganttBarStyle
- fetchDetail
- extractProjectFromItem
- parseAccurateDate
- accurate-create-hpb/index.ts
- accurate-list-po/index.ts
- sync-accurate-dos/index.ts
- sync-accurate-pos/index.ts
- sync-accurate-receive-items/index.ts
- jspdf
- lucide-vue-next
- p-limit
- reka-ui
- @supabase/supabase-js
- vue-draggable-next
- clsx
- @vueuse/core
- HelloWorld.vue
- doGlobalSearch
- formatIdr
- saveEditTask
- handleFileChange
- descPreview
- applyDateFilter
- accurate-create-hpb/deno.json
- accurate-detail-so/deno.json
- accurate-list-do/index.ts
- accurate-list-so/deno.json
- accurate-list-tracking-so/deno.json
- accurate-print-doc/deno.json
- create-user/index.ts
- get-stock-availability/deno.json
- temp-migration/deno.json
- temp-migration-hso/deno.json
- temp-migration-hso/index.ts
- upload-to-drive/index.ts
- vercel.json

## God Nodes (most connected - your core abstractions)
1. `cn()` - 56 edges
2. `supabase` - 28 edges
3. `getHpoEntries()` - 19 edges
4. `parseMeta()` - 13 edges
5. `isDisplayedFullyShipped()` - 12 edges
6. `parseMeta()` - 11 edges
7. `getVisualStatus()` - 10 edges
8. `filterTasksByPeriod()` - 10 edges
9. `getHpoShipment()` - 9 edges
10. `getDisplayedQtyShipped()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `bulkDownloadReminderPO()` --calls--> `isDisplayedFullyShipped()`  [INFERRED]
  src/views/SalesOrderView.vue → src/views/SalesOrderDetailView.vue
- `priorityList` --calls--> `parseStockFromNote()`  [INFERRED]
  src/components/dashboard/HSOPriorityCard.vue → src/views/SalesOrderDetailView.vue
- `bulkDownloadReminderPO()` --calls--> `getHpoEntries()`  [INFERRED]
  src/views/SalesOrderView.vue → src/views/SalesOrderDetailView.vue
- `bulkDownloadReminderPO()` --calls--> `getHpoReferenceType()`  [INFERRED]
  src/views/SalesOrderView.vue → src/views/SalesOrderDetailView.vue
- `bulkDownloadReminderPO()` --calls--> `getHpoShipment()`  [INFERRED]
  src/views/SalesOrderView.vue → src/views/SalesOrderDetailView.vue

## Import Cycles
- None detected.

## Communities (139 total, 40 thin omitted)

### Community 0 - "MarketingHubView.vue"
Cohesion: 0.02
Nodes (79): activeFilter, activeStatus, activeTab, attachmentPreviewUrl, calendarCells, canSubmit, commentAttachment, commentAttachmentPreview (+71 more)

### Community 1 - "PermintaanView.vue"
Cohesion: 0.02
Nodes (55): accurateCustomers, activePeriod, allTasksRaw, assigneeFilterOpen, attachmentMode, availablePeriods, boardColumns, boardCustomFrom (+47 more)

### Community 2 - "SalesOrderDetailView.vue"
Cohesion: 0.03
Nodes (60): activityLogs, allowedModules, canWrite, cartItems, copiedPartNumber, copiedRowCode, copiedSku, currentUser (+52 more)

### Community 3 - "PermintaanDetailView.vue"
Cohesion: 0.04
Nodes (32): accurateCustomers, attachmentMode, canChangeStatus, comments, currentUserEmail, customerComboboxRef, customerSearchQuery, doneSubtasksCount (+24 more)

### Community 4 - "SalesOrderView.vue"
Cohesion: 0.04
Nodes (33): availableStatuses, bulkModeType, bulkProgress, bulkStatus, currentPage, currentStatusesStr, dateFilterOption, dateRangeLabel (+25 more)

### Community 5 - "CartView.vue"
Cohesion: 0.04
Nodes (37): activeGroupForHpb, activeStockSku, activeTab, allowedModules, canWrite, checkedCount, collapsedGroups, copiedSku (+29 more)

### Community 6 - "LogisticsDbView.vue"
Cohesion: 0.06
Nodes (43): allowedModules, appliedUpdatesCount, applyAllSyncUpdates(), canWrite, clearTrackingDb(), currentPage, deleteRow(), excelFileInput (+35 more)

### Community 7 - "DashboardView.vue"
Cohesion: 0.06
Nodes (40): chartZoom, customerAnalytics, fetchData(), getCandleColor(), getPODateRange(), getSummaryDateRange(), hsoStatusData, hsoStatusFilter (+32 more)

### Community 8 - "PurchaseOrderListView.vue"
Cohesion: 0.05
Nodes (32): availableStatuses, checkAndTriggerAutoSync(), currentPage, dateRangeLabel, endDate, exportToExcel(), exportToPDF(), fetchOrders() (+24 more)

### Community 9 - "DeliveryOrderListView.vue"
Cohesion: 0.05
Nodes (31): availableStatuses, checkAndTriggerAutoSync(), currentPage, dateFilterOption, deliveryOrders, endDate, exportToExcel(), exportToPDF() (+23 more)

### Community 10 - "ReceiveItemListView.vue"
Cohesion: 0.05
Nodes (31): availableStatuses, checkAndTriggerAutoSync(), currentPage, dateFilterOption, endDate, exportToExcel(), exportToPDF(), fetchOrders() (+23 more)

### Community 11 - "HsqListView.vue"
Cohesion: 0.06
Nodes (31): activeDateShortcut, applyDateFilter(), availableStatuses, currentPage, dateFilterOption, endDate, endIndex, fetchError (+23 more)

### Community 12 - "SettingsView.vue"
Cohesion: 0.06
Nodes (28): props, props, props, avatarVariant, delegatedProps, props, delegatedProps, emits (+20 more)

### Community 13 - "InvoicePriorityCard.vue"
Cohesion: 0.06
Nodes (31): availableYears, CLOSED_STATUSES, currentPage, currentPageUnshipped, formatCurrency(), formatCurrencyShort(), formatDateId(), getHsoRef() (+23 more)

### Community 14 - "HsqDetailView.vue"
Cohesion: 0.05
Nodes (27): activityForm, activityLogs, activityTypes, availableStages, combinedActivityFeed, editingActivityId, editingTaskId, fetchError (+19 more)

### Community 15 - "HSOPriorityCard.vue"
Cohesion: 0.07
Nodes (27): currentPage, dismissedOrders, emit, fetchDetailsForList(), formatCurrency(), formatCurrencyShort(), formatDateId(), getAgeDays() (+19 more)

### Community 16 - "dropdown-menu/index.js"
Cohesion: 0.05
Nodes (27): emits, forwarded, props, delegatedProps, emits, forwarded, props, props (+19 more)

### Community 17 - "TrackingView.vue"
Cohesion: 0.06
Nodes (24): emits, modelValue, props, delegatedProps, props, calculateNeeds(), currentPage, expandedGroups (+16 more)

### Community 18 - "select/index.js"
Cohesion: 0.06
Nodes (23): emits, forwarded, props, delegatedProps, emits, forwarded, props, delegatedProps (+15 more)

### Community 19 - "MainLayout.vue"
Cohesion: 0.06
Nodes (24): allowedModules, cartItemCount, filteredMenuGroups, globalSearch, hasSearchResults, isDarkMode, isLogistikOpen, isNotifOpen (+16 more)

### Community 20 - "dialog/index.js"
Cohesion: 0.06
Nodes (21): emits, forwarded, props, props, delegatedProps, emits, forwarded, props (+13 more)

### Community 21 - "HpbListView.vue"
Cohesion: 0.08
Nodes (21): applyDateFilter(), availableStatuses, currentPage, dateFilterOption, endDate, endIndex, fetchError, filteredHpbList (+13 more)

### Community 22 - "sheet/index.js"
Cohesion: 0.08
Nodes (16): sheetVariants, emits, forwarded, props, props, delegatedProps, emits, forwarded (+8 more)

### Community 23 - "getHpoEntries"
Cohesion: 0.15
Nodes (25): exportAllHpoExcel(), exportFullHsoExcel(), exportReminderExcel(), fetchHdoInBackground(), filteredItems, formatDateSimple(), getHpoBreakdown(), getHpoDisplayDate() (+17 more)

### Community 24 - "PurchaseOrderDetailView.vue"
Cohesion: 0.09
Nodes (14): allowedModules, canWrite, copiedSku, errorMessage, isLoading, isRealtimeConnected, isRefreshing, poDetail (+6 more)

### Community 25 - "utils.js"
Cohesion: 0.13
Nodes (10): props, props, props, props, delegatedProps, props, props, props (+2 more)

### Community 26 - "DevUpdatesView.vue"
Cohesion: 0.11
Nodes (13): activeTab, calendarCells, commits, commitsByDate, copiedHash, currentMonth, currentYear, dayNames (+5 more)

### Community 27 - "ReceiveItemDetailView.vue"
Cohesion: 0.11
Nodes (12): errorMessage, isLoading, isRealtimeConnected, isRefreshing, poData, poItems, realtimeUpdatePulse, refreshMessage (+4 more)

### Community 28 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, composables, lib, ui, utils, iconLibrary, registries (+9 more)

### Community 29 - "HSQPriorityCard.vue"
Cohesion: 0.15
Nodes (12): currentPage, formatCurrency(), formatCurrencyShort(), formatDateId(), getAgeDays(), pageSize, paginatedList, parseAccurateDate() (+4 more)

### Community 30 - "TargetTrajectoryChart.vue"
Cohesion: 0.15
Nodes (16): actualAreaPathString, actualLinePoints, actualPolylineString, currentMonthIdx, currentYear, formatCurrency(), formatCurrencyShort(), getYCoord() (+8 more)

### Community 31 - "cn"
Cohesion: 0.15
Nodes (9): props, props, props, props, props, props, delegatedProps, props (+1 more)

### Community 32 - "NotificationsView.vue"
Cohesion: 0.15
Nodes (14): currentPage, fetchAll(), goTo(), isLoading, markAllRead(), markRead(), moduleMeta, notifications (+6 more)

### Community 33 - "dependencies"
Cohesion: 0.13
Nodes (15): class-variance-authority, jspdf-autotable, dependencies, class-variance-authority, jspdf-autotable, tailwind-merge, tailwindcss-animate, vue (+7 more)

### Community 34 - "TabsTrigger.vue"
Cohesion: 0.13
Nodes (10): emits, forwarded, props, delegatedProps, props, delegatedProps, props, delegatedProps (+2 more)

### Community 35 - "PublicTrackingView.vue"
Cohesion: 0.15
Nodes (9): expandedSections, exportToExcel(), fetchError, formatDate(), groupedData, isLoading, route, soHeader (+1 more)

### Community 36 - "isDisplayedFullyShipped"
Cohesion: 0.25
Nodes (14): getDisplayedQtyRemaining(), getDisplayedQtyShipped(), getHdoNumber(), getHdoQty(), getHdosForItem(), getHpoDisplayStatus(), getRowStatus(), getSingleHdoQty() (+6 more)

### Community 37 - "accurate-webhook-handler/index.ts"
Cohesion: 0.32
Nodes (12): buildAccurateHeaders(), createHmacSha256(), extractHso(), formatDate(), handleDeliveryOrder(), handlePurchaseOrder(), handleReceiveItem(), handleSalesOrder() (+4 more)

### Community 38 - "devDependencies"
Cohesion: 0.15
Nodes (13): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, @types/node, vite, @vitejs/plugin-vue (+5 more)

### Community 39 - "HpbDetailView.vue"
Cohesion: 0.17
Nodes (7): exportToExcel(), fetchError, formatDate(), isLoading, route, router, selectedHpb

### Community 40 - "parseMeta"
Cohesion: 0.20
Nodes (12): getCustomerName, getLocalMeta(), getPicName, getProjectName, parseMeta(), recurringInfo, statusHistory, taskAssignees (+4 more)

### Community 41 - "parseMeta"
Cohesion: 0.29
Nodes (12): fetchAccurateCustomers(), fetchUsers(), getCustomerName(), getFileLink(), getLocalMeta(), getPicName(), getProjectName(), getTaskAttachments() (+4 more)

### Community 42 - "supabase.js"
Cohesion: 0.20
Nodes (8): supabase, email, errorMessage, isLoading, password, rememberMe, router, showPassword

### Community 43 - "filterTasksByPeriod"
Cohesion: 0.24
Nodes (11): applyBoardDateFilter(), checkAndTriggerDeadlineReminders(), deleteTask(), fetchTasks(), filterTasksByPeriod(), getPeriodFromDate(), handleRealtimeChange(), isOverdue() (+3 more)

### Community 44 - "RichTextEditor.vue"
Cohesion: 0.31
Nodes (8): addLink(), clearFormat(), editorRef, emit, exec(), handleInput(), props, toggleHighlight()

### Community 45 - "useAccurateSync.js"
Cohesion: 0.29
Nodes (9): addLog(), callPagedSync(), getAuthHeaders(), isSyncing, lastSyncTime, syncLog, syncProgress, syncStep (+1 more)

### Community 46 - "MonthlyTargetCard.vue"
Cohesion: 0.28
Nodes (8): currentMonthIdx, currentMonthName, formatCurrency(), formatCurrencyShort(), metrics, monthNames, parseAccurateDate(), props

### Community 47 - "DeliveryOrderDetailView.vue"
Cohesion: 0.22
Nodes (5): doDetail, errorMessage, isLoading, route, router

### Community 49 - "AccurateSyncWidget.vue"
Cohesion: 0.29
Nodes (5): emit, isOpen, {
  isSyncing, syncStep, syncProgress, syncLog,
  lastSyncFormatted, shouldAutoSync,
  syncAll, syncHri, syncHpo, syncHdo
}, props, syncStepLabel

### Community 50 - "getLocalData"
Cohesion: 0.43
Nodes (8): deleteActivityLog(), deleteTask(), getLocalData(), saveActivityLog(), saveHsqProgress(), saveTask(), setLocalData(), toggleTaskStatus()

### Community 51 - "fetchDetail"
Cohesion: 0.25
Nodes (8): addToPurchaseCart(), applyExcelUpdates(), extractProjectFromText(), fetchCartItems(), fetchDetail(), fetchHpoInBackground(), fetchLinkedHpb(), saveUpdate()

### Community 52 - "sync-accurate-pos-recent/index.ts"
Cohesion: 0.39
Nodes (6): extractHso(), formatDate(), safeFloat(), safeInt(), supabase, syncSinglePO()

### Community 53 - "exportToExcel"
Cohesion: 0.29
Nodes (7): exportToExcel(), formatCurrency(), formatDate(), formatDateTime(), getDiscountText(), getLineTotal(), parseAccurateDate()

### Community 55 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, prebuild, predev, preview

### Community 56 - "badge/index.js"
Cohesion: 0.40
Nodes (3): props, badgeVariants, activeTab

### Community 57 - "Checkbox.vue"
Cohesion: 0.33
Nodes (4): delegatedProps, emits, forwarded, props

### Community 58 - "fetchEvents"
Cohesion: 0.33
Nodes (6): buildEventDetailPayload(), fetchEvents(), persistEventDetail(), saveEvent(), saveEventDetailProgress(), scheduleAutoSave()

### Community 59 - "getDisplayAssignees"
Cohesion: 0.33
Nodes (6): assigneeOptions, canChangeStatus(), getDisplayAssignees(), onDrop(), tableTasks, updateStatus()

### Community 61 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 62 - "DropdownMenuCheckboxItem.vue"
Cohesion: 0.40
Nodes (4): delegatedProps, emits, forwarded, props

### Community 63 - "DropdownMenuSubContent.vue"
Cohesion: 0.40
Nodes (4): delegatedProps, emits, forwarded, props

### Community 66 - "compilerOptions"
Cohesion: 0.50
Nodes (3): compilerOptions, baseUrl, paths

### Community 68 - "DropdownMenuItem.vue"
Cohesion: 0.50
Nodes (3): delegatedProps, forwardedProps, props

### Community 69 - "SelectScrollDownButton.vue"
Cohesion: 0.50
Nodes (3): delegatedProps, forwardedProps, props

### Community 71 - "stopTyping"
Cohesion: 0.50
Nodes (4): removeCommentAttachment(), sendTyping(), stopTyping(), submitComment()

### Community 72 - "submitForm"
Cohesion: 0.50
Nodes (4): closeModal(), getWeekOfYear(), showToast(), submitForm()

### Community 73 - "exportToPDF"
Cohesion: 0.50
Nodes (4): exportToExcel(), exportToPDF(), formatCurrency(), getFilename()

### Community 75 - "imports"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

### Community 76 - "imports"
Cohesion: 0.50
Nodes (3): imports, @supabase/functions-js, @supabase/server

### Community 78 - "fetchHsqTrackingData"
Cohesion: 0.67
Nodes (3): fetchHsoUsers(), fetchHsqDetail(), fetchHsqTrackingData()

### Community 79 - "formatUserName"
Cohesion: 0.67
Nodes (3): formatUserName(), formatUserNameList(), getUserInitials()

### Community 80 - "getLocalDate"
Cohesion: 0.67
Nodes (3): startGlobalSync(), getLocalDate(), syncFromLogisticsDb()

### Community 81 - "submitIdea"
Cohesion: 0.67
Nodes (3): closeComposer(), fetchIdeas(), submitIdea()

### Community 82 - "updateStatus"
Cohesion: 0.67
Nodes (3): confirmStatusWithDate(), handleStatusSelect(), updateStatus()

### Community 83 - "openEditModal"
Cohesion: 0.67
Nodes (3): fetchAccurateCustomers(), fetchUsers(), openEditModal()

### Community 84 - "ganttBarStyle"
Cohesion: 0.67
Nodes (3): ganttBarStyle(), getTaskEnd(), getTaskStart()

### Community 85 - "fetchDetail"
Cohesion: 0.67
Nodes (3): extractRef(), fetchDetail(), refreshSinglePO()

### Community 86 - "extractProjectFromItem"
Cohesion: 0.67
Nodes (3): extractProjectFromItem(), extractProjectFromText(), fetchOrders()

### Community 87 - "parseAccurateDate"
Cohesion: 0.67
Nodes (3): filteredAndSortedOrders, formatShortDate(), parseAccurateDate()

## Knowledge Gaps
- **884 isolated node(s):** `activeFilter`, `activeStatus`, `activeTab`, `attachmentPreviewUrl`, `calendarCells` (+879 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `supabase.js` to `MarketingHubView.vue`, `PermintaanView.vue`, `SalesOrderDetailView.vue`, `PermintaanDetailView.vue`, `SalesOrderView.vue`, `CartView.vue`, `LogisticsDbView.vue`, `DashboardView.vue`, `PurchaseOrderListView.vue`, `DeliveryOrderListView.vue`, `ReceiveItemListView.vue`, `HsqListView.vue`, `SettingsView.vue`, `HsqDetailView.vue`, `HSOPriorityCard.vue`, `TrackingView.vue`, `MainLayout.vue`, `HpbListView.vue`, `PurchaseOrderDetailView.vue`, `ReceiveItemDetailView.vue`, `NotificationsView.vue`, `PublicTrackingView.vue`, `HpbDetailView.vue`, `useAccurateSync.js`, `DeliveryOrderDetailView.vue`, `router/index.js`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `TabsTrigger.vue`, `button/index.js`, `DropdownMenuItem.vue`, `SelectScrollDownButton.vue`, `Separator.vue`, `SettingsView.vue`, `dropdown-menu/index.js`, `TrackingView.vue`, `select/index.js`, `dialog/index.js`, `sheet/index.js`, `utils.js`, `badge/index.js`, `Checkbox.vue`, `DropdownMenuCheckboxItem.vue`, `DropdownMenuSubContent.vue`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `bulkDownloadReminderPO()` connect `getHpoEntries` to `SalesOrderView.vue`, `isDisplayedFullyShipped`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **What connects `activeFilter`, `activeStatus`, `activeTab` to the rest of the system?**
  _884 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MarketingHubView.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.016129032258064516 - nodes in this community are weakly interconnected._
- **Should `PermintaanView.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.023529411764705882 - nodes in this community are weakly interconnected._
- **Should `SalesOrderDetailView.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.02596559558584875 - nodes in this community are weakly interconnected._