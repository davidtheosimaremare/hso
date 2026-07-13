<script setup>
import { ref } from 'vue'
import { 
  BookOpen, 
  CheckCircle2, 
  ShoppingCart, 
  Send, 
  Database, 
  UploadCloud, 
  RefreshCw, 
  ArrowRight, 
  Package, 
  FileText, 
  Truck, 
  FileSpreadsheet, 
  ShieldCheck, 
  Search, 
  Settings, 
  Activity, 
  Layers
} from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const activeTab = ref('sop') // 'sop' or 'flow'
</script>

<template>
  <div class="space-y-6 max-w-6xl mx-auto pb-12">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-5">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <BookOpen class="w-7 h-7 text-red-600" />
          <span>SOP & Panduan Penggunaan Aplikasi</span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Dokumentasi alur kerja end-to-end, SOP pemeriksaan pemesanan barang, dan panduan operasional sistem HSO Tracker.
        </p>
      </div>
      
      <!-- Tab Navigation -->
      <div class="flex bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl border border-gray-200 dark:border-slate-700/50 self-start md:self-auto">
        <button 
          @click="activeTab = 'sop'"
          :class="activeTab === 'sop' 
            ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          class="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all"
        >
          SOP Pemesanan
        </button>
        <button 
          @click="activeTab = 'flow'"
          :class="activeTab === 'flow' 
            ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' 
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
          class="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all"
        >
          Panduan Flow Modul
        </button>
      </div>
    </div>

    <!-- TAB 1: SOP PEMESANAN BARANG -->
    <div v-if="activeTab === 'sop'" class="space-y-6">
      
      <!-- Flow Visual Card -->
      <Card class="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
        <CardHeader class="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 p-6">
          <CardTitle class="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Layers class="w-5 h-5 text-red-500" />
            <span>Alur SOP Pemeriksaan & Pemesanan Barang</span>
          </CardTitle>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Ikuti 10 langkah terstruktur di bawah ini untuk memproses barang pesanan dari HSO hingga pengiriman.
          </p>
        </CardHeader>
        <CardContent class="p-6 md:p-8">
          
          <div class="relative pl-6 md:pl-8 border-l-2 border-red-500/30 dark:border-red-500/20 space-y-8">
            
            <!-- Step 1 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-red-600 text-white font-mono text-xs md:text-sm font-bold shadow-md">
                1
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>HSO Dibuat (Accurate Online)</span>
                  <Badge variant="outline" class="text-[10px] border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">Mulai</Badge>
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Sales Order (HSO) baru didaftarkan dan di-approve di Accurate Online oleh tim sales admin. Dokumen ini secara otomatis akan tersinkronisasi ke aplikasi HSO Tracker.
                </p>
              </div>
            </div>

            <!-- Step 2 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                2
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Identifikasi Barang No Stock (Shortage)</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Periksa Sales Order (HSO) aktif melalui modul <strong>Sales Order</strong> untuk menyaring item-item pesanan yang tidak memiliki stok (<em>no stock</em> / <em>shortage</em>) dan memerlukan pemesanan ke vendor.
                </p>
              </div>
            </div>

            <!-- Step 3 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                3
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Masukkan ke Keranjang Pembelian</span>
                  <ShoppingCart class="w-3.5 h-3.5 text-amber-500" />
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Buka detail HSO terkait, pilih item-item shortage, lalu klik tombol <strong>"Masukkan ke Keranjang"</strong>. Langkah ini akan mengumpulkan item rencana pembelian secara kolektif dari berbagai HSO yang terdaftar.
                </p>
              </div>
            </div>

            <!-- Step 4 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                4
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Lakukan Crosscheck Barang</span>
                  <CheckCircle2 class="w-3.5 h-3.5 text-green-500" />
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Buka menu <strong>Rencana Pembelian &rarr; Keranjang</strong>. Lakukan pencocokan data fisik barang dan jumlah pesanan. Klik tombol <strong>"Cek Stok"</strong> untuk melihat ketersediaan stok real-time Accurate (stok bebas, reservasi, dll.). Berikan status verifikasi <strong>Checked</strong> jika sudah sesuai.
                </p>
              </div>
            </div>

            <!-- Step 5 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                5
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Submit HPB (Harga Pokok Barang) / Permintaan Barang</span>
                  <Send class="w-3.5 h-3.5 text-blue-500" />
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Setelah seluruh item di keranjang ditandai <em>Checked</em>, klik tombol <strong>"Kirim ke HPB"</strong>. Sistem akan membuat draf dokumen Permintaan Barang (Purchase Requisition/HPB) baru di database Accurate secara otomatis.
                </p>
              </div>
            </div>

            <!-- Step 6 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                6
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Pemeriksaan HPB oleh Sales Manager & Direktur</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Dokumen HPB yang telah dikirimkan ke Accurate Online akan diperiksa dan direview secara berjenjang oleh Sales Manager dan Direktur untuk mendapatkan persetujuan (approval).
                </p>
              </div>
            </div>

            <!-- Step 7 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                7
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Revisi Penyesuaian Stok / MOQ (Bila Ada)</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Jika terdapat perubahan jumlah pesanan atau penambahan untuk pemenuhan batas Minimum Order Quantity (MOQ) supplier, lakukan pengeditan item atau jumlahnya langsung pada dokumen HPB di dalam aplikasi Accurate Online.
                </p>
              </div>
            </div>

            <!-- Step 8 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                8
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white">Penarikan HPB menjadi HPO (Purchase Order)</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Setelah dokumen HPB dinyatakan OK dan disetujui, admin pembelian menarik (convert) dokumen HPB tersebut menjadi dokumen Purchase Order (HPO) di Accurate Online agar diteruskan pemesanan fisiknya ke pihak vendor/supplier.
                </p>
              </div>
            </div>

            <!-- Step 9 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs md:text-sm font-bold border border-slate-300 dark:border-slate-700">
                9
              </span>
              <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Tracking Otomatis Teraktifkan</span>
                  <Activity class="w-3.5 h-3.5 text-indigo-500" />
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Setelah HPO diterbitkan di Accurate, sistem HSO Tracker secara otomatis akan melacak siklus hidup item barang tersebut dari tahap pemesanan (HPO), status transit logistik, penerimaan di gudang (RI), hingga pengiriman akhir ke customer (HDO).
                </p>
              </div>
            </div>

            <!-- Step 10 -->
            <div class="relative">
              <span class="absolute -left-[35px] md:-left-[43px] top-0 flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full bg-green-600 text-white font-mono text-xs md:text-sm font-bold shadow-md">
                10
              </span>
              <div class="bg-green-50/30 dark:bg-green-950/10 p-5 rounded-xl border border-green-100 dark:border-green-900/30">
                <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Sinkronisasi & Update Status Logistik</span>
                  <Database class="w-3.5 h-3.5 text-green-600" />
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Untuk memperbarui status logistik (seperti Ex-Works, ETA JKT, Tiba Dunex, Tiba Hokiindo, dll) secara massal dari forwarder:
                </p>
                <ol class="list-decimal pl-4 mt-2 text-xs space-y-1 text-slate-600 dark:text-slate-400 font-mono">
                  <li>Buka modul <strong class="text-slate-800 dark:text-slate-200">Database Logistik</strong>.</li>
                  <li>Klik tombol <strong class="text-slate-800 dark:text-slate-200">"Unggah Spreadsheet"</strong> untuk meng-upload file excel status logistik terbaru.</li>
                  <li>Klik tombol <strong class="text-slate-800 dark:text-slate-200">"Sync Semua HSO Aktif"</strong> untuk melakukan sinkronisasi massal status logistik ke seluruh SO.</li>
                  <li>
                    <strong class="text-red-600 dark:text-red-400">PENTING:</strong> Lakukan crosscheck ulang pada masing-masing dokumen HSO secara berkala. Jika dibutuhkan pembaruan cepat, lakukan sinkronisasi manual langsung melalui tombol <strong class="text-slate-800 dark:text-slate-200">"Sync dari Database Logistik"</strong> di halaman Detail HSO terkait.
                  </li>
                </ol>
              </div>
            </div>

          </div>

        </CardContent>
      </Card>
      
      <!-- SOP Golden Rules Card -->
      <Card class="bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20 rounded-2xl p-6">
        <h3 class="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
          <ShieldCheck class="w-5 h-5" />
          <span>Hal-Hal Penting Yang Wajib Diperhatikan:</span>
        </h3>
        <ul class="list-disc pl-5 mt-3 text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
          <li><strong>Sinkronisasi Manual HSO:</strong> Jika status PO Siemens atau DO Accurate untuk suatu SO baru saja diubah, buka detail SO tersebut dan klik tombol <strong>"Sync PO"</strong> atau <strong>"Sync DO"</strong> untuk langsung memperbarui data di dashboard pelacakan tanpa menunggu sinkronisasi otomatis harian.</li>
          <li><strong>Data Logistik Eksternal:</strong> Pastikan kolom nomor HPO Siemens dan SKU di file Excel yang diunggah ke Database Logistik terisi dengan format teks yang bersih tanpa spasi tambahan untuk menghindari kegagalan sinkronisasi.</li>
        </ul>
      </Card>
    </div>

    <!-- TAB 2: PANDUAN MODUL APLIKASI -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      <!-- Modul 1: Dashboard -->
      <Card class="bg-gradient-to-br from-blue-50/70 to-white dark:from-blue-950/20 dark:to-slate-900 border-blue-200 dark:border-blue-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-500 text-white rounded-lg shadow-sm">
                <RefreshCw class="w-5 h-5 animate-spin-slow" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">1. Dashboard & Analitik</h3>
            </div>
            <Badge class="bg-blue-500 hover:bg-blue-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/dashboard</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Menyajikan visualisasi performa penjualan, grafik nilai transaksi SO, status SO saat ini, dan peringkat 20 customer teratas. Gunakan tombol <strong>"Refresh"</strong> untuk memperbarui data analitik langsung dari sistem Accurate Online.
          </p>
        </CardContent>
      </Card>

      <!-- Modul 2: Sales Order -->
      <Card class="bg-gradient-to-br from-purple-50/70 to-white dark:from-purple-950/20 dark:to-slate-900 border-purple-200 dark:border-purple-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-purple-500 text-white rounded-lg shadow-sm">
                <FileText class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">2. Sales Order & Detail HSO</h3>
            </div>
            <Badge class="bg-purple-500 hover:bg-purple-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/sales-orders</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Daftar pesanan aktif dari customer. Pada halaman detail HSO, admin dapat mengubah status logistik barang, menyalin link tracking eksternal untuk dikirim ke customer via WhatsApp, serta mengirim barang yang kurang ke Keranjang Pembelian.
          </p>
        </CardContent>
      </Card>

      <!-- Modul 3: Sales Quotation (HSQ) -->
      <Card class="bg-gradient-to-br from-indigo-50/70 to-white dark:from-indigo-950/20 dark:to-slate-900 border-indigo-200 dark:border-indigo-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-indigo-500 text-white rounded-lg shadow-sm">
                <FileSpreadsheet class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">3. Sales Quotation (HSQ)</h3>
            </div>
            <Badge class="bg-indigo-500 hover:bg-indigo-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/hsq</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Menampilkan daftar penawaran harga resmi (Quotation) yang dikirim ke pelanggan. Anda dapat melihat detail harga, syarat pembayaran, potongan harga, dan mengunduh data penawaran ke format Excel.
          </p>
        </CardContent>
      </Card>

      <!-- Modul 4: Keranjang Pembelian -->
      <Card class="bg-gradient-to-br from-amber-50/70 to-white dark:from-amber-950/20 dark:to-slate-900 border-amber-200 dark:border-amber-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-amber-500 text-white rounded-lg shadow-sm">
                <ShoppingCart class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">4. Keranjang Pembelian (Cart)</h3>
            </div>
            <Badge class="bg-amber-500 hover:bg-amber-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/cart</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Keranjang belanja internal untuk menampung seluruh item shortage yang diajukan dari SO. Setelah melewati proses crosscheck stok Gudang & verifikasi (<em>Checked</em>), kumpulan barang ini dapat dikirim langsung menjadi HPB Accurate.
          </p>
        </CardContent>
      </Card>

      <!-- Modul 5: Permintaan Barang (HPB) -->
      <Card class="bg-gradient-to-br from-emerald-50/70 to-white dark:from-emerald-950/20 dark:to-slate-900 border-emerald-200 dark:border-emerald-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-emerald-500 text-white rounded-lg shadow-sm">
                <Send class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">5. Permintaan Barang (HPB)</h3>
            </div>
            <Badge class="bg-emerald-500 hover:bg-emerald-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/hpb</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Memantau draf dokumen Permintaan Barang (Purchase Requisition/HPB) yang telah dibuat. Menampilkan status approval dari Sales Manager & Direktur sebelum ditarik ke HPO.
          </p>
        </CardContent>
      </Card>

      <!-- Modul 6: Purchase Order -->
      <Card class="bg-gradient-to-br from-orange-50/70 to-white dark:from-orange-950/20 dark:to-slate-900 border-orange-200 dark:border-orange-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-orange-500 text-white rounded-lg shadow-sm">
                <Package class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">6. Purchase Order & Penerimaan Barang</h3>
            </div>
            <Badge class="bg-orange-500 hover:bg-orange-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/purchase-orders</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Memantau berkas pembelian resmi (HPO) ke supplier dan dokumen penerimaan barang di gudang (RI). Memberikan kepastian status barang apakah masih dipesan ke pabrik atau sudah tiba secara fisik di gudang Hokiindo.
          </p>
        </CardContent>
      </Card>

      <!-- Modul 7: Delivery Order -->
      <Card class="bg-gradient-to-br from-teal-50/70 to-white dark:from-teal-950/20 dark:to-slate-900 border-teal-200 dark:border-teal-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-teal-500 text-white rounded-lg shadow-sm">
                <Truck class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">7. Delivery Order (HDO)</h3>
            </div>
            <Badge class="bg-teal-500 hover:bg-teal-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/delivery-orders</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Menampilkan rincian berkas pengiriman barang ke customer. Berisi detail Driver yang bertugas, tanggal pengiriman, dan item mana saja dari SO pelanggan yang saat ini sedang dalam perjalanan atau sudah terkirim (Fulfillment rate).
          </p>
        </CardContent>
      </Card>

      <!-- Modul 8: Database Logistik -->
      <Card class="bg-gradient-to-br from-rose-50/70 to-white dark:from-rose-950/20 dark:to-slate-900 border-rose-200 dark:border-rose-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-rose-500 text-white rounded-lg shadow-sm">
                <Database class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">8. Database Pelacakan Logistik</h3>
            </div>
            <Badge class="bg-rose-500 hover:bg-rose-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/logistics-db</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Pusat data global untuk status pengapalan barang. Admin logistik dapat mengunggah file excel forwarder yang berisi status transit (Ex-Works, ETA JKT, dll.) untuk disinkronisasi ke seluruh SO yang aktif secara otomatis.
          </p>
        </CardContent>
      </Card>

      <!-- Modul 9: Public Tracking -->
      <Card class="bg-gradient-to-br from-cyan-50/70 to-white dark:from-cyan-950/20 dark:to-slate-900 border-cyan-200 dark:border-cyan-900/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4">
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-cyan-500 text-white rounded-lg shadow-sm">
                <Search class="w-5 h-5" />
              </div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">9. Halaman Tracking Publik</h3>
            </div>
            <Badge class="bg-cyan-500 hover:bg-cyan-600 text-white font-mono text-[10px] py-0.5 px-2 rounded-full">/public/tracking/:code</Badge>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Halaman khusus yang dapat diakses oleh customer eksternal tanpa perlu login. Menampilkan kemajuan persentase pesanan mereka, rincian barang yang sudah dikirim, serta status logistik barang impor yang sedang dalam perjalanan.
          </p>
        </CardContent>
      </Card>

    </div>

  </div>
</template>
