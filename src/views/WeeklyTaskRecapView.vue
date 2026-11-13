<template>
  <div class="space-y-6">
    <!-- Breadcrumb & Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200 dark:border-slate-800">
      <div>
        <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
          <RouterLink to="/dashboard" class="hover:text-blue-600 dark:hover:text-blue-400">Dashboard</RouterLink>
          <span>/</span>
          <span>Setting</span>
          <span>/</span>
          <span class="text-gray-800 dark:text-gray-200 font-medium">Rekapan Mingguan HSO</span>
        </div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Mail class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Rekapan Tugas Mingguan HSO
          </h1>
          <span 
            :class="settings.mode === 'test' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'"
            class="px-2.5 py-0.5 text-xs font-semibold rounded-full border flex items-center gap-1.5"
          >
            <span class="w-2 h-2 rounded-full" :class="settings.mode === 'test' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"></span>
            {{ settings.mode === 'test' ? 'MODE PENGETESAN (TEST)' : 'MODE PRODUKSI (LIVE)' }}
          </span>
        </div>
        <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">
          Otomatisasi ringkasan tugas mingguan setiap hari Jumat untuk HSO Siap Kirim, Belum Dipesan, dan Logistik Stagnan.
        </p>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex flex-wrap items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          @click="fetchData(true)" 
          :disabled="isLoadingData" 
          class="gap-1.5 border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-xs"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoadingData }" />
          <span>{{ isLoadingData ? 'Menyinkronkan...' : 'Refresh Data' }}</span>
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          @click="showPreviewModal = true" 
          :disabled="isLoadingData || !taskData"
          class="gap-1.5 border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-xs"
        >
          <Eye class="w-3.5 h-3.5 text-indigo-500" />
          <span>Pratinjau Email</span>
        </Button>
        <Button 
          size="sm" 
          @click="handleSendEmailNow" 
          :disabled="isSendingEmail || isLoadingData || !taskData"
          class="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs"
        >
          <Send class="w-3.5 h-3.5" :class="{ 'animate-spin': isSendingEmail }" />
          <span>{{ isSendingEmail ? 'Mengirim...' : 'Kirim Rekapan Sekarang' }}</span>
        </Button>
      </div>
    </div>

    <!-- Alert / Toast Banner if notification exists -->
    <div 
      v-if="actionBanner.show" 
      class="p-4 rounded-xl border transition-all duration-300 flex items-start justify-between gap-3 shadow-sm"
      :class="actionBanner.success ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'"
    >
      <div class="flex items-start gap-3">
        <CheckCircle2 v-if="actionBanner.success" class="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
        <AlertCircle v-else class="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
        <div class="text-sm">
          <p class="font-semibold">{{ actionBanner.title }}</p>
          <p class="text-xs opacity-90 mt-0.5 leading-relaxed">{{ actionBanner.message }}</p>
        </div>
      </div>
      <button @click="actionBanner.show = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- 3 KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- KPI 1: Siap Kirim -->
      <div 
        @click="activeTab = 'siap_kirim'"
        class="cursor-pointer bg-white dark:bg-slate-900 rounded-xl p-5 border transition-all duration-200 shadow-sm hover:shadow-md relative overflow-hidden"
        :class="activeTab === 'siap_kirim' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800'"
      >
        <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-emerald-50 dark:bg-emerald-950/20 rounded-full blur-xl pointer-events-none"></div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <PackageCheck class="w-5 h-5" />
            </div>
            <div>
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tugas 1</p>
              <h3 class="text-sm font-bold text-gray-900 dark:text-white">Siap Kirim Customer</h3>
            </div>
          </div>
          <span class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {{ taskData ? taskData.counts.siap_kirim : '-' }}
          </span>
        </div>
        <div class="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-600 dark:text-gray-300 flex items-center justify-between">
          <span>Stok tiba di gudang / siap DO</span>
          <span class="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            Lihat List <ArrowRight class="w-3 h-3" />
          </span>
        </div>
      </div>

      <!-- KPI 2: Belum Dipesan -->
      <div 
        @click="activeTab = 'belum_dipesan'"
        class="cursor-pointer bg-white dark:bg-slate-900 rounded-xl p-5 border transition-all duration-200 shadow-sm hover:shadow-md relative overflow-hidden"
        :class="activeTab === 'belum_dipesan' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-gray-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-800'"
      >
        <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-amber-50 dark:bg-amber-950/20 rounded-full blur-xl pointer-events-none"></div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <AlertTriangle class="w-5 h-5" />
            </div>
            <div>
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tugas 2</p>
              <h3 class="text-sm font-bold text-gray-900 dark:text-white">Belum Dipesan (HPO)</h3>
            </div>
          </div>
          <span class="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {{ taskData ? taskData.counts.belum_dipesan : '-' }}
          </span>
        </div>
        <div class="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-600 dark:text-gray-300 flex items-center justify-between">
          <span>HSO aktif belum ada PO vendor</span>
          <span class="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
            Lihat List <ArrowRight class="w-3 h-3" />
          </span>
        </div>
      </div>

      <!-- KPI 3: Logistik Stagnan -->
      <div 
        @click="activeTab = 'logistik_stagnan'"
        class="cursor-pointer bg-white dark:bg-slate-900 rounded-xl p-5 border transition-all duration-200 shadow-sm hover:shadow-md relative overflow-hidden"
        :class="activeTab === 'logistik_stagnan' ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-gray-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800'"
      >
        <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-rose-50 dark:bg-rose-950/20 rounded-full blur-xl pointer-events-none"></div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <Truck class="w-5 h-5" />
            </div>
            <div>
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tugas 3</p>
              <h3 class="text-sm font-bold text-gray-900 dark:text-white">Logistik Stagnan</h3>
            </div>
          </div>
          <span class="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {{ taskData ? taskData.counts.logistik_stagnan : '-' }}
          </span>
        </div>
        <div class="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-600 dark:text-gray-300 flex items-center justify-between">
          <span>Tidak ada update > {{ settings.stagnant_threshold_days }} hari</span>
          <span class="font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
            Lihat List <ArrowRight class="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>

    <!-- Main 2-Column Grid: Settings & Preview / History -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left Column: Settings Form (5 Cols) -->
      <div class="lg:col-span-5 space-y-6">
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 shadow-sm space-y-5">
          <div class="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-slate-800">
            <h2 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sliders class="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Pengaturan & Mode Pengiriman
            </h2>
            <Badge variant="outline" class="text-xs">
              Sistem Aktif
            </Badge>
          </div>

          <!-- Mode Selector (Radio Cards) -->
          <div class="space-y-3">
            <Label class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Pilih Mode Rekapan
            </Label>
            
            <div class="grid grid-cols-1 gap-3">
              <!-- Mode Testing Option -->
              <div 
                @click="formSettings.mode = 'test'"
                class="cursor-pointer rounded-lg p-3.5 border transition-all flex items-start gap-3"
                :class="formSettings.mode === 'test' ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-500' : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'"
              >
                <div class="mt-0.5">
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center" :class="formSettings.mode === 'test' ? 'border-amber-600 bg-amber-600' : 'border-gray-400'">
                    <div v-if="formSettings.mode === 'test'" class="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-bold text-gray-900 dark:text-white">Mode Pengetesan (Testing)</span>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Default Saat Ini</span>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Hanya dikirimkan ke email tester:
                  </p>
                  <p class="text-xs font-mono font-medium text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40 px-2 py-0.5 rounded mt-1.5 inline-block">
                    davidtheosimaremare@gmail.com
                  </p>
                </div>
              </div>

              <!-- Mode Production Option -->
              <div 
                @click="formSettings.mode = 'production'"
                class="cursor-pointer rounded-lg p-3.5 border transition-all flex items-start gap-3"
                :class="formSettings.mode === 'production' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500' : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'"
              >
                <div class="mt-0.5">
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center" :class="formSettings.mode === 'production' ? 'border-emerald-600 bg-emerald-600' : 'border-gray-400'">
                    <div v-if="formSettings.mode === 'production'" class="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-bold text-gray-900 dark:text-white">Mode Produksi (Seharusnya)</span>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Live Team</span>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Dikirim resmi ke seluruh tim operasional:
                  </p>
                  <div class="flex flex-wrap gap-1 mt-1.5">
                    <span v-for="email in formSettings.production_recipients" :key="email" class="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300">
                      {{ email }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Custom Additional Recipients -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Email Penerima Tambahan (Opsional)
              </Label>
              <span class="text-[11px] text-gray-400">Pisahkan dengan koma</span>
            </div>
            <Input 
              v-model="customRecipientsInput" 
              placeholder="contoh: manager@hokiindo.co.id, direktur@gmail.com" 
              class="text-xs dark:bg-slate-800 dark:border-slate-700"
            />
            <p class="text-[11px] text-gray-500 dark:text-gray-400">
              Email di atas akan ikut menerima salinan rekapan baik saat mode testing maupun mode produksi.
            </p>
          </div>

          <!-- Schedule & Threshold Settings -->
          <div class="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
            <div>
              <Label class="text-xs font-semibold text-gray-700 dark:text-gray-300">Hari Rekapan</Label>
              <div class="mt-1 flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-800 dark:text-gray-200">
                <CalendarIcon class="w-4 h-4 text-blue-500" />
                <span>{{ formSettings.day_of_week }} (08:00 WIB)</span>
              </div>
            </div>
            <div>
              <Label class="text-xs font-semibold text-gray-700 dark:text-gray-300">Batas Logistik Stagnan</Label>
              <div class="mt-1 flex items-center gap-2">
                <Input 
                  type="number" 
                  v-model.number="formSettings.stagnant_threshold_days" 
                  min="1" 
                  max="30" 
                  class="text-xs dark:bg-slate-800 dark:border-slate-700 h-9"
                />
                <span class="text-xs text-gray-500">Hari</span>
              </div>
            </div>
          </div>

          <!-- Save Button -->
          <div class="pt-2">
            <Button 
              @click="handleSaveSettings" 
              :disabled="isSavingSettings" 
              class="w-full bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium text-xs h-9 shadow-sm gap-2"
            >
              <Check class="w-4 h-4" v-if="!isSavingSettings" />
              <Loader2 class="w-4 h-4 animate-spin" v-else />
              <span>{{ isSavingSettings ? 'Menyimpan...' : 'Simpan Perubahan Pengaturan' }}</span>
            </Button>
          </div>
        </div>

        <!-- Target Delivery Summary Card -->
        <div class="bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-800 p-4 space-y-2.5">
          <h3 class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
            <Info class="w-3.5 h-3.5 text-blue-500" />
            Ringkasan Target Penerima Saat Ini
          </h3>
          <div class="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
            <div class="flex items-start gap-2">
              <span class="text-gray-400 font-medium">Mode:</span>
              <span class="font-bold" :class="settings.mode === 'test' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">
                {{ settings.mode === 'test' ? 'Pengetesan (Test Send)' : 'Produksi Resmi (Live)' }}
              </span>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-gray-400 font-medium shrink-0">Penerima:</span>
              <div class="flex flex-col gap-1">
                <span v-for="rec in currentActiveRecipients" :key="rec" class="font-mono text-[11px] text-gray-800 dark:text-gray-200">
                  • {{ rec }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-slate-800 text-[11px] text-gray-500">
              <Clock class="w-3.5 h-3.5 text-gray-400" />
              <span>Pengiriman terakhir: {{ settings.last_sent_at ? formatDateTime(settings.last_sent_at) : 'Belum pernah dikirim' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Task List Table & Details (7 Cols) -->
      <div class="lg:col-span-7 space-y-4">
        <!-- Table Card -->
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <!-- Card Header & Filter Tabs -->
          <div class="p-4 border-b border-gray-200 dark:border-slate-800 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ListTodo class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Rincian Tugas HSO Minggu Ini
                </h2>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Daftar HSO yang akan dimasukkan ke dalam rekapan email.
                </p>
              </div>

              <!-- Search -->
              <div class="relative w-full sm:w-60">
                <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input 
                  v-model="searchQuery" 
                  placeholder="Cari HSO, customer, HPO..." 
                  class="pl-8 text-xs h-8 dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>

            <!-- Tabs -->
            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <button 
                @click="activeTab = 'all'"
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                :class="activeTab === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'"
              >
                <span>Semua Tugas</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-bold">
                  {{ taskData ? taskData.counts.total_tasks : 0 }}
                </span>
              </button>

              <button 
                @click="activeTab = 'siap_kirim'"
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                :class="activeTab === 'siap_kirim' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'"
              >
                <span>Siap Kirim</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-bold">
                  {{ taskData ? taskData.counts.siap_kirim : 0 }}
                </span>
              </button>

              <button 
                @click="activeTab = 'belum_dipesan'"
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                :class="activeTab === 'belum_dipesan' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100'"
              >
                <span>Belum Dipesan</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-bold">
                  {{ taskData ? taskData.counts.belum_dipesan : 0 }}
                </span>
              </button>

              <button 
                @click="activeTab = 'logistik_stagnan'"
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                :class="activeTab === 'logistik_stagnan' ? 'bg-rose-600 text-white shadow-sm' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100'"
              >
                <span>Logistik Stagnan</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-bold">
                  {{ taskData ? taskData.counts.logistik_stagnan : 0 }}
                </span>
              </button>
            </div>
          </div>

          <!-- Table Content -->
          <div class="overflow-x-auto min-h-[320px]">
            <div v-if="isLoadingData" class="flex flex-col items-center justify-center p-12 text-gray-400 gap-2">
              <Loader2 class="w-8 h-8 animate-spin text-blue-500" />
              <p class="text-xs">Mengompilasi data tugas dari Accurate & Supabase...</p>
            </div>

            <div v-else-if="filteredTaskList.length === 0" class="flex flex-col items-center justify-center p-12 text-gray-400 gap-2">
              <CheckCircle2 class="w-10 h-10 text-emerald-500" />
              <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">Tidak ada tugas pada kategori ini</p>
              <p class="text-xs text-gray-400">Seluruh pesanan aman atau sesuai kriteria filter.</p>
            </div>

            <table v-else class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-gray-50 dark:bg-slate-800/60 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-slate-800">
                  <th class="py-2.5 px-3 font-semibold">No. HSO</th>
                  <th class="py-2.5 px-3 font-semibold">Customer & Proyek</th>
                  <th class="py-2.5 px-3 font-semibold">Kategori Tugas</th>
                  <th class="py-2.5 px-3 font-semibold">Detail / Alasan</th>
                  <th class="py-2.5 px-3 font-semibold text-right">Nilai</th>
                  <th class="py-2.5 px-3 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-slate-800">
                <tr 
                  v-for="item in filteredTaskList" 
                  :key="item.so_number + (item.category || '')"
                  class="hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td class="py-2.5 px-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    <RouterLink 
                      :to="`/sales-orders/${item.so_number.replace(/\//g, '-')}`"
                      class="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      {{ item.so_number }}
                    </RouterLink>
                    <span class="text-[10px] text-gray-400 block">{{ item.trans_date }}</span>
                  </td>
                  <td class="py-2.5 px-3 max-w-[180px]">
                    <div class="font-medium text-gray-800 dark:text-gray-200 truncate" :title="item.customer_name">
                      {{ item.customer_name }}
                    </div>
                    <div v-if="item.project_name && item.project_name !== '-'" class="text-[10px] text-gray-500 truncate" :title="item.project_name">
                      Proyek: {{ item.project_name }}
                    </div>
                  </td>
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span 
                      v-if="item.category === 'siap_kirim'"
                      class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      📦 Siap Kirim
                    </span>
                    <span 
                      v-else-if="item.category === 'belum_dipesan'"
                      class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      📝 Belum Dipesan
                    </span>
                    <span 
                      v-else-if="item.category === 'logistik_stagnan'"
                      class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    >
                      ⏳ Logistik Stagnan
                    </span>
                  </td>
                  <td class="py-2.5 px-3 text-gray-600 dark:text-gray-400 max-w-[200px]">
                    <p class="truncate text-[11px]" :title="item.reason || item.description">
                      {{ item.reason || item.description || '-' }}
                    </p>
                    <span v-if="item.days_stagnant" class="text-[10px] text-rose-600 dark:text-rose-400 font-semibold block">
                      Stagnan {{ item.days_stagnant }} hari
                    </span>
                    <span v-else-if="item.days_since_created" class="text-[10px] text-gray-400 block">
                      Berjalan {{ item.days_since_created }} hari
                    </span>
                  </td>
                  <td class="py-2.5 px-3 text-right font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {{ item.amount_formatted || '-' }}
                  </td>
                  <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <RouterLink 
                      :to="`/sales-orders/${item.so_number.replace(/\//g, '-')}`"
                      class="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 inline-flex items-center"
                      title="Buka SO"
                    >
                      <ExternalLink class="w-3.5 h-3.5" />
                    </RouterLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Table Footer -->
          <div class="p-3 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 flex items-center justify-between text-xs text-gray-500">
            <span>Menampilkan {{ filteredTaskList.length }} item tugas</span>
            <span class="text-[11px]">Format email disusun otomatis per PIC tugas</span>
          </div>
        </div>

        <!-- Delivery Logs Card -->
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <History class="w-3.5 h-3.5 text-gray-500" />
              Riwayat Pengiriman Email Rekapan Terakhir
            </h3>
            <button @click="clearLogs" v-if="deliveryLogs.length > 0" class="text-[11px] text-rose-500 hover:underline">
              Bersihkan Log
            </button>
          </div>

          <div v-if="deliveryLogs.length === 0" class="p-4 text-center text-xs text-gray-400 border border-dashed rounded-lg">
            Belum ada riwayat pengiriman rekapan yang tercatat.
          </div>

          <div v-else class="space-y-2 max-h-48 overflow-y-auto">
            <div 
              v-for="(log, idx) in deliveryLogs" 
              :key="idx" 
              class="p-2.5 rounded-lg border text-xs flex items-start justify-between gap-3"
              :class="log.success ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900' : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold" :class="log.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'">
                    {{ log.success ? '✓ Berhasil Dikirim' : '✕ Gagal Mengirim' }}
                  </span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase" :class="log.mode === 'test' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 text-emerald-300'">
                    {{ log.mode }}
                  </span>
                  <span class="text-[11px] text-gray-400">
                    {{ formatDateTime(log.timestamp) }}
                  </span>
                </div>
                <div class="text-[11px] text-gray-600 dark:text-gray-300 font-mono">
                  Penerima: {{ Array.isArray(log.recipients) ? log.recipients.join(', ') : log.recipients }}
                </div>
                <div v-if="log.counts" class="text-[10px] text-gray-500 flex gap-3">
                  <span>Siap Kirim: <b>{{ log.counts.siap_kirim }}</b></span>
                  <span>Belum Dipesan: <b>{{ log.counts.belum_dipesan }}</b></span>
                  <span>Stagnan: <b>{{ log.counts.logistik_stagnan }}</b></span>
                </div>
                <div v-if="log.error" class="text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                  Error: {{ log.error }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Preview Modal -->
    <div 
      v-if="showPreviewModal" 
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
    >
      <div class="bg-white dark:bg-slate-900 w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-800">
        <!-- Modal Header -->
        <div class="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between bg-gray-50 dark:bg-slate-800/60">
          <div class="flex items-center gap-2">
            <Eye class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 class="text-sm font-bold text-gray-900 dark:text-white">Pratinjau Langsung Email Rekapan Mingguan</h3>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                Tampilan persis seperti yang akan diterima di kotak masuk (inbox) email tim.
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button 
              size="sm" 
              @click="handleSendEmailNow" 
              :disabled="isSendingEmail" 
              class="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
            >
              <Send class="w-3.5 h-3.5" :class="{ 'animate-spin': isSendingEmail }" />
              <span>{{ isSendingEmail ? 'Mengirim...' : 'Kirim Sekarang' }}</span>
            </Button>
            <button 
              @click="showPreviewModal = false" 
              class="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Modal Body (Iframe Live HTML Preview) -->
        <div class="flex-1 bg-gray-100 dark:bg-slate-950 p-2 overflow-hidden">
          <iframe 
            :srcdoc="previewHtml" 
            class="w-full h-full bg-white rounded-lg shadow-inner border border-gray-200 dark:border-slate-800"
          ></iframe>
        </div>

        <!-- Modal Footer -->
        <div class="p-3 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/60 flex items-center justify-between text-xs text-gray-500">
          <span>Target Mode: <b>{{ formSettings.mode.toUpperCase() }}</b></span>
          <Button variant="outline" size="sm" @click="showPreviewModal = false" class="text-xs h-8">
            Tutup Pratinjau
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { 
  loadRecapSettings, 
  saveRecapSettings, 
  compileWeeklyTaskData, 
  generateWeeklyTaskEmailHtml, 
  sendWeeklyTaskRecapEmail,
  DEFAULT_RECAP_SETTINGS 
} from '@/lib/weeklyTaskDigest'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Mail, Send, Eye, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle, 
  PackageCheck, Truck, Sliders, Calendar as CalendarIcon, Clock, Check, 
  ListTodo, Search, ExternalLink, History, Info, X, ArrowRight, Loader2
} from 'lucide-vue-next'

// State
const settings = ref({ ...DEFAULT_RECAP_SETTINGS })
const formSettings = ref({ ...DEFAULT_RECAP_SETTINGS })
const customRecipientsInput = ref('')
const taskData = ref(null)

const isLoadingData = ref(false)
const isSavingSettings = ref(false)
const isSendingEmail = ref(false)
const showPreviewModal = ref(false)

const activeTab = ref('all') // 'all' | 'siap_kirim' | 'belum_dipesan' | 'logistik_stagnan'
const searchQuery = ref('')
const deliveryLogs = ref([])

const actionBanner = ref({
  show: false,
  success: true,
  title: '',
  message: ''
})

// Current Active Recipients based on Mode
const currentActiveRecipients = computed(() => {
  if (settings.value.mode === 'test') {
    return settings.value.test_recipients || ['davidtheosimaremare@gmail.com']
  }
  const base = settings.value.production_recipients || ['sales@hokiindo.co.id', 'info@hokiindo.co.id', 'purchasing@hokiindo.co.id']
  const custom = settings.value.custom_recipients || []
  return [...base, ...custom]
})

// Combined flat list of all tasks for the table
const allTasksList = computed(() => {
  if (!taskData.value) return []
  const list = []
  
  ;(taskData.value.tasks.siap_kirim || []).forEach(item => {
    list.push({ ...item, category: 'siap_kirim' })
  })
  ;(taskData.value.tasks.belum_dipesan || []).forEach(item => {
    list.push({ ...item, category: 'belum_dipesan' })
  })
  ;(taskData.value.tasks.logistik_stagnan || []).forEach(item => {
    list.push({ ...item, category: 'logistik_stagnan' })
  })

  return list
})

// Filtered task list by Tab and Search
const filteredTaskList = computed(() => {
  let list = allTasksList.value

  if (activeTab.value !== 'all') {
    list = list.filter(item => item.category === activeTab.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(item => {
      return (item.so_number || '').toLowerCase().includes(q) ||
        (item.customer_name || '').toLowerCase().includes(q) ||
        (item.project_name || '').toLowerCase().includes(q) ||
        (item.reason || '').toLowerCase().includes(q) ||
        (item.hpo_list || []).some(h => h.toLowerCase().includes(q))
    })
  }

  return list
})

// Preview HTML Computed
const previewHtml = computed(() => {
  if (!taskData.value) return '<html><body><p>Memuat data...</p></body></html>'
  return generateWeeklyTaskEmailHtml(taskData.value, formSettings.value)
})

// Date formatter
function formatDateTime(isoStr) {
  if (!isoStr) return '-'
  try {
    const d = new Date(isoStr)
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d)
  } catch (e) {
    return isoStr
  }
}

// Load logs
function loadDeliveryLogs() {
  try {
    const logs = localStorage.getItem('hir_weekly_recap_logs')
    if (logs) {
      deliveryLogs.value = JSON.parse(logs)
    }
  } catch (e) {}
}

function clearLogs() {
  deliveryLogs.value = []
  localStorage.removeItem('hir_weekly_recap_logs')
}

// Load settings & data
async function init() {
  const loaded = await loadRecapSettings()
  settings.value = { ...loaded }
  formSettings.value = { ...loaded }
  if (loaded.custom_recipients && Array.isArray(loaded.custom_recipients)) {
    customRecipientsInput.value = loaded.custom_recipients.join(', ')
  }
  loadDeliveryLogs()
  await fetchData()
}

// Fetch compiled task data
async function fetchData(forceRefresh = false) {
  isLoadingData.value = true
  try {
    const data = await compileWeeklyTaskData({
      stagnantThresholdDays: formSettings.value.stagnant_threshold_days || 5
    })
    taskData.value = data
  } catch (err) {
    console.error('Error fetching weekly task data:', err)
    actionBanner.value = {
      show: true,
      success: false,
      title: 'Gagal Mengambil Data Tugas',
      message: err.message || 'Terjadi kesalahan saat mengompilasi data tugas.'
    }
  } finally {
    isLoadingData.value = false
  }
}

// Save Settings Handler
async function handleSaveSettings() {
  isSavingSettings.value = true

  // Parse custom recipients
  const customRecs = customRecipientsInput.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s.includes('@'))

  const updatedSettings = {
    ...formSettings.value,
    custom_recipients: customRecs
  }

  const res = await saveRecapSettings(updatedSettings)
  isSavingSettings.value = false

  if (res.success) {
    settings.value = { ...res.settings }
    formSettings.value = { ...res.settings }
    actionBanner.value = {
      show: true,
      success: true,
      title: 'Pengaturan Berhasil Disimpan',
      message: `Mode pengiriman aktif: ${res.settings.mode.toUpperCase()}. Penerima telah diperbarui.`
    }
    // Recompile data if threshold changed
    await fetchData()
  } else {
    actionBanner.value = {
      show: true,
      success: false,
      title: 'Gagal Menyimpan Pengaturan',
      message: res.error || 'Terjadi kesalahan saat menyimpan pengaturan.'
    }
  }
}

// Send Email Now Handler
async function handleSendEmailNow() {
  if (!taskData.value) {
    await fetchData()
  }

  const confirmMode = formSettings.value.mode === 'test' 
    ? 'Mode Pengetesan (Testing) ke davidtheosimaremare@gmail.com' 
    : 'Mode Produksi Resmi ke Seluruh Tim (Sales, Info, Purchasing)'

  if (!confirm(`Kirim rekapan email sekarang menggunakan ${confirmMode}?`)) {
    return
  }

  isSendingEmail.value = true
  actionBanner.value.show = false

  try {
    const result = await sendWeeklyTaskRecapEmail(taskData.value, formSettings.value)
    if (result.success) {
      actionBanner.value = {
        show: true,
        success: true,
        title: 'Email Rekapan Berhasil Dikirim! 🚀',
        message: `Rekap mingguan telah dikirim ke: ${result.recipients.join(', ')}.`
      }
      loadDeliveryLogs()
      // Reload settings to get updated last_sent_at
      const loaded = await loadRecapSettings()
      settings.value = { ...loaded }
    } else {
      throw new Error(result.error || 'Gagal mengirim email')
    }
  } catch (err) {
    actionBanner.value = {
      show: true,
      success: false,
      title: 'Gagal Mengirim Email',
      message: err.message || 'Terjadi kendala saat memanggil layanan email.'
    }
  } finally {
    isSendingEmail.value = false
    showPreviewModal.value = false
  }
}

onMounted(() => {
  init()
})
</script>

