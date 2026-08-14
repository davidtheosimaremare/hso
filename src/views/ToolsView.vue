<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { 
  Wrench, 
  Sparkles, 
  ArrowRightLeft, 
  MapPin, 
  Building2, 
  Server, 
  Zap, 
  Clock, 
  CheckCircle2, 
  Bell, 
  Cpu, 
  Compass, 
  Search, 
  Layers,
  ArrowRight
} from 'lucide-vue-next'

const route = useRoute()
const activeTab = ref(route.path.includes('maps') ? 'maps' : 'converter')
const notifyEmail = ref('')
const isSubscribed = ref(false)

const handleSubscribe = () => {
  if (!notifyEmail.value) return
  isSubscribed.value = true
  setTimeout(() => {
    isSubscribed.value = false
    notifyEmail.value = ''
  }, 4000)
}
</script>

<template>
  <div class="p-4 md:p-6 w-full max-w-[1600px] mx-auto space-y-6">
    
    <!-- Top Header Banner -->
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-red-950 to-slate-900 text-white p-6 md:p-8 shadow-xl border border-red-900/30">
      <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="relative z-10 max-w-3xl space-y-3">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/30 backdrop-blur-md">
          <Sparkles class="w-3.5 h-3.5 text-red-400" />
          <span>Sales & Engineering Tools Suite</span>
        </div>
        <h1 class="text-2xl md:text-4xl font-black tracking-tight text-white leading-tight">
          Tools Penjualan & Konversi Komponen
        </h1>
        <p class="text-slate-300 text-xs md:text-sm leading-relaxed">
          Kumpulan perkakas cerdas yang dirancang untuk mempercepat proses penawaran teknis, pencocokan komponen listrik antar-merk, serta otomatisasi pencarian calon pelanggan B2B secara terukur.
        </p>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex items-center gap-2 mt-6 pt-4 border-t border-white/10 flex-wrap">
        <button
          @click="activeTab = 'converter'"
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          :class="activeTab === 'converter' 
            ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' 
            : 'bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white'"
        >
          <ArrowRightLeft class="w-4 h-4" />
          <span>Component Converter</span>
          <span class="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 rounded">Soon</span>
        </button>

        <button
          @click="activeTab = 'maps'"
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          :class="activeTab === 'maps' 
            ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' 
            : 'bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white'"
        >
          <MapPin class="w-4 h-4" />
          <span>Google Maps B2B Lead Finder</span>
          <span class="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 rounded">Soon</span>
        </button>
      </div>
    </div>

    <!-- Tool 1: Component Converter -->
    <div v-if="activeTab === 'converter'" class="space-y-6">
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <Cpu class="w-5 h-5" />
              </span>
              <h2 class="text-xl font-bold text-slate-900 dark:text-white">Smart Component Converter</h2>
            </div>
            <p class="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              Konversi & padankan spesifikasi komponen Schneider/ABB ke Siemens dengan cepat dan akurat.
            </p>
          </div>

          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800 shrink-0">
            <Clock class="w-4 h-4" />
            <span>Tahap Pengembangan (Coming Soon)</span>
          </div>
        </div>

        <!-- Interactive Mockup Preview -->
        <div class="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 space-y-5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase text-slate-400 tracking-wider">Preview Fitur Converter</span>
            <span class="text-[11px] font-semibold text-slate-500">Supported: Schneider, ABB ➔ Siemens</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
            <!-- Brand Input -->
            <div class="md:col-span-2 space-y-2 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>Komponen Asal</span>
                <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">Schneider / ABB</span>
              </div>
              <input 
                type="text" 
                disabled 
                value="Schneider NSX100N TM100D (LV429630)" 
                class="w-full text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 opacity-80 cursor-not-allowed" 
              />
              <p class="text-[10px] text-slate-400">MCCB 3P 100A 36kA Thermal-Magnetic</p>
            </div>

            <!-- Conversion Arrow -->
            <div class="md:col-span-1 flex flex-col items-center justify-center py-2">
              <div class="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-600/30">
                <ArrowRightLeft class="w-5 h-5 animate-pulse" />
              </div>
              <span class="text-[10px] font-extrabold text-red-600 dark:text-red-400 mt-1">Match Spec</span>
            </div>

            <!-- Target Output -->
            <div class="md:col-span-2 space-y-2 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
              <div class="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <span>Ekuivalen Siemens</span>
                <span class="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-[10px] text-emerald-800 dark:text-emerald-200">100% Match</span>
              </div>
              <input 
                type="text" 
                disabled 
                value="Siemens 3VA1110-4EE32-0AA0" 
                class="w-full text-xs font-mono font-bold bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-700" 
              />
              <p class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">3VA1 MCCB 3P 100A 36kA Line Protection TM240</p>
            </div>
          </div>
        </div>

        <!-- Key Capability Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <CheckCircle2 class="w-4 h-4 text-emerald-500" />
              <span>Cross-Reference Presisi</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Mencocokkan parameter teknis utama seperti *breaking capacity*, ampere rating, tipe trip unit, dan dimensi fisik.
            </p>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Zap class="w-4 h-4 text-amber-500" />
              <span>Cepat & Otomatis</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Cukup masukkan part number atau upload file BOQ komparasi untuk langsung mendapatkan tipe pengganti Siemens secara sekaligus.
            </p>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Layers class="w-4 h-4 text-red-500" />
              <span>Ekspor ke Penawaran (HSQ)</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Hasil konversi komponen dapat langsung dimasukkan ke draft surat penawaran harga (HSQ) dengan satu klik.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tool 2: Google Maps Lead Finder -->
    <div v-if="activeTab === 'maps'" class="space-y-6">
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <MapPin class="w-5 h-5" />
              </span>
              <h2 class="text-xl font-bold text-slate-900 dark:text-white">Google Maps B2B Lead Finder</h2>
            </div>
            <p class="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              Dapatkan data prospek B2B (Panel Maker, Kontraktor Listrik, & Data Center) di sekitar lokasi target via Google Maps.
            </p>
          </div>

          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800 shrink-0">
            <Clock class="w-4 h-4" />
            <span>Tahap Pengembangan (Coming Soon)</span>
          </div>
        </div>

        <!-- Interactive Mockup Preview -->
        <div class="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 space-y-5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase text-slate-400 tracking-wider">Simulasi Pencarian Prospect</span>
            <span class="text-[11px] font-semibold text-slate-500">Integrasi Google Maps Business Search API</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
                <Building2 class="w-4 h-4" />
                <span>Panel Maker Sekitar</span>
              </div>
              <p class="text-xs font-medium text-slate-700 dark:text-slate-300">
                Pencarian produsen & assembler panel switchboard di kawasan industri.
              </p>
              <div class="text-[10px] text-slate-400 font-mono">Status: Auto-extract kontak & alamat</div>
            </div>

            <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
                <Compass class="w-4 h-4" />
                <span>Kontraktor ME & Listrik</span>
              </div>
              <p class="text-xs font-medium text-slate-700 dark:text-slate-300">
                Temukan perusahaan kontraktor Mechanical & Electrical (ME) terdekat.
              </p>
              <div class="text-[10px] text-slate-400 font-mono">Status: Auto-extract nomor telepon & website</div>
            </div>

            <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
              <div class="flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400">
                <Server class="w-4 h-4" />
                <span>Data Center & Gedung Komersial</span>
              </div>
              <p class="text-xs font-medium text-slate-700 dark:text-slate-300">
                Pemetaan lokasi fasilitas data center & infrastruktur kritis lokal.
              </p>
              <div class="text-[10px] text-slate-400 font-mono">Status: Geolocation radius mapping</div>
            </div>
          </div>
        </div>

        <!-- Feature List -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Search class="w-4 h-4 text-red-500" />
              <span>Target Radius Lokasi</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Cukup tentukan kota atau area (misal: Jabodetabek, Surabaya, Cikarang) untuk menemukan daftar perusahaan relevan.
            </p>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Building2 class="w-4 h-4 text-amber-500" />
              <span>Ekstraksi Informasi Kontak</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Mendapatkan nama perusahaan, alamat lengkap, nomor telepon, rating, serta situs web resmi secara terstruktur.
            </p>
          </div>

          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Zap class="w-4 h-4 text-emerald-500" />
              <span>Impor ke TO-DO & Prospek</span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Hasil prospek dapat langsung ditambahkan ke daftar tugas tim atau delegasi kunjungan sales secara terintegrasi.
            </p>
          </div>
        </div>

      </div>
    </div>

    <!-- Notification Request Box -->
    <div class="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 rounded-2xl p-6 border border-red-200/80 dark:border-red-900/40 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="space-y-1 text-center md:text-left">
        <h3 class="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-center md:justify-start gap-2">
          <Bell class="w-4 h-4 text-red-600 dark:text-red-400" />
          <span>Ingin Diberitahu Saat Tools Ini Rilis?</span>
        </h3>
        <p class="text-xs text-slate-600 dark:text-slate-400">
          Dapatkan akses awal (early access) begitu fitur Component Converter dan Maps Lead Finder siap digunakan.
        </p>
      </div>

      <div class="flex items-center gap-2 w-full md:w-auto shrink-0">
        <input 
          v-model="notifyEmail" 
          type="email" 
          placeholder="Masukkan email Anda..." 
          class="px-3.5 py-2 text-xs rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-red-500 flex-1 md:w-64" 
        />
        <button 
          @click="handleSubscribe" 
          class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer shrink-0"
        >
          {{ isSubscribed ? 'Terdaftar!' : 'Beri Tahu Saya' }}
        </button>
      </div>
    </div>

  </div>
</template>
