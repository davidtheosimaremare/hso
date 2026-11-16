<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAccurateItems, categorizeMLFB, isDummyItem } from '@/composables/useAccurateItems'
import {
  Sparkles,
  Bot,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Settings,
  ShieldCheck,
  Key,
  Zap,
  Flame,
  UserCheck,
  Calendar,
  Mail,
  FileText,
  Video,
  Laugh,
  TrendingUp,
  DollarSign,
  Upload,
  Image as ImageIcon,
  Link as LinkIcon,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Play,
  Sliders,
  Info,
  MessageSquare,
  Megaphone,
  ExternalLink,
  Trash2,
  Edit3,
  ArrowRight,
  ShieldAlert,
  Award,
  CheckCheck,
  XCircle,
  Clock,
  CalendarDays,
  Layers,
  ChevronDown,
  Plus,
  BarChart3,
  BookmarkCheck,
  Filter,
  Palette,
  Layout,
  Crop,
  Wand2,
  CalendarRange,
  ArrowLeftRight,
  BookOpen,
  Users,
  Target,
  Search,
  MessageCircle,
  BarChart2,
  GraduationCap,
  ThumbsUp,
  Globe,
  Package,
  ArrowLeft,
  Download
} from 'lucide-vue-next'

const props = defineProps({
  currentUser: {
    type: String,
    default: ''
  },
  currentUserName: {
    type: String,
    default: 'Manajer Konten'
  }
})

const emit = defineEmits(['idea-created', 'navigate-to-feed', 'navigate-to-calendar'])

// ==========================================
// 1. BANK DATA & INTELIJEN KELISTRIKAN
// (Referensi Industri, Siemens, G-Comin & Standar PUIL)
// ==========================================
const DEFAULT_KNOWLEDGE_BASE = [
  {
    id: 'kb_1',
    category: 'siemens',
    title: 'Standar Proteksi IEC 60947-2 & Koordinasi Trip Unit Siemens Sentron',
    source: 'Siemens Industry Mall & Standar PUIL 2020',
    summary: 'Perbedaan karakteristik tripping Icu (Ultimate Short-Circuit Breaking Capacity) dan Ics (Service Breaking Capacity). Pada breaker murah Ics sering hanya 50% dari Icu, sedangkan Siemens Sentron 3VM/3VA menjamin Ics = 100% Icu.',
    keyInsights: [
      'Trip Unit Termal-Magnetik (TM) untuk beban standar, Electronic Trip Unit (ETU) untuk kurva L-I-S-G presisi.',
      'Selektivitas penuh mencegah breaker hulu (main ACB) tripping saat cabang feeder hilir yang bermasalah.',
      'Pentingnya sertifikat Certificate of Origin (CoO) resmi untuk meloloskan audit serah terima tender.'
    ],
    tags: ['Siemens Sentron', 'IEC 60947-2', 'PUIL 2020', 'Trip Unit']
  },
  {
    id: 'kb_2',
    category: 'siemens',
    title: 'Standar Tata Kelola Daya & Form Segregasi Cubicle Switchgear (IEC 61439-1/2 & PUIL 2020)',
    source: 'IEC 61439 Switchgear Assemblies & PUIL 2020',
    summary: 'Konfigurasi Form 2b, 3b, hingga 4b pada Main Distribution Panel (MDP) memisahkan busbar fasa, unit fungsional breaker, dan terminal eksternal untuk menjamin keselamatan operator saat inspeksi pemeliharaan operasional industri.',
    keyInsights: [
      'Form 4b memberikan isolasi total antar unit fungsional dan terminal konduktor eksternal.',
      'Uji kenaikan suhu (temperature rise test) verifikasi disipasi panas switchgear sesuai ambang batas busbar tembaga.',
      'Mencegah propagasi busur api internal (internal arc flash) merambat antar kompartemen kubikel.'
    ],
    tags: ['IEC 61439-1/2', 'Switchboard Form 4b', 'PUIL 2020', 'Busbar Sizing']
  },
  {
    id: 'kb_3',
    category: 'siemens',
    title: 'Arus Inrush Motor Induksi & Ketahanan Kontak Perak Siemens Sirius',
    source: 'Siemens Sirius Technical Application Guide',
    summary: 'Saat start motor beban berat (Direct-On-Line), arus inrush melonjak 6 hingga 8 kali arus nominal. Jika menggunakan kontaktor murah tanpa paduan perak-nikel, titik kontak akan mengalami welding (melekat/meleleh).',
    keyInsights: [
      'Kategori pemakaian AC-3 untuk motor sangkar tupai standar, AC-4 untuk inching/plugging beban ekstrim.',
      'Siemens Sirius memiliki mechanical life hingga 30 juta siklus operasi.',
      'Integrasi thermal overload relay 3RU melindungi lilitan motor dari fasa hilang (phase failure).'
    ],
    tags: ['Siemens Sirius', 'Motor Inrush', 'Kontaktor AC-3', 'Relay Proteksi']
  },
  {
    id: 'kb_4',
    category: 'siemens',
    title: 'Analisis Tekno-Ekonomi Koordinasi Kaskade (Cascading) Breaker Siemens Sentron',
    source: 'IEC 60947-2 Annex A & Siemens Sentron Technical Guide',
    summary: 'Penerapan teknik kaskade sesuai IEC 60947-2 Lampiran A memungkinkan penggunaan breaker hilir (downstream) dengan kapasitas pemutusan Icu lebih ekonomis berkat pembatasan energi tembus (let-through energy I²t) oleh breaker hulu Siemens Sentron.',
    keyInsights: [
      'Mengurangi biaya investasi switchboard cabang hilir hingga 25-35% tanpa mengorbankan keselamatan sistem.',
      'Tabel koordinasi resmi Siemens menjamin validitas kaskade teruji laboratorium akreditasi internasional.',
      'Mencegah kerusakan termal dan elektrodinamik pada konduktor sirkit cabang selama gangguan hubung singkat.'
    ],
    tags: ['IEC 60947-2 Annex A', 'Cascading Proteksi', 'Siemens Sentron', 'Efisiensi Capex']
  },
  {
    id: 'kb_5',
    category: 'market',
    title: 'Pain Points Nyata Kontraktor ME & Panel Maker Indonesia',
    source: 'Wawancara Lapangan Tim Sales HSO & Komunitas Panel Builder',
    summary: 'Tiga ketakutan terbesar kontraktor ME: 1) Barang dibilang ready tapi ternyata inden 8 minggu sehingga kena denda keterlambatan proyek; 2) Komponen ditolak konsultan pengawas karena tidak ada surat keaslian CoO; 3) Breaker ngetrip saat uji komisioning bersama owner.',
    keyInsights: [
      'Kontraktor butuh SLA kepastian stok 24 jam dan pengiriman sameday Jabodetabek.',
      'BoQ quotation harus selesai dalam 2-4 jam agar bisa segera submit tender.',
      'Konsultan butuh data sheet dan kurva trip PDF yang siap dilampirkan ke dokumen tender.'
    ],
    tags: ['Pain Points', 'Panel Maker', 'Tender BoQ', 'Lead Generation']
  },
  {
    id: 'kb_6',
    category: 'trends',
    title: 'Transisi Industri 4.0: Smart Switchboard & Monitoring Energi IoT',
    source: 'Siemens Digital Enterprise & Kementerian Perindustrian (Making Indonesia 4.0)',
    summary: 'Pabrik modern beralih dari panel buta (blind panel) ke panel cerdas dengan modul komunikasi Modbus TCP/IP dan PROFINET. Breaker Siemens Sentron kini bisa mengirim data konsumsi kWh, status temperatur, dan alarm dini langsung ke smartphone manajemen.',
    keyInsights: [
      'Prediktif maintenance menggantikan preventif maintenance terjadwal.',
      'Integrasi Siemens S7-1200 dengan TIA Portal memangkas waktu pemrograman hingga 40%.',
      'Kepatuhan ISO 50001 (Energy Management System).'
    ],
    tags: ['Industri 4.0', 'IoT Switchboard', 'TIA Portal', 'Smart Energy']
  }
]

// =========================================================================
// 2. DEMO AUDIENCE PERSONAS (10 PASAR STRATEGIS PROYEK KELISTRIKAN B2B)
// (Simulator Pengukur Dampak Pembaca Nyata & AI Reviewer Engine)
// =========================================================================
const DEMO_AUDIENCE_PERSONAS = [
  {
    id: 'bambang',
    name: 'Pak Bambang',
    age: 52,
    location: 'Tangerang (Workshop Balaraja)',
    role: 'Senior Panel Builder & Pemilik Workshop Switchboard',
    strategicMarket: 'Panel Maker',
    segment: 'panel_maker',
    avatarEmoji: '⚡',
    avatarBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    painPoint: 'Ruang cubicle sempit, breaker panas, terminal tembaga oblak, dan takut kena penalti denda keterlambatan serah terima panel.',
    whatMatters: 'Dimensi cubicle kompak menghemat 20% ruang tata letak, kemudahan koneksi busbar tembaga, dan dokumen sertifikat CoO resmi pabrikan.',
    primaryInterest: 'siemens'
  },
  {
    id: 'willy',
    name: 'Ko Willy',
    age: 43,
    location: 'Surabaya / Gresik',
    role: 'Direktur Kontraktor EPC Listrik & Proyek ME Komersial',
    strategicMarket: 'Kontraktor',
    segment: 'contractor',
    avatarEmoji: '🏗️',
    avatarBg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
    painPoint: 'Dikejar batas waktu tender BUMN/swasta, takut barang inden berbulan-bulan bikin kena denda liquidated damages proyek.',
    whatMatters: 'Surat dukungan distributor resmi (Letter of Support) terbit cepat dalam 24 jam di hokiindo.co.id, keaslian unit 100%, dan ready stock sameday Jabodetabek & Jawa Timur.',
    primaryInterest: 'all'
  },
  {
    id: 'gunawan',
    name: 'Pak Gunawan',
    age: 49,
    location: 'Jakarta Barat',
    role: 'Senior M&E Engineering Consultant & Tender Specifier',
    strategicMarket: 'Konsultan',
    segment: 'consultant',
    avatarEmoji: '📐',
    avatarBg: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    painPoint: 'Spesifikasi yang dirancang ditolak owner atau komisioning gagal karena kontraktor memasang unit abal-abal yang kapasitas breaking capacity (kA)-nya palsu.',
    whatMatters: 'Kepatuhan standar internasional IEC 60947-2 (Ics = 100% Icu), PUIL 2020, kurva proteksi selektif L-I-S-G, dan technical data sheet resmi Siemens.',
    primaryInterest: 'siemens'
  },
  {
    id: 'dimas',
    name: 'Mas Dimas',
    age: 33,
    location: 'Karawang (Kawasan KIIC)',
    role: 'Head of Maintenance & Plant Electrical Engineer Pabrik Manufaktur',
    strategicMarket: 'End User',
    segment: 'end_user',
    avatarEmoji: '🏭',
    avatarBg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    painPoint: 'Paling takut false tripping pada jam beban puncak shift 3 dan motor induksi terbakar karena kontak leleh.',
    whatMatters: 'Keandalan 24 jam nonstop, ketahanan kontak perak-nikel AC-3 Siemens Sirius, respon trip unit ETU presisi, dan kemudahan cek stok mandiri di shop.hokiindo.co.id.',
    primaryInterest: 'siemens'
  },
  {
    id: 'fajar',
    name: 'Mas Fajar',
    age: 36,
    location: 'Jakarta Barat',
    role: 'Senior Electrical Cost Estimator & QS Tender ME',
    strategicMarket: 'Estimator',
    segment: 'estimator',
    avatarEmoji: '📊',
    avatarBg: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    painPoint: 'Margin tender tipis, kesulitan mencocokkan part number MLFB ke budget BoQ owner, dan takut salah hitung harga material kelistrikan.',
    whatMatters: 'Transparansi harga katalog resmi di shop.hokiindo.co.id, part number MLFB akurat, diskon volume BoQ, dan kepastian barang ready tanpa biaya siluman.',
    primaryInterest: 'all'
  },
  {
    id: 'bagas',
    name: 'Mas Bagas',
    age: 29,
    location: 'Cikarang',
    role: 'Teknisi Listrik & Panel Wiring Bersertifikat K3',
    strategicMarket: 'Teknisi Listrik',
    segment: 'field',
    avatarEmoji: '🔧',
    avatarBg: 'bg-stone-100 text-stone-800 dark:bg-stone-950 dark:text-stone-300',
    painPoint: 'Baut terminal dol, ruang cubicle sempit bikin jari terjepit, instruksi wiring membingungkan tanpa skema jelas.',
    whatMatters: 'Kemudahan instalasi busbar tembaga, skema wiring Siemens yang jelas, keaslian material kontak perak, dan tips praktis di ruang panel.',
    primaryInterest: 'siemens'
  },
  {
    id: 'joko',
    name: 'Ir. Joko Prasetyo, S.T.',
    age: 38,
    location: 'Surabaya (Rungkut Industri)',
    role: 'Lead Electrical Testing & Commissioning Engineer (AK3 Listrik)',
    strategicMarket: 'Testing & Commissioning',
    segment: 'field',
    avatarEmoji: '⚡',
    avatarBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    painPoint: 'Toleransi tripping kurva TCC tidak presisi dengan kurva pabrikan, resistansi kontak busbar tinggi memicu hotspot saat uji beban penuh, dan kendala sinkronisasi interlock mekanikal-elektrikal ACB.',
    whatMatters: 'Uji injeksi sekunder kurva TCC Siemens ETU, uji kontak resistance (Micro-Ohm Ductor < 50 µΩ), protokol komisioning SAT terverifikasi, dan sertifikasi kalibrasi alat uji.',
    primaryInterest: 'testing'
  },
  {
    id: 'hendro',
    name: 'Pak Hendro',
    age: 46,
    location: 'Cikarang (Kawasan MM2100)',
    role: 'Head of Purchasing & Procurement Kontraktor & Pabrik',
    strategicMarket: 'Purchasing',
    segment: 'estimator',
    avatarEmoji: '💼',
    avatarBg: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    painPoint: 'Kena audit internal jika harga pengadaan over-budget atau sparepart telat datang bikin proyek dan lini produksi terhenti.',
    whatMatters: 'Harga diskon volume BoQ, kepastian ready stock 24 jam Jabodetabek, kemudahan cek stok di shop.hokiindo.co.id, dan invoice resmi.',
    primaryInterest: 'all'
  },
  {
    id: 'ratna',
    name: 'Ir. Ratna, M.T.',
    age: 41,
    location: 'Bekasi (Jababeka)',
    role: 'Plant Reliability & Electrical Safety / HSE Manager',
    strategicMarket: 'HSE & K3',
    segment: 'end_user',
    avatarEmoji: '🌱',
    avatarBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    painPoint: 'Rugi daya reaktif (kVARh) pabrik tinggi, ancaman insiden bahaya arc flash pada switchboard tegangan rendah, dan target audit ISO 50001.',
    whatMatters: 'Mitigasi bahaya arc flash (IEEE 1584 / NFPA 70E), audit kualitas daya THD-V/THD-I via Sentron PAC, efisiensi konsumsi daya, dan kepatuhan K3 Listrik PUIL 2020.',
    primaryInterest: 'safety'
  },
  {
    id: 'rian',
    name: 'Mas Rian',
    age: 30,
    location: 'Cikarang',
    role: 'Automation Engineer & PLC SIMATIC S7-1200 Specialist',
    strategicMarket: 'Otomasi PLC',
    segment: 'consultant',
    avatarEmoji: '🤖',
    avatarBg: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    painPoint: 'Modul I/O dan komunikasi sering error kalau protokol SCADA tidak kompatibel dengan hardware di panel.',
    whatMatters: 'Siemens SIMATIC S7-1200, kemudahan TIA Portal, protokol PROFINET/Modbus, dan smart IoT switchboard industri 4.0.',
    primaryInterest: 'siemens'
  }
]

function calculateAudienceBaseline(slot) {
  if (!slot) return null

  const title = (slot.title || '').toLowerCase()
  const body = (slot.body || '').toLowerCase()
  const hook = (slot.hook || '').toLowerCase()
  const cta = (slot.cta || '').toLowerCase()
  const cat = (slot.category || '').toLowerCase()
  const platform = (slot.platform || '').toLowerCase()
  const postType = (slot.postType || '').toLowerCase()

  const reviews = DEMO_AUDIENCE_PERSONAS.map(persona => {
    let score = 72
    let reaction = 'Menarik untuk dibaca'
    let quote = ''
    let actionTriggered = 'Membaca sekilas'
    let suggestedTweak = ''

    if (persona.id === 'bambang') {
      // Panel Maker
      if (cat === 'siemens' || title.includes('mccb') || title.includes('panel') || title.includes('acb') || title.includes('trip') || title.includes('3vm') || title.includes('switchboard') || title.includes('busbar')) {
        score = 94
        reaction = 'Sangat Relevan dengan Proyek Panel'
        quote = '"Nah iki! Spesifikasi Sentron 3VM presisi gini yang dicari konsultan. Asal stok beneran ready di gudang Hokiindo, langsung tak masukin BoQ switchboard."'
        actionTriggered = 'Cek stok di shop.hokiindo.co.id & Minta Penawaran BoQ'
      } else if (title.includes('busbar') || title.includes('grounding') || title.includes('trafo')) {
        score = 86
        reaction = 'Suka Pembahasannya'
        quote = '"Konfigurasi busbar dan pembumian berstandar IEC membuat serah terima komisioning lancar tanpa catatan konsultan pengawas."'
        actionTriggered = 'Bookmark Referensi Teknis'
      } else {
        score = 70
        reaction = 'Cukup Menarik'
        quote = '"Bagus buat wawasan, tapi tolong perjelas ketersediaan stok breaker 100A-250A di gudang."'
        actionTriggered = 'Scroll Lanjut'
        suggestedTweak = 'Sebutkan ketersediaan stok ready 24 jam dan dimensi bodi cubicle.'
      }
    } else if (persona.id === 'willy') {
      // Kontraktor
      if (title.includes('tender') || title.includes('surat dukungan') || title.includes('stok') || title.includes('kontraktor') || postType.includes('Ads') || title.includes('epc') || title.includes('lelang')) {
        score = 96
        reaction = 'Solusi Nyata Kontraktor EPC'
        quote = '"Dukungan distributor resmi dalam 24 jam via hokiindo.co.id ini penyelamat kontraktor yang lagi kejar tayang lelang tender BUMN!"'
        actionTriggered = 'Ajukan Surat Dukungan Tender di hokiindo.co.id'
      } else {
        score = 75
        reaction = 'Menarik Minat'
        quote = '"Materi bagus, pastikan selalu sertakan link download form tender di hokiindo.co.id."'
        actionTriggered = 'Minta Company Profile di hokiindo.co.id'
      }
    } else if (persona.id === 'gunawan') {
      // Konsultan
      if (title.includes('standar') || title.includes('iec') || title.includes('puil') || title.includes('selektif') || cat === 'siemens' || title.includes('coo') || title.includes('sertifikat')) {
        score = 96
        reaction = 'Kredibilitas Teknis Sangat Tinggi'
        quote = '"Ulasan standar IEC 60947-2 dan PUIL 2020 ini sangat akademis dan aplikatif. Sangat layak dijadikan rujukan spesifikasi tender."'
        actionTriggered = 'Masukkan Siemens ke Buku Spesifikasi Proyek'
      } else {
        score = 72
        reaction = 'Cukup Informatif'
        quote = '"Bagus, tapi pastikan selalu mencantumkan kepatuhan terhadap standar IEC terkait."'
        actionTriggered = 'Simpan Data Sheet'
        suggestedTweak = 'Cantumkan referensi standar IEC 60947-2 atau IEC 61439.'
      }
    } else if (persona.id === 'dimas') {
      // End User (Plant Manager)
      if (title.includes('trip') || title.includes('trafo') || title.includes('kontaktor') || title.includes('plc') || title.includes('kurva') || cat === 'siemens' || title.includes('maintenance') || title.includes('downtime')) {
        score = 95
        reaction = 'Sangat Mengedukasi & Bermanfaat'
        quote = '"Penjelasan kurva L-I-S-G dan pencegahan false trip ini daging semua! Jarang distributor yang paham sedalam ini."'
        actionTriggered = 'Simpan (Save Post) & Cek Sparepart di shop.hokiindo.co.id'
      } else if (cat === 'gcomin' && (title.includes('high bay') || title.includes('heatsink'))) {
        score = 89
        reaction = 'Membantu Perawatan Pabrik'
        quote = '"Plafon pabrik kami 10 meter, memang heatsink sirip penting biar gak bolak-balik naik scaffolding."'
        actionTriggered = 'Rekomendasikan ke Purchasing'
      } else {
        score = 73
        reaction = 'Menghibur'
        quote = '"Bagus buat selingan, bikin gak jenuh mikirin mesin tripping shift 3."'
        actionTriggered = 'Beri Like & Komentar'
      }
    } else if (persona.id === 'fajar') {
      // Estimator & QS Tender
      if (title.includes('boq') || title.includes('harga') || title.includes('biaya') || title.includes('katalog') || title.includes('estimasi') || title.includes('diskon') || body.includes('shop.hokiindo.co.id') || cta.includes('shop.hokiindo.co.id')) {
        score = 97
        reaction = 'Sangat Membantu Perhitungan BoQ'
        quote = '"Katalog transparan dan harga part number MLFB jelas di shop.hokiindo.co.id ini yang bikin kita gampang ngunci margin tender BoQ tanpa takut boncos."'
        actionTriggered = 'Cek Harga & Download Part List di shop.hokiindo.co.id'
      } else {
        score = 74
        reaction = 'Menunggu Rincian Harga'
        quote = '"Ulasannya menarik, akan lebih aplikatif kalau langsung dicantumkan link katalog harga di shop.hokiindo.co.id."'
        actionTriggered = 'Bookmark untuk Proyek Mendatang'
        suggestedTweak = 'Tambahkan CTA langsung ke katalog shop.hokiindo.co.id untuk mempermudah estimator.'
      }
    } else if (persona.id === 'bagas') {
      // Teknisi Listrik
      if (title.includes('wiring') || title.includes('terminal') || title.includes('busbar') || title.includes('baut') || title.includes('kontak') || title.includes('pasang') || title.includes('teknisi')) {
        score = 95
        reaction = 'Sangat Praktis untuk Teknisi Lapangan'
        quote = '"Terminal baut tembaga Siemens Sentron kokoh dan presisi. Kalau ada panduan skema praktis gini teknisi di ruang panel makin cepat mengeksekusi wiring."'
        actionTriggered = 'Simpan Panduan Wiring & Tips Panel'
      } else {
        score = 75
        reaction = 'Bagus untuk Edukasi Teknik'
        quote = '"Penjelasannya komprehensif, sertakan skema diagram wiring terminal busbar agar teknisi semakin cepat memahami konfigurasi polaritas."'
        actionTriggered = 'Baca Detail Rekayasa'
        suggestedTweak = 'Sertakan foto detail terminal tembaga busbar pada visual konten.'
      }
    } else if (persona.id === 'joko') {
      // Testing & Commissioning Site Engineer
      if (title.includes('uji') || title.includes('komisioning') || title.includes('fat') || title.includes('sat') || title.includes('tcc') || title.includes('injeksi') || title.includes('megger') || title.includes('proteksi')) {
        score = 96
        reaction = 'Sangat Krusial untuk Komisioning Site'
        quote = '"Protokol uji injeksi sekunder kurva TCC dan batas toleransi tripping ini sangat presisi. Ini standar wajib yang kami terapkan saat SAT sebelum energize."'
        actionTriggered = 'Simpan Protokol Pengujian & Bookmark Dokumen Teknik'
      } else {
        score = 80
        reaction = 'Relevan Secara Teknis'
        quote = '"Spesifikasi peralatan terinci baik, sangat membantu validasi Single Line Diagram."'
        actionTriggered = 'Verifikasi Parameter Spesifikasi'
      }
    } else if (persona.id === 'hendro') {
      // Purchasing Manager
      if (cat === 'gcomin' || title.includes('purchasing') || title.includes('stok') || title.includes('garansi') || title.includes('harga') || postType.includes('Email') || postType.includes('Ads') || body.includes('shop.hokiindo.co.id')) {
        score = 96
        reaction = 'Sangat Menarik Minat Beli'
        quote = '"Bisa langsung cek stok live di shop.hokiindo.co.id bikin kerjaan purchasing cepat. Ditambah garansi resmi aman dari audit direksi."'
        actionTriggered = 'Cek Stok di shop.hokiindo.co.id & Terbitkan PO'
      } else if (cat === 'siemens') {
        score = 86
        reaction = 'Mempertimbangkan Pembelian'
        quote = '"Kalo ada Certificate of Origin resmi dari Siemens gini, aman buat audit tender pabrik kami."'
        actionTriggered = 'Minta Brosur & Price List BoQ'
      } else {
        score = 70
        reaction = 'Biasa Saja'
        quote = '"Perlu ditambah penegasan diskon volume pengadaan BoQ biar purchasing makin tertarik."'
        actionTriggered = 'Scroll Lanjut'
        suggestedTweak = 'Tambahkan info SLA pengiriman cepat dan diskon volume BoQ.'
      }
    } else if (persona.id === 'ratna') {
      // HSE & K3 Manager
      if (cat === 'gcomin' || title.includes('solar') || title.includes('k3') || title.includes('zero accident') || title.includes('arc') || title.includes('efisiensi') || title.includes('sni') || title.includes('lux')) {
        score = 96
        reaction = 'Sangat Sejalan dengan KPI Pabrik'
        quote = '"Analisis efisiensi energi dan zero accident K3 ini persis yang saya butuhkan untuk dipresentasikan ke direksi bulan depan!"'
        actionTriggered = 'Ajukan Jadwal Audit Energi di hokiindo.co.id'
      } else {
        score = 74
        reaction = 'Cukup Baik'
        quote = '"Proteksi kelistrikan yang baik memang fondasi utama keselamatan kerja di pabrik."'
        actionTriggered = 'Catat Kontak PT Hokiindo Raya'
      }
    } else if (persona.id === 'rian') {
      // Otomasi PLC
      if (title.includes('plc') || title.includes('otomasi') || title.includes('s7-1200') || title.includes('tia portal') || title.includes('smart') || title.includes('scada')) {
        score = 97
        reaction = 'Sangat Sesuai Dunia Otomasi'
        quote = '"Siemens S7-1200 memang standar emas otomasi pabrik. Senang melihat distributor lokal yang mengedukasi TIA Portal."'
        actionTriggered = 'Konsultasi Konfigurasi Modul I/O PLC'
      } else {
        score = 68
        reaction = 'Biasa Saja'
        quote = '"Untuk engineer otomasi agak general, tapi bagus untuk pemahaman dasar kelistrikan."'
        actionTriggered = 'Baca Kilat'
      }
    }

    return {
      ...persona,
      score,
      reaction,
      quote,
      actionTriggered,
      suggestedTweak: suggestedTweak || `Perkuat pada aspek: ${persona.whatMatters}`
    }
  })

  const avgScore = Math.round(reviews.reduce((acc, r) => acc + r.score, 0) / reviews.length)
  const positiveCount = reviews.filter(r => r.score >= 85).length
  const hesitantCount = reviews.filter(r => r.score >= 70 && r.score < 85).length
  const lowCount = reviews.filter(r => r.score < 70).length

  // Segment breakdown
  const contractorAvg = Math.round(reviews.filter(r => r.segment === 'contractor' || r.segment === 'panel_maker').reduce((acc, r) => acc + r.score, 0) / 2)
  const engineeringAvg = Math.round(reviews.filter(r => r.segment === 'consultant' || r.segment === 'estimator').reduce((acc, r) => acc + r.score, 0) / 3)
  const fieldAvg = Math.round(reviews.filter(r => r.segment === 'field' || r.segment === 'end_user').reduce((acc, r) => acc + r.score, 0) / 5)

  const topTarget = [...reviews].sort((a, b) => b.score - a.score)[0]
  const secondTarget = [...reviews].sort((a, b) => b.score - a.score)[1]

  let overallVerdict = 'Daya Tarik Tinggi'
  let verdictBadge = 'bg-emerald-600 text-white'
  if (avgScore >= 90) {
    overallVerdict = 'Sangat Memikat & Berdampak Tinggi (High-Converting Magnet)'
    verdictBadge = 'bg-emerald-600 text-white'
  } else if (avgScore >= 80) {
    overallVerdict = 'Bagus & Tepat Sasaran Pasar B2B'
    verdictBadge = 'bg-indigo-600 text-white'
  } else {
    overallVerdict = 'Perlu Penajaman Sudut Pandang Teknis'
    verdictBadge = 'bg-amber-500 text-white'
  }

  const mostHesitant = [...reviews].sort((a, b) => a.score - b.score)[0]
  const mainCritique = `Saran Utama Panel: ${mostHesitant.name} (${mostHesitant.role}) merasa materi akan jauh lebih kuat jika CTA atau naskah menegaskan: "${mostHesitant.whatMatters}".`

  return {
    isAiGenerated: false,
    avgScore,
    positiveCount,
    hesitantCount,
    lowCount,
    segmentBreakdown: {
      contractor: contractorAvg,
      engineering: engineeringAvg,
      field: fieldAvg
    },
    overallVerdict,
    verdictBadge,
    topTarget,
    secondTarget,
    reviews,
    mainCritique,
    tips: `Konten ini memiliki daya tarik tertinggi pada ${topTarget.name} (${topTarget.role} - ${topTarget.strategicMarket}) dengan skor ${topTarget.score}%. Disarankan CTA mempertegas: "${topTarget.whatMatters}".`
  }
}

function evaluateDemoAudience(slot) {
  if (!slot) return null
  // Jika slot sudah memiliki hasil review dari AI (DeepSeek / SumoPod), gunakan hasil AI yang tersimpan!
  if (slot.aiAudienceReview && Array.isArray(slot.aiAudienceReview.reviews) && slot.aiAudienceReview.reviews.length > 0) {
    return slot.aiAudienceReview
  }
  return calculateAudienceBaseline(slot)
}
// ==========================================
// 1. DATA 4 AGEN JAWA MARKETING SQUAD
// ==========================================
const SQUAD_AGENTS = [
  {
    id: 'tejo',
    name: 'Mas Tejo',
    nickname: 'Lead Tech Author',
    title: 'Lead Power Systems Engineer & Technical Specification Author',
    avatarBg: 'from-blue-600 to-indigo-700',
    badgeCls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    avatarEmoji: '✍️',
    quote: '"Integritas rekayasa kelistrikan ditentukan oleh presisi spesifikasi dan kepatuhan mutlak pada standar IEC 60947 serta PUIL 2020."',
    specialties: [
      'Technical Whitepapers & Application Guides (IEC 60947, IEC 61439)',
      'Kajian Koordinasi Selektivitas & Mitigasi Bahaya Arc Flash',
      'Optimasi Single Line Diagram (SLD) & Spesifikasi Tender Industri',
      'Technical Bulletins untuk Konsultan Perencana & Panel Builder'
    ],
    defaultPlatform: 'linkedin',
    defaultModel: 'deepseek-v3',
    costPerRun: 'Aktif & Siap Kerja',
    accentColor: 'blue'
  },
  {
    id: 'bagong',
    name: 'Ir. Bagong, S.T.',
    nickname: 'Commissioning Specialist',
    title: 'Field Testing, FAT/SAT & Commissioning Engineer',
    avatarBg: 'from-amber-500 to-orange-600',
    badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    avatarEmoji: '⚡',
    quote: '"Uji injeksi sekunder tidak pernah bohong; kurva TCC dan ketahanan kontak harus presisi di lapangan sebelum serah terima daya penuh."',
    specialties: [
      'Protokol Pengujian Lapangan FAT & SAT Berstandar IEC',
      'Verifikasi Kurva Waktu-Arus (TCC) Injeksi Sekunder',
      'Analisis Termografi Inframerah & Ductor Micro-Ohm',
      'Studi Kasus Kegagalan Proteksi & Mitigasi Arc Flash'
    ],
    defaultPlatform: 'instagram',
    defaultModel: 'deepseek-v3',
    costPerRun: 'Aktif & Siap Kerja',
    accentColor: 'amber'
  },
  {
    id: 'sri',
    name: 'Mbak Sri',
    nickname: 'Engineering Coordinator',
    title: 'Tender Document Specialist & Supply Chain Coordinator',
    avatarBg: 'from-emerald-600 to-teal-700',
    badgeCls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    avatarEmoji: '📋',
    quote: '"SLA respon BoQ 2 jam, validitas Certificate of Origin (CoO) pabrikan terjamin 100% untuk kelulusan tender industri."',
    specialties: [
      'Analisis BoQ & SLA Penawaran Teknis (< 4 Jam)',
      'Manajemen Dokumen Keaslian CoO & Sertifikat Type-Test',
      'Komunikasi Terjadwal Multi-Platform untuk EPC & Panel Maker',
      'Orkestrasian Tindak Lanjut Inquiries Proyek Industri'
    ],
    defaultPlatform: 'email',
    defaultModel: 'deepseek-v3',
    costPerRun: 'Aktif & Siap Kerja',
    accentColor: 'emerald'
  },
  {
    id: 'broto',
    name: 'Ir. Broto Kusumo, M.T.',
    nickname: 'Industrial Solutions Director',
    title: 'Head of Energy Optimization & Capex/Opex Engineering',
    avatarBg: 'from-purple-600 to-pink-700',
    badgeCls: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    avatarEmoji: '💼',
    quote: '"Investasi kelistrikan pabrik harus terukur secara TCO (Total Cost of Ownership), meminimalkan risiko downtime tak terjadwal dan menekan rugi daya."',
    specialties: [
      'Analisis Total Cost of Ownership (TCO) & Payback Industri',
      'Kajian Retrofit & Modernisasi Switchgear Existing',
      'Outreach B2B Strategis untuk Direktur Operasional & Purchasing',
      'Kajian Kelayakan Monitoring Energi (ISO 50001 / IEC 61557-12)'
    ],
    defaultPlatform: 'linkedin',
    defaultModel: 'deepseek-v3',
    costPerRun: 'Aktif & Siap Kerja',
    accentColor: 'purple'
  }
]

// ==========================================
// 2. HELPER TANGGAL & ROLLING PEKAN
// ==========================================
function getNextMondayYMD(baseDate = new Date()) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = day === 0 ? 1 : (8 - day)
  const nextMonday = new Date(d)
  nextMonday.setDate(d.getDate() + diff)
  const yyyy = nextMonday.getFullYear()
  const mm = String(nextMonday.getMonth() + 1).padStart(2, '0')
  const dd = String(nextMonday.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function snapToMonday(dateStr) {
  if (!dateStr) return getNextMondayYMD()
  const parts = dateStr.split('-')
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  const day = d.getDay() // 0 = Sunday, 1 = Monday
  const diff = (day === 0 ? -6 : 1 - day)
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  const yyyy = mon.getFullYear()
  const mm = String(mon.getMonth() + 1).padStart(2, '0')
  const dd = String(mon.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDaysToDateStr(dateStr, days) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  d.setDate(d.getDate() + days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatIndoDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  if (isNaN(d.getTime())) return dateStr
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${d.getDate()} ${monthNames[d.getMonth()]}`
}

function formatWeekRange(mondayStr) {
  if (!mondayStr) return ''
  const friStr = addDaysToDateStr(mondayStr, 4)
  return `${formatIndoDate(mondayStr)} s/d ${formatIndoDate(friStr)}`
}

function getWeekDates(mondayStr) {
  return [
    addDaysToDateStr(mondayStr, 0), // Senin Pagi
    addDaysToDateStr(mondayStr, 0), // Senin Sore
    addDaysToDateStr(mondayStr, 1), // Selasa
    addDaysToDateStr(mondayStr, 2), // Rabu Pagi
    addDaysToDateStr(mondayStr, 2), // Rabu Sore
    addDaysToDateStr(mondayStr, 3), // Kamis
    addDaysToDateStr(mondayStr, 4)  // Jumat
  ]
}

// ==========================================
// 3. MASTER TEMPLATE CERDAS BUILT-IN
// (Digunakan saat offline / fallback SumoPod)
// ==========================================
function getBuiltinWeekSlots(mondayStr, weekNumber = 1, customTopic = '') {
  const dates = getWeekDates(mondayStr)
  const normWeek = ((weekNumber - 1) % 4) + 1
  const slots = []

  if (normWeek === 1) {
    slots.push({
      id: `slot_${mondayStr}_1`,
      week: weekNumber,
      dateStr: dates[0],
      dayLabel: 'Senin Pagi',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Artikel LinkedIn B2B',
      title: customTopic ? `[Analisis Teknis] ${customTopic}` : 'Standar Trip Unit MCCB Siemens Sentron 3VM untuk Panel Maker',
      hook: 'Banyak panel builder dan engineer pabrik sering mengabaikan hal krusial ini saat memilih pemutus sirkuit.',
      body: `Dalam operasional pabrik yang berjalan 24 jam nonstop, keandalan proteksi kelistrikan bukan sekadar formalitas spesifikasi tender.

Ketika terjadi arus beban lebih (overload) atau gangguan hubung singkat (short circuit), perbedaan respons 0,05 detik menentukan keselamatan aset mesin senilai ratusan juta rupiah.

Inilah alasan PT Hokiindo Raya secara konsisten merekomendasikan jajaran MCCB Siemens Sentron 3VM:
1. Akurasi Trip Unit Teruji: Respon termal-magnetik dan proteksi elektronik yang presisi tanpa false tripping.
2. Dimensi Kompak & Ergonomis: Menghemat ruang tata letak panel hingga 20%, memudahkan terminasi konduktor busbar.
3. Ketersediaan Riil (Ready Stock): Kami memahami deadline proyek Anda tidak bisa menunggu waktu inden berbulan-bulan.

Bagaimana standar proteksi panel di plant Anda saat ini? Mari berdiskusi tentang optimasi sistem kelistrikan Anda.`,
      cta: 'Konsultasikan kebutuhan spesifikasi dan ketersediaan stok Siemens bersama tim teknis PT Hokiindo Raya via pesan langsung atau hubungi kantor kami.',
      hashtags: '#SiemensIndonesia #PTHokiindoRaya #PanelMaker #Switchgear #TeknikElektro #ListrikIndustri',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Portrait)',
        layoutType: 'Hero Product Showcase / 3/4 Perspective',
        headlineOverlay: 'AKURAT 0,05 DETIK: PROTEKSI MAKSIMAL MESIN PABRIK',
        subHeadlineOverlay: 'MCCB Siemens Sentron 3VM • Ready Stock PT Hokiindo Raya',
        colorPalette: [
          { name: 'Navy Brand HSO', hex: '#0F172A' },
          { name: 'Siemens Petrol Teal', hex: '#00646E' },
          { name: 'Copper Orange Glow', hex: '#B45309' },
          { name: 'Pure White Text', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Posisikan unit MCCB Siemens 3VM di 1/3 kanan frame dengan sudut serong menonjolkan terminal baut tembaga. Sebelah kiri berlatar belakang gelap untuk typography bold headline dan logo HSO.',
        aiPrompt: 'Commercial studio product shot of Siemens Sentron 3VM MCCB circuit breaker, industrial switchgear copper busbar background, dramatic dark lighting, shallow depth of field --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_2`,
      week: weekNumber,
      dateStr: dates[1],
      dayLabel: 'Senin Sore',
      agentId: 'bagong',
      category: 'testing',
      platform: 'instagram',
      postType: 'Video Walkthrough Pengujian Teknis',
      title: 'Verifikasi Kurva Waktu-Arus (TCC) Injeksi Sekunder: Mengapa Breaker Non-Standar Trip Prematur',
      hook: '[0-3 Detik]: "Pernah mengalami breaker mendadak trip di 80% beban nominal saat commissioning? Jangan salahkan beban dulu sebelum verifikasi kurva TCC trip unit!" ⚡',
      body: `[Protokol Video Pengujian Teknis 30 Detik]:

👉 [00-08 Detik]: 
Visual: Display alat uji injeksi sekunder (Secondary Injection Test Set) terhubung ke Electronic Trip Unit (ETU) Siemens Sentron 3VA.
Penjelasan: "Breaker non-standar bimetal sering mengalami degradasi termal akibat creepage & contact bounce, memicu pergeseran kurva invers sehingga trip prematur sebelum mencapai arus proteksi nominal."

👉 [08-20 Detik]: 
Visual: Grafik Time-Current Characteristic (TCC) presisi dengan kurva L-S-I-G Siemens Sentron yang stabil pada toleransi ±5% sesuai IEC 60947-2.
Penjelasan: "Trip Unit Mikroprosesor Siemens Sentron mengukur nilai True RMS arus fasa, menjamin selektivitas penuh tanpa risiko false tripping akibat harmonisa beban non-linear."

👉 [20-30 Detik]:
Visual: Pengecekan status kontak breaker pada busbar cubicle yang dingin dan stabil pada uji injeksi arus penuh.
Penjelasan: "Gunakan pemutus sirkuit dengan akurasi teruji dan Certificate of Origin (CoO) pabrikan resmi dari PT Hokiindo Raya."`,
      cta: 'Konsultasikan kurva koordinasi proteksi dan kebutuhan breaker industri Anda bersama tim rekayasa PT Hokiindo Raya di shop.hokiindo.co.id.',
      hashtags: '#UjiInjeksiSekunder #KurvaTCC #ProteksiListrik #SiemensSentron #IEC60947 #PTHokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1920 px (9:16 Vertikal Thumbnail)',
        layoutType: 'Technical Diagnostic Protocol Visual',
        headlineOverlay: 'UJI INJEKSI SEKUNDER KURVA TCC: BREAKER SERING FALSE TRIP?',
        subHeadlineOverlay: 'Verifikasi Toleransi Tripping IEC 60947-2 Siemens Sentron',
        colorPalette: [
          { name: 'Precision Cyan', hex: '#06B6D4' },
          { name: 'Siemens Petrol', hex: '#00646E' },
          { name: 'Dark Navy', hex: '#020617' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Teknisi komisioning bersertifikat mengoperasikan test kit injeksi sekunder dengan tampilan kurva waktu-arus digital di latar belakang ruang switchboard industri.',
        aiPrompt: 'High-tech electrical commissioning engineer testing a Siemens circuit breaker with secondary injection test set, digital logarithmic graph display, clean industrial switchgear laboratory --ar 9:16'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_3`,
      week: weekNumber,
      dateStr: dates[2],
      dayLabel: 'Selasa',
      agentId: 'sri',
      category: 'siemens',
      platform: 'email',
      postType: 'Email Blast Klien B2B',
      title: 'Pembaruan Stok Ready 24 Jam: Siemens MCCB & Katalog G-Comin',
      hook: 'Subject: [Info Stok Ready 24 Jam] Pembaruan Ketersediaan Komponen Siemens & Lampu G-Comin untuk Proyek Anda',
      body: `Yth. Bapak/Ibu Rekan Bisnis & Pelanggan Setia PT Hokiindo Raya,

Semoga kegiatan operasional dan proyek yang sedang berjalan senantiasa lancar.

Menjawab kebutuhan percepatan pengadaan komponen elektrikal berkualitas tinggi di kuartal ini, kami informasikan bahwa gudang utama PT Hokiindo Raya saat ini telah siap menyalurkan:

1. Siemens MCCB Sentron 3VM & 3VA (Rating 16A s/d 630A - Ready Stock)
2. Siemens Contactor Sirius Series & Overload Relay
3. G-Comin Industrial High Bay LED 100W/150W/200W (Efikasi tinggi untuk gudang & pabrik)

Keuntungan pemesanan minggu ini:
- Jaminan keaslian 100% dengan dokumen resmi pabrikan.
- Prioritas pengiriman langsung armada HSO untuk area Jabodetabek.
- Dukungan konsultasi teknis pemilihan rating kapasitas bersama engineer kami.`,
      cta: 'Silakan balas email ini atau kirimkan daftar BoQ proyek Anda ke sales@hokiindo.com untuk mendapatkan surat penawaran harga resmi.',
      hashtags: '#EmailBlast #PTHokiindoRaya #PengadaanB2B #KatalogSiemens #LampuGComin #DistributorResmi',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '600 x 250 px (Header Banner Email)',
        layoutType: 'Clean Corporate Logistics Banner',
        headlineOverlay: 'READY STOCK 24 JAM: SIEMENS & G-COMIN',
        subHeadlineOverlay: 'Pengiriman Cepat Jabodetabek & Garansi Asli 100%',
        colorPalette: [
          { name: 'Corporate Blue', hex: '#1E3A8A' },
          { name: 'Siemens Cyan', hex: '#00646E' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Gudang logistik modern dengan pallet box komponen Siemens berstiker QC PASS dan armada pengiriman HSO.',
        aiPrompt: 'Modern high-tech industrial warehouse with stacked boxes of Siemens electrical components, clean logistics, bright lighting --ar 12:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_4`,
      week: weekNumber,
      dateStr: dates[3],
      dayLabel: 'Rabu Pagi',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'website',
      postType: 'Artikel Blog Website & LinkedIn SEO',
      title: '3 Kesalahan Fatal Pemilihan Kapasitas Pemutusan (Breaking Capacity kA) pada Switchboard Industri',
      hook: 'Memilih breaker hanya berdasarkan arus nominal (In) tanpa menghitung kapasitas hubung singkat prospektif trafo (Isc) adalah penyebab utama ledakan cubicle panel.',
      body: `Banyak perencana elektrikal mengabaikan relasi antara impedansi persentase (%Z) transformator daya dan level arus hubung singkat simetris 3-fasa pada busbar utama LVMDP.

Inilah 3 parameter rekayasa krusial yang wajib diverifikasi:
1. Menghitung Isc Prospektif Trafo: Rumus dasar Isc = S_trafo / (akar(3) x V_fasa x %Z). Untuk trafo 2000 kVA 20kV/400V dengan %Z = 6%, arus short-circuit simetris mencapai 48,1 kA. Menggunakan breaker 36kA pada posisi ini adalah pelanggaran fatal standar IEC 60947-2.
2. Membedakan Icu vs Ics: Icu (Ultimate Breaking Capacity) hanya menguji kemampuan pemutusan sekali uji lab. Pastikan memilih breaker dengan Ics = 100% Icu (seperti Siemens Sentron 3VA/3VM) agar breaker tetap beroperasi andal pasca-gangguan.
3. Koordinasi Back-up Protection: Jika level gangguan melebihi rating breaker cabang, terapkan koordinasi kaskade (cascading) berdasar tabel resmi Siemens Sentron untuk membatasi energi tembus I²t.`,
      cta: 'Dapatkan tabel kalkulasi kA trafo vs breaker dan konsultasi spesifikasi switchboard bersama tim rekayasa PT Hokiindo Raya di hokiindo.co.id.',
      hashtags: '#BreakingCapacity #IEC60947 #SiemensSentron #KalkulasiHubungSingkat #SwitchboardDesign #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1200 x 628 px (16:9 Banner)',
        layoutType: 'Technical Diagnostic Comparison / Diagram',
        headlineOverlay: '3 KESALAHAN FATAL PEMILIHAN BREAKING CAPACITY (kA)',
        subHeadlineOverlay: 'Rumus Kalkulasi Isc Trafo & Jaminan Ics = 100% Icu Siemens Sentron',
        colorPalette: [
          { name: 'Engineering Navy', hex: '#0B132B' },
          { name: 'Precision Cyan', hex: '#00F0FF' },
          { name: 'Safety White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Diagram skematik Single Line Diagram (SLD) transformator distribusi ke Main Switchboard dengan rumus perhitungan Isc dan grafik kurva pemutusan breaker Siemens.',
        aiPrompt: 'Clean technical electrical single line diagram with short circuit calculation formulas, blueprint aesthetics, professional switchgear engineering --ar 16:9'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_5`,
      week: weekNumber,
      dateStr: dates[4],
      dayLabel: 'Rabu Sore',
      agentId: 'bagong',
      category: 'siemens',
      platform: 'instagram',
      postType: 'Carousel Instagram (5 Slide Edukasi)',
      title: '5 Tanda MCCB Pabrikmu Sudah Minta Pensiun',
      hook: 'Slide 1: "Jangan tunggu keluar asap atau mesin mati total! Cek 5 tanda bahaya breaker panel ini!" ⚠️',
      body: `[Isi 5 Slide Carousel Instagram]:
Slide 1: Cover menarik "5 Tanda Breaker Pabrikmu Sudah Minta Pensiun Dini!"
Slide 2: Tanda #1 - Bodi switch terasa panas abnormal saat disentuh (indikasi resistansi kontak internal naik).
Slide 3: Tanda #2 - Sering false trip padahal beban ampere masih jauh di bawah rating nominal In.
Slide 4: Tanda #3 - Tuas toggle terasa kendor atau macet saat dites mekanikal trip (push to trip).
Slide 5: Solusi - Re-evaluasi dengan Siemens Sentron 3VM ready stock di PT Hokiindo Raya.`,
      cta: 'Simpan postingan ini untuk checklist maintenance bulanan tim Anda!',
      hashtags: '#MaintenancePabrik #TeknikElektro #TipsListrik #SiemensSentron #PanelMaker #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Carousel Slide 1)',
        layoutType: 'High-Alert Warning Card',
        headlineOverlay: '5 TANDA BREAKER PABRIK SUDAH MINTA PENSIUN!',
        subHeadlineOverlay: 'Checklist Wajib Tim Maintenance Sebelum Fatal Trip',
        colorPalette: [
          { name: 'Danger Red', hex: '#EF4444' },
          { name: 'Industrial Charcoal', hex: '#1F2937' },
          { name: 'Siemens Amber', hex: '#F59E0B' }
        ],
        compositionDetails: 'Visual dramatis breaker dengan efek thermal scanner inframerah (panas merah-kuning) di terminal busbarnya.',
        aiPrompt: 'Infrared thermal scan visual of an electrical circuit breaker overheating, stark contrast, alert red warning graphics --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_6`,
      week: weekNumber,
      dateStr: dates[5],
      dayLabel: 'Kamis',
      agentId: 'broto',
      category: 'gcomin',
      platform: 'linkedin',
      postType: 'Strategi Iklan B2B (Target Purchasing)',
      title: 'Kurasi Iklan B2B: Target Purchasing Pabrik Cikarang & Karawang',
      hook: 'Rekomendasi Kampanye Ads: Boost konten edukasi High Bay G-Comin dengan target terfokus kawasan industri.',
      body: `Rancangan Kampanye Iklan Berbayar Anti-Boncos Minggu Ini:

1. Target Audience Persona:
- Job Titles: Purchasing Manager, Procurement Specialist, Maintenance Supervisor, Electrical Engineering Manager.
- Wilayah Geografis: Kawasan Industri MM2100, Jababeka, EJIP Cikarang, Suryacipta Karawang, Rungkut Surabaya.
- Platform: LinkedIn Sponsored Post + Meta Ads Retargeting.

2. Alokasi Anggaran Cerdas:
- Budget: Rp 150.000 / hari x 4 hari (Total Rp 600.000).
- Proyeksi Hasil: 4.000 - 7.500 Jangkauan Eksekutif, estimasi 30 - 55 Lead Klik Masuk ke Konsultasi WhatsApp Sales HSO.

3. Sudut Pesan Iklan:
"Gudang sering gelap dan lampu sering putus kena panas atap? G-Comin High Bay LED tahan panas 50°C, garansi resmi distributor PT Hokiindo Raya. Ready stock Jabodetabek!"`,
      cta: 'Tombol Call-To-Action: Dapatkan Brosur & Penawaran Harga Spesial (Direct WhatsApp).',
      hashtags: '#AdsStrategy #GrowthMarketing #B2BProcurement #LampuPabrik #PTHokiindoRaya #GComin',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1080 px (1:1 Square Feed Ads)',
        layoutType: 'High-Converting B2B Lead Magnet',
        headlineOverlay: 'PROYEK DIKEJAR DEADLINE? KOMPONEN KAMI SIAP KIRIM',
        subHeadlineOverlay: 'Distributor Resmi Siemens & Lampu Industri G-Comin HSO',
        colorPalette: [
          { name: 'Trust Royal Blue', hex: '#1D4ED8' },
          { name: 'Action Orange', hex: '#EA580C' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Podium metalik gelap menampilkan unit MCCB Siemens dan lampu High Bay G-Comin. Tombol Call to Action grafis "Minta Penawaran BoQ Hari Ini".',
        aiPrompt: 'Professional product advertisement shot of industrial switchgear breaker and high bay lamp, high contrast lighting, premium metallic podium --ar 1:1'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_7`,
      week: weekNumber,
      dateStr: dates[6],
      dayLabel: 'Jumat',
      agentId: 'bagong',
      category: 'testing',
      platform: 'linkedin',
      postType: 'Studi Kasus Teknis & Evaluasi Lapangan',
      title: 'Analisis Kegagalan Kontak Pemutus Akibat Peningkatan Resistansi Mikro-Ohm (Ductor Test)',
      hook: 'Resistansi kontak di atas 50 µΩ pada terminal busbar breaker adalah bom waktu termal I²R yang memicu hotspot hingga 140°C saat dialiri arus beban penuh.',
      body: `Banyak kegagalan switchboard terjadi bukan karena kesalahan tripping kurva proteksi, melainkan degradasi mekanikal permukaan kontak pemutus sirkuit.

Mengapa uji Contact Resistance (Ductor Test) wajib dilakukan saat FAT/SAT:
1. Rugi Disipasi Panas I²R: Resistansi kontak yang naik dari 25 µΩ menjadi 150 µΩ pada arus 630A menghasilkan pelepasan panas terkonsentrasi sebesar ~60 Watt pada titik sambungan yang sempit.
2. Degradasi Kontak Bimetal: Breaker non-standar yang menggunakan lapisan tembaga tipis tanpa paduan perak-nikel mengalami oksidasi termal cepat, melelehkan insulator bodi switchgear.
3. Keunggulan Siemens Sentron: Desain kontak perak-nikel (AgNi) pada Siemens Sentron 3VM/3VA mempertahankan resistansi kontak stabil < 30 µΩ bahkan setelah menjalani siklus pemutusan arus hubung singkat berat.

Pastikan protokol komisioning Anda mencakup pengukuran mikro-ohm 4-kawat (Kelvin bridge) sebelum serah terima daya.`,
      cta: 'Konsultasikan prosedur pengujian komisioning dan ketersediaan komponen proteksi resmi Siemens bersama tim rekayasa PT Hokiindo Raya di hokiindo.co.id.',
      hashtags: '#DuctorTest #ContactResistance #FAT #SAT #KomisioningListrik #SiemensSentron #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1080 px (1:1 Technical Infographic)',
        layoutType: 'Engineering Failure Analysis Graphic',
        headlineOverlay: 'RESISTANSI KONTAK > 50 µΩ: BOM WAKTU HOTSPOT RUANG PANEL',
        subHeadlineOverlay: 'Pentingnya Uji Ductor Test 4-Kawat pada Breaker Siemens Sentron',
        colorPalette: [
          { name: 'Alert Red', hex: '#DC2626' },
          { name: 'Copper Shiny', hex: '#D97706' },
          { name: 'Dark Navy', hex: '#0B132B' }
        ],
        compositionDetails: 'Visual inframerah termografi yang menampakkan perbandingan terminal breaker bertemperatur normal (biru-hijau) vs hotspot kritis (merah membara) akibat resistansi kontak tinggi.',
        aiPrompt: 'Infrared thermal imaging comparison of electrical circuit breaker terminals, one cool green and one glowing red hotspot, professional engineering diagram layout --ar 1:1'
      }
    })
  } else if (normWeek === 2) {
    slots.push({
      id: `slot_${mondayStr}_1`,
      week: weekNumber,
      dateStr: dates[0],
      dayLabel: 'Senin Pagi',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Artikel LinkedIn B2B',
      title: 'Sentron ACB 3WL: Mengapa Pabrik Kaca & Semen Tidak Boleh Kompromi',
      hook: 'Di industri semen dan kaca, downtime 1 jam sama dengan kerugian bahan baku ratusan juta rupiah yang membeku di kiln.',
      body: `Air Circuit Breaker (ACB) adalah jantung pertahanan sistem kelistrikan utama pabrik. Beban induktif motor raksasa dan fluktuasi tegangan ekstrim membutuhkan pemutus berdaya tahan siklus mekanikal tinggi.

Keunggulan Siemens Sentron ACB yang disuplai PT Hokiindo Raya:
- Daya tahan hingga 20.000 siklus operasi mekanis.
- Unit proteksi Electronic Trip Unit (ETU) dengan pengukuran harmonisa terintegrasi.
- Kemudahan komunikasi protokol Modbus/Profibus untuk otomasi SCADA.`,
      cta: 'Cek stok dan spesifikasi ACB Siemens Sentron di shop.hokiindo.co.id atau konsultasi teknis tender di hokiindo.co.id.',
      hashtags: '#AirCircuitBreaker #SiemensSentron #HeavyIndustry #HokiindoRaya #TeknikElektro',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Portrait)',
        layoutType: 'Industrial Heavy Duty Showcase',
        headlineOverlay: 'DOWNTIME 1 JAM = RUGI RATUSAN JUTA?',
        subHeadlineOverlay: 'Sentron ACB Siemens: Perlindungan Maksimal Industri Berat',
        colorPalette: [
          { name: 'Steel Blue', hex: '#1E40AF' },
          { name: 'Titanium Grey', hex: '#374151' },
          { name: 'Clean White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Close-up unit ACB Siemens terpasang di cubicle panel distribusi utama dengan latar belakang pabrik semen yang kokoh.',
        aiPrompt: 'Industrial Air Circuit Breaker installed inside a massive power distribution cubicle, engineering lighting --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_2`,
      week: weekNumber,
      dateStr: dates[1],
      dayLabel: 'Senin Sore',
      agentId: 'bagong',
      category: 'testing',
      platform: 'instagram',
      postType: 'Video Walkthrough Pengujian Teknis',
      title: 'Verifikasi Tingkat Proteksi Selungkup IP54 & IP65 Cubicle Switchboard Sesuai IEC 60529',
      hook: '[0-3 Detik]: "Debu konduktif atau percikan air masuk ke dalam cubicle breaker? Verifikasi sertifikasi IP rating switchboard Anda sesuai IEC 60529!" 🛡️',
      body: `[Alur Video Protokol Pengujian 30 Detik]:
Detik 0-5: Ir. Bagong memeriksa gasket sealing polyurethane dan pintu ber-interlock pada kubikel switchgear industri.
Detik 5-15: Pengujian semprotan air bertekanan terkontrol (Water Ingress Test) pada sambungan kompartemen busbar dan pintu ventilasi ber-filter IP54.
Detik 15-22: Inspeksi kompartemen internal: tidak ada partikel debu konduktif maupun tetesan air yang menembus ruang isolasi busbar.
Detik 22-30: "Sertifikasi enclosure IP54/IP65 terverifikasi menjamin operasional kontinu switchboard pada pabrik kimia, semen, dan manufaktur berat."`,
      cta: 'Konsultasikan desain panel switchboard berstandar IEC 61439 dan komponen proteksi Siemens di hokiindo.co.id.',
      hashtags: '#IEC60529 #IPRating #SwitchgearProtection #SiemensSentron #EnclosureDesign #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1920 px (9:16 Video Thumbnail)',
        layoutType: 'Technical Enclosure Testing Visual',
        headlineOverlay: 'VERIFIKASI TINGKAT PROTEKSI IP54/IP65 CUBICLE SWITCHBOARD',
        subHeadlineOverlay: 'Uji Ketahanan Ingress Sesuai Standar IEC 60529 & IEC 61439',
        colorPalette: [
          { name: 'Precision Cyan', hex: '#06B6D4' },
          { name: 'Industrial Navy', hex: '#0F172A' },
          { name: 'Safety Gold', hex: '#FACC15' }
        ],
        compositionDetails: 'Close-up pintu cubicle switchgear dengan gasket industri presisi tinggi dan indikator uji penetrasi air berstandar laboratorium akreditasi.',
        aiPrompt: 'High tech industrial electrical enclosure undergoing IP rating water ingress spray testing, professional electrical engineering test facility, dramatic clean lighting --ar 9:16'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_3`,
      week: weekNumber,
      dateStr: dates[2],
      dayLabel: 'Selasa',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Artikel Komparasi Teknis',
      title: 'Siemens Sirius Contactor vs Kontaktor Generik: Apa yang Terjadi Saat Start Motor Berat?',
      hook: 'Arus inrush motor induksi bisa mencapai 7x arus nominal. Apakah kontak perak breaker Anda sanggup bertahan?',
      body: `Penggantian kontaktor yang terlalu sering adalah gejala kelelahan material pada contact point yang terbuat dari campuran tembaga murah.

Siemens Sirius Contactor menggunakan alloy perak-nikel tahan busur api (arc resistant) dengan mechanical interlock yang presisi. Hasilnya: bebas macet dan usia pakai motor Anda bertambah hingga 3 kali lipat.`,
      cta: 'Cek ketersediaan paket kontaktor Sirius + overload relay di shop.hokiindo.co.id (ready stock gudang PT Hokiindo Raya).',
      hashtags: '#SiemensSirius #KontaktorListrik #MotorInduksi #PanelMaker #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Infografis)',
        layoutType: 'Macro Engineering Component Shot',
        headlineOverlay: 'ARUS INRUSH 7X LIPAT: APAKAH KONTAKTOR ANDA SELAMAT?',
        subHeadlineOverlay: 'Siemens Sirius Series: Daya Tahan Kontak Perak Anti Meleleh',
        colorPalette: [
          { name: 'Siemens Teal', hex: '#00646E' },
          { name: 'Silver Contact', hex: '#94A3B8' },
          { name: 'Dark Void', hex: '#090D16' }
        ],
        compositionDetails: 'Foto makro jarak dekat contact point perak kontaktor Siemens Sirius dengan pencahayaan rim-light elegan.',
        aiPrompt: 'Macro extreme close-up of electrical contact point inside Siemens Sirius motor contactor, metallic textures, studio lighting --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_4`,
      week: weekNumber,
      dateStr: dates[3],
      dayLabel: 'Rabu Pagi',
      agentId: 'bagong',
      category: 'siemens',
      platform: 'instagram',
      postType: 'Carousel Instagram (5 Slide Tips)',
      title: 'Cara Menghitung Kapasitas Kontaktor Sesuai Beban Motor kW',
      hook: 'Slide 1: "Beli kontaktor jangan cuma pas-pasan sama ampere motor! Bisa meleleh pas start pertama!"',
      body: `Slide 1: Rumus Cepat Menentukan Rating Kontaktor AC-3
Slide 2: Pahami Kategori Penggunaan (AC-1 vs AC-3 vs AC-4)
Slide 3: Menghitung Arus Nominal In = P / (√3 x V x cos φ x η)
Slide 4: Faktor Keselamatan (Safety Margin 20-25% untuk Heavy Starting)
Slide 5: Tabel Rekomendasi Siemens Sirius Rating 9A sampai 500A (Cek stok di shop.hokiindo.co.id).`,
      cta: 'Simpan tabel ini di galeri Anda untuk referensi perakitan panel!',
      hashtags: '#RumusElektro #PanelListrik #BelajarListrik #SiemensContactor #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Carousel)',
        layoutType: 'Formula & Reference Card',
        headlineOverlay: 'RUMUS CEPAT RATING KONTAKTOR MOTOR PABRIK',
        subHeadlineOverlay: 'Jangan Sampai Kontak Meleleh Pas Starting Beban Penuh',
        colorPalette: [
          { name: 'Industrial Slate', hex: '#1E293B' },
          { name: 'Formula Yellow', hex: '#FDE047' },
          { name: 'Clean White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Kartu formula matematika teknik bersih berlatar papan tulis teknik gelap modern dengan diagram motor dan kontaktor.',
        aiPrompt: 'Technical electrical engineering formula chart, chalkboard dark texture with clean yellow modern typography --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_5`,
      week: weekNumber,
      dateStr: dates[4],
      dayLabel: 'Rabu Sore',
      agentId: 'sri',
      category: 'siemens',
      platform: 'website',
      postType: 'Artikel Blog SEO Website',
      title: 'Surat Keaslian Produk (CoO) Siemens: Mengapa Kontraktor Wajib Memintanya',
      hook: 'Banyak tender proyek menolak serah terima karena kontraktor tidak dapat melampirkan Certificate of Origin resmi.',
      body: `Di pasar kelistrikan Indonesia, beredar banyak komponen rekondisi berlabel merek ternama. Saat audit tender, ketiadaan sertifikat keaslian dapat membatalkan pembayaran termin proyek Anda.

PT Hokiindo Raya memastikan setiap komponen Siemens disertai dokumen resmi langsung dari prinsipal:
- Certificate of Origin (CoO) & Certificate of Conformity (CoC).
- Serial number terdaftar resmi di database pabrikan.
- Garansi penggantian unit baru jika ada cacat pabrik.`,
      cta: 'Pastikan proyek Anda aman dari risiko barang palsu bersama PT Hokiindo Raya.',
      hashtags: '#SertifikatKeaslian #SiemensResmi #DistributorSiemens #TenderProyek #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1200 x 628 px (16:9 Banner)',
        layoutType: 'Trust & Official Certification Badge',
        headlineOverlay: 'AMANKAN TERMIN TENDER DENGAN SERTIFIKAT RESMI SIEMENS',
        subHeadlineOverlay: 'Jaminan Dokumen CoO & CoC Resmi Bersama PT Hokiindo Raya',
        colorPalette: [
          { name: 'Trust Navy', hex: '#0F2C59' },
          { name: 'Certificate Gold', hex: '#D4AF37' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Tampilan elegan map berkas sertifikat resmi dengan cap stempel emas distributor dan komponen Siemens di sampingnya.',
        aiPrompt: 'Official corporate document presentation, gold certificate seal of authenticity, Siemens electrical components on executive mahogany desk --ar 16:9'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_6`,
      week: weekNumber,
      dateStr: dates[5],
      dayLabel: 'Kamis',
      agentId: 'broto',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Strategi Retargeting Ads',
      title: 'Strategi Retargeting: Menjangkau Klien yang Pernah Minta BoQ',
      hook: 'Jangan biarkan penawaran harga yang sudah dikirim menggantung tanpa follow up digital.',
      body: `Ir. Broto Kusumo merancang strategi re-engagement digital khusus di LinkedIn & jaringan industri B2B untuk audiens yang pernah mengajukan penawaran BoQ komponen Siemens dalam 30 hari terakhir.

Pesan retargeting: "Masih membandingkan harga komponen untuk proyek Anda? PT Hokiindo Raya berikan garansi ketersediaan stok 100% dan pengiriman sameday untuk BoQ Anda!"`,
      cta: 'Aktifkan kampanye retargeting untuk menutup deals sebelum akhir bulan.',
      hashtags: '#B2BMarketing #RetargetingAds #SalesVelocity #GrowthHacking #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1080 px (1:1 Ads Banner)',
        layoutType: 'Urgency & Solution Offer',
        headlineOverlay: 'PROYEK JALAN TERUS, STOK SIEMENS JANGAN SAMPAI PUTUS',
        subHeadlineOverlay: 'Diskon Volume BoQ & Konsultasi Gratis Hari Ini',
        colorPalette: [
          { name: 'Action Blue', hex: '#2563EB' },
          { name: 'High-Vis Yellow', hex: '#EAB308' },
          { name: 'Deep Space', hex: '#0B0F19' }
        ],
        compositionDetails: 'Truk ekspedisi logistik HSO siap meluncur dari gerbang gudang membawa muatan panel kelistrikan Siemens.',
        aiPrompt: 'Logistics delivery truck leaving warehouse at dawn carrying industrial electrical equipment, dynamic lighting, professional commercial --ar 1:1'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_7`,
      week: weekNumber,
      dateStr: dates[6],
      dayLabel: 'Jumat',
      agentId: 'bagong',
      category: 'testing',
      platform: 'linkedin',
      postType: 'Studi Kasus Teknis & Keselamatan K3',
      title: 'Kategori Pengukuran CAT III / CAT IV Menurut IEC 61010-1: Mencegah Transien Arc Blast pada Busbar 380V',
      hook: 'Tegangan transien hingga 8.000 Volt akibat switching induktif trafo dapat memicu busur api ledakan (Arc Blast) jika instrumentasi uji tidak memenuhi standar CAT IV.',
      body: `Banyak insiden keselamatan di ruang cubicle panel terjadi bukan karena hubung singkat peralatan, melainkan penggunaan instrumen ukur dengan kategori isolasi yang tidak memadai.

Parameter keselamatan instrumentasi listrik industri sesuai IEC 61010-1:
1. Definisi Kategori Instalasi: CAT III dirancang untuk panel distribusi sub-feeder pabrik, sedangkan CAT IV wajib digunakan pada sambungan primer transformator dan Main Distribution Panel (MDP).
2. Tegangan Impuls Transien: Alat ukur CAT IV 600V / CAT III 1000V mampu menahan impuls lonjakan transien petir dan switching hingga 8 kV tanpa mengalami breakdown dielektrik antar terminal probe.
3. Koordinasi dengan Pemutus Siemens: Pasang pemutus sirkuit berkecepatan pemutusan tinggi dengan arc chute Siemens Sentron untuk membatasi durasi busur api di bawah 10 milidetik saat terjadi kesalahan isolasi.

Utamakan keselamatan K3 teknisi pengujian dengan selalu memeriksa sertifikasi CAT rating dan APD arc flash sebelum melakukan pengukuran busbar bertegangan.`,
      cta: 'Pelajari panduan keselamatan proteksi ruang switchboard industri bersama tim aplikasi PT Hokiindo Raya di hokiindo.co.id.',
      hashtags: '#IEC61010 #CATIV #ArcFlashSafety #K3Listrik #SiemensSentron #SwitchboardSafety #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1080 px (1:1 Technical Safety Infographic)',
        layoutType: 'Safety & Standards Technical Diagram',
        headlineOverlay: 'STANDAR CAT III VS CAT IV IEC 61010-1: MITIGASI ARC BLAST',
        subHeadlineOverlay: 'Prosedur Verifikasi Keselamatan Pengukuran Busbar 380V di Ruang Panel',
        colorPalette: [
          { name: 'Safety Amber', hex: '#F59E0B' },
          { name: 'Industrial Navy', hex: '#0B132B' },
          { name: 'Alert Red', hex: '#DC2626' }
        ],
        compositionDetails: 'Diagram teknis zona kategori pengukuran kelistrikan dari gardu distribusi (CAT IV) ke sub-panel distribusi (CAT III) dengan visual APD teknisi dan kubikel Siemens Sentron.',
        aiPrompt: 'Technical electrical safety diagram showing CAT III and CAT IV measurement categories on an industrial power distribution network, clean blueprint layout --ar 1:1'
      }
    })
  } else if (normWeek === 3) {
    slots.push({
      id: `slot_${mondayStr}_1`,
      week: weekNumber,
      dateStr: dates[0],
      dayLabel: 'Senin Pagi',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Artikel LinkedIn B2B',
      title: 'Migrasi ke Siemens SIMATIC S7-1200: Mengapa Pabrik Menengah Wajib Melakukannya',
      hook: 'Masih mengandalkan relay konvensional yang memenuhi seluruh pintu panel? Inilah alasan otomasi PLC menghemat 60% waktu troubleshooting.',
      body: `Otomasi bukan monopoli industri raksasa. Siemens S7-1200 dirancang modular untuk manufaktur skala menengah dengan integrasi TIA Portal yang intuitif.

Keuntungan implementasi S7-1200 dari PT Hokiindo Raya:
- Diagnostik error terpadu tanpa perlu membongkar rangkaian pengawatan (wiring).
- Port komunikasi PROFINET terpasang untuk koneksi HMI dan cloud IoT.
- Didukung engineer otomasi HSO yang siap membantu pemilihan modul I/O.`,
      cta: 'Konsultasikan BoQ otomasi pabrik Anda bersama spesialis PLC PT Hokiindo Raya.',
      hashtags: '#SiemensPLC #SimaticS71200 #OtomasiIndustri #SmartFactory #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Portrait)',
        layoutType: 'High-Tech Automation Showcase',
        headlineOverlay: 'RELAY SE-GABAN vs 1 PLC RINGKAS: PILIH MANA?',
        subHeadlineOverlay: 'Siemens SIMATIC S7-1200: Otomasi Cerdas Manufaktur Indonesia',
        colorPalette: [
          { name: 'Cyber Navy', hex: '#0A1128' },
          { name: 'Siemens Turquoise', hex: '#00A3A6' },
          { name: 'Data Blue', hex: '#3B82F6' }
        ],
        compositionDetails: 'Unit PLC Siemens S7-1200 dengan indikator LED berkedip hijau terhubung rapi ke modul komunikasi di rel DIN modern.',
        aiPrompt: 'Modern Siemens SIMATIC S7-1200 PLC mounted on DIN rail with glowing ethernet port and status LEDs, cybernetic industrial background --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_2`,
      week: weekNumber,
      dateStr: dates[1],
      dayLabel: 'Senin Sore',
      agentId: 'sri',
      category: 'siemens',
      platform: 'email',
      postType: 'Email Blast Klien B2B & Konsultasi Teknis',
      title: 'Strategi Manajemen Kualitas Daya Terpadu Menggunakan Sentron PAC3200 & PAC4200 pada MDP',
      hook: 'Subject: [Optimasi Kualitas Daya Industri] Pemantauan Harmonisa THD & Efisiensi Energi Listrik Pabrik',
      body: `Yth. Manajer Teknik & Pemeliharaan Pabrik,

Beban non-linear seperti Variable Frequency Drive (VFD), inverter, dan rectifier switching pada industri modern menginjeksikan distorsi harmonisa (THD-V dan THD-I) yang signifikan ke jaringan kelistrikan internal.

Dampak buruk harmonisa jika tidak termonitor secara real-time:
1. Overheating Transformator: Peningkatan rugi arus eddy (eddy current losses) yang memaksa derating kapasitas kVA trafo.
2. Penurunan Faktor Daya (Cos Phi): Kegagalan kapasitor bank akibat resonansi paralel harmonisa orde ke-5 dan ke-7.
3. Solusi Siemens SENTRON PAC: Digital Power Meter dengan akurasi Class 0.5S sesuai IEC 62053-22, menganalisis individual harmonics hingga orde ke-31 atau ke-64 secara presisi melalui protokol Modbus TCP dan PROFINET.`,
      cta: 'Dapatkan spesifikasi lengkap Siemens Sentron PAC dan ajukan audit kualitas daya bersama engineer PT Hokiindo Raya di hokiindo.co.id.',
      hashtags: '#PowerQuality #SentronPAC #Harmonics #THD #EfisiensiEnergi #SiemensIndonesia #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '600 x 250 px (Header Banner Email)',
        layoutType: 'Power Quality & Analytics Banner',
        headlineOverlay: 'MONITORING KUALITAS DAYA TERPADU: SENTRON PAC SERIES',
        subHeadlineOverlay: 'Deteksi Dini Harmonisa THD & Optimasi Efisiensi Energi Pabrik',
        colorPalette: [
          { name: 'Siemens Cyan', hex: '#00646E' },
          { name: 'Analytics Navy', hex: '#0F172A' },
          { name: 'Clean White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Unit Power Meter Siemens Sentron PAC4200 dengan layar LCD berwarna menampilkan diagram spektrum harmonisa fasa dan tren konsumsi daya aktif industri.',
        aiPrompt: 'Digital high tech power monitoring meter installed on an industrial switchgear cubicle, displaying clear harmonic distortion graph, precision engineering aesthetic --ar 12:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_3`,
      week: weekNumber,
      dateStr: dates[2],
      dayLabel: 'Selasa',
      agentId: 'bagong',
      category: 'testing',
      platform: 'instagram',
      postType: 'Video Walkthrough Rekayasa Panel',
      title: 'Desain Segregasi Internal Switchboard Form 2b hingga Form 4b Sesuai IEC 61439-2',
      hook: '[0-3 Detik]: "Mengapa konsultan perencana menolak BAST panel distribusi utama Anda? Cek pemisahan kompartemen busbar fasa dan breaker sesuai Form 4b!" 📐',
      body: `[Alur Video Rekayasa Teknis 30 Detik]:
Detik 0-6: Ir. Bagong membuka pintu cubicle switchgear Main Distribution Panel (MDP).
Detik 6-16: Menjelaskan batas partisi Form 4b: Busbar tembaga utama terisolasi total dalam kompartemen tersendiri, terpisah dari unit fungsional breaker drawout dan terminal terminasi eksternal.
Detik 16-25: "Pemisahan Form 4b menjamin keselamatan absolut: teknisi dapat melakukan pemeliharaan pada unit breaker cabang tanpa risiko tersentuh busbar fasa bertegangan."
Detik 25-30: "Rancang panel switchgear Anda dengan komponen Siemens Sentron berstandar IEC 61439-1/2 bersama distributor resmi PT Hokiindo Raya."`,
      cta: 'Unduh panduan segregasi internal panel switchboard Form 1-4b di portal teknik PT Hokiindo Raya di hokiindo.co.id.',
      hashtags: '#IEC61439 #Form4b #SwitchboardDesign #PanelMaker #SiemensSentron #KeselamatanKerja #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1920 px (9:16 Video Thumbnail)',
        layoutType: 'Technical Internal Segregation Exploded View',
        headlineOverlay: 'DESAIN FORM 2b VS FORM 4b IEC 61439-2: APA BEDANYA?',
        subHeadlineOverlay: 'Pemisahan Kompartemen Busbar Fasa untuk Keselamatan Maksimal',
        colorPalette: [
          { name: 'Blueprint Blue', hex: '#1D4ED8' },
          { name: 'Safety Amber', hex: '#F59E0B' },
          { name: 'Industrial Navy', hex: '#0F172A' }
        ],
        compositionDetails: 'Diagram skematik 3D kompartemen cubicle switchboard dengan pembagian zona busbar tembaga, unit breaker, dan terminal eksternal sesuai Form 4b.',
        aiPrompt: 'Detailed technical 3D architectural cutaway diagram of an industrial low voltage switchgear panel showing Form 4b internal segregation chambers, pristine engineering design --ar 9:16'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_4`,
      week: weekNumber,
      dateStr: dates[3],
      dayLabel: 'Rabu Pagi',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'website',
      postType: 'Artikel Panduan Teknis & Blog SEO',
      title: 'Memahami Kurva Trip L-I-S-G pada Breaker Elektronik Siemens Sentron',
      hook: 'Banyak teknisi bingung menyetel dial L, I, S, dan G. Padahal settingan ini yang mencegah trafo meledak saat ada ground fault.',
      body: `Panduan praktis menyetel proteksi selektif pada trip unit elektronik Siemens ETU:
- L (Long-time protection): Perlindungan beban lebih (overload) dengan jeda waktu invers.
- S (Short-time protection): Penundaan waktu pendek untuk selektivitas hierarki breaker hilir.
- I (Instantaneous): Pemutusan seketika saat terjadi arus hubung singkat raksasa.
- G (Ground fault): Proteksi kebocoran arus ke bodi tanah untuk mencegah kebakaran.`,
      cta: 'Unduh kurva koordinasi proteksi kelistrikan Siemens gratis dari portal teknik PT Hokiindo Raya.',
      hashtags: '#KurvaTrip #ProteksiListrik #GroundFault #SiemensSentron #TeknikElektro #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1200 x 628 px (16:9 Banner)',
        layoutType: 'Technical Graph & Time-Current Curve',
        headlineOverlay: 'BEDAH KURVA TRIP L-I-S-G ELEKTRONIK BREAKER SIEMENS',
        subHeadlineOverlay: 'Panduan Praktis Koordinasi Proteksi Agar Tidak Salah Setting',
        colorPalette: [
          { name: 'Graph Navy', hex: '#0B192C' },
          { name: 'Curve Neon Cyan', hex: '#00F0FF' },
          { name: 'Axis White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Grafik kurva waktu-arus (Time-Current Curve) logaritmik dengan garis neon menyala menunjukkan zona L, S, I, dan G.',
        aiPrompt: 'Logarithmic electrical time-current tripping curve graph, glowing neon coordinates on dark high-tech background --ar 16:9'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_5`,
      week: weekNumber,
      dateStr: dates[4],
      dayLabel: 'Rabu Sore',
      agentId: 'broto',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Carousel Rekayasa Tekno-Ekonomi (5 Slide)',
      title: 'Studi Kelayakan Retrofit Air Circuit Breaker (ACB) Lama ke Siemens Sentron 3WL',
      hook: 'Slide 1: "Ganti total kubikel switchgear senilai ratusan juta atau Retrofit Cradle ACB Siemens Sentron 3WL? Mari bedah data tekno-ekonominya!" 📊',
      body: `Slide 1: Dilema Pabrik Manufaktur: ACB lama sering macet mekanikal trip, sparepart diskontinu, dan berisiko downtime fatal.
Slide 2: Solusi Retrofit Cradle: Mengganti unit drawout moving part lama dengan Siemens Sentron 3WL tanpa membongkar kubikel switchgear eksisting.
Slide 3: Efisiensi Waktu Downtime: Proses retrofit hanya memakan waktu 6-8 jam selama shutdown terencana (dibanding ganti kubikel yang butuh 5-7 hari).
Slide 4: Peningkatan Keandalan: Mendapatkan Electronic Trip Unit (ETU) mikroprosesor terkini dengan proteksi L-S-I-G dan komunikasi Modbus TCP terpadu.
Slide 5: Kesimpulan: Menghemat biaya Capex hingga 65% dengan masa pakai sistem bertambah 15-20 tahun. Ajukan studi retrofit kelistrikan bersama PT Hokiindo Raya.`,
      cta: 'Geser sampai slide akhir dan jadwalkan inspeksi teknis retrofit switchboard pabrik Anda bersama tim engineer PT Hokiindo Raya.',
      hashtags: '#RetrofitACB #Siemens3WL #Sentron #ModernisasiSwitchgear #TCO #EfisiensiIndustri #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Carousel Slide 1)',
        layoutType: 'Financial & Engineering Feasibility Breakdown',
        headlineOverlay: 'STUDI RETROFIT ACB 3WL: HEMAT CAPEX HINGGA 65%',
        subHeadlineOverlay: 'Modernisasi Proteksi Switchgear Tanpa Ganti Kubikel Eksisting',
        colorPalette: [
          { name: 'Siemens Petrol', hex: '#00646E' },
          { name: 'Executive Navy', hex: '#0F172A' },
          { name: 'Precision Cyan', hex: '#06B6D4' }
        ],
        compositionDetails: 'Tampilan perbandingan visual side-by-side unit ACB lama yang aus vs unit Siemens Sentron 3WL baru yang terpasang pada cradle retrofit kubikel industri.',
        aiPrompt: 'Professional side by side industrial comparison of an old legacy electrical air circuit breaker cradle versus a brand new modern Siemens Sentron ACB, clean corporate layout --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_6`,
      week: weekNumber,
      dateStr: dates[5],
      dayLabel: 'Kamis',
      agentId: 'broto',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Strategi Ads B2B (Momen Tender BoQ)',
      title: 'Strategi Iklan: Menargetkan Kontraktor Menjelang Penutupan Tender',
      hook: 'Analisis Ir. Broto: Di akhir kuartal, ratusan kontraktor ME sedang berburu distributor resmi penyedia surat dukungan tender.',
      body: `Rekomendasi Kampanye Ads Ir. Broto Kusumo:
Luncurkan iklan berformat Lead Generation di LinkedIn yang menawarkan "Surat Dukungan Distributor Resmi Siemens Terbit Dalam 24 Jam".

Targeting: Estimator ME, Tender Specialist, Project Director di seluruh kontraktor EPC tier 1 dan tier 2 di Indonesia.`,
      cta: 'Dapatkan surat dukungan tender resmi untuk memenangkan lelang proyek Anda di hokiindo.co.id.',
      hashtags: '#TenderME #KontraktorEPC #SuratDukungan #SiemensIndonesia #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1080 px (1:1 Ads Post)',
        layoutType: 'Prestige Corporate B2B Seal',
        headlineOverlay: 'BUTUH SURAT DUKUNGAN TENDER SIEMENS DALAM 24 JAM?',
        subHeadlineOverlay: 'Distributor Resmi PT Hokiindo Raya Siap Menangkan Proyek Anda',
        colorPalette: [
          { name: 'Deep Gold', hex: '#CA8A04' },
          { name: 'Royal Navy', hex: '#1E3A8A' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Stempel resmi verified distributor dengan jabat tangan kemitraan profesional berlatar cetak biru gambar teknik proyek.',
        aiPrompt: 'Professional business handshake over architectural blueprints with verified golden distributor stamp, corporate excellence --ar 1:1'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_7`,
      week: weekNumber,
      dateStr: dates[6],
      dayLabel: 'Jumat',
      agentId: 'bagong',
      category: 'testing',
      platform: 'linkedin',
      postType: 'Studi Kasus Koordinasi Proteksi',
      title: 'Validasi Single Line Diagram (SLD) As-Built vs Koordinasi Proteksi Aktual di Lapangan',
      hook: 'Perbedaan 1 rating ukuran breaker antara gambar SLD tender dan instalasi aktual dapat merusak seluruh hierarki selektivitas kurva TCC sistem kelistrikan Anda.',
      body: `Momen krusial serah terima proyek (BAST) dan penerbitan Sertifikat Laik Operasi (SLO):
Seringkali terjadi di lapangan, breaker cabang dinaikkan kapasitasnya dari 160A ke 250A tanpa memperbarui kurva selektivitas waktu-arus terhadap breaker hulu di LVMDP.

Risiko teknis yang timbul:
1. Kehilangan Selektivitas (Loss of Discrimination): Gangguan hubung singkat di sub-panel cabang memicu trip langsung pada Main ACB hulu, menyebabkan blackout total pabrik.
2. Kerusakan Elektrodinamik: Busbar dan konduktor sirkit hilir mengalami gaya tolak elektrodinamik raksasa karena energi tembus I²t tidak dibatasi secara tepat.
3. Solusi Validasi Siemens: Manfaatkan perangkat lunak koordinasi Siemens Simaris Curves untuk memvalidasi setting L-S-I-G pada trip unit ETU Sentron secara presisi sebelum uji beban komisioning.`,
      cta: 'Konsultasikan validasi Single Line Diagram dan koordinasi selektivitas proteksi bersama tim aplikasi PT Hokiindo Raya di hokiindo.co.id.',
      hashtags: '#SingleLineDiagram #SLDAsBuilt #KoordinasiProteksi #SelektivitasBreaker #SiemensSentron #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1080 px (1:1 Technical Comparison Graphic)',
        layoutType: 'Expectation vs Reality Engineering Review',
        headlineOverlay: 'VALIDASI SLD AS-BUILT: HINDARI BLACKOUT KARENA SALAH RATING',
        subHeadlineOverlay: 'Verifikasi Kurva Selektivitas TCC Menggunakan Siemens Sentron Tools',
        colorPalette: [
          { name: 'Drafting Blue', hex: '#1D4ED8' },
          { name: 'Alert Red', hex: '#DC2626' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Format komparasi teknis: Kiri gambar Single Line Diagram CAD presisi, kanan grafik kurva koordinasi TCC yang tumpang tindih dengan indikator peringatan bahaya tripping.',
        aiPrompt: 'Clean technical electrical single line diagram schematic beside logarithmic time current tripping curves with warning highlight indicator, professional engineering interface --ar 1:1'
      }
    })
  } else {
    // Week 4: K3 Kelistrikan & Tutup Tahun
    slots.push({
      id: `slot_${mondayStr}_1`,
      week: weekNumber,
      dateStr: dates[0],
      dayLabel: 'Senin Pagi',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Artikel LinkedIn B2B',
      title: 'Target Zero Accident: Mengapa Proteksi Arc Fault dan K3 Listrik Jadi Kunci',
      hook: 'Percikan busur api di dalam switchboard dapat mencapai suhu 19.000°C dalam hitungan milidetik. Lebih panas dari permukaan matahari.',
      body: `Kecelakaan kerja akibat ledakan arc flash adalah mimpi buruk setiap manajer pabrik. Proteksi kelistrikan modern tidak hanya menjaga mesin, tapi menyelamatkan nyawa operator.

Teknologi breaker Siemens Sentron di PT Hokiindo Raya dirancang dengan ruang pemadam busur api (arc chute deionizing) mutakhir yang meredam ledakan seketika. Jadikan K3 sebagai budaya, bukan sekadar banner di gerbang pabrik.`,
      cta: 'Tingkatkan standar keselamatan ruang panel Anda bersama tim safety electrical PT Hokiindo Raya.',
      hashtags: '#K3Listrik #ZeroAccident #SafetyFirst #SiemensIndonesia #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Portrait)',
        layoutType: 'Safety First Industrial Hero',
        headlineOverlay: 'SUHU 19.000°C DALAM 0,01 DETIK: SIAPKAN RUANG PANEL ANDA',
        subHeadlineOverlay: 'Proteksi Arc Fault Siemens: Menjaga Nyawa & Aset Pabrik',
        colorPalette: [
          { name: 'Safety Yellow', hex: '#EAB308' },
          { name: 'Industrial Black', hex: '#0F172A' },
          { name: 'Warning Orange', hex: '#EA580C' }
        ],
        compositionDetails: 'Teknisi kelistrikan memakai APD lengkap (Arc Flash Suit) sedang melakukan inspeksi switchgear panel Siemens.',
        aiPrompt: 'Electrical safety engineer wearing high-tech protective suit and helmet inspecting a clean Siemens switchgear panel, dramatic lighting --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_2`,
      week: weekNumber,
      dateStr: dates[1],
      dayLabel: 'Senin Sore',
      agentId: 'bagong',
      category: 'testing',
      platform: 'instagram',
      postType: 'Video Walkthrough Pengujian Teknis',
      title: 'Protokol Quality Control (QC) & Verifikasi CoO Komponen Switchgear Siemens',
      hook: '[0-3 Detik]: "Bagaimana memastikan breaker Siemens yang tiba di proyek Anda 100% genuine dan lulus kalibrasi pabrikan?" 🔍',
      body: `[Alur Video Inspeksi Teknis 30 Detik]:
Detik 0-5: Suasana fasilitas logistik PT Hokiindo Raya: teknisi melakukan unboxing inspeksi breaker Siemens Sentron 3VM/3VA.
Detik 5-15: Proses Quality Control (QC) terverifikasi: pengecekan nomor seri MLFB dengan laser marking pabrik dan pemindaian QR code Certificate of Origin (CoO).
Detik 15-22: Uji kontinuitas kutub dan mekanikal trip toggle (Push to Trip) untuk menjamin pegas pemutus berfungsi prima.
Detik 22-30: Ir. Bagong: "Komponen lolos QC, bersegel garansi resmi distributor, siap dikirim untuk keandalan instalasi proyek Anda."`,
      cta: 'Hubungi tim sales engineering kami untuk kepastian ketersediaan stok komponen Siemens hari ini di shop.hokiindo.co.id.',
      hashtags: '#QualityControl #DistributorResmi #SiemensIndonesia #Sentron #Sirius #LogistikTeknik #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1920 px (9:16 Video Thumbnail)',
        layoutType: 'Dynamic Technical Inspection Shot',
        headlineOverlay: 'PROTOKOL QC & VERIFIKASI SERTIFIKAT COO SIEMENS',
        subHeadlineOverlay: 'Jaminan Keaslian 100% Prinsipal Sebelum Pengiriman ke Proyek',
        colorPalette: [
          { name: 'Action Navy', hex: '#1E293B' },
          { name: 'Siemens Cyan', hex: '#00646E' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Teknisi inspeksi kelistrikan melakukan verifikasi barcode laser pada unit breaker Siemens Sentron dengan checklist QC digital.',
        aiPrompt: 'Professional electrical quality control engineer verifying serial numbers and authentic certificates on a Siemens Sentron circuit breaker, high-tech industrial testing lab --ar 9:16'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_3`,
      week: weekNumber,
      dateStr: dates[2],
      dayLabel: 'Selasa',
      agentId: 'sri',
      category: 'siemens',
      platform: 'email',
      postType: 'Email Rekapitulasi & Digest Bulanan',
      title: 'Rekapitulasi Kinerja Konten & Inquiries Klien HSO',
      hook: 'Subject: [Monthly Report Digest] Evaluasi Ketercapaian Marketing & Pembaruan Pelayanan PT Hokiindo Raya',
      body: `Laporan Ringkas Mbak Sri:
1. Peningkatan kunjungan katalog digital dan konsultasi teknik via WhatsApp sebesar 34%.
2. Top requested items: MCCB Siemens Sentron 3VM 100A-250A dan High Bay UFO LED G-Comin 150W.
3. Respons positif email blast klien dengan open-rate mencapai 42%.`,
      cta: 'Dokumen rekap siap diarsipkan ke laporan bulanan manajemen PT Hokiindo Raya.',
      hashtags: '#MonthlyDigest #LaporanMarketing #KinerjaHSO #DataDrivenMarketing',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Infografis Laporan)',
        layoutType: 'Executive Performance Digest Card',
        headlineOverlay: 'REKAPITULASI KINERJA KONTEN & INQUIRIES HSO',
        subHeadlineOverlay: 'Peningkatan Inquiry Klien B2B +34% & Stok Siap Salur',
        colorPalette: [
          { name: 'Emerald Growth', hex: '#10B981' },
          { name: 'Executive Navy', hex: '#0F172A' },
          { name: 'Clean White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Kartu ringkasan metrik eksekutif dengan grafik batang pertumbuhan hijau, ikon handshake kemitraan, dan logo PT Hokiindo Raya.',
        aiPrompt: 'Clean executive corporate dashboard infographic report, positive growth charts, sleek layout, emerald and dark navy theme --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_4`,
      week: weekNumber,
      dateStr: dates[3],
      dayLabel: 'Rabu Pagi',
      agentId: 'tejo',
      category: 'siemens',
      platform: 'website',
      postType: 'Artikel Blog Website & LinkedIn SEO',
      title: 'Panduan Memilih Kapasitas Ampere MCCB Sesuai Beban Trafo Pabrik',
      hook: 'Salah perhitungan kapasitas pemutus sirkuit berakibat tripping konstan atau konduktor mengalami degradasi termal akibat panas berlebih.',
      body: `Tabel panduan praktis menghitung In (Nominal Current) breaker berdasarkan kapasitas kVA transformator dan faktor diversitas beban industri. Dilengkapi tips pemilihan kapasitas pemutusan Icu (kA).`,
      cta: 'Unduh tabel kalkulasi kapasitas breaker gratis di portal teknik PT Hokiindo Raya.',
      hashtags: '#RumusListrik #KalkulasiMCCB #TrafoPabrik #TeknikElektro #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1200 x 628 px (16:9 Banner)',
        layoutType: 'Engineering Reference Matrix Table',
        headlineOverlay: 'TABEL RATING MCCB VS KAPASITAS TRAFO PABRIK',
        subHeadlineOverlay: 'Rumus Praktis Menghitung In & Icu untuk Menghindari Tripping',
        colorPalette: [
          { name: 'Tech Blue', hex: '#2563EB' },
          { name: 'Grid Grey', hex: '#1E293B' },
          { name: 'Clean White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Tabel matriks teknik bersih membandingkan kVA Trafo (630, 1000, 1600 kVA) dengan rating Ampere breaker Siemens Sentron yang direkomendasikan.',
        aiPrompt: 'Engineering reference table infographic, electrical calculations formula, clean typography on modern dark tech background --ar 16:9'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_5`,
      week: weekNumber,
      dateStr: dates[4],
      dayLabel: 'Rabu Sore',
      agentId: 'bagong',
      category: 'gcomin',
      platform: 'instagram',
      postType: 'Carousel Instagram (5 Slide Tips)',
      title: '5 Pertanyaan yang Wajib Ditanyakan Purchasing Sebelum Beli Lampu Pabrik',
      hook: 'Slide 1: "Jangan Cuma Tanya Watt! Ini 5 Hal Krusial yang Wajib Dicek Purchasing Saat Beli Lampu Pabrik!"',
      body: `Tips cerdas purchasing: 1. Nilai Lumens per Watt (Efficacy), 2. Garansi chip dan driver, 3. Ketahanan suhu ambient heatsink, 4. Sertifikasi IP/IK, 5. Ketersediaan distributor resmi.`,
      cta: 'Simpan tips ini agar pengadaan lampu gudang Anda hemat dan tahan 5 tahun!',
      hashtags: '#TipsPurchasing #LampuGudang #GCominLighting #PengadaanPabrik #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Carousel Slide 1)',
        layoutType: 'Product Callout & Inspection Pointer',
        headlineOverlay: 'JANGAN CUMA TANYA WATT! INI 5 HAL WAJIB DICEK PURCHASING',
        subHeadlineOverlay: 'Panduan Cerdas Pengadaan Lampu Gudang Awet 5 Tahun',
        colorPalette: [
          { name: 'Clean White Studio', hex: '#FFFFFF' },
          { name: 'Purchasing Charcoal', hex: '#1E293B' },
          { name: 'G-Comin Amber', hex: '#D97706' }
        ],
        compositionDetails: 'Unit High Bay UFO G-Comin di tengah latar putih bersih dengan 5 garis penunjuk (pointer) ke arah heatsink, driver, dan chip LED.',
        aiPrompt: 'Product callout graphic of high bay UFO LED industrial lamp, white studio background, pointer lines highlighting technical features --ar 4:5'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_6`,
      week: weekNumber,
      dateStr: dates[5],
      dayLabel: 'Kamis',
      agentId: 'broto',
      category: 'siemens',
      platform: 'linkedin',
      postType: 'Strategi Ads B2B (Proyeksi Kuartal I)',
      title: 'Kalkulasi Akhir Tahun: Perencanaan Capex & Modernisasi Sistem Switchboard Kuartal I',
      hook: 'Analisis Ir. Broto Kusumo: Bagaimana merencanakan alokasi Capex peremajaan breaker dan monitoring energi tanpa membebani arus kas operasional pabrik.',
      body: `Rekomendasi alokasi anggaran menyongsong Kuartal I: Menitikberatkan pada program retrofit cradle ACB Sentron 3WL dan implementasi digital power monitoring SENTRON PAC. Penghematan biaya perawatan darurat mencapai 40%.`,
      cta: 'Rencana strategi rekayasa kelistrikan siap dieksekusi bersama tim aplikasi PT Hokiindo Raya di hokiindo.co.id.',
      hashtags: '#CapexKelistrikan #ModernisasiSwitchgear #TCO #SiemensSentron #HokiindoRaya',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1080 px (1:1 Iklan B2B)',
        layoutType: 'ROI Calculator & Modern Factory',
        headlineOverlay: 'PROYEKSI MODERNISASI SWITCHBOARD: EFISIENSI TCO',
        subHeadlineOverlay: 'Audit Keandalan Proteksi Bersama Tim Rekayasa PT Hokiindo Raya',
        colorPalette: [
          { name: 'Royal Gold', hex: '#B45309' },
          { name: 'Dark Navy', hex: '#0F172A' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Pabrik manufaktur modern dengan visual ruang kubikel switchboard yang andal dan grafik proyeksi efisiensi operasional daya.',
        aiPrompt: 'Financial energy and switchboard audit presentation graphic, modern clean industrial plant, golden upward efficiency curve, executive corporate engineering look --ar 1:1'
      }
    })

    slots.push({
      id: `slot_${mondayStr}_7`,
      week: weekNumber,
      dateStr: dates[6],
      dayLabel: 'Jumat',
      agentId: 'tejo',
      category: 'bts',
      platform: 'linkedin',
      postType: 'Apresiasi & Refleksi Tahunan',
      title: 'Apresiasi Mitra PT Hokiindo Raya: Sinergi Membangun Industri Indonesia',
      hook: 'Sebuah kehormatan bagi PT Hokiindo Raya dapat dipercaya menjadi mitra penyedia kelistrikan industri di ratusan pabrik di Indonesia.',
      body: `Pesan terima kasih hangat kepada para panel builder, kontraktor ME, konsultan teknik, dan purchasing manager atas sinergi luar biasa. Kami berkomitmen terus meningkatkan kecepatan layanan dan ketersediaan stok komponen berkualitas.`,
      cta: 'Mari melangkah bersama menuju standar kelistrikan industri yang semakin andal dan efisien.',
      hashtags: '#ApresiasiMitra #SinergiIndustri #PTHokiindoRaya #DistributorResmi #TerimaKasih',
      curationStatus: 'approved',
      uploadedImagePreview: '',
      externalImageUrl: '',
      designGuide: {
        dimensions: '1080 x 1350 px (4:5 Kolase Tahunan)',
        layoutType: 'Prestigious Project Gallery Collage',
        headlineOverlay: 'TERIMA KASIH TELAH BERSINERGI BERSAMA HOKIINDO',
        subHeadlineOverlay: 'Mendukung Ratusan Proyek Kelistrikan Industri di Seluruh Nusantara',
        colorPalette: [
          { name: 'Festive Navy', hex: '#0A192F' },
          { name: 'Warm Bokeh Gold', hex: '#F59E0B' },
          { name: 'Pure White', hex: '#FFFFFF' }
        ],
        compositionDetails: 'Kolase foto estetik proyek-proyek kelistrikan, panel switchgear megah, dan tim ekspedisi HSO berlatar pencahayaan bokeh emas hangat.',
        aiPrompt: 'Prestigious end of year corporate appreciation collage, warm golden bokeh lighting, photos of electrical engineers and modern industrial plants --ar 4:5'
      }
    })
  }

  return slots
}

// ==========================================
// 4. SUMOPOD API & LIVE ENGINE
// ==========================================
// State Bank Data & Modal
const showKnowledgeBaseModal = ref(false)
const activeKbCategory = ref('all') // 'all' | 'siemens' | 'gcomin' | 'market' | 'trends'
const searchKbQuery = ref('')

let initialKb = DEFAULT_KNOWLEDGE_BASE
try {
  const cachedKb = localStorage.getItem('hso_marketing_knowledge_bank')
  if (cachedKb) initialKb = JSON.parse(cachedKb)
} catch {}
const knowledgeBaseList = ref(initialKb)

const filteredKnowledgeBase = computed(() => {
  return knowledgeBaseList.value.filter(item => {
    const matchCat = activeKbCategory.value === 'all' || item.category === activeKbCategory.value
    const matchQuery = !searchKbQuery.value.trim() ||
      item.title.toLowerCase().includes(searchKbQuery.value.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchKbQuery.value.toLowerCase()) ||
      item.tags.some(t => t.toLowerCase().includes(searchKbQuery.value.toLowerCase()))
    return matchCat && matchQuery
  })
})

const isAddingNewKb = ref(false)
const newKbItem = ref({
  category: 'siemens',
  title: '',
  source: '',
  summary: '',
  keyInsights: '',
  tags: ''
})

const saveNewKnowledgeItem = () => {
  if (!newKbItem.value.title.trim() || !newKbItem.value.summary.trim()) {
    alert('Mohon isi judul dan rangkuman referensi.')
    return
  }
  const insightsArr = newKbItem.value.keyInsights
    ? newKbItem.value.keyInsights.split('\n').map(s => s.trim()).filter(Boolean)
    : []
  const tagsArr = newKbItem.value.tags
    ? newKbItem.value.tags.split(',').map(s => s.trim()).filter(Boolean)
    : []

  const item = {
    id: `kb_custom_${Date.now()}`,
    category: newKbItem.value.category,
    title: newKbItem.value.title.trim(),
    source: newKbItem.value.source.trim() || 'Riset Tim Marketing HSO',
    summary: newKbItem.value.summary.trim(),
    keyInsights: insightsArr.length > 0 ? insightsArr : [newKbItem.value.summary.trim()],
    tags: tagsArr.length > 0 ? tagsArr : ['Referensi Baru']
  }

  knowledgeBaseList.value.unshift(item)
  localStorage.setItem('hso_marketing_knowledge_bank', JSON.stringify(knowledgeBaseList.value))
  
  newKbItem.value = {
    category: 'siemens',
    title: '',
    source: '',
    summary: '',
    keyInsights: '',
    tags: ''
  }
  isAddingNewKb.value = false
}

const deleteKnowledgeItem = (id) => {
  if (!confirm('Hapus referensi ini dari Bank Data?')) return
  knowledgeBaseList.value = knowledgeBaseList.value.filter(k => k.id !== id)
  localStorage.setItem('hso_marketing_knowledge_bank', JSON.stringify(knowledgeBaseList.value))
}

const showSettingsModal = ref(false)
const sumopodApiKey = ref(localStorage.getItem('hso_sumopod_api_key') || localStorage.getItem('hso_ai_api_key') || '')
const sumopodBaseUrl = ref(localStorage.getItem('hso_sumopod_base_url') || localStorage.getItem('hso_ai_base_url') || 'https://ai.sumopod.com/v1')
const sumopodModel = ref(localStorage.getItem('hso_sumopod_model') || localStorage.getItem('hso_ai_model') || 'deepseek-chat')
const isTestingConnection = ref(false)
const isFetchingModels = ref(false)
const connectionStatus = ref(null) // 'success' | 'error' | null
const connectionMessage = ref('')
const showApiKeyText = ref(false)
const isManualModelInput = ref(false)

// Cached models from localStorage
let initialCachedModels = []
try {
  const c = localStorage.getItem('hso_sumopod_cached_models')
  if (c) initialCachedModels = JSON.parse(c)
} catch {}

const availableModels = ref(initialCachedModels.length > 0 ? initialCachedModels : [
  'deepseek-chat',
  'deepseek-reasoner',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-r1',
  'gpt-4o-mini',
  'gpt-4o',
  'claude-3-5-sonnet',
  'google/gemini-2.0-flash-001'
])

const isApiConfigured = computed(() => !!sumopodApiKey.value.trim())

const fetchSumopodModels = async (quiet = false) => {
  if (!sumopodApiKey.value.trim()) {
    if (!quiet) {
      connectionStatus.value = 'error'
      connectionMessage.value = 'Masukkan Kunci Akses AI terlebih dahulu.'
    }
    return []
  }

  isFetchingModels.value = true
  if (!quiet) {
    connectionStatus.value = null
    connectionMessage.value = ''
  }

  try {
    const cleanBase = (sumopodBaseUrl.value.trim() || 'https://ai.sumopod.com/v1').replace(/\/+$/, '')
    const endpoint = cleanBase.endsWith('/models') ? cleanBase : `${cleanBase}/models`

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sumopodApiKey.value.trim()}`,
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) {
      const errText = await res.text()
      let msg = `HTTP ${res.status}: ${res.statusText}`
      try {
        const parsed = JSON.parse(errText)
        if (parsed?.error?.message) msg = parsed.error.message
      } catch {}
      throw new Error(msg)
    }

    const data = await res.json()
    let list = []
    if (Array.isArray(data)) {
      list = data.map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean)
    } else if (Array.isArray(data?.data)) {
      list = data.data.map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean)
    } else if (Array.isArray(data?.models)) {
      list = data.models.map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean)
    }

    if (list.length > 0) {
      // Sort alphabetically
      list.sort()
      availableModels.value = list
      localStorage.setItem('hso_sumopod_cached_models', JSON.stringify(list))

      // If current model is invalid or not in list, auto-select a suitable model
      if (!list.includes(sumopodModel.value)) {
        const bestMatch = list.find(m => m === 'deepseek-chat') ||
                          list.find(m => m.includes('deepseek-chat')) ||
                          list.find(m => m.includes('deepseek')) ||
                          list.find(m => m.includes('gpt-4o-mini')) ||
                          list[0]
        if (bestMatch) {
          sumopodModel.value = bestMatch
          localStorage.setItem('hso_sumopod_model', bestMatch)
        }
      }

      if (!quiet) {
        connectionStatus.value = 'success'
        connectionMessage.value = `Berhasil memuat ${list.length} model resmi untuk akun Anda!`
      }
      return list
    }
    return []
  } catch (err) {
    console.error('Fetch models error:', err)
    if (!quiet) {
      connectionStatus.value = 'error'
      connectionMessage.value = `Gagal memuat model: ${err.message}`
    }
    return []
  } finally {
    isFetchingModels.value = false
  }
}

const applyProviderPreset = (provider) => {
  connectionStatus.value = null
  connectionMessage.value = ''
  if (provider === 'deepseek') {
    sumopodBaseUrl.value = 'https://api.deepseek.com'
    sumopodModel.value = 'deepseek-chat'
  } else if (provider === 'sumopod') {
    sumopodBaseUrl.value = 'https://ai.sumopod.com/v1'
    sumopodModel.value = 'deepseek/deepseek-chat'
  } else if (provider === 'openai') {
    sumopodBaseUrl.value = 'https://api.openai.com/v1'
    sumopodModel.value = 'gpt-4o-mini'
  } else if (provider === 'groq') {
    sumopodBaseUrl.value = 'https://api.groq.com/openai/v1'
    sumopodModel.value = 'llama-3.3-70b-versatile'
  }
}

const saveSettings = () => {
  localStorage.setItem('hso_sumopod_api_key', sumopodApiKey.value.trim())
  localStorage.setItem('hso_sumopod_base_url', sumopodBaseUrl.value.trim())
  localStorage.setItem('hso_sumopod_model', sumopodModel.value.trim())
  showSettingsModal.value = false
}

const testSumopodConnection = async () => {
  if (!sumopodApiKey.value.trim()) {
    connectionStatus.value = 'error'
    connectionMessage.value = 'Silakan masukkan Kunci Akses AI terlebih dahulu.'
    return
  }

  isTestingConnection.value = true
  connectionStatus.value = null
  connectionMessage.value = ''

  try {
    // 1. Tarik model resmi dari /v1/models jika tersedia
    const fetchedModels = await fetchSumopodModels(true)
    const validModels = fetchedModels.length > 0 ? fetchedModels : availableModels.value

    // Auto-koreksi nama model jika diperlukan
    let targetModel = sumopodModel.value.trim()
    if (targetModel === 'deepseek-v3' && !validModels.includes('deepseek-v3')) {
      const fallback = validModels.find(m => m === 'deepseek/deepseek-chat') ||
                       validModels.find(m => m === 'deepseek-chat') ||
                       validModels.find(m => m.includes('deepseek')) ||
                       validModels[0] || 'deepseek/deepseek-chat'
      targetModel = fallback
      sumopodModel.value = fallback
      localStorage.setItem('hso_sumopod_model', fallback)
    }

    let cleanBase = (sumopodBaseUrl.value.trim() || 'https://ai.sumopod.com/v1').replace(/\/+$/, '')
    let endpoint = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`

    const testPayload = {
      model: targetModel,
      messages: [
        { role: 'user', content: 'Halo! Jawab singkat: "Koneksi AI Berhasil".' }
      ],
      max_tokens: 35
    }

    let res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sumopodApiKey.value.trim()}`
      },
      body: JSON.stringify(testPayload)
    })

    // Jika 404 (Model tidak ditemukan di SumoPod), coba format alternatif tanpa mengubah Base URL
    if (!res.ok && res.status === 404) {
      let altModel = null
      if (targetModel === 'deepseek-chat') altModel = 'deepseek/deepseek-chat'
      else if (targetModel === 'deepseek/deepseek-chat') altModel = 'deepseek-chat'
      else if (targetModel === 'deepseek-reasoner') altModel = 'deepseek/deepseek-r1'
      else if (targetModel === 'deepseek/deepseek-r1') altModel = 'deepseek-reasoner'
      else if (!targetModel.includes('/') && targetModel.startsWith('gpt-')) altModel = `openai/${targetModel}`

      if (altModel) {
        console.info(`Mencoba model alternatif di ${cleanBase}: ${altModel}`)
        const altRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sumopodApiKey.value.trim()}`
          },
          body: JSON.stringify({ ...testPayload, model: altModel })
        })
        if (altRes.ok) {
          res = altRes
          targetModel = altModel
          sumopodModel.value = altModel
          localStorage.setItem('hso_sumopod_model', altModel)
        }
      }
    }

    if (!res.ok) {
      const errText = await res.text()
      let msg = `HTTP ${res.status}: ${res.statusText}`
      try {
        const parsed = JSON.parse(errText)
        if (parsed?.error?.message) msg = parsed.error.message
      } catch {}

      if (res.status === 401) {
        msg = `Autentikasi gagal (401 Unauthorized) pada ${cleanBase}. Pastikan Kunci Akses SumoPod valid dan kuota/saldo mencukupi.`
      }

      if (msg.includes('Invalid model') || msg.includes('models') || res.status === 404) {
        const models = await fetchSumopodModels(true)
        if (models.length > 0) {
          msg += ` (Model "${targetModel}" tidak tersedia. Tersedia ${models.length} model resmi di akun Anda, silakan pilih dari daftar)`
        }
      }
      throw new Error(msg)
    }

    const data = await res.json()
    const reply = data?.choices?.[0]?.message?.content || 'Terhubung!'
    const providerLabel = cleanBase.includes('sumopod.com') ? 'SumoPod AI' : (cleanBase.includes('deepseek.com') ? 'DeepSeek Resmi' : 'Gateway AI')
    connectionStatus.value = 'success'
    connectionMessage.value = `Berhasil terhubung ke ${providerLabel} (Model: "${targetModel}")! Respon: "${reply.trim()}"`
  } catch (err) {
    console.error('SumoPod Test Connection Error:', err)
    connectionStatus.value = 'error'
    connectionMessage.value = `Gagal terhubung: ${err.message}`
  } finally {
    isTestingConnection.value = false
  }
}

async function callSumopodChatCompletions(messages, maxTokens = 4096) {
  const cleanKey = sumopodApiKey.value.trim()
  if (!cleanKey) {
    throw new Error('Kunci Akses AI belum diisi. Masukkan di modal Pengaturan AI.')
  }
  let cleanBase = (sumopodBaseUrl.value.trim() || 'https://ai.sumopod.com/v1').replace(/\/+$/, '')
  let endpoint = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`

  let activeModel = sumopodModel.value.trim() || 'deepseek/deepseek-chat'
  if (activeModel === 'deepseek-v3') {
    activeModel = 'deepseek/deepseek-chat'
    sumopodModel.value = 'deepseek/deepseek-chat'
  }

  const buildPayload = (m) => ({
    model: m,
    messages,
    temperature: (m.includes('reasoner') || m.includes('r1')) ? undefined : 0.7,
    max_tokens: maxTokens
  })

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanKey}`
    },
    body: JSON.stringify(buildPayload(activeModel))
  })

  // Format retry jika 404 (Model tidak ditemukan) di gateway AI tanpa mengubah Base URL
  if (!response.ok && response.status === 404) {
    let altModel = null
    if (activeModel === 'deepseek-chat') altModel = 'deepseek/deepseek-chat'
    else if (activeModel === 'deepseek/deepseek-chat') altModel = 'deepseek-chat'
    else if (activeModel === 'deepseek-reasoner') altModel = 'deepseek/deepseek-r1'
    else if (activeModel === 'deepseek/deepseek-r1') altModel = 'deepseek-reasoner'
    else if (!activeModel.includes('/') && activeModel.startsWith('gpt-')) altModel = `openai/${activeModel}`

    if (altModel) {
      console.info(`Mencoba format model alternatif di ${cleanBase}: ${altModel}`)
      const altResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cleanKey}`
        },
        body: JSON.stringify(buildPayload(altModel))
      })
      if (altResponse.ok) {
        response = altResponse
        sumopodModel.value = altModel
        localStorage.setItem('hso_sumopod_model', altModel)
      }
    }
  }

  if (!response.ok) {
    const errorText = await response.text()
    let msg = `HTTP ${response.status}: ${response.statusText}`
    try {
      const parsed = JSON.parse(errorText)
      if (parsed?.error?.message) msg = parsed.error.message
    } catch {}

    if (response.status === 401) {
      throw new Error(`Akses ditolak (401 Unauthorized) oleh ${cleanBase}. Pastikan Kunci Akses AI SumoPod Anda benar dan memiliki kuota/saldo.`)
    }
    throw new Error(msg)
  }

  const data = await response.json()
  return data?.choices?.[0]?.message?.content || ''
}

// Ekstraktor objek JSON toleran terhadap pemotongan token (Truncation-Resistant)
function extractJsonObjectsFromArray(str) {
  const objects = []
  let depth = 0
  let inString = false
  let escape = false
  let startIdx = -1

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    if (escape) {
      escape = false
      continue
    }
    if (char === '\\') {
      escape = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') {
      if (depth === 0) startIdx = i
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0 && startIdx !== -1) {
        const objStr = str.substring(startIdx, i + 1)
        try {
          const parsedObj = JSON.parse(objStr)
          if (parsedObj && typeof parsedObj === 'object') {
            objects.push(parsedObj)
          }
        } catch {
          try {
            const cleanObjStr = objStr.replace(/,\s*([\]}])/g, '$1')
            const parsedObj = JSON.parse(cleanObjStr)
            if (parsedObj && typeof parsedObj === 'object') {
              objects.push(parsedObj)
            }
          } catch {}
        }
        startIdx = -1
      }
    }
  }
  return objects
}

// Parser tangguh untuk respon AI slot mingguan
function parseAiSlotsResponse(raw, mondayStr, weekNum, dates) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Respon AI kosong.')
  }

  // 1. Bersihkan penalaran DeepSeek R1 / Reasoning (<think>...</think>)
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  // 2. Bersihkan bungkus markdown code fence
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()

  // 3. Coba parsing langsung jika output berupa array JSON valid
  let parsedArray = null
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const candidate = cleaned.substring(firstBracket, lastBracket + 1)
    try {
      parsedArray = JSON.parse(candidate)
    } catch {
      try {
        const repaired = candidate
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/[\u0000-\u0019]+/g, ' ')
        parsedArray = JSON.parse(repaired)
      } catch {}
    }
  }

  // 3b. Coba perbaiki jika hanya bracket penutup ] yang terpotong
  if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
    try {
      let candidate = cleaned.trim()
      if (candidate.startsWith('[') && !candidate.endsWith(']')) {
        candidate = candidate.replace(/,\s*$/, '') + ']'
        parsedArray = JSON.parse(candidate)
      }
    } catch {}
  }

  // 4. Jika direct parse gagal (respon terpotong batas token), lakukan ekstraksi objek toleran
  if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
    const extracted = extractJsonObjectsFromArray(cleaned)
    if (extracted.length > 0) {
      parsedArray = extracted
    }
  }

  // 5. Jika masih belum berhasil, coba parsing cleaned utuh jika single array/object
  if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
    try {
      const direct = JSON.parse(cleaned)
      if (Array.isArray(direct)) parsedArray = direct
      else if (direct && Array.isArray(direct.slots)) parsedArray = direct.slots
      else if (direct && typeof direct === 'object') parsedArray = [direct]
    } catch {}
  }

  if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
    console.error('Gagal memparsing respon AI SumoPod:', raw)
    throw new Error('Format respon AI tidak dapat diparse. Silakan klik Racik 1 Minggu sekali lagi.')
  }

  // Platform dimensions standard
  const platformDimensions = {
    linkedin: '1200 x 628 px (16:9 Landscape)',
    instagram: '1080 x 1350 px (4:5 Portrait)',
    tiktok: '1080 x 1920 px (9:16 Vertical)',
    facebook: '1080 x 1080 px (1:1 Square)',
    website: '1200 x 630 px (16:9 Hero)',
    email: '600 x 300 px (Email Header)'
  }

  // Default color palettes standard
  const defaultPalettes = {
    siemens: [
      { name: 'Siemens Petrol', hex: '#00646E' },
      { name: 'Dark Navy', hex: '#0F172A' },
      { name: 'Signal Amber', hex: '#F59E0B' },
      { name: 'Pure White', hex: '#FFFFFF' }
    ],
    gcomin: [
      { name: 'G-Comin Amber', hex: '#D97706' },
      { name: 'Dark Graphite', hex: '#1E293B' },
      { name: 'Sunburst Yellow', hex: '#FBBF24' },
      { name: 'Clean White', hex: '#FFFFFF' }
    ]
  }

  // Template cadangan untuk slot yang hilang jika respon AI terpotong
  const fallbackBuiltins = getBuiltinWeekSlots(mondayStr, weekNum, '')

  // Susun tepat 7 slot lengkap
  const finalSlots = []
  for (let idx = 0; idx < 7; idx++) {
    const item = parsedArray[idx] || fallbackBuiltins[idx] || {}
    const fb = fallbackBuiltins[idx] || {}

    const cat = ((item.category || fb.category || 'siemens').toLowerCase().includes('gcomin')) ? 'gcomin' : 'siemens'
    const plat = (item.platform || fb.platform || 'linkedin').toLowerCase()
    const dim = platformDimensions[plat] || '1080 x 1350 px (4:5 Portrait)'
    const palette = defaultPalettes[cat] || defaultPalettes.siemens

    const slotId = item.id || `slot_${mondayStr}_${idx + 1}`
    const dateStr = item.dateStr || dates[idx] || fb.dateStr || mondayStr

    const designGuide = {
      dimensions: item.designGuide?.dimensions || dim,
      layoutType: item.designGuide?.layoutType || (item.postType?.includes('Reel') || item.postType?.includes('Video') ? 'Vertical Motion' : 'Product Showcase'),
      headlineOverlay: item.headlineOverlay || item.designGuide?.headlineOverlay || item.title || fb.title || 'PT Hokiindo Raya',
      subHeadlineOverlay: item.subHeadlineOverlay || item.designGuide?.subHeadlineOverlay || (cat === 'siemens' ? 'Distributor Resmi Siemens Indonesia' : 'Industrial High Bay & Floodlight'),
      colorPalette: (Array.isArray(item.designGuide?.colorPalette) && item.designGuide.colorPalette.length > 0)
        ? item.designGuide.colorPalette
        : palette,
      compositionDetails: item.visualConcept || item.designGuide?.compositionDetails || 'Modern industrial lighting setup, clean professional product shot.',
      aiPrompt: item.aiPrompt || item.designGuide?.aiPrompt || 'Industrial electrical equipment, professional studio photography, cinematic lighting --ar 4:5'
    }

    const slot = {
      id: slotId,
      week: weekNum,
      dateStr: dateStr,
      dayLabel: item.dayLabel || fb.dayLabel || `Slot ${idx + 1}`,
      agentId: item.agentId || fb.agentId || 'tejo',
      category: cat,
      platform: plat,
      postType: item.postType || fb.postType || 'Artikel LinkedIn B2B',
      title: item.title || fb.title || 'Update Kelistrikan Industri',
      hook: item.hook || fb.hook || '',
      body: item.body || fb.body || '',
      cta: item.cta || fb.cta || 'Kunjungi https://shop.hokiindo.co.id untuk info ketersediaan stok & pemesanan resmi.',
      hashtags: item.hashtags || fb.hashtags || '#HokiindoRaya #SiemensIndonesia #PanelMaker',
      curationStatus: item.curationStatus || 'approved',
      uploadedImagePreview: item.uploadedImagePreview || '',
      externalImageUrl: item.externalImageUrl || '',
      designGuide
    }

    humanizeSlot(slot)
    finalSlots.push(slot)
  }

  return finalSlots
}

// =========================================================================
// 8 PILAR TEMA STRATEGIS EDITORIAL MINGGUAN (ANTI-MONOTON & FRESH CREATIVE)
// =========================================================================
const EDITORIAL_THEMES = [
  {
    id: 'energy_roi',
    title: 'Audit Energi & Efisiensi Biaya Listrik Pabrik',
    badge: '💰 Efisiensi & Daya',
    angle: 'Kalkulasi penghematan kWh & rupiah konkret, pemantauan daya presisi via Digital Power Meter Sentron PAC, dan optimasi rugi daya sistem switchgear.',
    keywords: 'Power Meter PAC3200, Efisiensi kWh, ROI Penghematan Listrik Pabrik, Kualitas Daya, Audit Daya & Form Segregasi Cubicle Switchboard',
    preferredCategory: 'siemens'
  },
  {
    id: 'motor_starter',
    title: 'Zero Downtime & Keandalan Motor Starter Industri',
    badge: '⚙️ Motor & Mesin',
    angle: 'Perlindungan motor 3-fase pompa, kompresor, dan conveyor pabrik dengan Kontaktor Siemens SIRIUS 3RT, Overload Relay 3RU, dan Motor Breaker 3RV tahan arus inrush.',
    keywords: 'Kontaktor Siemens SIRIUS 3RT, Overload Relay 3RU, Motor Breaker 3RV, Arus Inrush Motor 6-8x In, Proteksi Phase Loss, Kontak Perak-Nikel',
    preferredCategory: 'siemens'
  },
  {
    id: 'tender_selectivity',
    title: 'Proteksi Selektif & Sukses Lolos Audit Tender ME',
    badge: '🏆 Tender & Panel MDP',
    angle: 'Pencegahan blackout total via kurva proteksi selektif L-I-S-G Air Circuit Breaker (ACB) Siemens 3WA/3WL dan jaminan dokumen keaslian CoO resmi pabrik.',
    keywords: 'Air Circuit Breaker ACB 3WA, Sentron 3VA/3VM, Kurva Proteksi L-I-S-G, Selektivitas Breaker, Sertifikat CoO Resmi Pabrikan, BAST Tender',
    preferredCategory: 'siemens'
  },
  {
    id: 'k3_safety',
    title: 'Keselamatan K3 & Proteksi Bahaya Kelistrikan',
    badge: '🛡️ K3 & Safety',
    angle: 'Mitigasi sambaran petir dengan Surge Arrester (SPD) Siemens, bahaya busur api (arc flash), standar PUIL 2020, dan keunggulan breaking capacity Ics = 100% Icu.',
    keywords: 'Surge Arrester SPD Siemens, Arc Flash, Breaking Capacity 100% Ics, PUIL 2020, MCB 5SL6 6kA, Proteksi Hubung Singkat',
    preferredCategory: 'siemens'
  },
  {
    id: 'smart_automation',
    title: 'Otomasi Pabrik Modern & Smart Monitoring Digital',
    badge: '🤖 Otomasi Industri 4.0',
    angle: 'Integrasi PLC Siemens S7-1200, HMI KTP Basic, dan monitoring digital panel untuk mencegah downtime mesin serta membaca kebocoran energi shift malam.',
    keywords: 'PLC Siemens S7-1200, HMI KTP Basic, Sentron PAC Meter, Modbus RTU/TCP, Smart Panel, Otomasi Pabrik Bebas Macet',
    preferredCategory: 'siemens'
  },
  {
    id: 'power_quality_audit',
    title: 'Manajemen Kualitas Daya & Efisiensi Energi Listrik (ISO 50001)',
    badge: '📊 Kualitas Daya & Energi',
    angle: 'Analisis harmonisa THD-V dan THD-I menggunakan Sentron PAC3200/4200, mitigasi kenaikan suhu transformator akibat beban non-linear, dan audit efisiensi daya pabrik manufaktur sesuai IEC 61557-12.',
    keywords: 'SENTRON PAC Power Meter, Harmonisa THD-V THD-I, Efisiensi Energi ISO 50001, IEC 61557-12, Kualitas Daya Industri, Power Monitoring',
    preferredCategory: 'siemens'
  },
  {
    id: 'trust_counterfeit',
    title: 'Investigasi Komponen Aspal vs Distributor Resmi',
    badge: '🔍 Edukasi Anti-Aspal',
    angle: 'Bahaya breaker rekondisi/daur ulang tanpa uji lab, cara mengecek keaslian barcode CoO pabrik, dan reputasi distributor resmi PT Hokiindo Raya.',
    keywords: 'Breaker Aspal vs Asli, Sertifikat Keaslian CoO, MCCB Sentron 3VM, Distributor Resmi Siemens Indonesia, Garansi Pabrikan Resmi',
    preferredCategory: 'siemens'
  },
  {
    id: 'urgent_delivery',
    title: 'Solusi Cepat Kebutuhan Mendesak & Deadline Proyek',
    badge: '⚡ Gercep 24 Jam',
    angle: 'Layanan darurat sameday delivery Jabodetabek, SLA gudang ready stock 24 jam, dan kemudahan cek produk di toko online shop.hokiindo.co.id.',
    keywords: 'Ready Stock 24 Jam, Sameday Delivery Jabodetabek, Cek Stok shop.hokiindo.co.id, Penyelamat Deadline Proyek, Gudang Terlengkap',
    preferredCategory: 'siemens'
  }
]

async function generateWeekPlanWithSumopod(mondayStr, weekNum, focusTopic) {
  const dates = getWeekDates(mondayStr)

  // 1. Tentukan Tema Strategis Pekan Ini (Dinamis & Anti-Monoton)
  const themeIndex = (weekNum + planGenerationVariant) % EDITORIAL_THEMES.length
  const autoTheme = EDITORIAL_THEMES[themeIndex]
  const effectiveTheme = focusTopic ? {
    id: 'custom',
    title: focusTopic,
    badge: '🎯 Tema Pilihan Manajer',
    angle: `Eksplorasi mendalam fokus materi: "${focusTopic}" dengan perspektif teknisi lapangan, estimator tender, dan praktisi industri.`,
    keywords: focusTopic,
    preferredCategory: (focusTopic.toLowerCase().includes('lampu') || focusTopic.toLowerCase().includes('solar') || focusTopic.toLowerCase().includes('led')) ? 'gcomin' : 'siemens'
  } : autoTheme

  // 2. Sampling Produk Cerdas Sesuai Tema (Menghindari Produk yang Monoton Sama)
  let selectedProductsForPrompt = []
  if (effectiveTheme.preferredCategory === 'gcomin' || effectiveTheme.id === 'energy_roi' || effectiveTheme.id === 'green_solar') {
    const gcominProds = accurateProducts.value.filter(p => {
      const name = (p.item_name || '').toLowerCase()
      const cat = (p.category || '').toLowerCase()
      const brand = (p.brand || '').toLowerCase()
      return cat.includes('lampu') || name.includes('high bay') || name.includes('floodlight') || name.includes('solar') || brand.includes('gcomin') || brand.includes('g-comin')
    })
    const otherProds = accurateProducts.value.filter(p => !gcominProds.includes(p))
    selectedProductsForPrompt = [...gcominProds.slice(0, 10), ...otherProds.slice(0, 8)]
  } else if (effectiveTheme.id === 'motor_starter') {
    const motorProds = accurateProducts.value.filter(p => {
      const name = (p.item_name || '').toLowerCase()
      return name.includes('kontaktor') || name.includes('sirius') || name.includes('overload') || name.includes('3rt') || name.includes('3ru') || name.includes('3rv')
    })
    const otherProds = accurateProducts.value.filter(p => !motorProds.includes(p))
    selectedProductsForPrompt = [...motorProds.slice(0, 10), ...otherProds.slice(0, 8)]
  } else if (effectiveTheme.id === 'smart_automation') {
    const autoProds = accurateProducts.value.filter(p => {
      const name = (p.item_name || '').toLowerCase()
      return name.includes('plc') || name.includes('s7') || name.includes('pac') || name.includes('meter') || name.includes('hmi')
    })
    const otherProds = accurateProducts.value.filter(p => !autoProds.includes(p))
    selectedProductsForPrompt = [...autoProds.slice(0, 10), ...otherProds.slice(0, 8)]
  } else {
    // Rotasi produk cerdas berdasarkan variasi putaran (offset) agar tiap generate menampilkan part number berbeda
    const offset = (planGenerationVariant * 4) % Math.max(1, accurateProducts.value.length - 15)
    selectedProductsForPrompt = accurateProducts.value.slice(offset, offset + 18)
    if (selectedProductsForPrompt.length < 12) {
      selectedProductsForPrompt = [...selectedProductsForPrompt, ...accurateProducts.value.slice(0, 18 - selectedProductsForPrompt.length)]
    }
  }

  if (selectedProductsForPrompt.length === 0) {
    selectedProductsForPrompt = accurateProducts.value.slice(0, 18)
  }

  const websiteContext = hsoWebsites.value.map(w => `- ${w.title} (${w.url}): ${w.description}` + (w.highlights && w.highlights.length ? ` [Poin: ${w.highlights.join('; ')}]` : '')).join('\n')
  const articleContext = hsoArticles.value.map(a => `- ${a.title} (${a.author} - ${a.category}): ${a.summary}` + (a.keyInsights && a.keyInsights.length ? ` [Insight: ${a.keyInsights.join('; ')}]` : '')).join('\n')
  const pdfContext = hsoPdfs.value.map(p => `- ${p.title} (${p.brand} ${p.code} - Link: ${p.url}): ${p.specsSummary ? p.specsSummary.join(', ') : ''}`).join('\n')
  
  const productContext = selectedProductsForPrompt.map(p => {
    const data = resolveProductSupportingData(p)
    return `- ${p.item_name} [MLFB: ${p.item_no}]: ${data.baseDesc} (Kategori: ${data.category}, Spesifikasi: ${[data.currentRating, data.poles, data.breakingCapacity, data.tripUnit].filter(Boolean).join(', ')}, Aplikasi: ${data.application}, Standar: ${data.standard}, Stok: Ready Stock 24 Jam)` + (data.customNote ? ` [Catatan Khusus: "${data.customNote}"]` : '')
  }).join('\n')

  const referenceContext = hsoContentReferences.value.map(r => `[Contoh Referensi: ${r.title} (${r.platform} - ${r.category})]\n• Formula Sukses: ${r.whyItWorks}\n• Cuplikan Konten: "${r.contentText}"`).join('\n\n')

  const systemPrompt = `Kamu adalah Antigravity Marketing & Technical Engineering Engine untuk PT Hokiindo Raya (distributor resmi produk industri kelistrikan Siemens di Indonesia).
PERAN & OTORITAS: Kamu bertindak sebagai Chief Electrical Engineer & Siemens Certified Specialist kelas dunia sekaligus Master B2B Technical Copywriter. Konten yang kamu hasilkan HARUS 100% KREDIBEL, SANGAT BERBOBOT TEKNIK (ENGINEERING-GRADE), AKURAT SECARA STANDAR KELISTRIKAN INTERNASIONAL (IEC / PUIL), TIDAK AMBIGU, MEMILIKI TINGKAT KETERBACAAN EKSEKUTIF YANG TINGGI, SERTA BERWIBAWA.

BATASAN CAKUPAN PRODUK & LARANGAN KERAS (MUTLAK & WAJIB DIIKUTI):
1. TIDAK ADA TOWER LIGHTING DI MINING, GUDANG & KONSTRUKSI:
   - DILARANG KERAS mempromosikan tower lighting (lampu menara / mobile lighting tower).
   - DILARANG KERAS membuat konten atau penawaran penerangan untuk sektor penambangan (mining), gudang logistik umum, dan proyek konstruksi sipil/bedeng proyek.
   - Fokus kelistrikan PT Hokiindo Raya adalah fasilitas industri manufaktur berat, proses industri terotomasi, gardu distribusi, ruang cubicle switchgear/MCC, dan pabrik modern.
2. TIDAK JUALAN KABEL:
   - DILARANG KERAS menyatakan atau mengimplikasikan bahwa PT Hokiindo Raya menjual atau menyuplai kabel (kabel tanah, kabel NYFGBY, kabel grounding tembaga, dsb.). KAMI TIDAK MENJUAL KABEL.
   - Pemutus sirkuit dan relay proteksi Siemens memproteksi konduktor dan kabel sirkit eksternal (menurut kaidah I²t <= k²S² per IEC 60364-4-43 & PUIL 2020), tetapi suplai kabel dilakukan oleh pihak ketiga/kontraktor. PT Hokiindo Raya HANYA menyediakan komponen pemutus tenaga, switchgear, controlgear, proteksi, dan otomasi.
3. BAHASA SANGAT ENGINEERING & KELAS DUNIA:
   - DILARANG KERAS menggunakan bahasa gaul pasar murahan, guyonan kuli/mandor, plesetan kopi bedeng, kawat jemuran, drama mandor ngamuk, dll.
   - Wajib menggunakan bahasa rekayasa teknik kelistrikan tingkat tinggi (Chief Electrical Engineer & Senior Power Systems Consultant tone): berbasis data matematis, merujuk standar internasional resmi (IEC 60947, IEC 61439, IEEE 1584, IEC 61557, PUIL 2020), metodis, presisi, dan berwibawa.

STANDAR KREDIBILITAS & AKURASI TEKNIK LISTRIK (MUTLAK & WAJIB AKURAT):
1. PEMUTUS TENAGA & BREAKER (MCCB 3VM/3VA, ACB 3WA/3WL):
   - Wajib merujuk pada standar IEC 60947-2 dan PUIL 2020.
   - Bedakan dengan tegas nilai Icu (Ultimate Short-Circuit Breaking Capacity) dan Ics (Service Breaking Capacity di mana Siemens 3VA memiliki Ics = 100% Icu).
   - Bedakan Trip Unit TMD (Thermal Magnetic TM210/TM220/TM240: proteksi thermal overload bimetal beralur adjustable/fixed dan magnetic short-circuit) dengan ETU (Electronic Trip Unit microprocessor seri ETU3xx/ETU5xx/ETU8xx dengan kurva proteksi L-S-I-G: Long-time, Short-time delay, Instantaneous, Ground fault).
   - Jangan pernah menyebut MCCB sebagai MCB (MCB hanya untuk modular din-rail <= 125A, sedangkan MCCB industri hingga 1600A dan ACB hingga 6300A).
2. MOTOR CONTROL & STARTER (SIRIUS 3RT, OVERLOAD 3RU/3RB, MPCB 3RV):
   - Wajib merujuk standar IEC 60947-4-1.
   - PENTING: Untuk motor efisiensi tinggi (IE3/IE4), jelaskan fenomena arus start inrush yang mencapai 8-10x arus nominal (In), sehingga kontaktor WAJIB berkategori utilisasi AC-3e (bukan hanya AC-3 standar lama) agar kontak perak tidak cepat aus atau las akibat contact bounce.
   - Overload relay 3RU memiliki sensitivitas kegagalan fasa (phase loss / single-phasing protection differential mechanism) dengan kompensasi temperatur ambien -40°C hingga +70°C, Trip Class 10.
3. KUALITAS DAYA & MONITORING (SENTRON PAC2200/PAC3200/PAC4200):
   - Standar akurasi IEC 62053-22 Class 0.2S / 0.5S.
   - Parameter: Total Harmonic Distortion (THD-V dan THD-I), individual harmonics hingga orde ke-31 atau ke-64, pengukuran 4-kuadran (energi aktif dan reaktif, impor/ekspor).
4. SURGE ARRESTER (SPD) & PROTEKSI PETIR:
   - Standar IEC 61643-11: Bedakan Type 1 (gelombang impuls arus petir 10/350 µs) untuk Main Switchboard MDP, Type 2 (gelombang switching surge 8/20 µs) untuk Sub-Panel SDP, dan Type 3 untuk beban sensitif. Up (voltage protection level) <= 1.5 kV.
5. STANDAR PANEL & SWITCHBOARD:
   - IEC 61439-1 & IEC 61439-2 (Desain Panel Design-Verified, Form of Internal Separation Form 1 s/d Form 4b, derajat proteksi IP30, IP41, IP54, IP65).

RUKUN GAYA PENULISAN: ENGINEERING-GRADE, METODIS, MENGGUGAH & HOOK 3 DETIK:
1. HOOK 3 DETIK PERTAMA (WAJIB ADA DI SETIAP AWAL KONTEN):
   - Langsung sentak perhatian audiens dengan studi kasus rekayasa nyata, parameter kegagalan kritis, atau mitos kelistrikan yang salah kaprah.
   - Contoh hook engineering: "Memilih breaker hanya berdasarkan arus nominal tanpa menghitung kapasitas hubung singkat prospektif (Isc) dari trafo adalah akar penyebab utama kegagalan katastropik switchboard."
2. JUDUL MENGGUGAH DENGAN SEO & TERMINOLOGI TEKNIS KUAT:
   - Judul harus memuat parameter rekayasa konkret, nomor standar IEC/PUIL, atau tipe part number MLFB Siemens.
3. TATA BAHASA PRESISI, FORMAL-BERWIBAWA, & ZERO SLOP:
   - DILARANG KERAS menggunakan bahasa robot klise atau humor pasar murahan.
   - Tulis dengan gaya Chief Electrical Engineer & Senior Power Systems Consultant yang berwibawa, metodis, dan tidak terbantahkan secara kalkulasi fisik listrik.

ATURAN DOMAIN & RUJUKAN SITUS RESMI PT HOKIINDO RAYA (MUTLAK & KETAT):
1. CEK PRODUK, SPESIFIKASI, STOK & PEMBELIAN (PENTING SEKALI):
   - Wajib arahkan audiens/pelanggan ke TOKO ONLINE RESMI: https://shop.hokiindo.co.id
   - PENTING: Pengecekan produk dan stok BUKAN di HSO! HSO adalah sistem internal tim operasional, BUKAN untuk publik.
   - Contoh CTA yang benar:
     * "Cek ketersediaan stok ready 24 jam dan harga resmi di https://shop.hokiindo.co.id"
     * "Lihat datasheet lengkap dan pesan langsung di https://shop.hokiindo.co.id"
     * "Cari tipe MLFB Siemens yang Anda butuhkan di https://shop.hokiindo.co.id"
   - DILARANG KERAS menyebut atau mengarahkan publik untuk mengecek produk di "HSO".
2. COMPANY PROFILE, KREDIBILITAS DISTRIBUTOR RESMI & TENDER:
   - Wajib arahkan ke WEBSITE KORPORAT RESMI: https://hokiindo.co.id
   - Gunakan hokiindo.co.id untuk profil PT Hokiindo Raya sebagai authorized distributor resmi Siemens Indonesia, legalitas dokumen CoO (Certificate of Origin), portofolio proyek switchgear/panel, dan pengajuan tender BoQ proyek besar.
   - Contoh CTA: "Pelajari legalitas distributor resmi kami dan ajukan surat dukungan tender di https://hokiindo.co.id".
3. KONTAK RESMI: https://hokiindo.co.id/contact.

FOKUS TEMA STRATEGIS PEKAN INI (WAJIB DIIKUTI & DIEKSPLORASI PENUH):
- Tema Utama: "${effectiveTheme.title}" (${effectiveTheme.badge})
- Sudut Pandang Rekayasa: "${effectiveTheme.angle}"
- Kata Kunci & Produk Sorotan: ${effectiveTheme.keywords}

ATURAN ANTI-REPETISI & KUALITAS TEKNIK TINGGI (MUTLAK):
1. Seluruh 7 slot konten pekan ini HARUS mengeksplorasi tema "${effectiveTheme.title}".
2. DILARANG KERAS mengulang-ulang cerita generik yang sama! Terapkan sudut pandang unik tema ini.
3. Setiap slot per hari harus memiliki format dan sudut pandang rekayasa yang unik:
   - Slot 1 (Senin Pagi - Mas Tejo): Artikel Teknis & Thought Leadership LinkedIn B2B (Standar Desain & Spesifikasi Kelistrikan).
   - Slot 2 (Senin Sore - Ir. Bagong, S.T.): Video Walkthrough Teknis / Prosedur Komisioning Lapangan (FAT/SAT & Kurva TCC).
   - Slot 3 (Selasa - Mbak Sri): Surat Penawaran B2B & Konsultasi Spesifikasi BoQ Tender Industri.
   - Slot 4 (Rabu Pagi - Mas Tejo): Whitepaper / Panduan Rekayasa Teknis & Standar Proteksi Industri (IEC/PUIL).
   - Slot 5 (Rabu Sore - Ir. Bagong, S.T.): Carousel Infografis Teknis 5-Slide (Komparasi Kurva, Koordinasi Proteksi, Analisis Kerusakan Termal).
   - Slot 6 (Kamis - Ir. Broto Kusumo, M.T.): Analisis Capex/Opex, TCO & Strategi Efisiensi Kelistrikan untuk Direktur Operasional & Purchasing Industri.
   - Slot 7 (Jumat - Ir. Bagong, S.T. / Mas Tejo): Evaluasi Studi Kasus Kegagalan Proteksi Lapangan & Refleksi Keandalan Sistem Kelistrikan Industri.

5 PILAR BANK DATA PT HOKIINDO RAYA:
Situs Resmi:
${websiteContext}

Artikel Teknik:
${articleContext}

Dokumen PDF:
${pdfContext}

Katalog Accurate Pilihan Pekan Ini:
${productContext}

Formula Referensi:
${referenceContext}

FORMAT OUTPUT WAJIB:
KEMBALIKAN HANYA JSON MURNI BERUPA ARRAY BERISI TEPAT 7 OBJEK (tanpa markdown wrapper \`\`\`json atau pembungkus lain). Format per objek:
[
  {
    "dayLabel": "Senin Pagi",
    "agentId": "tejo",
    "category": "${effectiveTheme.preferredCategory || 'siemens'}",
    "platform": "linkedin",
    "postType": "Artikel LinkedIn B2B",
    "title": "Judul ringkas padat maks 10-12 kata",
    "hook": "Hook alami tanpa label robotik",
    "body": "Naskah mendalam gaya manusia mengalir bercerita (anti-slop)",
    "cta": "CTA arahkan ke shop.hokiindo.co.id (stok) atau hokiindo.co.id (tender)",
    "hashtags": "#HokiindoRaya #SiemensIndonesia #ListrikIndustri",
    "headlineOverlay": "Teks besar banner visual",
    "subHeadlineOverlay": "Sub-headline pendukung banner",
    "visualConcept": "Arahan visual & angle kamera",
    "aiPrompt": "Midjourney/Canva prompt in English"
  }
]`

  const userPrompt = `Buatkan tepat 7 slot rencana konten untuk pekan ${mondayStr} (Pekan ke-${weekNum}).
FOKUS TEMA STRATEGIS: "${effectiveTheme.title}" - ${effectiveTheme.angle}.
PENTING SEKALI:
1. Konsep setiap hari harus 100% FRESH, KREATIF, BARU, dan BERBEDA DARI PEKAN-PEKAN LAIN.
2. Jangan mengulang konsep monoton. Terapkan sudut pandang unik tema "${effectiveTheme.title}".
3. Kembalikan HANYA array JSON 7 objek.`

  const raw = await callSumopodChatCompletions([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 4096)

  return parseAiSlotsResponse(raw, mondayStr, weekNum, dates)
}

// ==========================================
// 5. STATE PERENCANAAN BERGULIR (ROLLING WEEK)
// ==========================================
const activeViewMode = ref('weekly_rolling') // 'weekly_rolling' | 'all_overview' | 'manual_studio'
const currentWeekMondayStr = ref(getNextMondayYMD())
const currentWeekNumber = ref(1)
const currentWeekFocusTopic = ref('')

// Storage peta rencana mingguan: { [mondayStr]: slotsArray }
const weeklyPlansMap = ref({})

const isGeneratingAI = ref(false)
const aiGenerationNotice = ref('')
const aiGenerationError = ref('')
const isBatchPublishing = ref(false)
const showThemePromptBar = ref(false)
const batchPublishSuccess = ref('')
const activeCurationFilter = ref('all') // 'all' | 'approved' | 'pending' | 'rejected'

const selectedSlotForCuration = ref(null)
const curationModalOpen = ref(false)
const curationActiveTab = ref('design')
const copiedHexCode = ref('')

// Studio Mandiri Satuan
const selectedAgentId = ref('tejo')
const currentAgent = computed(() => SQUAD_AGENTS.find(a => a.id === selectedAgentId.value) || SQUAD_AGENTS[0])
const contentCategory = ref('siemens')
const targetPlatform = ref('linkedin')
const customTopic = ref('')

// Computed Slots Pekan Aktif
const currentWeekSlots = computed(() => {
  return weeklyPlansMap.value[currentWeekMondayStr.value] || []
})

const filteredSlots = computed(() => {
  let list = currentWeekSlots.value
  if (activeCurationFilter.value !== 'all') {
    list = list.filter(s => s.curationStatus === activeCurationFilter.value)
  }
  return list
})

const approvedCount = computed(() => currentWeekSlots.value.filter(s => s.curationStatus === 'approved').length)
const pendingCount = computed(() => currentWeekSlots.value.filter(s => s.curationStatus === 'pending').length)
const imageReadyCount = computed(() => currentWeekSlots.value.filter(s => s.uploadedImagePreview || s.externalImageUrl).length)

// ==========================================
// 6. MESIN ANTI-SLOP & HUMANIZER COPYWRITING
// ==========================================
const AI_SLOP_PATTERNS = [
  { regex: /dalam era (modern|digital|teknologi)?\s*(yang)?\s*(serba)?\s*cepat( ini)?/gi, replacement: 'Di lapangan sehari-hari,' },
  { regex: /tidak dapat dipungkiri bahwa/gi, replacement: 'Jujur aja,' },
  { regex: /tidak dapat dipungkiri/gi, replacement: 'faktanya' },
  { regex: /mari kita (selami|telaah|bedah|bahas)( lebih dalam)?/gi, replacement: 'ini yang sering terjadi:' },
  { regex: /solusi (komprehensif|mutakhir|revolusioner|holistik)/gi, replacement: 'solusi praktis' },
  { regex: /membawa angin segar/gi, replacement: 'sangat membantu' },
  { regex: /game changer/gi, replacement: 'penyelamat proyek' },
  { regex: /merajut/gi, replacement: 'membangun' },
  { regex: /menyelami/gi, replacement: 'mempelajari' },
  { regex: /tonggak sejarah/gi, replacement: 'standar baru' },
  { regex: /batu loncatan/gi, replacement: 'langkah awal' },
  { regex: /kesimpulannya,?\s*(investasi pada|memilih)?/gi, replacement: 'Intinya,' },
  { regex: /jangan ragu untuk menghubungi/gi, replacement: 'Langsung kontak tim teknis' },
  { regex: /tahukah anda bahwa/gi, replacement: 'Banyak yang belum tahu,' },
  { regex: /merupakan pilihan ideal bagi/gi, replacement: 'paling pas buat' },
  { regex: /penting untuk diingat bahwa/gi, replacement: 'Catatan pentingnya:' },
  { regex: /hadir sebagai solusi/gi, replacement: 'bisa jadi pilihan pas' }
]

function detectSlopScore(slot) {
  if (!slot) return { hasSlop: false, count: 0, label: '100% Human Writing' }
  const text = `${slot.hook || ''} ${slot.body || ''} ${slot.title || ''}`
  let matches = 0
  AI_SLOP_PATTERNS.forEach(p => {
    const found = text.match(p.regex)
    if (found) matches += found.length
  })
  if (matches === 0) {
    return { hasSlop: false, count: 0, label: '🛡️ 100% Human Writing' }
  }
  return { hasSlop: true, count: matches, label: `⚠️ Terdeteksi ${matches} Kata Klise AI` }
}

function cleanSlopFromSlot(slot) {
  if (!slot) return
  let body = slot.body || ''
  let hook = slot.hook || ''
  let title = slot.title || ''

  AI_SLOP_PATTERNS.forEach(p => {
    body = body.replace(p.regex, p.replacement)
    hook = hook.replace(p.regex, p.replacement)
    title = title.replace(p.regex, p.replacement)
  })

  // Bersihkan label robotik
  hook = hook.replace(/^\[0-3 Detik\]:?\s*/i, '').replace(/^\[Solusi Resmi HSO\]:?\s*/i, '')

  slot.body = body.trim()
  slot.hook = hook.trim()
  slot.title = title.trim()
  saveSlotCuration(false)
}

function humanizeSlot(s) {
  if (!s) return
  cleanSlopFromSlot(s)
}

function loadWeeklyPlansFromStorage() {
  try {
    const raw = localStorage.getItem('hso_marketing_weekly_plans')
    if (raw) {
      const parsed = JSON.parse(raw)
      // Humanize existing cached slots so robotic text is cleaned immediately
      for (const key in parsed) {
        if (Array.isArray(parsed[key])) {
          parsed[key].forEach(humanizeSlot)
        }
      }
      weeklyPlansMap.value = parsed
    }
  } catch (e) {
    console.error('Failed to load weekly plans from localStorage:', e)
  }
}

function saveWeeklyPlansToStorage() {
  try {
    localStorage.setItem('hso_marketing_weekly_plans', JSON.stringify(weeklyPlansMap.value))
  } catch (e) {
    console.error('Failed to save weekly plans to localStorage:', e)
  }
}

function initOrLoadActiveWeek() {
  const mondayStr = currentWeekMondayStr.value
  if (!weeklyPlansMap.value[mondayStr] || weeklyPlansMap.value[mondayStr].length === 0) {
    // Generate built-in template as instant initial state
    const slots = getBuiltinWeekSlots(mondayStr, currentWeekNumber.value, currentWeekFocusTopic.value)
    weeklyPlansMap.value[mondayStr] = slots
    saveWeeklyPlansToStorage()
  }
  batchPublishSuccess.value = ''
  aiGenerationNotice.value = ''
  aiGenerationError.value = ''
}

const goToPreviousWeek = () => {
  currentWeekMondayStr.value = addDaysToDateStr(currentWeekMondayStr.value, -7)
  if (currentWeekNumber.value > 1) {
    currentWeekNumber.value--
  } else {
    currentWeekNumber.value = 1
  }
  initOrLoadActiveWeek()
}

const goToNextWeek = () => {
  currentWeekMondayStr.value = addDaysToDateStr(currentWeekMondayStr.value, 7)
  currentWeekNumber.value++
  initOrLoadActiveWeek()
}

const onCustomDateChange = (e) => {
  const val = e.target.value
  if (!val) return
  currentWeekMondayStr.value = snapToMonday(val)
  initOrLoadActiveWeek()
}

const jumpToDatePreset = (mondayStr, weekIndex) => {
  currentWeekMondayStr.value = mondayStr
  currentWeekNumber.value = weekIndex
  initOrLoadActiveWeek()
}

const applyTopicPreset = (topic) => {
  currentWeekFocusTopic.value = topic
  generateCurrentWeekPlan(true)
}

const randomizeWeeklyTheme = () => {
  const currentIndex = EDITORIAL_THEMES.findIndex(t => t.title === currentWeekFocusTopic.value)
  let nextIndex = Math.floor(Math.random() * EDITORIAL_THEMES.length)
  if (nextIndex === currentIndex) {
    nextIndex = (nextIndex + 1) % EDITORIAL_THEMES.length
  }
  const picked = EDITORIAL_THEMES[nextIndex]
  currentWeekFocusTopic.value = picked.title
  generateCurrentWeekPlan(true)
}

// ==========================================
// 7. GENERATOR PEKAN INI (SUMOPOD / BUILT-IN)
// ==========================================
let planGenerationVariant = 0

const generateCurrentWeekPlan = async (forceSumopod = false) => {
  isGeneratingAI.value = true
  aiGenerationError.value = ''
  aiGenerationNotice.value = ''
  batchPublishSuccess.value = ''

  const mondayStr = currentWeekMondayStr.value
  const weekNum = currentWeekNumber.value
  const focusTopic = currentWeekFocusTopic.value.trim()

  planGenerationVariant++

  try {
    if (isApiConfigured.value) {
      try {
        const slots = await generateWeekPlanWithSumopod(mondayStr, weekNum, focusTopic)
        weeklyPlansMap.value[mondayStr] = slots
        saveWeeklyPlansToStorage()
        const providerName = sumopodBaseUrl.value.includes('sumopod.com') ? 'SumoPod AI' : 'Mesin AI'
        const themeLabel = focusTopic || EDITORIAL_THEMES[((weekNum + planGenerationVariant - 1) % EDITORIAL_THEMES.length)]?.title || 'Tema Terpilih'
        aiGenerationNotice.value = `Berhasil! 7 slot konten pekan ${formatShortDate(mondayStr)} bertema "${themeLabel}" selesai diracik via ${providerName} (${sumopodModel.value}) oleh ${squadGangName.value}!`
        return
      } catch (apiErr) {
        console.error('AI call failed:', apiErr)
        aiGenerationError.value = `Gagal meracik via AI (${apiErr.message}). Konten pekan ini tetap aman dan tidak diubah. Buka "Pengaturan AI" jika perlu memeriksa Kunci Akses / Model SumoPod Anda.`
        return
      }
    } else {
      aiGenerationError.value = 'Kunci Akses AI SumoPod belum dikonfigurasi. Klik ikon Gerigi "Pengaturan AI" di sudut kanan atas untuk memasukkan Kunci Akses SumoPod.'
      return
    }
  } finally {
    isGeneratingAI.value = false
  }
}

// ==========================================
// AUTO-IMPROVE DARI MASUKAN AUDIENS (SUMOPOD / SMART ENGINE)
// ==========================================
const isImprovingWithAudience = ref(false)
const audienceImproveSuccess = ref('')
const activeAudienceFilter = ref('all') // 'all' | 'panel_maker' | 'contractor' | 'consultant' | 'end_user' | 'field' | 'estimator'
const isReviewingWithAi = ref(false)
const aiAudienceReviewSuccess = ref('')
const aiAudienceReviewError = ref('')

async function runAiAudienceReview(slotToReview = null) {
  const slot = slotToReview || selectedSlotForCuration.value
  if (!slot) return

  isReviewingWithAi.value = true
  aiAudienceReviewError.value = ''
  aiAudienceReviewSuccess.value = ''

  try {
    if (isApiConfigured.value) {
      const personaContext = DEMO_AUDIENCE_PERSONAS.map(p => 
        `- ID: "${p.id}", Nama: ${p.name} (${p.role}), Pasar Strategis: ${p.strategicMarket}, Pain Point: "${p.painPoint}", Penentu Keputusan: "${p.whatMatters}"`
      ).join('\n')

      const systemPrompt = `Kamu adalah Engine Simulator Evaluasi Audiens B2B Independen untuk industri kelistrikan Indonesia (PT Hokiindo Raya).
Kamu bertindak sebagai PANEL PENGUJI 10 PASAR STRATEGIS PROYEK KELISTRIKAN:
1. Panel Maker (Workshop Switchboard - Pak Bambang)
2. Kontraktor Listrik (EPC & Mekanikal Elektrikal - Ko Willy)
3. Konsultan Perencana (M&E Specifier Tender - Pak Gunawan)
4. End User Pabrik (Head of Maintenance Industri - Mas Dimas)
5. Estimator & QS Tender (Penghitung Biaya & Margin BoQ - Mas Fajar)
6. Teknisi Listrik (Electrician & Panel Wiring Bersertifikat K3 - Mas Bagas)
7. Pekerja Lapangan (Mandor Instalasi Elektrikal - Mas Joko)
8. Purchasing Manager (Head of Procurement - Pak Hendro)
9. HSE & K3 Manager (Keselamatan Kerja & Efisiensi Energi - Ibu Ratna)
10. Otomasi PLC (System Integrator & Automation Specialist - Mas Rian)

ATURAN DOMAIN RESMI PT HOKIINDO RAYA:
- Cek Produk, Harga & Ketersediaan Stok -> https://shop.hokiindo.co.id (PENTING: Cek produk BUKAN di HSO; HSO adalah dashboard sistem operasional internal tim, bukan untuk publik).
- Company Profile, Sertifikat CoO Pabrik, & Surat Dukungan Tender -> https://hokiindo.co.id.

TUGAS:
Evaluasi konten marketing berikut dari sudut pandang 10 persona pasar strategis di atas secara kritis, jujur, objektif, dan berbobot:
1. Berikan skor daya tarik (0-100%).
2. Reaksi singkat (contoh: "Sangat Relevan dengan Proyek Panel", "Menimbang Harga BoQ", "Suka Edukasi Kurva Proteksi").
3. Kutipan respon langsung yang realistis (quote) menggunakan gaya bahasa Indonesia/Jawa khas profesi mereka di lapangan.
4. Action yang dipicu (contoh: "Cek stok di shop.hokiindo.co.id", "Minta surat dukungan di hokiindo.co.id", "Bookmark referensi").
5. Saran konkret perbaikan (suggestedTweak).`

      const userPrompt = `Review konten berikut untuk 10 persona pasar strategis proyek kelistrikan:
JUDUL: "${slot.title}"
HOOK: "${slot.hook}"
NASKAH:
${slot.body}
CTA: "${slot.cta}"
PLATFORM: "${slot.platform}" (${slot.postType})
KATEGORI: "${slot.category}"

DAFTAR 10 PERSONA:
${personaContext}

KEMBALIKAN HANYA JSON MURNI BERIKUT (tanpa markdown codeblock wrapper):
{
  "reviews": [
    {
      "id": "bambang",
      "score": 93,
      "reaction": "Sangat Relevan dengan Proyek Panel",
      "quote": "\"Komentar realistis persona...\"",
      "actionTriggered": "Aksi yang dipicu...",
      "suggestedTweak": "Saran konkret..."
    }
  ],
  "mainCritique": "Saran utama panel penguji...",
  "overallVerdict": "Sangat Memikat & Berdampak Tinggi",
  "tips": "Tips penajaman konten..."
}
Pastikan array "reviews" memuat tepat 10 objek dengan id: "bambang", "willy", "gunawan", "dimas", "fajar", "bagas", "joko", "hendro", "ratna", "rian".`

      const raw = await callSumopodChatCompletions([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 2500)

      let cleaned = raw.trim()
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
      else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()

      const firstBrace = cleaned.indexOf('{')
      const lastBrace = cleaned.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1)
      }

      let parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        parsed = { reviews: parsed }
      }

      const reviews = DEMO_AUDIENCE_PERSONAS.map(persona => {
        const aiMatch = parsed.reviews ? parsed.reviews.find(r => r.id === persona.id) : null
        return {
          ...persona,
          score: aiMatch?.score ? Math.min(100, Math.max(0, Number(aiMatch.score))) : 80,
          reaction: aiMatch?.reaction || 'Cukup Menarik untuk Proyek',
          quote: aiMatch?.quote || `"${persona.whatMatters} perlu ditegaskan lagi dalam naskah."`,
          actionTriggered: aiMatch?.actionTriggered || 'Membaca sekilas informasi',
          suggestedTweak: aiMatch?.suggestedTweak || `Perkuat aspek: ${persona.whatMatters}`
        }
      })

      const avgScore = Math.round(reviews.reduce((acc, r) => acc + r.score, 0) / reviews.length)
      const positiveCount = reviews.filter(r => r.score >= 85).length
      const hesitantCount = reviews.filter(r => r.score >= 70 && r.score < 85).length
      const lowCount = reviews.filter(r => r.score < 70).length

      const contractorAvg = Math.round(reviews.filter(r => r.segment === 'contractor' || r.segment === 'panel_maker').reduce((acc, r) => acc + r.score, 0) / 2)
      const engineeringAvg = Math.round(reviews.filter(r => r.segment === 'consultant' || r.segment === 'estimator').reduce((acc, r) => acc + r.score, 0) / 3)
      const fieldAvg = Math.round(reviews.filter(r => r.segment === 'field' || r.segment === 'end_user').reduce((acc, r) => acc + r.score, 0) / 5)

      const topTarget = [...reviews].sort((a, b) => b.score - a.score)[0]
      const secondTarget = [...reviews].sort((a, b) => b.score - a.score)[1]

      let overallVerdict = parsed.overallVerdict || 'Daya Tarik Tinggi'
      let verdictBadge = 'bg-emerald-600 text-white'
      if (avgScore >= 90) {
        overallVerdict = 'Sangat Memikat & Berdampak Tinggi (High-Converting Magnet)'
        verdictBadge = 'bg-emerald-600 text-white'
      } else if (avgScore >= 80) {
        overallVerdict = 'Bagus & Tepat Sasaran Pasar B2B'
        verdictBadge = 'bg-indigo-600 text-white'
      } else {
        overallVerdict = 'Perlu Penajaman Sudut Pandang Teknis'
        verdictBadge = 'bg-amber-500 text-white'
      }

      const mainCritique = parsed.mainCritique || `Saran Utama Panel: Perkuat penegasan "${topTarget.whatMatters}".`
      const tips = parsed.tips || `Konten ini memiliki resonansi tertinggi pada ${topTarget.name} (${topTarget.role} - ${topTarget.strategicMarket}) dengan skor ${topTarget.score}%.`

      slot.aiAudienceReview = {
        isAiGenerated: true,
        evaluatedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        avgScore,
        positiveCount,
        hesitantCount,
        lowCount,
        segmentBreakdown: {
          contractor: contractorAvg,
          engineering: engineeringAvg,
          field: fieldAvg
        },
        overallVerdict,
        verdictBadge,
        topTarget,
        secondTarget,
        reviews,
        mainCritique,
        tips
      }

      saveWeeklyPlansToStorage()
      aiAudienceReviewSuccess.value = 'Berhasil! 10 Persona Pasar Strategis telah selesai mereview naskah via AI!'
      setTimeout(() => { aiAudienceReviewSuccess.value = '' }, 4000)
    } else {
      const baseline = calculateAudienceBaseline(slot)
      slot.aiAudienceReview = {
        ...baseline,
        isAiGenerated: false,
        evaluatedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      }
      saveWeeklyPlansToStorage()
      aiAudienceReviewSuccess.value = 'Simulator cerdas lokal selesai mengevaluasi 10 pasar strategis.'
      setTimeout(() => { aiAudienceReviewSuccess.value = '' }, 4000)
    }
  } catch (err) {
    console.error('Error running AI Audience Review:', err)
    aiAudienceReviewError.value = `Gagal menjalankan AI Reviewer: ${err.message}`
    setTimeout(() => { aiAudienceReviewError.value = '' }, 5000)
  } finally {
    isReviewingWithAi.value = false
  }
}

function refineSlotOffline(slot, evaluation) {
  // Masukkan poin kepastian secara mengalir dan manusiawi (bukan bulet point kaku)
  const humanAddition = `\n\nCatatan penting buat rekan kontraktor dan panel builder: Semua unit di Hokiindo kita pastiin 100% original dan udah lengkap dengan sertifikat CoO resmi pabrikan. Jadi pas jadwal audit bareng konsultan pengawas, serah terima dijamin mulus tanpa was-was ditolak. Apalagi stoknya selalu kita jaga ready 24 jam di gudang Jabodetabek—butuh sameday delivery langsung jalan.`

  if (!slot.body.includes('Certificate of Origin') && !slot.body.includes('CoO')) {
    slot.body = slot.body.trim() + humanAddition
  }

  // Hook yang natural dan relatable (tanpa label robotik [Solusi Resmi HSO])
  if (slot.hook.startsWith('[Solusi Resmi HSO]:')) {
    slot.hook = slot.hook.replace(/^\[Solusi Resmi HSO\]:\s*/, '').trim()
  }
  if (!slot.hook.includes('?') && !slot.hook.includes('Pernah')) {
    slot.hook = `Pernah ngalamin serah terima proyek terancam molor cuma gara-gara sertifikat breaker? Ini cara amannya biar gak kena penalti denda.`
  }

  // Judul yang natural dan memikat (tidak panjang bertele-tele)
  if (slot.title && slot.title.length > 70) {
    slot.title = 'Kunci Lolos Audit Tender ME: Jangan Sepelekan Sertifikat CoO Breaker'
  }

  // CTA yang santai, bersahabat, dan manusiawi dengan domain yang benar
  slot.cta = 'Mau cek stok dan harga resmi hari ini? Kunjungi toko online kami di shop.hokiindo.co.id, atau konsultasikan kebutuhan tender BoQ proyek di hokiindo.co.id.'
}

async function improveContentFromAudienceFeedback() {
  if (!selectedSlotForCuration.value) return
  isImprovingWithAudience.value = true
  audienceImproveSuccess.value = ''

  const slot = selectedSlotForCuration.value
  const evaluation = evaluateDemoAudience(slot)
  if (!evaluation) {
    isImprovingWithAudience.value = false
    return
  }

  const feedbackList = evaluation.reviews.map(r => `- ${r.name} (${r.role} - ${r.strategicMarket}): "${r.quote}" -> Butuh penegasan: ${r.whatMatters}`).join('\n')

  try {
    if (isApiConfigured.value) {
      const productContext = accurateProducts.value.slice(0, 8).map(p => {
        const data = resolveProductSupportingData(p)
        return `- ${p.item_name} [${p.item_no}]: ${data.baseDesc} (Kategori: ${data.category}, Spesifikasi: ${[data.currentRating, data.poles, data.breakingCapacity, data.tripUnit].filter(Boolean).join(', ')}, Aplikasi: ${data.application})`
      }).join('\n')

      const prompt = `Kamu adalah Antigravity Marketing Engine untuk PT Hokiindo Raya (distributor resmi Siemens & Lampu Industri G-Comin).

ATURAN DOMAIN & RUJUKAN SITUS RESMI PT HOKIINDO RAYA:
1. Cek Produk, Harga & Ketersediaan Stok: Wajib arahkan audiens ke Toko Online Resmi: https://shop.hokiindo.co.id
   (PENTING: Cek produk BUKAN di HSO. HSO adalah dashboard sistem operasional internal tim, bukan untuk publik).
2. Company Profile & Surat Dukungan Tender: Arahkan ke https://hokiindo.co.id.

Kamu memiliki akses ke Database Produk dengan Deskripsi Lengkap:
${productContext}
Kamu sedang meninjau konten marketing berikut yang telah diuji oleh 10 Persona Pasar Strategis Proyek Kelistrikan (Panel Maker, Kontraktor, Konsultan, End User, Estimator, Teknisi Listrik, Pekerja Lapangan, Purchasing, HSE, Otomasi):

JUDUL SAAT INI: "${slot.title}"
HOOK SAAT INI: "${slot.hook}"
NASKAH SAAT INI:
${slot.body}
CTA SAAT INI: "${slot.cta}"

MASUKAN & SARAN PERBAIKAN DARI 10 AUDIENS PASAR STRATEGIS:
${feedbackList}

TUGAS:
Sempurnakan konten di atas dengan gaya penulisan yang SANGAT MANUSIAWI (HUMAN BANGET):
1. Judul: Ringkas, padat, dan memikat (maksimal 10-12 kata). JANGAN panjang bertele-tele seperti brosur.
   Contoh bagus: "Kenapa Breaker Panel Sering Jeglek Pas Komisioning bareng Konsultan?" atau "Kunci Lolos Audit Tender ME: Jangan Remehkan Sertifikat CoO".
2. Hook: Buat kalimat pembuka yang natural, menghentikan scroll pembaca karena sangat relate dengan masalah nyata engineer / purchasing di lapangan. HINDARI format kaku seperti "[Solusi Resmi HSO]" atau "[0-3 Detik]".
3. Naskah (Body): Bercerita (storytelling), hangat, mengalir, dan berbobot teknis. Ceritakan masalah nyata di lapangan, jelaskan solusi teknisnya secara santai, dan tegaskan bahwa PT Hokiindo Raya ready stock 24 jam dengan sertifikat CoO resmi dari pabrikan.
4. Call to Action (CTA): Ramah, bersahabat, ajak cek stok ke shop.hokiindo.co.id atau ajukan BoQ di hokiindo.co.id.
5. Pertahankan gaya bahasa natural human writing khas agen (${slot.agentId}).

OUTPUT HARUS BERUPA JSON MURNI:
{
  "title": "...",
  "hook": "...",
  "body": "...",
  "cta": "...",
  "hashtags": "..."
}`

      const raw = await callSumopodChatCompletions([
        { role: 'system', content: 'Kamu adalah pakar copywriting B2B industri kelistrikan. Kembalikan HANYA JSON murni tanpa markdown wrapper.' },
        { role: 'user', content: prompt }
      ], 2000)

      let cleaned = raw.trim()
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
      else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
      const firstBrace = cleaned.indexOf('{')
      const lastBrace = cleaned.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) cleaned = cleaned.substring(firstBrace, lastBrace + 1)
      const parsed = JSON.parse(cleaned)

      if (parsed.title) slot.title = parsed.title
      if (parsed.hook) slot.hook = parsed.hook
      if (parsed.body) slot.body = parsed.body
      if (parsed.cta) slot.cta = parsed.cta
      if (parsed.hashtags) slot.hashtags = parsed.hashtags

      audienceImproveSuccess.value = `Naskah berhasil disempurnakan oleh ${squadGangName.value} berdasarkan masukan 10 panelis audiens! Buka tab "Naskah & Copywriting" untuk melihat hasilnya.`

      // Re-review otomatis menggunakan AI untuk memperbarui skor dan reaksi
      try {
        await runAiAudienceReview(slot)
      } catch (revErr) {
        console.warn('Auto re-review audience error:', revErr)
      }
    } else {
      refineSlotOffline(slot, evaluation)
      audienceImproveSuccess.value = 'Naskah berhasil disempurnakan dengan Standar Trust Signals HSO (Ready Stock 24 Jam, Dokumen CoO Resmi, & CTA BoQ Tajam)!'
    }

    saveSlotCuration(false)
  } catch (err) {
    console.error('Improve with audience error:', err)
    refineSlotOffline(slot, evaluation)
    audienceImproveSuccess.value = 'Naskah berhasil disempurnakan dengan Standar Keaslian & SLA Stok HSO!'
    saveSlotCuration(false)
  } finally {
    isImprovingWithAudience.value = false
  }
}

const applyIndividualFeedback = (persona) => {
  if (!selectedSlotForCuration.value) return
  const slot = selectedSlotForCuration.value

  let snippet = ''
  if (persona.id === 'bambang') {
    snippet = '\n\n📐 Khusus Panel Builder: Dimensi unit Sentron 3VM sangat kompak menghemat hingga 20% ruang tata letak cubicle switchboard, serta dilengkapi dokumen CoO resmi dari pabrikan untuk kelancaran serah terima proyek.'
  } else if (persona.id === 'willy') {
    snippet = '\n\n🏗️ Dukungan Tender EPC: Dapatkan surat dukungan distributor resmi Siemens & G-Comin di hokiindo.co.id terbit dalam 24 jam untuk memperkuat dokumen penawaran tender lelang Anda.'
  } else if (persona.id === 'gunawan') {
    snippet = '\n\n📋 Standar Spesifikasi Tender: Memenuhi standar internasional IEC 60947-2 (Ics = 100% Icu) dan PUIL 2020 lengkap dengan data sheet teknis resmi Siemens.'
  } else if (persona.id === 'dimas') {
    snippet = '\n\n🔧 Rekomendasi Maintenance Pabrik: Dilengkapi proteksi kurva selektif presisi L-I-S-G untuk mencegah false tripping pada jam beban puncak pabrik Anda.'
  } else if (persona.id === 'fajar') {
    snippet = '\n\n📊 Untuk Estimator & Tim Tender BoQ: Cek katalog lengkap, spesifikasi MLFB, dan harga resmi langsung di shop.hokiindo.co.id untuk kalkulasi anggaran proyek yang akurat tanpa risiko markup terselubung.'
  } else if (persona.id === 'bagas') {
    snippet = '\n\n⚡ Catatan Teknisi Panel & Wiring: Terminal koneksi tembaga dirancang ergonomis mempermudah penarikan busbar serta memangkas waktu wiring di ruang panel.'
  } else if (persona.id === 'joko') {
    snippet = '\n\n🛠️ Catatan Rekayasa & K3 Listrik: Pastikan identifikasi ferrule konduktor sesuai Single Line Diagram dan terapkan prosedur LOTO (Lockout/Tagout) saat instalasi ruang switchboard.'
  } else if (persona.id === 'hendro') {
    snippet = '\n\n💼 Catatan Pengadaan untuk Tim Purchasing: Cek stok live dan pesan mandiri di shop.hokiindo.co.id. Dapatkan diskon volume BoQ dan pengiriman sameday untuk kawasan industri.'
  } else if (persona.id === 'ratna') {
    snippet = '\n\n🌱 Standar K3 & Efisiensi Energi: Menjamin kesesuaian lux SNI dan proteksi arc flash untuk mendukung target Zero Accident dan penghematan biaya listrik pabrik.'
  } else if (persona.id === 'rian') {
    snippet = '\n\n🤖 Integrasi Otomasi & SCADA: Modul Siemens S7-1200 dengan komunikasi PROFINET/Modbus siap terhubung mulus ke sistem monitoring pabrik pintar.'
  } else {
    snippet = `\n\n💡 Catatan Tambahan: Menjawab kebutuhan ${persona.name} (${persona.role}) terkait kepastian kualitas dan layanan prima PT Hokiindo Raya.`
  }

  slot.body += snippet
  saveSlotCuration(false)
  alert(`Masukan dari ${persona.name} (${persona.role}) berhasil disematkan ke naskah!`)
}

// ==========================================
// 8. LOGIKA MEJA KERJA DETAIL KONTEN & DESAIN (INLINE / TANPA MODAL)
// ==========================================
const currentSlotIndex = computed(() => {
  if (!selectedSlotForCuration.value) return -1
  const slots = currentWeekSlots.value
  return slots.findIndex(s => s.id === selectedSlotForCuration.value.id)
})

const hasPreviousSlot = computed(() => currentSlotIndex.value > 0)
const hasNextSlot = computed(() => currentSlotIndex.value !== -1 && currentSlotIndex.value < currentWeekSlots.value.length - 1)

const openSlotDetail = (slot, initialTab = 'design') => {
  const cloned = JSON.parse(JSON.stringify(slot))
  humanizeSlot(cloned)
  selectedSlotForCuration.value = cloned
  curationActiveTab.value = initialTab
  // Scroll to top of workspace
  window.scrollTo({ top: 200, behavior: 'smooth' })
}

const closeSlotDetail = () => {
  selectedSlotForCuration.value = null
}

const goToPreviousSlot = () => {
  if (currentSlotIndex.value > 0) {
    saveSlotCuration(false)
    const prev = currentWeekSlots.value[currentSlotIndex.value - 1]
    const cloned = JSON.parse(JSON.stringify(prev))
    humanizeSlot(cloned)
    selectedSlotForCuration.value = cloned
    window.scrollTo({ top: 200, behavior: 'smooth' })
  }
}

const goToNextSlot = () => {
  if (currentSlotIndex.value < currentWeekSlots.value.length - 1) {
    saveSlotCuration(false)
    const next = currentWeekSlots.value[currentSlotIndex.value + 1]
    const cloned = JSON.parse(JSON.stringify(next))
    humanizeSlot(cloned)
    selectedSlotForCuration.value = cloned
    window.scrollTo({ top: 200, behavior: 'smooth' })
  }
}

const saveSlotCuration = (closeAfter = true) => {
  if (!selectedSlotForCuration.value) return
  const mondayStr = currentWeekMondayStr.value
  const slots = weeklyPlansMap.value[mondayStr] || []
  const idx = slots.findIndex(s => s.id === selectedSlotForCuration.value.id)
  if (idx !== -1) {
    slots[idx] = {
      ...selectedSlotForCuration.value,
      curationStatus: 'approved'
    }
    weeklyPlansMap.value[mondayStr] = [...slots]
    saveWeeklyPlansToStorage()
  }
  if (closeAfter) {
    selectedSlotForCuration.value = null
  }
}

const saveAndGoToNextSlot = () => {
  if (hasNextSlot.value) {
    saveSlotCuration(false)
    goToNextSlot()
  } else {
    saveSlotCuration(true)
  }
}

// Backward compatibility alias
const openCurationModal = openSlotDetail

const toggleSlotStatus = (slot, newStatus) => {
  slot.curationStatus = slot.curationStatus === newStatus ? 'pending' : newStatus
  saveWeeklyPlansToStorage()
}

const approveAllFilteredSlots = () => {
  const mondayStr = currentWeekMondayStr.value
  const slots = weeklyPlansMap.value[mondayStr] || []
  slots.forEach(s => {
    if (s.curationStatus !== 'rejected') {
      s.curationStatus = 'approved'
    }
  })
  weeklyPlansMap.value[mondayStr] = [...slots]
  saveWeeklyPlansToStorage()
}

const handleSlotImageUpload = (e) => {
  const file = e.target.files?.[0]
  if (!file || !selectedSlotForCuration.value) return
  selectedSlotForCuration.value.uploadedImagePreview = URL.createObjectURL(file)
}

const removeSlotImage = () => {
  if (!selectedSlotForCuration.value) return
  selectedSlotForCuration.value.uploadedImagePreview = ''
}

const copyHex = (hex) => {
  if (!hex) return
  navigator.clipboard.writeText(hex)
  copiedHexCode.value = hex
  setTimeout(() => {
    if (copiedHexCode.value === hex) copiedHexCode.value = ''
  }, 2000)
}

const copyPromptText = (prompt) => {
  if (!prompt) return
  navigator.clipboard.writeText(prompt)
  alert('Prompt AI Gambar berhasil disalin! Tempel di Midjourney / Canva Magic / DALL-E.')
}

// ==========================================
// 9. PENERBITAN KE KALENDER HSO
// ==========================================
const publishActiveWeekSlots = async () => {
  const targetPool = currentWeekSlots.value.filter(s => s.curationStatus === 'approved')

  if (targetPool.length === 0) {
    alert('Tidak ada slot yang berstatus "Disetujui" pada pekan ini. Silakan klik "Setujui" pada slot yang ingin dijadwalkan.')
    return
  }

  isBatchPublishing.value = true
  batchPublishSuccess.value = ''

  try {
    const payloads = targetPool.map(slot => {
      let desc = `${slot.hook}\n\n${slot.body}`
      if (slot.cta) desc += `\n\n📌 CALL TO ACTION:\n${slot.cta}`
      if (slot.hashtags) desc += `\n\n${slot.hashtags}`
      if (slot.designGuide) {
        desc += `\n\n🎨 PANDUAN DESAIN GRAFIS:\n- Format: ${slot.designGuide.dimensions}\n- Headline Gambar: "${slot.designGuide.headlineOverlay}"\n- Komposisi: ${slot.designGuide.compositionDetails}`
      }
      if (slot.externalImageUrl) desc += `\n\n🖼️ Link Gambar Referensi: ${slot.externalImageUrl}`

      const agentObj = SQUAD_AGENTS.find(a => a.id === slot.agentId)
      const agentName = agentObj ? agentObj.name : squadGangName.value

      return {
        platforms: [slot.platform],
        platform: slot.platform,
        title: slot.title.trim(),
        description: desc.trim(),
        tags: [`Pekan ${currentWeekNumber.value}`, agentName, slot.category.toUpperCase()],
        submitted_by: props.currentUser || 'manager@hokiindo.com',
        status: 'scheduled',
        target_date: slot.dateStr
      }
    })

    const { data, error } = await supabase.from('marketing_ideas').insert(payloads).select()
    if (error) throw error

    batchPublishSuccess.value = `Alhamdulillah! Sebanyak ${targetPool.length} konten untuk pekan ${formatShortDate(currentWeekMondayStr.value)} berhasil dijadwalkan ke Kalender Konten HSO!`
    emit('idea-created', data)

  } catch (err) {
    console.error('Publish active week error:', err)
    alert(`Gagal menyimpan ke database: ${err.message}`)
  } finally {
    isBatchPublishing.value = false
  }
}

onMounted(async () => {
  loadWeeklyPlansFromStorage()
  initOrLoadActiveWeek()

  // Auto-sync Kunci AI Tim dari Database jika ada
  if (!sumopodApiKey.value.trim()) {
    try {
      const { data } = await supabase
        .from('converter_custom_rules')
        .select('*')
        .eq('siemens_mlfb', '__SYSTEM_AI_CONFIG__')
        .maybeSingle()
      if (data?.spec_match_notes) {
        const val = JSON.parse(data.spec_match_notes)
        if (val.apiKey) {
          sumopodApiKey.value = val.apiKey
          localStorage.setItem('hso_sumopod_api_key', val.apiKey)
          if (val.baseUrl) {
            sumopodBaseUrl.value = val.baseUrl
            localStorage.setItem('hso_sumopod_base_url', val.baseUrl)
          }
          if (val.model) {
            sumopodModel.value = val.model
            localStorage.setItem('hso_sumopod_model', val.model)
          }
        }
      }
    } catch {}
  }
})

// =========================================================================
// 4 PILAR BANK DATA & INTELIJEN RESMI PT HOKIINDO RAYA
// (1. Situs Sendiri, 2. Artikel Teknik, 3. Dokumen PDF, 4. Database Produk)
// =========================================================================

// --- PILAR 1: SITUS SENDIRI & HALAMAN WEB ---
const DEFAULT_HSO_WEBSITES = [
  {
    id: 'web_shop',
    title: 'Toko Online Resmi & Cek Stok Produk PT Hokiindo Raya',
    url: 'https://shop.hokiindo.co.id',
    category: 'Toko Online & Cek Produk',
    description: 'Pusat belanja online dan pengecekan produk, harga transparan, dan stok live komponen elektrikal Siemens dan lampu industri G-Comin. Tempat pelanggan, kontraktor, dan panel builder mengecek part number MLFB dan memesan langsung.',
    highlights: [
      'Cek stok live dan harga resmi komponen Siemens (MCCB Sentron 3VM/3VA, MCB 5SL, Contactor Sirius 3RT, ACB 3WL)',
      'Katalog lampu industri G-Comin (High Bay LED UFO IP66, Floodlight, PJU Solar Cell)',
      'Download datasheet teknis dan brosur produk resmi',
      'Pemesanan online cepat dengan pengiriman sameday area industri'
    ]
  },
  {
    id: 'web_compro',
    title: 'Website Resmi PT Hokiindo Raya (Company Profile)',
    url: 'https://hokiindo.co.id',
    category: 'Company Profile & Distributor Resmi',
    description: 'Portal profil korporat resmi PT Hokiindo Raya sebagai authorized distributor & stockist terkemuka komponen Siemens Indonesia dan Lampu Industri G-Comin. Melayani kontraktor EPC, panel builder switchboard, pabrik industri, dan pengadaan B2B tender.',
    highlights: [
      'Authorized Distributor Resmi Siemens Indonesia & Lampu G-Comin',
      'Jaminan 100% Keaslian Produk & Penerbitan Sertifikat Certificate of Origin (CoO) resmi pabrikan',
      'Layanan Surat Dukungan Distributor Resmi (Letter of Support) untuk tender B2B / B2G',
      'Tim engineering berpengalaman untuk asistensi BoQ proyek dan konsultasi spesifikasi'
    ]
  },
  {
    id: 'web_shop_siemens',
    title: 'Katalog Belanja Siemens di Toko Online Hokiindo',
    url: 'https://shop.hokiindo.co.id/category/siemens',
    category: 'Katalog Toko Siemens',
    description: 'Halaman kategori belanja resmi komponen kelistrikan Siemens: Sentron (3VM, 3VA, 3WL), Sirius (3RT, 3RU, 3RW), Simatic PLC (S7-1200), dan Sinamics Inverter.',
    highlights: [
      'Pencarian berdasarkan part number MLFB resmi pabrikan',
      'Informasi ketersediaan stok gudang 24 jam dan harga transparan'
    ]
  },
  {
    id: 'web_shop_gcomin',
    title: 'Katalog Belanja Lampu Industri G-Comin di Toko Online Hokiindo',
    url: 'https://shop.hokiindo.co.id/category/g-comin',
    category: 'Katalog Toko G-Comin',
    description: 'Halaman belanja resmi lampu hemat energi industri G-Comin: High Bay LED UFO IP66 tahan panas 50°C, Floodlight sorot outdoor, dan PJU Solar Cell.',
    highlights: [
      'Efikasi tinggi hingga 160 lm/W dengan garansi distributor 5 tahun',
      'Layanan perhitungan Dialux & audit lux gratis sesuai SNI 03-6575'
    ]
  },
  {
    id: 'web_contact',
    title: 'Kontak Fast Response & Pengajuan Tender BoQ PT Hokiindo Raya',
    url: 'https://hokiindo.co.id/contact',
    category: 'Kontak & Layanan Tender',
    description: 'Saluran komunikasi resmi untuk pengajuan BoQ tender proyek, konsultasi teknis engineer, dan respon cepat tim sales PT Hokiindo Raya.',
    highlights: [
      'WhatsApp Business tim sales & email resmi sales@hokiindo.co.id',
      'Respon cepat penawaran harga BoQ dalam hitungan jam'
    ]
  }
]

// --- PILAR 2: ARTIKEL TEKNIK & STUDI KASUS KELISTRIKAN ---
const DEFAULT_HSO_ARTICLES = [
  {
    id: 'art_1',
    title: 'Memahami Perbedaan Icu dan Ics pada Breaker: Mengapa Ics = 100% Icu Sangat Krusial bagi Pabrik 24/7',
    author: 'Tim Engineering PT Hokiindo Raya (Ref: IEC 60947-2)',
    category: 'Standar Proteksi Siemens',
    summary: 'Banyak kontraktor menyamakan Icu (Ultimate Breaking Capacity) dengan Ics (Service Breaking Capacity). Pada breaker ekonomis, Ics sering hanya 50% dari Icu, yang berarti breaker berisiko rusak setelah sekali memutus arus short-circuit. Siemens Sentron 3VM dan 3VA menjamin Ics = 100% Icu, sehingga aman digunakan kembali tanpa merusak switchboard utama.',
    keyInsights: [
      'Icu adalah batas kemampuan ekstrem pemutusan, sedangkan Ics adalah jaminan pemutusan berulang tanpa penurunan isolasi.',
      'Siemens Sentron 3VM/3VA memiliki ruang pemadam busur api (arc chute) berlapis ganda berpaten.',
      'Mencegah downtime tak terduga dan mengurangi pengeluaran penggantian breaker berulang di pabrik.'
    ],
    tags: ['IEC 60947-2', 'Siemens Sentron', 'Icu vs Ics', 'MCCB']
  },
  {
    id: 'art_2',
    title: 'Pedoman PUIL 2020: Standar Selektivitas Breaker Hulu-Hilir Mencegah Blackout Total',
    author: 'Konsultan Kelistrikan HSO (Ref: PUIL 2020 Bagian 5-53)',
    category: 'Regulasi PUIL & Standar Nasional',
    summary: 'Panduan koordinasi proteksi kaskade (cascading) dan diskriminasi selektif antara Air Circuit Breaker (ACB) di panel utama LVMDP dengan MCCB di sub-panel. Dengan kurva L-I-S-G elektronik pada ETU Siemens Sentron, hanya breaker cabang yang trip ketika terjadi hubung singkat, sementara jalur produksi lainnya tetap beroperasi normal.',
    keyInsights: [
      'Pengaturan Electronic Trip Unit (ETU) ETU300/ETU600 pada ACB 3WA/3WL.',
      'Diskriminasi waktu treshold (time-current delay) mencegah main ACB hulu padam total.',
      'Memenuhi persyaratan sertifikat laik operasi (SLO) kelistrikan gedung komersial & industri.'
    ],
    tags: ['PUIL 2020', 'Selektivitas Proteksi', 'ACB 3WA', 'LVMDP']
  },
  {
    id: 'art_3',
    title: 'Kompensasi Daya Reaktif & Mitigasi Harmonisa Beban Non-Linear pada Main Distribution Panel (MDP)',
    author: 'Divisi Power Quality & Industrial Applications PT Hokiindo Raya',
    category: 'Kualitas Daya & Harmonisa',
    summary: 'Analisis pengaruh beban inverter VFD dan rectifier terhadap kenaikan suhu transformator daya dan distorsi tegangan (THD-V). Penggunaan Digital Power Meter Siemens SENTRON PAC3200/4200 dengan akurasi Class 0.5S sesuai IEC 62053-22 memungkinkan identifikasi harmonisa orde ke-5, 7, dan 11 secara presisi untuk perancangan detuned capacitor bank.',
    keyInsights: [
      'Analisis spektrum harmonisa FFT (Fast Fourier Transform) hingga orde ke-31.',
      'Menjaga faktor daya (Power Factor / Cos Phi) di atas 0.95 untuk menghindari denda kVARh PLN.',
      'Menurunkan rugi tembaga dan kenaikan temperatur eddy current pada transformator distribusi.'
    ],
    tags: ['SENTRON PAC', 'IEC 62053-22', 'THD Harmonisa', 'Kualitas Daya']
  },
  {
    id: 'art_4',
    title: 'Studi Kasus Pabrik Makanan Cikarang: Reduksi False Tripping Pompa Chiller dengan Siemens Sirius 3RT2 & 3RU21',
    author: 'Field Case Study HSO Engineering',
    category: 'Studi Kasus Proyek B2B',
    summary: 'Pompa sirkulasi pendingin pada lini produksi susu sering mengalami trip mendadak pada jam 14.00 akibat fluktuasi beban dan panas ruang panel 42C. Penggantian starter dengan Siemens Sirius Ukuran S0/S2 yang dilengkapi kompensasi temperatur bimetal mengeliminasi downtime 100% selama 6 bulan pengujian.',
    keyInsights: [
      'Karakteristik Trip Class 10 untuk beban inrush motor standar AC-3.',
      'Kontak paduan perak oksida tahan jutaan siklus switching tanpa sticking atau aus.',
      'Penghematan biaya risiko kerusakan batch produk senilai ratusan juta rupiah.'
    ],
    tags: ['Studi Kasus Cikarang', 'Siemens Sirius', 'Kontaktor 3RT2', 'Motor Protection']
  },
  {
    id: 'art_5',
    title: 'Panduan Praktis Integrasi PLC Siemens S7-1200 dengan Smart Power Meter Sentron PAC melalui PROFINET',
    author: 'Divisi Automasi & IoT HSO',
    category: 'Automasi & Industri 4.0',
    summary: 'Langkah konfigurasi perangkat keras di TIA Portal V18 untuk membaca data Total Harmonic Distortion (THD), konsumsi kWh, dan tegangan fasa secara real-time dari meter Siemens Sentron PAC3200 langsung ke dashboard SCADA manajemen energi pabrik.',
    keyInsights: [
      'Protokol komunikasi terbuka PROFINET dan Modbus TCP tanpa modul konverter gateway tambahan.',
      'Pemantauan faktor daya (cos phi) untuk menghindari denda kelebihan daya reaktif (kVARh) dari PLN.',
      'Integrasi sistem alarm otomatis via notifikasi instan saat beban mendekati batas trip.'
    ],
    tags: ['Siemens S7-1200', 'TIA Portal', 'Energy Management', 'PROFINET']
  }
]

// --- PILAR 3: DOKUMEN PDF PRODUK, BROSUR & DATASHEET ---
const DEFAULT_HSO_PDFS = [
  {
    id: 'pdf_1',
    title: 'Katalog Lengkap Siemens Low Voltage Distribution & Control (Sentron & Sirius) - Ed. 2026',
    brand: 'SIEMENS',
    category: 'Katalog Utama Low Voltage',
    code: 'IC10-2026-LV',
    url: 'https://hokiindo.com/downloads/catalogs/siemens-sentron-sirius-complete-catalog-2026.pdf',
    size: '34.8 MB',
    version: 'Edisi Resmi 2026',
    specsSummary: [
      'Daftar lengkap 5SL/5SY MCB, 3VA/3VM MCCB, 3WA/3WL ACB, kontaktor 3RT2, overload 3RU21',
      'Dimensi fisik cad, tabel koordinasi selektivitas, cascading, dan aksesoris aux/shunt',
      'Sertifikasi standar internasional IEC 60947, UL, dan SNI'
    ]
  },
  {
    id: 'pdf_2',
    title: 'Datasheet Teknis Siemens Sentron 3VM Moulded Case Circuit Breaker (PDF)',
    brand: 'SIEMENS',
    category: 'MCCB',
    code: 'DS-3VM-100-630A',
    url: 'https://hokiindo.com/downloads/datasheets/siemens-sentron-3vm-datasheet.pdf',
    size: '4.2 MB',
    version: 'Rev 3.2',
    specsSummary: [
      'Rentang arus nominal: 16A hingga 630A, pilihan 3 Pole & 4 Pole',
      'Breaking capacity Icu: 16kA, 25kA, 36kA, 55kA pada 415V AC (Ics = 100% Icu)',
      'Trip Unit: Thermal-Magnetic TM210 (Fixed/Fixed) & TM220 (Adjustable/Fixed)',
      'Dimensi cubicle kompak menghemat ruang panel switchboard hingga 20%'
    ]
  },
  {
    id: 'pdf_3',
    title: 'Datasheet Teknis Siemens Air Circuit Breaker SENTRON 3WA (Smart ACB) (PDF)',
    brand: 'SIEMENS',
    category: 'ACB',
    code: 'DS-3WA-630-6300A',
    url: 'https://hokiindo.com/downloads/datasheets/siemens-sentron-3wa-smart-acb.pdf',
    size: '12.5 MB',
    version: 'Edisi 2026',
    specsSummary: [
      'Kapasitas arus: 630A hingga 6300A (Frame Size 1, Size 2, Size 3)',
      'Short-circuit breaking capacity hingga 150kA, fixed & drawout type',
      'Electronic Trip Unit ETU600 dengan proteksi L-I-S-G dan integrasi Ethernet/PROFINET bawaan'
    ]
  },
  {
    id: 'pdf_4',
    title: 'Brosur Spesifikasi G-Comin Industrial High Bay LED IP66 Series (100W-250W) (PDF)',
    brand: 'G-COMIN',
    category: 'Industrial Lighting',
    code: 'BR-GCM-HB-IP66',
    url: 'https://hokiindo.com/downloads/brochures/gcomin-high-bay-led-series-brochure.pdf',
    size: '6.1 MB',
    version: 'Versi Industri',
    specsSummary: [
      'Pilihan daya: 100W, 150W, 200W, 240W dengan efikasi 150-160 lm/W',
      'Bodi aluminium die-cast ADC12 berdaya hantar panas tinggi dengan IP66 & IK08',
      'Driver Sosen/Meanwell dengan proteksi petir Surge Protection 6kV dan garansi 5 tahun'
    ]
  },
  {
    id: 'pdf_5',
    title: 'Manual Wiring & Instalasi Siemens SIRIUS 3RT2 Contactor & 3RU Overload (PDF)',
    brand: 'SIEMENS',
    category: 'Industrial Control',
    code: 'MN-SIRIUS-3RT2-3RU',
    url: 'https://hokiindo.com/downloads/manuals/siemens-sirius-modular-system-manual.pdf',
    size: '8.4 MB',
    version: 'Manual Resmi',
    specsSummary: [
      'Panduan koneksi terminal screw & spring-loaded untuk ketahanan getaran',
      'Kurva trip proteksi Class 10 untuk motor induksi 3-fasa standar',
      'Pilihan voltase koil 24V DC, 110V AC, 230V AC, 400V AC'
    ]
  }
]

// --- PILAR 4: DATABASE PRODUK HSO DENGAN DESKRIPSI LENGKAP ---
const DEFAULT_HSO_PRODUCTS = [
  {
    id: 'prod_1',
    item_no: '3VM1110-3EE32-0AA0',
    item_name: 'Siemens Sentron 3VM11 MCCB 3P 100A 25kA',
    brand: 'SIEMENS',
    category: 'MCCB',
    stock_status: 'READY',
    stock_quantity: 140,
    unit_price: 1350000,
    description: 'Moulded Case Circuit Breaker (MCCB) Siemens Sentron 3VM11, 3 Pole, Arus Nominal 100A, Breaking Capacity Icu 25kA pada 415V AC (Ics = 100% Icu).',
    long_description: 'Moulded Case Circuit Breaker (MCCB) Siemens Sentron 3VM11, 3 Pole, Arus Nominal 100A, Breaking Capacity Icu 25kA pada 415V AC (Ics = 100% Icu). Dilengkapi Trip Unit Thermal-Magnetic TM220 dengan setelan proteksi beban lebih yang dapat diatur (Ir = 70A - 100A) dan proteksi hubung singkat instan tetap (Ii = 1000A). Desain sangat ramping dan kompak, menghemat ruang panel hingga 20%, dirancang khusus untuk distribusi daya fasilitas pabrik, gedung bertingkat, dan sub-distribution panel perumahan industri berstandar IEC 60947-2. Bersertifikat CoO resmi dan garansi distributor resmi PT Hokiindo Raya.',
    specs: { poles: '3P', current: '100A', breakingCapacity: '25kA', tripUnit: 'TM220 (Adjustable)' },
    datasheet: 'https://hokiindo.com/downloads/datasheets/siemens-sentron-3vm-datasheet.pdf'
  },
  {
    id: 'prod_2',
    item_no: '3VM1225-4EE32-0AA0',
    item_name: 'Siemens Sentron 3VM12 MCCB 3P 250A 36kA',
    brand: 'SIEMENS',
    category: 'MCCB',
    stock_status: 'READY',
    stock_quantity: 85,
    unit_price: 2950000,
    description: 'Siemens Sentron 3VM12 MCCB 3 Pole, Rating 250A, Breaking Capacity 36kA pada 415V AC (Ics = 100% Icu).',
    long_description: 'Siemens Sentron 3VM12 MCCB 3 Pole, Rating 250A, Breaking Capacity 36kA pada 415V AC. Memiliki trip unit TM220 dengan setelan termal fleksibel (Ir = 175A - 250A) dan proteksi magnetik hubung singkat (Ii = 2500A). Menggunakan teknologi pemadam busur api mutakhir untuk memperpanjang usia mekanis dan elektrikal kontaktor. Sangat ideal sebagai main incomer sub-panel distribusi motor dan beban berat industri.',
    specs: { poles: '3P', current: '250A', breakingCapacity: '36kA', tripUnit: 'TM220' },
    datasheet: 'https://hokiindo.com/downloads/datasheets/siemens-sentron-3vm-datasheet.pdf'
  },
  {
    id: 'prod_3',
    item_no: '3WA1116-2EB32-0AA0',
    item_name: 'Siemens SENTRON 3WA1 Smart ACB 3P 1600A 66kA Fixed',
    brand: 'SIEMENS',
    category: 'ACB',
    stock_status: 'READY',
    stock_quantity: 12,
    unit_price: 58000000,
    description: 'Air Circuit Breaker (ACB) generasi terbaru Siemens SENTRON 3WA1, Frame Size 1, 3 Pole, Arus Pengenal 1600A, Breaking Capacity 66kA pada 500V AC.',
    long_description: 'Air Circuit Breaker (ACB) generasi terbaru Siemens SENTRON 3WA1, Frame Size 1, 3 Pole, Arus Pengenal 1600A, Short-Circuit Breaking Capacity 66kA pada 500V AC. Dilengkapi Electronic Trip Unit ETU300 L-I-S-G dengan proteksi beban lebih (Overload), hubung singkat seketika (Instantaneous), hubung singkat tertunda (Short-time Delay) untuk selektivitas penuh, serta proteksi gangguan tanah (Ground Fault). Dilengkapi auxiliary switch, charging motor 230V AC, shunt trip, dan sertifikat uji tipe KEMA/IEC 60947-2.',
    specs: { poles: '3P', current: '1600A', breakingCapacity: '66kA', tripUnit: 'ETU300 (L-I-S-G)' },
    datasheet: 'https://hokiindo.com/downloads/datasheets/siemens-sentron-3wa-smart-acb.pdf'
  },
  {
    id: 'prod_4',
    item_no: '3RT2026-1AP00',
    item_name: 'Siemens SIRIUS Power Contactor 3RT2026 25A 11kW 230V AC Size S0',
    brand: 'SIEMENS',
    category: 'CONTACTOR',
    stock_status: 'READY',
    stock_quantity: 350,
    unit_price: 680000,
    description: 'Magnetic Power Contactor Siemens SIRIUS 3RT2026 Ukuran S0, 3 Pole untuk beban motor induksi 3-fasa hingga 11kW (25A AC-3 pada 400V).',
    long_description: 'Magnetic Power Contactor Siemens SIRIUS 3RT2026 Ukuran S0, 3 Pole untuk beban motor induksi 3-fasa hingga 11kW (25A AC-3 pada 400V). Voltase koil penggerak 230V AC 50/60Hz dengan kontak bantu internal 1NO + 1NC. Konstruksi modular plug-in memungkinkan pemasangan aksesoris tanpa alat khusus, tahan hingga 10 juta kali siklus mekanis, dan tahan terhadap getaran mesin manufaktur berstandar IEC 60947-4-1.',
    specs: { poles: '3P', current: '25A (11kW)', coil: '230V AC', size: 'S0' },
    datasheet: 'https://hokiindo.com/downloads/manuals/siemens-sirius-modular-system-manual.pdf'
  },
  {
    id: 'prod_5',
    item_no: '3RU2126-4BB0',
    item_name: 'Siemens SIRIUS Thermal Overload Relay 3RU2126 (14A - 20A) Size S0',
    brand: 'SIEMENS',
    category: 'TOR',
    stock_status: 'READY',
    stock_quantity: 210,
    unit_price: 490000,
    description: 'Relay Overload Termal Siemens SIRIUS 3RU2126 untuk proteksi beban lebih motor induksi 3-fasa dengan rentang setelan arus 14A hingga 20A.',
    long_description: 'Relay Overload Termal Siemens SIRIUS 3RU2126 untuk proteksi beban lebih motor induksi 3-fasa dengan rentang setelan arus 14A hingga 20A. Trip Class 10 dengan fitur kompensasi suhu ruangan (-40C hingga +70C) dan sensitivitas fasa hilang (Phase Loss Protection). Pemasangan langsung menancap (direct mounting) di bawah kontaktor 3RT202 Size S0 tanpa memerlukan jumper tembaga tambahan.',
    specs: { range: '14A - 20A', tripClass: 'Class 10', mounting: 'Direct to 3RT202' },
    datasheet: 'https://hokiindo.com/downloads/manuals/siemens-sirius-modular-system-manual.pdf'
  },
  {
    id: 'prod_6',
    item_no: 'GCM-HB-150W-IP66',
    item_name: 'G-Comin Industrial High Bay LED UFO IP66 150W 150lm/W',
    brand: 'G-COMIN',
    category: 'LIGHTING',
    stock_status: 'READY',
    stock_quantity: 500,
    unit_price: 1150000,
    description: 'Lampu High Bay Industri G-Comin 150 Watt dengan efikasi pencahayaan tinggi 150 Lumen per Watt (Total 22.500 Lumens, 5700K Daylight).',
    long_description: 'Lampu High Bay Industri G-Comin 150 Watt dengan efikasi pencahayaan tinggi 150 Lumen per Watt (Total Output: 22.500 Lumens, Color Temperature 5700K Daylight). Menggunakan chip LED Lumileds / Bridgelux premium dan Driver Sosen/Meanwell bersertifikat dengan proteksi lonjakan petir 6kV. Bodi terbuat dari aluminium die-cast ADC12 berdaya hantar panas tinggi dengan proteksi IP66 kedap debu dan air bertekanan serta sertifikasi anti benturan IK08. Garansi resmi 5 tahun dari PT Hokiindo Raya.',
    specs: { power: '150W', efficacy: '150 lm/W', lumens: '22,500 lm', protection: 'IP66 / IK08' },
    datasheet: 'https://hokiindo.com/downloads/brochures/gcomin-high-bay-led-series-brochure.pdf'
  },
  {
    id: 'prod_7',
    item_no: '5SL6116-7',
    item_name: 'Siemens SENTRON 5SL6 MCB 1P 16A 6kA C-Curve',
    brand: 'SIEMENS',
    category: 'MCB',
    stock_status: 'READY',
    stock_quantity: 2400,
    unit_price: 68000,
    description: 'Miniature Circuit Breaker (MCB) Siemens Sentron 5SL6, 1 Pole, 16 Ampere, Kurva C, Breaking Capacity 6kA sesuai IEC 60898-1.',
    long_description: 'Miniature Circuit Breaker (MCB) Siemens Sentron 5SL6, 1 Pole, 16 Ampere, Kurva C (Tripping 5-10x In), Breaking Capacity 6kA sesuai IEC 60898-1. Terminal koneksi ergonomis dengan perlindungan sentuh IP20, mudah dipasang pada rel DIN standar 35mm. Ideal untuk proteksi sirkit cabang penerangan dan stop kontak gedung industri, perkantoran, dan komersial.',
    specs: { poles: '1P', current: '16A', breakingCapacity: '6kA', curve: 'C-Curve' },
    datasheet: 'https://hokiindo.com/downloads/catalogs/siemens-sentron-sirius-complete-catalog-2026.pdf'
  }
]

// --- PILAR 5: BANK KONTEN REFERENSI & INSPIRASI SERUPA (FORMULA SUKSES) ---
const DEFAULT_HSO_CONTENT_REFERENCES = [
  {
    id: 'ref_1',
    title: 'Studi Kasus Lolos Audit Tender CoO Siemens (B2B LinkedIn)',
    platform: 'LinkedIn',
    category: 'Studi Kasus Tender',
    whyItWorks: 'Formula Problem-Agitate-Solve: Angkat risiko denda riil finansial B2B, berikan solusi spesifik (sertifikat CoO resmi + jaminan distributor 24 jam), diakhiri kepastian kelancaran termin pembayaran.',
    contentText: 'Panel maker asal Cikarang hampir kena penalti Rp 120 juta karena sertifikat keaslian MCCB-nya diragukan konsultan pengawas saat audit serah terima. Mereka butuh bukti keaslian dalam waktu 24 jam sebelum jatuh tempo penalti harian. Tim PT Hokiindo Raya langsung menerbitkan Certificate of Origin (CoO) resmi prinsipal Siemens beserta surat jaminan keaslian distributor 24 jam. Hasilnya: audit lolos tanpa catatan, BAST ditandatangani, dan termin pembayaran cair penuh.',
    sourceUrl: 'https://linkedin.com/posts/hokiindo-case-study-coo'
  },
  {
    id: 'ref_2',
    title: 'Edukasi Teknis: Kenapa Breaker Suka Jeglek Saat Motor Start? (Reels 30 Detik)',
    platform: 'Instagram / Reels',
    category: 'Hook Cepat Edukasi',
    whyItWorks: 'Hook provokatif langsung menyentuh frustrasi teknisi lapangan ("Jangan salahin PLN dulu") + Analogi lonjakan inrush 6-8x In sederhana + Solusi tepat kurva Siemens Sentron TM220 / Sirius 3RV.',
    contentText: 'Jangan salahin PLN dulu! Kalau MCB atau MCCB sering jeglek pas mesin kompresor atau pompa nyala, masalahnya bukan di ampere yang kurang, tapi arus inrush motor yang bisa lonjak 6 sampai 8 kali lipat saat start. Kalau pakai breaker standar kurva biasa tanpa setelan penundaan, pasti tripping. Solusinya: gunakan MCCB Siemens Sentron dengan adjustable trip unit TM220 atau proteksi motor starter SIRIUS!',
    sourceUrl: 'https://instagram.com/reels/hokiindo-edukasi-inrush'
  },
  {
    id: 'ref_3',
    title: 'Analisis Tekno-Ekonomi Retrofit Cradle ACB Siemens Sentron 3WL (Carousel 5 Slide)',
    platform: 'Instagram / LinkedIn',
    category: 'Rekayasa Tekno-Ekonomi & TCO',
    whyItWorks: 'Visualisasi perbandingan Capex/Opex konkret + Analisis penghematan waktu shutdown pabrik dari 7 hari menjadi 6 jam + Rekomendasi audit teknis switchgear tanpa komitmen.',
    contentText: 'Slide 1: Ganti total kubikel switchgear Rp 800 Juta atau Retrofit Cradle ACB Siemens Sentron 3WL hanya Rp 180 Juta? Mari bedah datanya.\nSlide 2: Dilema ACB lawas: sparepart langka, kontak aus, dan risiko kegagalan pemutusan short-circuit.\nSlide 3: Solusi Retrofit: Memasang moving part Siemens 3WL pada kerangka eksisting tanpa modifikasi busbar utama.\nSlide 4: Peningkatan keandalan proteksi mikroprosesor ETU dengan komunikasi Modbus TCP/PROFINET.\nSlide 5: Jadwalkan inspeksi teknis kelistrikan bersama engineer PT Hokiindo Raya di hokiindo.co.id.',
    sourceUrl: 'https://linkedin.com/posts/hokiindo-retrofit-acb-study'
  },
  {
    id: 'ref_4',
    title: 'Evaluasi Kegagalan Breaker Non-Standar Saat Uji Beban Penuh (Field Case Review)',
    platform: 'LinkedIn / Website',
    category: 'Studi Kasus Keandalan Sistem',
    whyItWorks: 'Analisis kegagalan teknis faktual yang dihadapi konsultan & kontraktor saat FAT/SAT + Penjelasan ilmiah kenaikan temperatur I²R akibat resistansi kontak tinggi + Solusi jaminan keaslian CoO pabrikan.',
    contentText: 'Saat uji komisioning daya penuh di depan konsultan pengawas, breaker non-standar mengalami kenaikan suhu abnormal hingga 135°C pada arus beban 75% akibat resistansi kontak melebihi 100 µΩ. Hal ini mengakibatkan pembongkaran kubikel dan penundaan serah terima BAST. Pemutus sirkuit adalah benteng proteksi utama aset industri. Pastikan selalu menggunakan Siemens Sentron resmi dari PT Hokiindo Raya — terverifikasi Certificate of Origin (CoO) pabrikan resmi untuk jaminan kepatuhan audit standar IEC 60947-2.',
    sourceUrl: 'https://linkedin.com/posts/hokiindo-breaker-reliability-study'
  }
]

// =========================================================================
// NAMA TIM REKAYASA KELISTRIKAN AI & KURASI PERSONAL DENGAN MATERI USER
// =========================================================================
const GANG_NAME_PRESETS = [
  'Hokiindo Power Engineering Taskforce',
  'Siemens Switchgear & Automation Squad',
  'Power System Reliability Group',
  'Industrial Electrical Engineering Squad',
  'HSO Engineering & Commissioning Division',
  'Hokiindo Industrial Solutions Team'
]

let savedGangName = 'Hokiindo Power Engineering Taskforce'
try {
  const cachedName = localStorage.getItem('hso_marketing_gang_name')
  if (cachedName && !cachedName.includes('Punakawan')) savedGangName = cachedName
} catch {}
const squadGangName = ref(savedGangName)
const isEditingGangName = ref(false)
const customGangNameInput = ref(savedGangName)

function selectGangNamePreset(name) {
  squadGangName.value = name
  customGangNameInput.value = name
  localStorage.setItem('hso_marketing_gang_name', name)
  isEditingGangName.value = false
}

function saveCustomGangName() {
  if (customGangNameInput.value.trim()) {
    squadGangName.value = customGangNameInput.value.trim()
    localStorage.setItem('hso_marketing_gang_name', squadGangName.value)
  }
  isEditingGangName.value = false
}

// User Personal Curation State
const isIntegratingUserNotes = ref(false)
const userNotesIntegrationSuccess = ref('')

function appendQuickTagToNotes(text) {
  if (!selectedSlotForCuration.value) return
  if (!selectedSlotForCuration.value.userNotes) {
    selectedSlotForCuration.value.userNotes = ''
  }
  if (selectedSlotForCuration.value.userNotes.trim()) {
    selectedSlotForCuration.value.userNotes += '\n' + text
  } else {
    selectedSlotForCuration.value.userNotes = text
  }
}

function appendNotesToBodyDirectly() {
  if (!selectedSlotForCuration.value || !selectedSlotForCuration.value.userNotes?.trim()) return
  const slot = selectedSlotForCuration.value
  slot.body += `\n\n📌 Catatan & Materi Tambahan:\n${slot.userNotes}`
  saveSlotCuration(false)
  userNotesIntegrationSuccess.value = 'Materi berhasil ditempel langsung ke dalam naskah!'
  setTimeout(() => { userNotesIntegrationSuccess.value = '' }, 4000)
}

async function integrateUserNotesWithAi() {
  if (!selectedSlotForCuration.value || !selectedSlotForCuration.value.userNotes?.trim()) return
  isIntegratingUserNotes.value = true
  userNotesIntegrationSuccess.value = ''
  const slot = selectedSlotForCuration.value
  const notes = slot.userNotes.trim()
  const agent = AGENTS.find(a => a.id === slot.agentId) || AGENTS[0]

  try {
    if (isApiConfigured.value) {
      const prompt = `Kamu adalah ${agent.name} (${agent.role}) dari "${squadGangName.value}" PT Hokiindo Raya.
Manajer/Ndoro Bos memberikan catatan ide dan materi tambahan khusus untuk slot konten ini:

CATATAN & MATERI KHUSUS DARI USER:
"""
${notes}
"""

KONTEN SAAT INI:
Judul: ${slot.title}
Hook: ${slot.hook}
Naskah:
${slot.body}
CTA: ${slot.cta}

ATURAN DOMAIN WAJIB:
- Cek Produk, Harga & Ketersediaan Stok -> arahkan ke https://shop.hokiindo.co.id (PENTING: Cek produk BUKAN di HSO; HSO adalah sistem operasional internal tim).
- Company Profile, Surat Dukungan Tender, Portofolio & Sertifikat CoO -> arahkan ke https://hokiindo.co.id.

TUGAS:
Sempurnakan dan rombak konten di atas secara menyeluruh agar ide, update, dan materi dari user terintegrasi sempurna:
1. Perbarui Judul & Hook jika perlu agar mencerminkan sudut pandang ide materi baru.
2. Integrasikan materi ke dalam naskah dengan gaya bahasa ${agent.name} (${agent.tone}) yang natural, tajam, dan persuasif bagi pembaca industri kelistrikan B2B.
3. Selaraskan Call to Action (CTA) dengan rujukan domain resmi yang benar (shop.hokiindo.co.id untuk cek produk/stok atau hokiindo.co.id untuk profil/tender).
4. Berikan arahan revisi desain visual jika materi memerlukan visual khusus.

KEMBALIKAN HANYA JSON:
{
  "title": "Judul baru yang diselaraskan",
  "hook": "Hook baru yang memikat",
  "body": "Naskah lengkap yang sudah mengintegrasikan materi user secara mulus...",
  "cta": "CTA baru",
  "designVisual": "Konsep visual grafis yang sesuai materi baru",
  "overlayText": "Teks singkat overlay gambar"
}`

      const rawRes = await callSumopodChatCompletions([
        { role: 'system', content: 'Kamu adalah copywriter profesional B2B industri kelistrikan. Kembalikan HANYA JSON murni.' },
        { role: 'user', content: prompt }
      ], 2000)
      let cleaned = rawRes.trim()
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim()
      else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim()

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.title) slot.title = parsed.title
        if (parsed.hook) slot.hook = parsed.hook
        if (parsed.body) slot.body = parsed.body
        if (parsed.cta) slot.cta = parsed.cta
        if (parsed.designVisual && slot.designGuide) slot.designGuide.visualConcept = parsed.designVisual
        if (parsed.overlayText && slot.designGuide) slot.designGuide.overlayText = parsed.overlayText
      }
    } else {
      // Offline fallback: Smart insertion & harmonization
      slot.body += `\n\n💡 Poin Utama & Materi Terkini:\n${notes}`
      slot.cta = 'Mau cek ketersediaan stok & harga resmi hari ini? Kunjungi toko online kami di shop.hokiindo.co.id, atau konsultasikan BoQ proyek Anda di hokiindo.co.id.'
    }

    slot.isCustomCurated = true
    saveSlotCuration(false)
    userNotesIntegrationSuccess.value = 'Naskah berhasil diselaraskan dengan ide & materi Anda!'
    setTimeout(() => { userNotesIntegrationSuccess.value = '' }, 4000)
  } catch (err) {
    console.error('Error integrating user notes:', err)
    slot.body += `\n\n💡 Poin Utama & Materi Terkini:\n${notes}`
    saveSlotCuration(false)
    userNotesIntegrationSuccess.value = 'Materi berhasil disisipkan ke naskah!'
    setTimeout(() => { userNotesIntegrationSuccess.value = '' }, 4000)
  } finally {
    isIntegratingUserNotes.value = false
  }
}

// =========================================================================
// MESIN EKSPANSI KONTEN PANJANG (DEEP LONG-FORM ENGINE)
// Menulis Artikel SEO Lengkap (1.500+ Kata) & Naskah Video Sutradara Rinci
// =========================================================================
const isExpandingLongForm = ref(false)
const longFormNotice = ref('')
const longFormError = ref('')
const contentBodyViewMode = ref('edit') // 'edit' | 'preview'
const showLongFormMenu = ref(false)
const isCopiedBody = ref(false)

const curationSlotWordCount = computed(() => {
  if (!selectedSlotForCuration.value?.body) return 0
  return selectedSlotForCuration.value.body.trim().split(/\s+/).filter(Boolean).length
})

const copyBodyToClipboard = () => {
  if (!selectedSlotForCuration.value?.body) return
  navigator.clipboard.writeText(selectedSlotForCuration.value.body)
  isCopiedBody.value = true
  setTimeout(() => { isCopiedBody.value = false }, 2500)
}

function formatInlineMarkdown(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic text-slate-600 dark:text-slate-300">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px] text-pink-600 dark:text-pink-400">$1</code>')
}

function formatBodyToHtml(text) {
  if (!text) return '<p class="text-slate-400 italic">Belum ada naskah...</p>'
  
  const lines = text.split('\n')
  let html = ''
  let inList = false
  let inTable = false
  let tableHeaderDone = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Table row detection
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        if (inList) { html += '</ul>'; inList = false }
        html += '<div class="overflow-x-auto my-3"><table class="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"><tbody class="divide-y divide-slate-200 dark:divide-slate-700">'
        inTable = true
        tableHeaderDone = false
      }
      if (line.match(/^\|[\s\-:|]+\|$/)) {
        tableHeaderDone = true
        continue
      }
      const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      const isHeader = !tableHeaderDone
      html += '<tr class="' + (isHeader ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50') + '">'
      cells.forEach(c => {
        const tag = isHeader ? 'th' : 'td'
        html += `<${tag} class="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 text-left">${formatInlineMarkdown(c.trim())}</${tag}>`
      })
      html += '</tr>'
      continue
    } else if (inTable) {
      html += '</tbody></table></div>'
      inTable = false
    }

    // List item detection
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        html += '<ul class="list-disc pl-5 my-2 space-y-1 text-slate-700 dark:text-slate-300 text-xs">'
        inList = true
      }
      html += `<li>${formatInlineMarkdown(line.substring(2))}</li>`
      continue
    } else if (inList) {
      html += '</ul>'
      inList = false
    }

    // Headings
    if (line.startsWith('# ')) {
      html += `<h2 class="text-base font-extrabold text-slate-900 dark:text-white mt-4 mb-2 pb-1 border-b border-slate-300 dark:border-slate-700">${formatInlineMarkdown(line.substring(2))}</h2>`
      continue
    }
    if (line.startsWith('## ')) {
      html += `<h3 class="text-sm font-bold text-slate-900 dark:text-white mt-4 mb-1.5 pb-1 border-b border-slate-200 dark:border-slate-800">${formatInlineMarkdown(line.substring(3))}</h3>`
      continue
    }
    if (line.startsWith('### ')) {
      html += `<h4 class="text-xs font-bold text-slate-900 dark:text-white mt-3 mb-1 uppercase tracking-wider">${formatInlineMarkdown(line.substring(4))}</h4>`
      continue
    }

    // Empty lines
    if (!line) {
      continue
    }

    // Paragraph
    html += `<p class="my-2 leading-relaxed text-slate-700 dark:text-slate-300 text-xs">${formatInlineMarkdown(line)}</p>`
  }

  if (inList) html += '</ul>'
  if (inTable) html += '</tbody></table></div>'

  return html
}

async function expandToLongFormContent(formatType) {
  if (!selectedSlotForCuration.value) return
  const slot = selectedSlotForCuration.value

  isExpandingLongForm.value = true
  longFormError.value = ''
  longFormNotice.value = ''

  const agent = SQUAD_AGENTS.find(a => a.id === slot.agentId) || SQUAD_AGENTS[0]

  if (!isApiConfigured.value) {
    longFormError.value = 'Kunci Akses AI SumoPod belum diisi. Buka Pengaturan AI untuk memasukkan API Key SumoPod.'
    isExpandingLongForm.value = false
    return
  }

  // 5 Pilar Bank Data Context Injection
  const websiteContext = hsoWebsites.value.map(w => `- ${w.title} (${w.url}): ${w.description}`).join('\n')
  const articleContext = hsoArticles.value.map(a => `- ${a.title} (${a.author}): ${a.summary}`).join('\n')
  const pdfContext = hsoPdfs.value.map(p => `- ${p.title} (${p.brand} ${p.code}): ${p.specsSummary ? p.specsSummary.join(', ') : ''}`).join('\n')
  
  const productsWithNotes = accurateProducts.value.filter(p => resolveProductSupportingData(p).customNote)
  const otherProducts = accurateProducts.value.filter(p => !resolveProductSupportingData(p).customNote)
  const productContext = [...productsWithNotes, ...otherProducts].slice(0, 15).map(p => {
    const d = resolveProductSupportingData(p)
    return `- ${p.item_name} [MLFB: ${p.item_no}]: ${d.baseDesc} (Kategori: ${d.category}, Spek: ${[d.currentRating, d.poles, d.breakingCapacity].filter(Boolean).join(', ')}, Stok: Ready 24 Jam)` + (d.customNote ? ` [Catatan: ${d.customNote}]` : '')
  }).join('\n')

  let promptTask = ''

  if (formatType === 'seo_article') {
    promptTask = `TUGAS: Tulis ARTIKEL BLOG & PANDUAN TEKNIS SEO LENGKAP & MENDALAM (Minimal 1.200 - 1.800 kata).
Format artikel harus siap tayang di Website / Blog resmi:
1. Target Kata Kunci Utama, Sekunder, dan Meta Description (150 karakter).
2. H1: Judul Menarik & Kaya Kata Kunci (maksimal 12 kata).
3. Pendahuluan: Angkat masalah riil di lapangan (misal: breaker sering jeglek waktu komisioning bareng konsultan, ketakutan barang inden 8 minggu hingga denda proyek serah terima).
4. H2: Tinjauan Teknis & Standar Regulasi (IEC 60947-2, PUIL 2020, nilai Ics=100% Icu, kurva tripping TM vs ETU L-I-S-G).
5. H2: Solusi Teknis & Keunggulan Produk (Sebutkan tipe MLFB Siemens Sentron 3VM/3VA atau Lampu High Bay LED UFO G-Comin dengan spesifikasi konkret).
6. H2: Tabel Perbandingan Spesifikasi & Rekomendasi Kapasitas (Sajikan dalam format tabel markdown yang rapi).
7. H2: Studi Kasus Nyata di Lapangan (Contoh pengalaman panel builder di Cikarang/Surabaya yang sukses komisioning tanpa catatan).
8. H2: Panduan Praktis Step-by-Step Pemilihan & Instalasi bagi Teknisi dan Estimator.
9. H2: 5 Pertanyaan Umum (FAQ) yang Paling Sering Dicari di Google Search.
10. Call to Action (CTA): Arahkan pembaca untuk mengecek ketersediaan stok & harga resmi di Toko Online: https://shop.hokiindo.co.id, dan permohonan sertifikat CoO resmi atau surat dukungan tender BoQ di https://hokiindo.co.id.

Gaya penulisan: Sangat manusiawi (human writing), mengalir bercerita, gaya praktisi profesional yang berwibawa, dan ZERO kata klise robotik AI.`
  } else if (formatType === 'video_script') {
    promptTask = `TUGAS: Tulis NASKAH SUTRADARA VIDEO LENGKAP (DIRECTOR'S SCRIPT) untuk Reels / TikTok / YouTube Shorts (Durasi 60-90 Detik).
Format naskah sutradara harus sangat detail, terstruktur dan siap syuting:
1. INFORMASI PRODUKSI:
   - Durasi Target: 60 - 90 Detik
   - Karakter / Talent: ${agent.name} (${agent.nickname}) - Gaya ${agent.tone}
   - Properti / Alat Peraga: Breaker Siemens Sentron 3VM / Lampu High Bay UFO G-Comin / Multimeter / Helm K3 Proyek
   - Suasana & Lokasi: Workshop panel switchboard atau gudang industri

2. BREAKDOWN SCENE-BY-SCENE RINCI:
   - [SCENE 1: Detik 0-3 | THE HOOK (Penghenti Scroll)]
     * Visual & Angle Kamera: (Close-up ekspresi talent panik atau breaker jeglek dramatis)
     * Sound Effect (SFX): (Suara jeglek dramatis / Whoosh bass)
     * Text on Screen (OST): (Teks besar tebal di layar yang memikat)
     * Voiceover (VO): (Kalimat pembuka provokatif yang relatable bagi pekerja lapangan)
   - [SCENE 2: Detik 4-15 | THE PROBLEM (Masalah Nyata di Lapangan)]
     * Visual & B-Roll: (Hotspot termal busbar, kurva tripping deviasi, indikator fault pada cubicle panel)
     * OST & SFX: (Efek tegang singkat)
     * Voiceover (VO): (Bahas ketakutan kena denda keterlambatan proyek atau komisioning ditolak)
   - [SCENE 3: Detik 16-45 | THE DEMO & SOLUTION (Bedah Fisik & Fitur)]
     * Visual & B-Roll: (Tangan memegang unit Siemens Sentron 3VM, sorot barcode CoO asli, tunjukkan trip unit TM220)
     * OST & SFX: (Angka kA, logo Siemens resmi)
     * Voiceover (VO): (Solusi teknis konkret dengan bahasa rekayasa profesional dan otoritatif)
   - [SCENE 4: Detik 46-60 | CALL TO ACTION & ENDING]
     * Visual: (Talent menunjuk alamat toko online di layar)
     * Voiceover (VO): (Ajak cek stok 24 jam dan pesan langsung di toko online resmi: shop.hokiindo.co.id)

3. CAPTION LENGKAP & HASHTAGS FYP SIAP COPY-PASTE.`
  } else if (formatType === 'b2b_proposal') {
    promptTask = `TUGAS: Tulis NASKAH EMAIL MARKETING & SURAT PENAWARAN RESMI B2B LENGKAP untuk Kontraktor & Panel Maker.
1. 2 Opsi Subject Line (A/B Test dengan Open Rate tinggi)
2. Salam Pembuka Personal & Profesional khas Mbak Sri
3. Identifikasi Masalah Proyek (Ketakutan barang inden, risiko serah terima audit tender)
4. Rekomendasi Solusi & Tabel Daftar Item Siemens / G-Comin (dengan kode MLFB dan spesifikasi teknis)
5. Garansi & Jaminan Keaslian Distributor Resmi PT Hokiindo Raya (Dokumen CoO pabrikan & ready stock 24 jam Jabodetabek)
6. Call to Action: Arahkan ke https://shop.hokiindo.co.id untuk cek harga/stok atau ajukan BoQ tender ke https://hokiindo.co.id.`
  }

  const systemPrompt = `Kamu adalah Antigravity Deep Content Engine untuk ${agent.name} (${agent.role}) dari "${squadGangName.value}" PT Hokiindo Raya (distributor resmi Siemens Indonesia).
PERAN: Kamu adalah Lead Electrical & Automation Systems Consultant berstandar internasional sekaligus Master B2B Technical Copywriter. Konten panjang yang kamu hasilkan HARUS SANGAT KREDIBEL, BERBOBOT REKAYASA TINGGI (ENGINEERING-GRADE), BEBAS DARI KLAIM AMBIGU ATAU SALAH TEKNIK (teruji valid saat dievaluasi AI model manapun seperti Gemini / GPT), memiliki JUDUL MENGGUGAH, TINGGI SEO, HOOK 3 DETIK PERTAMA, dan TATA BAHASA TEKNIK PROFESIONAL YANG PRESISI, BERWIBAWA, SERTA METODIS.

BATASAN CAKUPAN PRODUK & LARANGAN KERAS (MUTLAK):
1. TIDAK ADA TOWER LIGHTING DI MINING, GUDANG & KONSTRUKSI:
   - DILARANG KERAS mempromosikan tower lighting (lampu menara / mobile lighting tower).
   - DILARANG KERAS membuat konten atau penawaran penerangan untuk sektor penambangan (mining), gudang logistik umum, dan proyek konstruksi sipil/bedeng proyek.
   - Fokus kelistrikan PT Hokiindo Raya adalah fasilitas industri manufaktur berat, proses industri terotomasi, gardu distribusi, ruang cubicle switchgear/MCC, dan pabrik modern.
2. TIDAK JUALAN KABEL:
   - DILARANG KERAS menyatakan atau mengimplikasikan bahwa PT Hokiindo Raya menjual atau menyuplai kabel (kabel tanah, kabel NYFGBY, kabel grounding tembaga, dsb.). KAMI TIDAK MENJUAL KABEL.
   - Pemutus sirkuit dan relay proteksi Siemens memproteksi konduktor dan kabel sirkit eksternal (menurut kaidah I²t <= k²S² per IEC 60364-4-43 & PUIL 2020), tetapi suplai kabel dilakukan oleh pihak ketiga/kontraktor. PT Hokiindo Raya HANYA menyediakan komponen pemutus tenaga, switchgear, controlgear, proteksi, dan otomasi.
3. BAHASA SANGAT ENGINEERING & KELAS DUNIA:
   - DILARANG KERAS menggunakan bahasa gaul pasar murahan, guyonan kuli/mandor, plesetan kopi bedeng, kawat jemuran, drama mandor ngamuk, dll.
   - Wajib menggunakan bahasa rekayasa teknik kelistrikan tingkat tinggi (Chief Electrical Engineer & Senior Power Systems Consultant tone): berbasis data matematis, merujuk standar internasional resmi (IEC 60947, IEC 61439, IEEE 1584, IEC 61557, PUIL 2020), metodis, presisi, dan berwibawa.

STANDAR ILMIAH & REKAYASA KELISTRIKAN (WAJIB DITERAPKAN DI NASKAH):
1. Breaker & Proteksi: Rujuk IEC 60947-2 & PUIL 2020. Jelaskan parameter teknis riil: Icu, Ics = 100% Icu, koordinasi selektivitas diskriminasi proteksi (upstream ACB 3WA/3WL vs downstream MCCB 3VA/3VM), kurva tripping TMD (bimetal beralur) vs ETU (L-S-I-G microprocessor).
2. Motor Control: Rujuk IEC 60947-4-1. Tegaskan kategori utilisasi AC-3e khusus motor efisiensi tinggi IE3/IE4 dengan arus inrush start tinggi (8-10x In). Jelaskan proteksi fasa hilang (single-phasing) dan Trip Class 10 pada overload 3RU.
3. Kualitas Daya: Rujuk IEC 62053-22 Class 0.2S / 0.5S (Sentron PAC), analisa THD-I / THD-V untuk menekan rugi-rugi trafo dan distorsi tegangan.
4. Surge Protection: IEC 61643-11 (SPD Type 1 gelombang 10/350 µs vs Type 2 gelombang 8/20 µs, Up <= 1.5 kV).
5. Segregasi Switchboard: IEC 61439-1/2 (Form 2b s/d Form 4b, verifikasi temperature rise dan derajat proteksi IP54/IP65).

TATA BAHASA & RUKUN PEMBEDA (ENGINEERING-GRADE & HOOK 3 DETIK):
1. HOOK 3 DETIK PERTAMA: Selalu buka dengan hook tajam yang menyentuh studi kasus rekayasa nyata atau mitigasi risiko teknis.
2. ZERO ROBOTIC SLOP: DILARANG KERAS menggunakan kata klise robot ("Dalam era modern/digital...", "Tidak dapat dipungkiri bahwa...", "Mari kita selami...", "Solusi komprehensif...", "Game changer...", "Kesimpulannya...").
3. BERCERITA ALAMI: Gunakan penjelasan praktisi rekayasa kelistrikan yang otoritatif, sistematis, berkelas, dan berbasis bukti empiris.

ATURAN DOMAIN WAJIB & MUTLAK:
1. Pengecekan produk, harga, spesifikasi, ketersediaan stok, dan pembelian online: https://shop.hokiindo.co.id
   (PENTING SEKALI: Pengecekan produk BUKAN di HSO! HSO adalah sistem internal tim operasional, bukan untuk publik).
2. Company Profile resmi, portofolio proyek, sertifikat CoO, dan surat dukungan tender: https://hokiindo.co.id
3. DILARANG KERAS menyebut atau mengarahkan publik untuk cek produk di "HSO".

BANK DATA RESMI PT HOKIINDO RAYA:
Websites:
${websiteContext}

Artikel Teknik:
${articleContext}

Dokumen PDF:
${pdfContext}

Katalog Accurate:
${productContext}

PROTOKOL ANTI-SLOP (ZERO AI CLICHÉS / 100% GAYA MANUSIA ASLI):
Dilarang menggunakan kata klise robotik AI ("Dalam era digital...", "Tidak dapat dipungkiri bahwa...", "Mari kita selami...", "Solusi komprehensif...", "Game changer...").
Gunakan gaya bertutur praktisi profesional lapangan yang luwes, berbobot teknis, dan mengalir alami.`

  const userPrompt = `Kembangkan slot konten berikut menjadi naskah konteks panjang yang sangat lengkap dan berbobot:
JUDUL SAAT INI: "${slot.title}"
HOOK SAAT INI: "${slot.hook}"
NASKAH SAAT INI: "${slot.body}"
PLATFORM: "${slot.platform}" (${slot.postType})
KATEGORI: "${slot.category}"
CATATAN TAMBAHAN USER: "${slot.userNotes || 'Tidak ada catatan tambahan'}"

${promptTask}

Kembalikan naskah lengkap dalam format Markdown rapi dan terstruktur.`

  try {
    const rawResult = await callSumopodChatCompletions([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 4096)

    let cleaned = rawResult.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    if (cleaned.startsWith('```markdown')) cleaned = cleaned.replace(/^```markdown\s*/, '').replace(/```\s*$/, '').trim()
    else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()

    slot.body = cleaned
    slot.isCustomCurated = true

    // Ekstrak judul jika ada H1 di output naskah
    const titleMatch = cleaned.match(/^#\s+(.+)$/m) || cleaned.match(/^H1:\s*(.+)$/mi) || cleaned.match(/^JUDUL:\s*(.+)$/mi)
    if (titleMatch && titleMatch[1]) {
      const extractedTitle = titleMatch[1].replace(/[*_#]/g, '').trim()
      if (extractedTitle.length <= 100) {
        slot.title = extractedTitle
      }
    }

    const wordCount = cleaned.split(/\s+/).filter(Boolean).length
    saveSlotCuration(false)

    const typeLabel = formatType === 'seo_article' ? 'Artikel SEO Lengkap' : (formatType === 'video_script' ? 'Naskah Sutradara Video' : 'Penawaran B2B')
    longFormNotice.value = `Berhasil! Naskah berhasil dikembangkan menjadi ${typeLabel} (${wordCount} kata) oleh AI SumoPod!`
    contentBodyViewMode.value = 'preview'
    setTimeout(() => { longFormNotice.value = '' }, 6000)
  } catch (err) {
    console.error('Long form generation error:', err)
    longFormError.value = `Gagal mengembangkan konten panjang: ${err.message}`
    setTimeout(() => { longFormError.value = '' }, 6000)
  } finally {
    isExpandingLongForm.value = false
    showLongFormMenu.value = false
  }
}


// --- STATE MANAGEMENT BANK DATA ---
const activeBankDataTab = ref('websites') // 'websites' | 'articles' | 'pdfs' | 'products' | 'references'

// State Pilar 1: Situs Sendiri
let initialWebsites = DEFAULT_HSO_WEBSITES
try {
  const cached = localStorage.getItem('hso_marketing_websites')
  if (cached) {
    const parsed = JSON.parse(cached)
    // Cek apakah cache browser lama belum memuat domain toko online shop.hokiindo.co.id
    const hasShop = Array.isArray(parsed) && parsed.some(w => w.url && w.url.includes('shop.hokiindo.co.id'))
    if (hasShop) {
      initialWebsites = parsed
    } else {
      // Perbarui otomatis cache dengan daftar situs resmi baru yang memuat shop.hokiindo.co.id & hokiindo.co.id
      initialWebsites = DEFAULT_HSO_WEBSITES
      localStorage.setItem('hso_marketing_websites', JSON.stringify(DEFAULT_HSO_WEBSITES))
    }
  }
} catch {}
const hsoWebsites = ref(initialWebsites)
const searchWebsiteQuery = ref('')
const isAddingWebsite = ref(false)
const newWebsite = ref({ title: '', url: '', category: 'Company Profile', description: '', highlightsText: '' })

// State Pilar 2: Artikel Teknik
let initialArticles = DEFAULT_HSO_ARTICLES
try {
  const cached = localStorage.getItem('hso_marketing_articles')
  if (cached) initialArticles = JSON.parse(cached)
} catch {}
const hsoArticles = ref(initialArticles)
const searchArticleQuery = ref('')
const isAddingArticle = ref(false)
const newArticle = ref({ title: '', author: 'Tim Engineering HSO', category: 'Standar Proteksi Siemens', summary: '', insightsText: '', tags: '' })

// State Pilar 3: PDF Dokumen
let initialPdfs = DEFAULT_HSO_PDFS
try {
  const cached = localStorage.getItem('hso_marketing_pdfs')
  if (cached) initialPdfs = JSON.parse(cached)
} catch {}
const hsoPdfs = ref(initialPdfs)
const searchPdfQuery = ref('')
const isAddingPdf = ref(false)
const newPdf = ref({ title: '', brand: 'SIEMENS', category: 'Katalog', code: '', url: '', size: '5 MB', version: '2026', specsText: '' })

// State Pilar 4: Database Produk Accurate (Multi-ribu Master Accurate)
const { fetchItems: fetchMasterAccurateCatalog } = useAccurateItems()
const accurateProducts = ref(DEFAULT_HSO_PRODUCTS)
const isFetchingProducts = ref(false)
const searchProductQuery = ref('')
const productBrandFilter = ref('all') // 'all' | 'SIEMENS' | 'G-COMIN'
const productCategoryFilter = ref('all')
const displayedProductsCount = ref(40)

const displayedProducts = computed(() => {
  return filteredProducts.value.slice(0, displayedProductsCount.value)
})

function loadMoreProducts() {
  displayedProductsCount.value += 40
}

watch([searchProductQuery, productBrandFilter, productCategoryFilter], () => {
  displayedProductsCount.value = 40
})

// State Pilar 5: Konten Referensi & Inspirasi Serupa (Formula Sukses)
let initialReferences = DEFAULT_HSO_CONTENT_REFERENCES
try {
  const cached = localStorage.getItem('hso_marketing_content_references')
  if (cached) initialReferences = JSON.parse(cached)
} catch {}
const hsoContentReferences = ref(initialReferences)
const searchReferenceQuery = ref('')
const referencePlatformFilter = ref('all') // 'all' | 'LinkedIn' | 'Instagram' | 'Facebook' | 'Email'
const isAddingReference = ref(false)
const newReference = ref({
  title: '',
  platform: 'LinkedIn',
  category: 'Studi Kasus Tender',
  whyItWorks: '',
  contentText: '',
  sourceUrl: ''
})

// Quick Insert Menu State in Workbench
const activeQuickInsertMenu = ref(null) // null | 'web' | 'pdf' | 'product' | 'reference'
function toggleQuickInsertMenu(menu) {
  activeQuickInsertMenu.value = activeQuickInsertMenu.value === menu ? null : menu
}

// Filtered Lists
const filteredWebsites = computed(() => {
  const q = searchWebsiteQuery.value.toLowerCase().trim()
  if (!q) return hsoWebsites.value
  return hsoWebsites.value.filter(w =>
    w.title.toLowerCase().includes(q) ||
    w.url.toLowerCase().includes(q) ||
    w.description.toLowerCase().includes(q) ||
    w.category.toLowerCase().includes(q)
  )
})

const filteredArticles = computed(() => {
  const q = searchArticleQuery.value.toLowerCase().trim()
  if (!q) return hsoArticles.value
  return hsoArticles.value.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.summary.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q) ||
    (a.tags && a.tags.some(t => t.toLowerCase().includes(q)))
  )
})

const filteredPdfs = computed(() => {
  const q = searchPdfQuery.value.toLowerCase().trim()
  if (!q) return hsoPdfs.value
  return hsoPdfs.value.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.brand.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    (p.code && p.code.toLowerCase().includes(q))
  )
})

const filteredProducts = computed(() => {
  const q = searchProductQuery.value.toLowerCase().trim()
  return accurateProducts.value.filter(p => {
    const matchBrand = productBrandFilter.value === 'all' || (p.brand && p.brand.toUpperCase() === productBrandFilter.value.toUpperCase())
    const matchCat = productCategoryFilter.value === 'all' || (p.category && p.category.toUpperCase().includes(productCategoryFilter.value.toUpperCase()))
    const matchSearch = !q ||
      p.item_name.toLowerCase().includes(q) ||
      (p.item_no && p.item_no.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.long_description && p.long_description.toLowerCase().includes(q))
    return matchBrand && matchCat && matchSearch
  })
})

const filteredReferences = computed(() => {
  const q = searchReferenceQuery.value.toLowerCase().trim()
  return hsoContentReferences.value.filter(r => {
    const matchPlatform = referencePlatformFilter.value === 'all' || (r.platform && r.platform.toLowerCase().includes(referencePlatformFilter.value.toLowerCase()))
    const matchQuery = !q ||
      r.title.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.whyItWorks.toLowerCase().includes(q) ||
      r.contentText.toLowerCase().includes(q)
    return matchPlatform && matchQuery
  })
})

const totalProductsCount = computed(() => accurateProducts.value.length)

// State for custom supporting notes added by user for specific products
let initialSupportingNotes = {}
try {
  const cached = localStorage.getItem('hso_product_supporting_notes')
  if (cached) initialSupportingNotes = JSON.parse(cached)
} catch {}
const productSupportingNotes = ref(initialSupportingNotes)
const editingProductNoteItem = ref(null)
const editingNoteText = ref('')

function openEditSupportingNote(prod) {
  editingProductNoteItem.value = prod
  editingNoteText.value = productSupportingNotes.value[prod.item_no] || ''
}

function saveSupportingNote() {
  if (!editingProductNoteItem.value) return
  const itemNo = editingProductNoteItem.value.item_no
  if (editingNoteText.value.trim()) {
    productSupportingNotes.value[itemNo] = editingNoteText.value.trim()
  } else {
    delete productSupportingNotes.value[itemNo]
  }
  localStorage.setItem('hso_product_supporting_notes', JSON.stringify(productSupportingNotes.value))
  editingProductNoteItem.value = null
  editingNoteText.value = ''
  alert('Deskripsi pendukung produk berhasil disimpan!')
}

// Function to resolve rich, comprehensive supporting descriptions for any product
function resolveProductSupportingData(prod) {
  if (!prod) return {}
  const name = prod.item_name || ''
  const no = prod.item_no || ''
  const cat = prod.category || categorizeMLFB(no, name)
  const brand = prod.brand || (/^(3V|3R|3W|5S|7K|6E|6SL)/i.test(no) ? 'SIEMENS' : (/GCM|HB/i.test(no) ? 'G-COMIN' : 'HSO'))
  
  // 1. Base description from Accurate
  const baseDesc = prod.long_description || prod.description || name

  // 2. Extract technical highlights from name & no
  let currentRating = ''
  const currMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:A|Ampere)\b/i) || no.match(/(\d+)A\b/i)
  if (currMatch) currentRating = `${currMatch[1]} Ampere`

  let poles = ''
  const poleMatch = name.match(/\b([1-4])\s*(?:P|Pole)\b/i)
  if (poleMatch) poles = `${poleMatch[1]} Pole`

  let breakingCapacity = ''
  const kAMatch = name.match(/(\d+)\s*kA\b/i)
  if (kAMatch) breakingCapacity = `${kAMatch[1]}kA (Ics = 100% Icu)`

  let tripUnit = ''
  if (/TM220|TM|Thermal-Magnetic/i.test(name) || /TM/i.test(baseDesc)) {
    tripUnit = 'Thermal-Magnetic TM220 (Setelan arus beban lebih & proteksi hubung singkat)'
  } else if (/ETU|Electronic/i.test(name) || /ETU/i.test(baseDesc)) {
    tripUnit = 'Electronic Trip Unit ETU (Proteksi presisi L-I-S-G & selektivitas kaskade)'
  } else if (cat === 'MCB') {
    tripUnit = 'Kurva Karakteristik C (Tripping 5-10x In, proteksi beban cabang induktif)'
  } else if (cat === 'CONTACTOR' || cat === 'TOR') {
    tripUnit = 'Kontak Paduan Perak-Nikel AC-3 & Bimetal Overload Trip Class 10'
  }

  // 3. Recommended industrial application
  let application = 'Panel distribusi daya utama & sub-panel fasilitas industri'
  if (cat === 'ACB') {
    application = 'Main Incomer LVMDP (Low Voltage Main Distribution Panel) kapasitas besar gedung & pabrik'
  } else if (cat === 'MCCB') {
    application = 'Sub-Distribution Panel (SDP), pengaman feeder motor listrik, dan beban distribusi manufaktur'
  } else if (cat === 'MCB') {
    application = 'Sirkit cabang penerangan, stop kontak industri, dan panel instrumen kontrol DIN-rail'
  } else if (cat === 'CONTACTOR') {
    application = 'Starter motor induksi 3-fasa, panel kontrol HVAC/chiller, dan sistem switching otomatis'
  } else if (cat === 'TOR' || cat === 'MPCB') {
    application = 'Proteksi termal anti-overload dan kehilangan fasa (phase-loss) motor pompa & kompresor'
  } else if (cat === 'LIGHTING') {
    application = 'Pencahayaan presisi tinggi fasilitas manufaktur, ruang switchboard, dan area proses industri bersuhu tinggi'
  } else if (cat === 'PLC_AUTOMATION' || cat === 'VFD') {
    application = 'Otomasi lini produksi industri 4.0, kontrol kecepatan motor, dan sistem SCADA pabrik'
  }

  // 4. Standard compliance
  let standard = 'IEC 60947-2 / SNI'
  if (cat === 'MCB') standard = 'IEC 60898-1 & IEC 60947-2'
  if (cat === 'CONTACTOR' || cat === 'TOR' || cat === 'MPCB') standard = 'IEC 60947-4-1'
  if (cat === 'LIGHTING') standard = 'SNI 03-6575 & CE IP66 / IK08'

  // 5. User custom note if any
  const customNote = productSupportingNotes.value[no] || ''

  // 6. Complete synthesized supporting description for AI learning & copywriting
  const fullSupportingText = `${name} [Part No / MLFB: ${no}] - Kategori: ${cat} (${brand}).\n` +
    `Deskripsi Teknis: ${baseDesc}.\n` +
    `Spesifikasi Kunci: ${[currentRating, poles, breakingCapacity, tripUnit].filter(Boolean).join(' • ') || 'Komponen standar industri'}.\n` +
    `Kesesuaian Aplikasi: ${application} (Standar: ${standard}).\n` +
    `Jaminan Distributor: Ready stock 24 jam di gudang PT Hokiindo Raya dengan jaminan Certificate of Origin (CoO) resmi prinsipal.` +
    (customNote ? `\nCatatan Tambahan Khusus: "${customNote}"` : '')

  return {
    category: cat,
    brand,
    baseDesc,
    currentRating,
    poles,
    breakingCapacity,
    tripUnit,
    application,
    standard,
    customNote,
    fullSupportingText
  }
}

// --- FETCH PRODUCTS FROM ACCURATE DATABASE / SUPABASE (SEMUA PRODUK TANPA LIMIT 500) ---
async function fetchProductsFromDatabase(force = false) {
  isFetchingProducts.value = true
  try {
    // 1. Check cached items from Accurate first (instant load 0ms)
    let hasCompleteCache = false
    const cached = localStorage.getItem('accurate_items_cache')
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleanList = parsed
            .filter(item => item && (item.item_no || item.no) && !isDummyItem(item.item_no || item.no, item.item_name || item.name))
            .map(item => {
              const itemNo = item.item_no || item.no || ''
              const itemName = item.item_name || item.name || ''
              const cat = item.category || categorizeMLFB(itemNo, itemName)
              const brand = item.brand || (/^(3V|3R|3W|5S|7K|6E|6SL)/i.test(itemNo) ? 'SIEMENS' : (/GCM|HB/i.test(itemNo) ? 'G-COMIN' : 'HSO'))
              return {
                id: item.id || 'acc_' + itemNo,
                item_no: itemNo,
                item_name: itemName,
                brand,
                category: cat,
                stock_status: item.stock_status || ((item.stock_quantity > 0 || item.quantity > 0) ? 'READY' : 'INDEN'),
                stock_quantity: Number(item.stock_quantity ?? item.quantity ?? (item.available_to_sell ?? 50)),
                unit_price: Number(item.unit_price || item.unitPrice || item.base_price || 0),
                description: item.description || '',
                long_description: item.long_description || item.description || '',
                specs: item.specs || item.specifications || {},
                datasheet: item.datasheet || ''
              }
            })

          if (cleanList.length > 0) {
            const existingNos = new Set(cleanList.map(x => x.item_no))
            DEFAULT_HSO_PRODUCTS.forEach(dp => {
              if (!existingNos.has(dp.item_no)) cleanList.push(dp)
            })
            accurateProducts.value = cleanList
            // Hanya anggap cache lengkap jika sudah mencakup lebih dari 510 item (bukan bekas limit 500)
            if (cleanList.length > 510) {
              hasCompleteCache = true
            }
          }
        }
      } catch (e) {
        console.warn('Error reading cache:', e)
      }
    }

    // 2. Fetch seluruh ribuan katalog produk Accurate dari Database (Parallel Batch Range Query)
    if (!hasCompleteCache || force) {
      let rawFetched = []
      try {
        rawFetched = await fetchMasterAccurateCatalog({ force: true })
      } catch (err) {
        console.warn('Primary useAccurateItems fetch error, trying direct parallel fallback:', err)
      }

      // Fallback parallel range query jika fetchMasterAccurateCatalog return kosong
      if (!rawFetched || rawFetched.length === 0) {
        const { count } = await supabase
          .from('accurate_items')
          .select('*', { count: 'exact', head: true })

        const total = count || 6000
        const step = 1000
        const promises = []
        for (let from = 0; from < total; from += step) {
          promises.push(
            supabase
              .from('accurate_items')
              .select('id, item_no, item_name, description, long_description, unit_price, base_price, category, brand, stock_status, stock_quantity, available_to_sell, specs, datasheet')
              .order('item_no', { ascending: true })
              .range(from, from + step - 1)
          )
        }
        const results = await Promise.all(promises)
        rawFetched = results.flatMap(r => r.data || [])
      }

      if (rawFetched && rawFetched.length > 0) {
        const cleanList = rawFetched
          .filter(item => item && (item.item_no || item.no) && !isDummyItem(item.item_no || item.no, item.item_name || item.name))
          .map(item => {
            const itemNo = item.item_no || item.no || ''
            const itemName = item.item_name || item.name || ''
            const cat = item.category || categorizeMLFB(itemNo, itemName)
            const brand = item.brand || (/^(3V|3R|3W|5S|7K|6E|6SL)/i.test(itemNo) ? 'SIEMENS' : (/GCM|HB/i.test(itemNo) ? 'G-COMIN' : 'HSO'))
            return {
              id: item.id || 'acc_' + itemNo,
              item_no: itemNo,
              item_name: itemName,
              brand,
              category: cat,
              stock_status: item.stock_status || ((item.stock_quantity > 0 || item.available_to_sell > 0) ? 'READY' : 'INDEN'),
              stock_quantity: Number(item.stock_quantity ?? item.available_to_sell ?? 50),
              unit_price: Number(item.unit_price || item.base_price || 0),
              description: item.description || '',
              long_description: item.long_description || item.description || '',
              specs: item.specs || {},
              datasheet: item.datasheet || ''
            }
          })

        const existingNos = new Set(cleanList.map(x => x.item_no))
        DEFAULT_HSO_PRODUCTS.forEach(dp => {
          if (!existingNos.has(dp.item_no)) cleanList.push(dp)
        })
        accurateProducts.value = cleanList
        try {
          localStorage.setItem('accurate_items_cache', JSON.stringify(cleanList))
        } catch (storageErr) {
          console.warn('Cache quota notice:', storageErr)
        }
      }
    }
  } catch (err) {
    console.warn('Notice loading products from database:', err.message)
  } finally {
    isFetchingProducts.value = false
  }
}

// Actions for Bank Data
function saveNewWebsiteItem() {
  if (!newWebsite.value.title.trim() || !newWebsite.value.url.trim()) {
    alert('Mohon isi Judul dan URL website!')
    return
  }
  const highlights = newWebsite.value.highlightsText
    ? newWebsite.value.highlightsText.split('\n').map(x => x.trim()).filter(Boolean)
    : []

  const item = {
    id: 'web_' + Date.now(),
    title: newWebsite.value.title.trim(),
    url: newWebsite.value.url.trim(),
    category: newWebsite.value.category.trim() || 'Halaman Web',
    description: newWebsite.value.description.trim() || 'Halaman resmi PT Hokiindo Raya.',
    highlights: highlights.length > 0 ? highlights : ['Halaman informasi resmi PT Hokiindo Raya']
  }
  hsoWebsites.value.unshift(item)
  localStorage.setItem('hso_marketing_websites', JSON.stringify(hsoWebsites.value))
  newWebsite.value = { title: '', url: '', category: 'Company Profile', description: '', highlightsText: '' }
  isAddingWebsite.value = false
  alert('Halaman web berhasil ditambahkan ke Bank Data!')
}

function deleteWebsiteItem(id) {
  if (!confirm('Hapus halaman web ini dari Bank Data?')) return
  hsoWebsites.value = hsoWebsites.value.filter(x => x.id !== id)
  localStorage.setItem('hso_marketing_websites', JSON.stringify(hsoWebsites.value))
}

function saveNewArticleItem() {
  if (!newArticle.value.title.trim() || !newArticle.value.summary.trim()) {
    alert('Mohon isi Judul dan Ringkasan Artikel!')
    return
  }
  const insights = newArticle.value.insightsText
    ? newArticle.value.insightsText.split('\n').map(x => x.trim()).filter(Boolean)
    : []
  const tags = newArticle.value.tags
    ? newArticle.value.tags.split(',').map(x => x.trim()).filter(Boolean)
    : ['Teknik Kelistrikan']

  const item = {
    id: 'art_' + Date.now(),
    title: newArticle.value.title.trim(),
    author: newArticle.value.author.trim() || 'Tim Engineering HSO',
    category: newArticle.value.category.trim() || 'Artikel Teknik',
    summary: newArticle.value.summary.trim(),
    keyInsights: insights.length > 0 ? insights : ['Kepatuhan standar teknis kelistrikan nasional & internasional'],
    tags
  }
  hsoArticles.value.unshift(item)
  localStorage.setItem('hso_marketing_articles', JSON.stringify(hsoArticles.value))
  newArticle.value = { title: '', author: 'Tim Engineering HSO', category: 'Standar Proteksi Siemens', summary: '', insightsText: '', tags: '' }
  isAddingArticle.value = false
  alert('Artikel teknik berhasil ditambahkan ke Bank Data!')
}

function deleteArticleItem(id) {
  if (!confirm('Hapus artikel ini dari Bank Data?')) return
  hsoArticles.value = hsoArticles.value.filter(x => x.id !== id)
  localStorage.setItem('hso_marketing_articles', JSON.stringify(hsoArticles.value))
}

function saveNewPdfItem() {
  if (!newPdf.value.title.trim() || !newPdf.value.url.trim()) {
    alert('Mohon isi Nama Dokumen dan Link PDF!')
    return
  }
  const specs = newPdf.value.specsText
    ? newPdf.value.specsText.split('\n').map(x => x.trim()).filter(Boolean)
    : []

  const item = {
    id: 'pdf_' + Date.now(),
    title: newPdf.value.title.trim(),
    brand: newPdf.value.brand.trim() || 'SIEMENS',
    category: newPdf.value.category.trim() || 'Katalog',
    code: newPdf.value.code.trim() || 'PDF-DOC',
    url: newPdf.value.url.trim(),
    size: newPdf.value.size.trim() || '5 MB',
    version: newPdf.value.version.trim() || '2026',
    specsSummary: specs.length > 0 ? specs : ['Dokumen spesifikasi teknis resmi distributor']
  }
  hsoPdfs.value.unshift(item)
  localStorage.setItem('hso_marketing_pdfs', JSON.stringify(hsoPdfs.value))
  newPdf.value = { title: '', brand: 'SIEMENS', category: 'Katalog', code: '', url: '', size: '5 MB', version: '2026', specsText: '' }
  isAddingPdf.value = false
  alert('Dokumen PDF berhasil ditambahkan ke Bank Data!')
}

function deletePdfItem(id) {
  if (!confirm('Hapus dokumen PDF ini dari Bank Data?')) return
  hsoPdfs.value = hsoPdfs.value.filter(x => x.id !== id)
  localStorage.setItem('hso_marketing_pdfs', JSON.stringify(hsoPdfs.value))
}

// Injectors to active slot or clipboard
function useWebsiteInContent(site) {
  const snippet = `\n\n🌐 Kunjungi: ${site.title} (${site.url})\n${site.highlights && site.highlights.length ? site.highlights[0] : ''}`
  if (selectedSlotForCuration.value) {
    selectedSlotForCuration.value.body += snippet
    saveSlotCuration(false)
    alert(`Link "${site.title}" berhasil disisipkan ke naskah konten aktif!`)
  } else {
    navigator.clipboard.writeText(`${site.title}\n${site.url}`)
    alert(`Link ${site.url} disalin ke clipboard!`)
  }
}

function useArticleInContent(art) {
  const snippet = `\n\n💡 Referensi Teknik (${art.category}): "${art.title}"\n${art.summary}`
  if (selectedSlotForCuration.value) {
    selectedSlotForCuration.value.body += snippet
    saveSlotCuration(false)
    alert(`Artikel "${art.title}" berhasil disisipkan ke naskah konten aktif!`)
  } else {
    navigator.clipboard.writeText(`${art.title}\n\n${art.summary}`)
    alert(`Ringkasan artikel disalin ke clipboard!`)
  }
}

function usePdfInContent(pdf) {
  const snippet = `\n\n📄 Download Datasheet / Brosur Resmi: ${pdf.title}\nLink: ${pdf.url}`
  if (selectedSlotForCuration.value) {
    selectedSlotForCuration.value.body += snippet
    saveSlotCuration(false)
    alert(`Referensi Dokumen "${pdf.title}" berhasil disisipkan ke naskah konten aktif!`)
  } else {
    navigator.clipboard.writeText(`${pdf.title}\n${pdf.url}`)
    alert(`Link PDF disalin ke clipboard!`)
  }
}

function useProductInContent(prod) {
  const data = resolveProductSupportingData(prod)
  const snippet = `\n\n📦 Referensi Produk Resmi Accurate HSO:\n${data.fullSupportingText}`
  if (selectedSlotForCuration.value) {
    selectedSlotForCuration.value.body += snippet
    saveSlotCuration(false)
    alert(`Deskripsi pendukung lengkap "${prod.item_name}" berhasil disisipkan ke naskah!`)
  } else {
    navigator.clipboard.writeText(data.fullSupportingText)
    alert(`Deskripsi produk ${prod.item_name} berhasil disalin ke clipboard!`)
  }
}

function copyProductDescription(prod) {
  const data = resolveProductSupportingData(prod)
  navigator.clipboard.writeText(data.fullSupportingText)
  alert(`Deskripsi pendukung lengkap "${prod.item_name}" berhasil disalin ke clipboard!`)
}

function createContentFromAccurateProduct(prod) {
  const data = resolveProductSupportingData(prod)
  if (selectedSlotForCuration.value) {
    selectedSlotForCuration.value.title = `Solusi ${prod.item_name}: Proteksi Handal & Ready Stock 24 Jam`
    selectedSlotForCuration.value.userNotes = (selectedSlotForCuration.value.userNotes ? selectedSlotForCuration.value.userNotes + '\n\n' : '') +
      `📦 Produk Fokus dari Database Accurate:\n${data.fullSupportingText}`
    saveSlotCuration(false)
    activeViewMode.value = 'weekly_rolling'
    alert(`Produk "${prod.item_name}" beserta seluruh deskripsi pendukungnya disematkan ke slot konten aktif! Buka tab Naskah untuk menyelaraskan ide Anda.`)
  } else {
    customTopic.value = `Fokus produk: ${prod.item_name} [${prod.item_no}]. Keunggulan & Deskripsi: ${data.fullSupportingText}`
    activeViewMode.value = 'weekly_rolling'
    alert(`Produk "${prod.item_name}" disetel sebagai fokus tema rencana mingguan!`)
  }
}

// --- PILAR 5: ACTIONS FOR KONTEN REFERENSI & INSPIRASI ---
function saveNewReferenceItem() {
  if (!newReference.value.title.trim() || !newReference.value.contentText.trim()) {
    alert('Mohon isi Judul dan Naskah Konten Referensi!')
    return
  }
  const item = {
    id: 'ref_' + Date.now(),
    title: newReference.value.title.trim(),
    platform: newReference.value.platform || 'LinkedIn',
    category: newReference.value.category.trim() || 'Inspirasi Konten',
    whyItWorks: newReference.value.whyItWorks.trim() || 'Formula storytelling yang kuat dan memikat audiens B2B.',
    contentText: newReference.value.contentText.trim(),
    sourceUrl: newReference.value.sourceUrl.trim()
  }
  hsoContentReferences.value.unshift(item)
  localStorage.setItem('hso_marketing_content_references', JSON.stringify(hsoContentReferences.value))
  newReference.value = { title: '', platform: 'LinkedIn', category: 'Studi Kasus Tender', whyItWorks: '', contentText: '', sourceUrl: '' }
  isAddingReference.value = false
  alert('Konten referensi & formula berhasil ditambahkan ke Bank Data!')
}

function deleteReferenceItem(id) {
  if (!confirm('Hapus konten referensi ini dari Bank Data?')) return
  hsoContentReferences.value = hsoContentReferences.value.filter(x => x.id !== id)
  localStorage.setItem('hso_marketing_content_references', JSON.stringify(hsoContentReferences.value))
}

function useReferenceInContent(refItem) {
  if (selectedSlotForCuration.value) {
    selectedSlotForCuration.value.userNotes = (selectedSlotForCuration.value.userNotes ? selectedSlotForCuration.value.userNotes + '\n\n' : '') +
      `💡 Terapkan Formula Inspirasi (${refItem.title}):\n• Alasan Menarik: ${refItem.whyItWorks}\n• Contoh Naskah Terbukti: "${refItem.contentText}"`
    saveSlotCuration(false)
    alert(`Formula inspirasi "${refItem.title}" berhasil disematkan ke Catatan Kurasi slot ini! Klik '✨ Rombak Naskah dengan Ide Saya' untuk menyelaraskan naskah.`)
  } else {
    navigator.clipboard.writeText(`${refItem.title}\n\nFormula: ${refItem.whyItWorks}\n\nNaskah:\n${refItem.contentText}`)
    alert(`Formula & teks konten referensi disalin ke clipboard!`)
  }
}

function copyReferenceText(refItem) {
  navigator.clipboard.writeText(`${refItem.title}\nFormula Menarik:\n${refItem.whyItWorks}\n\nTeks Konten:\n${refItem.contentText}`)
  alert('Teks referensi & formula berhasil disalin ke clipboard!')
}

// OnMounted fetch products
onMounted(() => {
  fetchProductsFromDatabase()
})

</script>

<template>
  <div class="space-y-4">
    <!-- ========================================== -->
    <!-- HEADER UTAMA GENG PUNAKAWAN SETRUM (CLEAN B2B) -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-2xs space-y-3">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2 flex-wrap text-xs">
            <span class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-slate-500" />
              {{ squadGangName }}
            </span>

            <span class="text-slate-300 dark:text-slate-700">•</span>

            <span
              v-if="isApiConfigured"
              class="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Otak AI Aktif
            </span>
            <span
              v-else
              class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
            >
              Mode Cerdas HSO
            </span>

            <span class="text-slate-300 dark:text-slate-700">•</span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">
              Desainer: <strong class="text-slate-700 dark:text-slate-300 font-semibold">{{ currentUserName || 'Ndoro Bos' }}</strong>
            </span>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-normal">
            Perencanaan konten mingguan bergulir otomatis yang siap dikurasi, diuji dampak pembaca, dan diterbitkan ke kalender.
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            @click="activeViewMode = 'bank_data'"
            class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <BookOpen class="w-3.5 h-3.5 text-slate-500" />
            <span>Bank Data</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">4 Pilar</span>
          </button>

          <button
            @click="showSettingsModal = true"
            class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Settings class="w-3.5 h-3.5 text-slate-500" />
            <span>Pengaturan AI</span>
            <span v-if="isApiConfigured" class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </button>
        </div>
      </div>

      <!-- Mode Switcher (Clean Segmented Control) -->
      <div class="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div class="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            @click="activeViewMode = 'weekly_rolling'"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            :class="activeViewMode === 'weekly_rolling'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
          >
            <CalendarRange class="w-3.5 h-3.5" />
            <span>Pekan Bergulir (1 Minggu)</span>
          </button>
          <button
            @click="activeViewMode = 'manual_studio'"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            :class="activeViewMode === 'manual_studio'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
          >
            <Edit3 class="w-3.5 h-3.5" />
            <span>Studio Mandiri (1 Konten)</span>
          </button>
          <button
            @click="activeViewMode = 'bank_data'"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            :class="activeViewMode === 'bank_data'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
          >
            <BookOpen class="w-3.5 h-3.5" />
            <span>Bank Data & Intelijen</span>
          </button>
        </div>

        <div class="text-[11px] text-slate-500 dark:text-slate-400">
          Pekan Berjalan: <span class="text-slate-800 dark:text-slate-200 font-semibold font-mono">{{ formatShortDate(currentWeekMondayStr) }} - {{ formatShortDate(addDaysToDateStr(currentWeekMondayStr, 4)) }}</span>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- VIEW 1: PERENCANAAN MINGGUAN BERGULIR (ROLLING WEEKLY PLANNER)            -->
    <!-- ========================================================================= -->
    <div v-if="activeViewMode === 'weekly_rolling'" class="space-y-4 animate-in fade-in duration-150">
      
      <!-- ============================================================== -->
      <!-- KONDISI A: MEJA KERJA DETAIL SLOT (FOKUS KURASI & DESAIN)     -->
      <!-- ============================================================== -->
      <div v-if="selectedSlotForCuration" class="space-y-4 animate-in fade-in duration-150">
        
        <!-- TOP ACTION BAR: TOMBOL KEMBALI & NAVIGASI SLOT -->
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div class="flex items-center gap-2 flex-wrap">
            <button
              @click="closeSlotDetail"
              class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1 transition-colors"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
              <span>Kembali ke 7 Slot Pekan Ini</span>
            </button>

            <span class="text-xs text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>

            <div class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                Slot {{ currentSlotIndex + 1 }} dari {{ currentWeekSlots.length }}
              </span>
              <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {{ selectedSlotForCuration.dayLabel }} ({{ formatIndoDate(selectedSlotForCuration.dateStr) }})
              </span>
            </div>
          </div>

          <!-- Navigasi Lompat Antar Slot (Sebelumnya / Berikutnya / Setujui) -->
          <div class="flex items-center gap-1.5">
            <button
              @click="goToPreviousSlot"
              :disabled="!hasPreviousSlot"
              class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Sebelumnya</span>
            </button>

            <button
              @click="goToNextSlot"
              :disabled="!hasNextSlot"
              class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 disabled:opacity-40 transition-colors"
            >
              <span class="hidden sm:inline">Berikutnya</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>

            <button
              @click="toggleSlotStatus(selectedSlotForCuration, 'approved')"
              class="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all border"
              :class="selectedSlotForCuration.curationStatus === 'approved'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'"
            >
              <Check class="w-3.5 h-3.5" />
              <span>{{ selectedSlotForCuration.curationStatus === 'approved' ? 'Disetujui' : 'Setujui' }}</span>
            </button>
          </div>
        </div>

        <!-- MAIN WORKSPACE CARD (ANTI-OVERFLOW, 100% TIDAK KEGESER) -->
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 sm:p-5 space-y-3.5 overflow-hidden w-full">
          <!-- Baris 1: Judul Konten & Info Agen (Full Width, Wrap Alami) -->
          <div class="flex items-start gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-base shrink-0 mt-0.5">
              {{ (SQUAD_AGENTS.find(a => a.id === selectedSlotForCuration.agentId) || SQUAD_AGENTS[0]).avatarEmoji }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap mb-1">
                <span class="px-1.5 py-0.2 rounded text-[10px] font-medium uppercase border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {{ selectedSlotForCuration.platform }}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[10px] font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {{ selectedSlotForCuration.postType }}
                </span>
                <span class="text-[11px] text-slate-400">
                  • Disiapkan oleh {{ (SQUAD_AGENTS.find(a => a.id === selectedSlotForCuration.agentId) || SQUAD_AGENTS[0]).name }} ({{ (SQUAD_AGENTS.find(a => a.id === selectedSlotForCuration.agentId) || SQUAD_AGENTS[0]).nickname }})
                </span>
              </div>
              <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug break-words">
                {{ selectedSlotForCuration.title }}
              </h3>
            </div>
          </div>

          <!-- Baris 2: Tab Navigasi Khusus (Studio Desain | Naskah | Demo Audience) -->
          <!-- Menempati baris tersendiri dalam pill segmented control agar 100% rapi dan TIDAK PERNAH KEGESER -->
          <div class="border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div class="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 gap-1 flex-wrap">
              <button
                @click="curationActiveTab = 'design'"
                class="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"
                :class="curationActiveTab === 'design'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
              >
                <Palette class="w-3.5 h-3.5 text-slate-500" />
                <span>Studio Desain Grafis</span>
              </button>
              <button
                @click="curationActiveTab = 'content'"
                class="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"
                :class="curationActiveTab === 'content'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
              >
                <FileText class="w-3.5 h-3.5 text-slate-500" />
                <span>Naskah & Copywriting</span>
              </button>
              <button
                @click="curationActiveTab = 'audience'"
                class="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"
                :class="curationActiveTab === 'audience'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
              >
                <Users class="w-3.5 h-3.5 text-slate-500" />
                <span>Demo Audience</span>
                <span
                  v-if="evaluateDemoAudience(selectedSlotForCuration)"
                  class="ml-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                >
                  {{ evaluateDemoAudience(selectedSlotForCuration).avgScore }}%
                </span>
              </button>
            </div>
          </div>

          <!-- TAB 1: STUDIO DESAIN GRAFIS -->
          <div v-show="curationActiveTab === 'design'" class="space-y-4">
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
              <div class="flex items-center justify-between text-xs font-medium">
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Crop class="w-3 h-3" />
                  Format: {{ selectedSlotForCuration.designGuide?.dimensions }}
                </span>
                <span class="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Layout: {{ selectedSlotForCuration.designGuide?.layoutType }}
                </span>
              </div>

              <!-- Teks Overlay yang Wajib Muncul di Gambar -->
              <div class="p-3 rounded-lg bg-slate-900 text-white border border-slate-800 space-y-1">
                <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Headline Utama Overlay:
                </div>
                <div class="text-sm sm:text-base font-bold text-white tracking-tight">
                  "{{ selectedSlotForCuration.designGuide?.headlineOverlay }}"
                </div>
                <div class="text-xs text-slate-400 font-normal">
                  Subheadline / Tagline: {{ selectedSlotForCuration.designGuide?.subHeadlineOverlay }}
                </div>
              </div>

              <!-- Palet Warna yang Direkomendasikan (Bisa Klik untuk Copy HEX) -->
              <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Palette class="w-3.5 h-3.5 text-slate-500" />
                    Palet Warna Brand (Klik untuk Salin HEX)
                  </span>
                  <span v-if="copiedHexCode" class="text-xs text-emerald-600 font-medium">
                    ✓ HEX {{ copiedHexCode }} tersalin
                  </span>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="(color, cIdx) in selectedSlotForCuration.designGuide?.colorPalette"
                    :key="cIdx"
                    @click="copyHex(color.hex)"
                    class="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 flex items-center gap-2 hover:border-slate-400 transition-all text-left group min-w-0 overflow-hidden"
                  >
                    <span
                      class="w-4 h-4 rounded-full border border-black/15 shrink-0 shadow-2xs group-hover:scale-105 transition-transform"
                      :style="{ backgroundColor: color.hex }"
                    ></span>
                    <div class="min-w-0 flex-1">
                      <div class="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate">{{ color.name }}</div>
                      <div class="text-[9px] font-mono text-slate-400 truncate">{{ color.hex }}</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Panduan Komposisi & Tata Letak -->
              <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <h4 class="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Instruksi Penataan Gambar & Lighting (Checklist Desainer)
                </h4>
                <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {{ selectedSlotForCuration.designGuide?.compositionDetails }}
                </p>
              </div>

              <!-- AI Image Generator Prompt -->
              <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles class="w-3.5 h-3.5 text-slate-500" />
                    Prompt AI Image Generator (Midjourney / DALL-E / Canva)
                  </span>
                  <button
                    @click="copyPromptText(selectedSlotForCuration.designGuide?.aiPrompt)"
                    class="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 font-medium flex items-center gap-1"
                  >
                    <Copy class="w-3 h-3" /> Salin Prompt
                  </button>
                </div>
                <div class="p-2.5 rounded bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 font-mono border border-slate-100 dark:border-slate-700/60 select-all leading-relaxed">
                  {{ selectedSlotForCuration.designGuide?.aiPrompt }}
                </div>
              </div>
            </div>

            <!-- SLOT DROPZONE UNGGAH HASIL KARYA DESAINER -->
            <div class="p-3.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <h4 class="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                <Upload class="w-3.5 h-3.5 text-slate-500" />
                Upload File Desain (Atau Tempel Link Canva / Figma / Drive)
              </h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label class="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-slate-400 transition-colors bg-white dark:bg-slate-900">
                    <ImageIcon class="w-6 h-6 text-slate-400" />
                    <span class="text-xs font-medium text-slate-700 dark:text-slate-300 text-center">
                      Unggah file gambar desain
                    </span>
                    <span class="text-[10px] text-slate-400">PNG, JPG, WebP</span>
                    <input type="file" accept="image/*" class="hidden" @change="handleSlotImageUpload" />
                  </label>

                  <div class="mt-2">
                    <input
                      v-model="selectedSlotForCuration.externalImageUrl"
                      type="url"
                      placeholder="Atau tempel Link Canva / Figma / Drive..."
                      class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <!-- Preview Gambar yang Diupload -->
                <div class="min-h-[140px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center p-2.5 relative overflow-hidden">
                  <template v-if="selectedSlotForCuration.uploadedImagePreview">
                    <img :src="selectedSlotForCuration.uploadedImagePreview" class="max-h-48 w-auto object-contain rounded shadow-2xs" alt="Preview Desain" />
                    <button
                      @click="removeSlotImage"
                      class="absolute top-2 right-2 p-1.5 bg-slate-900 text-white rounded hover:bg-red-600 shadow-2xs transition-colors"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </template>
                  <div v-else class="text-center text-slate-400 text-xs p-3">
                    <p class="font-medium text-slate-600 dark:text-slate-300">Belum ada gambar yang diunggah.</p>
                    <p class="text-[11px] mt-0.5 text-slate-400">Gunakan panduan dimensi pixel & palet warna di atas untuk mulai mendesain.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: NASKAH TEKS & COPYWRITING -->
          <div v-show="curationActiveTab === 'content'" class="space-y-3.5">
            
            <!-- ============================================================== -->
            <!-- KOTAK KURASI PERSONAL: IDE, UPDATE & MATERI DARI ANDA           -->
            <!-- ============================================================== -->
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 uppercase">
                    Kurasi Anda
                  </span>
                  <h5 class="font-bold text-slate-900 dark:text-white text-xs">
                    Catatan, Ide Tambahan & Materi dari Anda (Ndoro Bos)
                  </h5>
                </div>
                <span class="text-[11px] font-medium" :class="selectedSlotForCuration.userNotes ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                  {{ selectedSlotForCuration.userNotes ? '✓ Materi Ditambahkan' : 'Belum Ada Materi Tambahan' }}
                </span>
              </div>

              <p class="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Tuliskan materi mentah, sudut pandang baru, update promo proyek, atau instruksi desainer. Geng AI akan merombak naskah & konsep visual agar materi Anda menyatu secara alami.
              </p>

              <!-- QUICK TAG BUTTONS -->
              <div class="flex items-center gap-1 flex-wrap text-xs">
                <span class="text-[10px] font-medium text-slate-400">Poin Cepat:</span>
                <button
                  @click="appendQuickTagToNotes('⚡ Diskon BoQ: Berikan promo volume khusus untuk pengadaan di atas 50 unit sampai akhir bulan ini.')"
                  class="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium hover:border-slate-400 transition-colors"
                >
                  + Diskon BoQ
                </button>
                <button
                  @click="appendQuickTagToNotes('🚚 SLA Sameday: Jaminan pengiriman sameday 24 jam untuk kawasan industri Jabodetabek & Surabaya.')"
                  class="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium hover:border-slate-400 transition-colors"
                >
                  + Stok Ready 24 Jam
                </button>
                <button
                  @click="appendQuickTagToNotes('📜 Sertifikat CoO: Wajib cantumkan jaminan Certificate of Origin resmi dari Siemens untuk audit serah terima.')"
                  class="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium hover:border-slate-400 transition-colors"
                >
                  + Dokumen CoO
                </button>
                <button
                  @click="appendQuickTagToNotes('💡 Audit Lux Gratis: Tawarkan survei dan kalkulasi lux gratis sesuai SNI 03-6575 untuk fasilitas gudang pabrik.')"
                  class="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium hover:border-slate-400 transition-colors"
                >
                  + Audit Lux SNI
                </button>
              </div>

              <!-- TEXTAREA CATATAN & MATERI USER -->
              <textarea
                v-model="selectedSlotForCuration.userNotes"
                rows="3"
                placeholder="Contoh: 'Tolong tonjolkan bahwa minggu ini kita ready stok 150 unit MCCB 3VM11 100A di gudang Cikarang, dan berikan garansi ganti unit 24 jam...'"
                class="w-full p-2.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 font-sans leading-relaxed"
              ></textarea>

              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                <div class="text-[10px] text-slate-400">
                  Materi ini otomatis tersimpan permanen pada slot konten ini.
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    @click="appendNotesToBodyDirectly"
                    :disabled="!selectedSlotForCuration.userNotes?.trim()"
                    class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors disabled:opacity-40"
                    title="Salin dan tempel catatan langsung ke badan naskah"
                  >
                    + Tempel ke Naskah
                  </button>

                  <button
                    @click="integrateUserNotesWithAi"
                    :disabled="isIntegratingUserNotes || !selectedSlotForCuration.userNotes?.trim()"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-40"
                    title="Selaraskan seluruh naskah & konsep visual dengan materi Anda"
                  >
                    <RefreshCw v-if="isIntegratingUserNotes" class="w-3.5 h-3.5 animate-spin" />
                    <Wand2 v-else class="w-3.5 h-3.5" />
                    <span>{{ isIntegratingUserNotes ? 'Menyelaraskan...' : '✨ Rombak Naskah dengan Ide Saya' }}</span>
                  </button>
                </div>
              </div>

              <!-- Alert Sukses Integrasi -->
              <div v-if="userNotesIntegrationSuccess" class="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{{ userNotesIntegrationSuccess }}</span>
              </div>
            </div>

            <!-- Form Edit Naskah -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Tanggal Penayangan
                </label>
                <input
                  v-model="selectedSlotForCuration.dateStr"
                  type="date"
                  class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Platform Penayangan
                </label>
                <select
                  v-model="selectedSlotForCuration.platform"
                  class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 font-medium"
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="facebook">Facebook</option>
                  <option value="email">Email</option>
                  <option value="website">Website</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Judul Konten
              </label>
              <input
                v-model="selectedSlotForCuration.title"
                type="text"
                class="w-full px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Hook 3 Detik / Kalimat Pembuka
              </label>
              <textarea
                v-model="selectedSlotForCuration.hook"
                rows="2"
                class="w-full p-2.5 rounded-lg text-xs italic font-serif bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 leading-relaxed"
              ></textarea>
            </div>

            <!-- BILAH SISIP CEPAT RUJUKAN BANK DATA KE NASKAH -->
            <div class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <BookOpen class="w-3.5 h-3.5 text-slate-500" />
                  Sisipkan Rujukan Bank Data ke Naskah (1-Klik):
                </span>
                <span class="text-[10px] text-slate-400 hidden sm:inline">Pilih rujukan resmi agar tulisan kredibel & menarik</span>
              </div>

              <div class="flex items-center gap-1.5 flex-wrap">
                <!-- Dropdown Web HSO -->
                <div class="relative">
                  <button
                    type="button"
                    @click="toggleQuickInsertMenu('web')"
                    class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 flex items-center gap-1 transition-colors"
                  >
                    <span>🌐</span>
                    <span>+ Link Web</span>
                    <ChevronDown class="w-3 h-3 text-slate-400" />
                  </button>
                  <div
                    v-if="activeQuickInsertMenu === 'web'"
                    class="absolute left-0 mt-1 w-72 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 p-1.5 space-y-1"
                  >
                    <div class="text-[10px] font-semibold text-slate-400 px-2 py-0.5 uppercase">Pilih Halaman Web Resmi:</div>
                    <button
                      v-for="site in hsoWebsites"
                      :key="site.id"
                      @click="useWebsiteInContent(site); activeQuickInsertMenu = null"
                      class="w-full text-left p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs transition-colors flex flex-col"
                    >
                      <span class="font-medium text-slate-800 dark:text-slate-200">{{ site.title }}</span>
                      <span class="text-[10px] text-slate-400 font-mono truncate">{{ site.url }}</span>
                    </button>
                  </div>
                </div>

                <!-- Dropdown Dokumen PDF -->
                <div class="relative">
                  <button
                    type="button"
                    @click="toggleQuickInsertMenu('pdf')"
                    class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 flex items-center gap-1 transition-colors"
                  >
                    <span>📄</span>
                    <span>+ Kutipan PDF</span>
                    <ChevronDown class="w-3 h-3 text-slate-400" />
                  </button>
                  <div
                    v-if="activeQuickInsertMenu === 'pdf'"
                    class="absolute left-0 mt-1 w-80 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 p-1.5 space-y-1"
                  >
                    <div class="text-[10px] font-semibold text-slate-400 px-2 py-0.5 uppercase">Pilih Dokumen PDF / Datasheet:</div>
                    <button
                      v-for="pdf in hsoPdfs"
                      :key="pdf.id"
                      @click="usePdfInContent(pdf); activeQuickInsertMenu = null"
                      class="w-full text-left p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs transition-colors flex flex-col"
                    >
                      <span class="font-medium text-slate-800 dark:text-slate-200">{{ pdf.title }}</span>
                      <span class="text-[10px] text-slate-400 font-mono">{{ pdf.brand }} • {{ pdf.code }}</span>
                    </button>
                  </div>
                </div>

                <!-- Dropdown Produk Accurate -->
                <div class="relative">
                  <button
                    type="button"
                    @click="toggleQuickInsertMenu('product')"
                    class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 flex items-center gap-1 transition-colors"
                  >
                    <span>📦</span>
                    <span>+ Produk Accurate</span>
                    <ChevronDown class="w-3 h-3 text-slate-400" />
                  </button>
                  <div
                    v-if="activeQuickInsertMenu === 'product'"
                    class="absolute left-0 sm:left-auto sm:right-0 mt-1 w-84 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 p-1.5 space-y-1"
                  >
                    <div class="text-[10px] font-semibold text-slate-400 px-2 py-0.5 uppercase">Pilih Produk dari Accurate Online:</div>
                    <button
                      v-for="prod in accurateProducts.slice(0, 15)"
                      :key="prod.id || prod.item_no"
                      @click="useProductInContent(prod); activeQuickInsertMenu = null"
                      class="w-full text-left p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs transition-colors flex flex-col"
                    >
                      <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">{{ prod.item_name }}</span>
                      <span class="text-[10px] text-slate-500 font-mono">MLFB: {{ prod.item_no }} • {{ prod.category }}</span>
                    </button>
                  </div>
                </div>

                <!-- Dropdown Formula Inspirasi Konten -->
                <div class="relative">
                  <button
                    type="button"
                    @click="toggleQuickInsertMenu('reference')"
                    class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 flex items-center gap-1 transition-colors"
                  >
                    <span>💡</span>
                    <span>+ Formula Referensi</span>
                    <ChevronDown class="w-3 h-3 text-slate-400" />
                  </button>
                  <div
                    v-if="activeQuickInsertMenu === 'reference'"
                    class="absolute right-0 mt-1 w-84 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 p-1.5 space-y-1"
                  >
                    <div class="text-[10px] font-semibold text-slate-400 px-2 py-0.5 uppercase">Pilih Formula Konten Terbukti Sukses:</div>
                    <button
                      v-for="refItem in hsoContentReferences"
                      :key="refItem.id"
                      @click="useReferenceInContent(refItem); activeQuickInsertMenu = null"
                      class="w-full text-left p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs transition-colors flex flex-col"
                    >
                      <span class="font-semibold text-slate-800 dark:text-slate-200">{{ refItem.title }}</span>
                      <span class="text-[10px] text-slate-500">{{ refItem.platform }} • {{ refItem.category }}</span>
                      <span class="text-[10px] text-emerald-600 dark:text-emerald-400 italic line-clamp-1 mt-0.5">{{ refItem.whyItWorks }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ================================================================= -->
            <!-- BILAH EKSPANSI KONTEN PANJANG (DEEP LONG-FORM AI ENGINE)             -->
            <!-- ================================================================= -->
            <div class="p-3 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-slate-50/60 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-slate-900/40 space-y-2.5">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-1.5">
                  <span class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                    ✨
                  </span>
                  <div>
                    <h5 class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>Ekspansi Konten Panjang & Mendalam</span>
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                        SumoPod AI
                      </span>
                    </h5>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400">
                      Tulis otomatis artikel SEO 1.500+ kata atau naskah video sutradara scene-by-scene siap produksi
                    </p>
                  </div>
                </div>

                <!-- Tombol Aksi Kontekstual Sesuai Platform -->
                <div class="flex items-center gap-1.5 flex-wrap">
                  <!-- Tombol Spesifik Artikel SEO -->
                  <button
                    v-if="selectedSlotForCuration.platform === 'website' || selectedSlotForCuration.postType?.includes('Blog') || selectedSlotForCuration.postType?.includes('Website')"
                    type="button"
                    @click="expandToLongFormContent('seo_article')"
                    :disabled="isExpandingLongForm"
                    class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
                  >
                    <RefreshCw v-if="isExpandingLongForm" class="w-3.5 h-3.5 animate-spin" />
                    <Sparkles v-else class="w-3.5 h-3.5 text-amber-300" />
                    <span>{{ isExpandingLongForm ? 'Menulis 1.500+ Kata...' : '✨ Kembangkan Jadi Artikel SEO Lengkap (1.500+ Kata)' }}</span>
                  </button>

                  <!-- Tombol Spesifik Naskah Video Sutradara -->
                  <button
                    v-else-if="selectedSlotForCuration.platform === 'tiktok' || selectedSlotForCuration.platform === 'instagram' || selectedSlotForCuration.postType?.includes('Video') || selectedSlotForCuration.postType?.includes('Reels')"
                    type="button"
                    @click="expandToLongFormContent('video_script')"
                    :disabled="isExpandingLongForm"
                    class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
                  >
                    <RefreshCw v-if="isExpandingLongForm" class="w-3.5 h-3.5 animate-spin" />
                    <Video v-else class="w-3.5 h-3.5 text-amber-300" />
                    <span>{{ isExpandingLongForm ? 'Meracik Naskah Scene...' : '🎬 Kembangkan Jadi Naskah Video Scene-by-Scene' }}</span>
                  </button>

                  <!-- Tombol Spesifik Email B2B -->
                  <button
                    v-else-if="selectedSlotForCuration.platform === 'email'"
                    type="button"
                    @click="expandToLongFormContent('b2b_proposal')"
                    :disabled="isExpandingLongForm"
                    class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
                  >
                    <RefreshCw v-if="isExpandingLongForm" class="w-3.5 h-3.5 animate-spin" />
                    <Mail v-else class="w-3.5 h-3.5" />
                    <span>{{ isExpandingLongForm ? 'Meracik Proposal...' : '📩 Kembangkan Surat Penawaran B2B Lengkap' }}</span>
                  </button>

                  <!-- Dropdown Menu Format Panjang Lainnya -->
                  <div class="relative">
                    <button
                      type="button"
                      @click="showLongFormMenu = !showLongFormMenu"
                      :disabled="isExpandingLongForm"
                      class="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <span>Format Lain</span>
                      <ChevronDown class="w-3 h-3 text-slate-400" />
                    </button>

                    <div
                      v-if="showLongFormMenu"
                      class="absolute right-0 mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-30 p-1.5 space-y-1 animate-in fade-in"
                    >
                      <button
                        type="button"
                        @click="expandToLongFormContent('seo_article')"
                        class="w-full text-left p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs transition-colors flex flex-col"
                      >
                        <span class="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>📝</span>
                          <span>Artikel Blog SEO (1.500+ Kata)</span>
                        </span>
                        <span class="text-[10px] text-slate-500 mt-0.5">Dengan H1, H2, tabel spek, FAQ & link toko online</span>
                      </button>

                      <button
                        type="button"
                        @click="expandToLongFormContent('video_script')"
                        class="w-full text-left p-2 rounded hover:bg-purple-50 dark:hover:bg-purple-950/40 text-xs transition-colors flex flex-col"
                      >
                        <span class="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>🎬</span>
                          <span>Naskah Video Scene-by-Scene</span>
                        </span>
                        <span class="text-[10px] text-slate-500 mt-0.5">Visual B-roll, Text on screen (OST), SFX & VO</span>
                      </button>

                      <button
                        type="button"
                        @click="expandToLongFormContent('b2b_proposal')"
                        class="w-full text-left p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition-colors flex flex-col"
                      >
                        <span class="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>📩</span>
                          <span>Penawaran & Proposal Tender B2B</span>
                        </span>
                        <span class="text-[10px] text-slate-500 mt-0.5">A/B Subject, jaminan CoO 24 jam & daftar MLFB</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Notifikasi Progress & Feedback -->
              <div
                v-if="isExpandingLongForm"
                class="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2 animate-pulse"
              >
                <RefreshCw class="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Sedang menulis naskah mendalam via SumoPod AI (memerlukan waktu ~10-15 detik untuk meracik artikel/naskah lengkap)...</span>
              </div>

              <div
                v-if="longFormNotice"
                class="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2"
              >
                <div class="flex items-center gap-1.5">
                  <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{{ longFormNotice }}</span>
                </div>
                <button @click="longFormNotice = ''" class="text-xs text-emerald-600 hover:text-emerald-800">✕</button>
              </div>

              <div
                v-if="longFormError"
                class="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center justify-between gap-2"
              >
                <div class="flex items-center gap-1.5">
                  <AlertCircle class="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                  <span>{{ longFormError }}</span>
                </div>
                <button @click="longFormError = ''" class="text-xs text-red-600 hover:text-red-800">✕</button>
              </div>
            </div>

            <!-- AREA EDITOR & PREVIEW NASKAH -->
            <div>
              <div class="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                <div class="flex items-center gap-2">
                  <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Isi Naskah / Copywriting Lengkap
                  </label>

                  <!-- Badge Indikator Kedalaman Konten & Jumlah Kata -->
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1 border"
                    :class="curationSlotWordCount >= 600
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'"
                  >
                    <span>{{ curationSlotWordCount >= 600 ? '📗 Long-Form' : '📱 Micro-Post' }}</span>
                    <span>•</span>
                    <span>{{ curationSlotWordCount }} Kata</span>
                  </span>
                </div>

                <div class="flex items-center gap-1.5 flex-wrap">
                  <!-- FITUR ANTI-SLOP LIVE INDICATOR & CLEANER -->
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all"
                    :class="detectSlopScore(selectedSlotForCuration).hasSlop
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'"
                  >
                    <ShieldCheck v-if="!detectSlopScore(selectedSlotForCuration).hasSlop" class="w-3 h-3 text-emerald-600" />
                    <AlertCircle v-else class="w-3 h-3 text-amber-500" />
                    <span>{{ detectSlopScore(selectedSlotForCuration).label }}</span>
                  </span>

                  <button
                    v-if="detectSlopScore(selectedSlotForCuration).hasSlop"
                    type="button"
                    @click="cleanSlopFromSlot(selectedSlotForCuration)"
                    class="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-[10px] font-semibold flex items-center gap-1 shadow-2xs transition-all"
                    title="Ganti otomatis frasa klise robotik dengan bahasa lapangan yang mengalir dan natural"
                  >
                    <Sparkles class="w-2.5 h-2.5 text-amber-400" />
                    <span>Bersihkan Klise</span>
                  </button>

                  <span class="text-slate-300 dark:text-slate-700">|</span>

                  <!-- Salin Naskah -->
                  <button
                    type="button"
                    @click="copyBodyToClipboard"
                    class="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-medium flex items-center gap-1 hover:border-slate-400"
                    title="Salin seluruh naskah ke clipboard"
                  >
                    <Check v-if="isCopiedBody" class="w-3 h-3 text-emerald-500" />
                    <Copy v-else class="w-3 h-3 text-slate-400" />
                    <span>{{ isCopiedBody ? 'Tersalin!' : 'Salin Naskah' }}</span>
                  </button>

                  <!-- Toggle View Mode: Editor vs Preview -->
                  <div class="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px]">
                    <button
                      type="button"
                      @click="contentBodyViewMode = 'edit'"
                      class="px-2 py-0.5 rounded font-medium transition-all"
                      :class="contentBodyViewMode === 'edit'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700'"
                    >
                      ✍️ Editor
                    </button>
                    <button
                      type="button"
                      @click="contentBodyViewMode = 'preview'"
                      class="px-2 py-0.5 rounded font-medium transition-all flex items-center gap-1"
                      :class="contentBodyViewMode === 'preview'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700'"
                    >
                      <Eye class="w-2.5 h-2.5" />
                      <span>Preview Baca</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Mode Edit: Textarea Nyaman & Responsif -->
              <div v-show="contentBodyViewMode === 'edit'">
                <textarea
                  v-model="selectedSlotForCuration.body"
                  :rows="curationSlotWordCount >= 400 ? 16 : 8"
                  class="w-full p-3 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 font-sans leading-relaxed"
                  placeholder="Tulis naskah lengkap di sini atau klik tombol 'Ekspansi Konten Panjang' di atas..."
                ></textarea>
              </div>

              <!-- Mode Preview: Tampilan Baca Terformat Indah -->
              <div
                v-show="contentBodyViewMode === 'preview'"
                class="p-4 rounded-lg bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 min-h-[220px] max-h-[500px] overflow-y-auto"
              >
                <div v-html="formatBodyToHtml(selectedSlotForCuration.body)"></div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Call to Action (CTA)
                </label>
                <input
                  v-model="selectedSlotForCuration.cta"
                  type="text"
                  class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Hashtags
                </label>
                <input
                  v-model="selectedSlotForCuration.hashtags"
                  type="text"
                  class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                />
              </div>
            </div>
          </div>

          <!-- TAB 3: DEMO AUDIENCE & PENGUKUR DAMPAK (10 PASAR STRATEGIS PROYEK KELISTRIKAN) -->
          <div v-show="curationActiveTab === 'audience'" class="space-y-4">
            <div
              v-if="selectedSlotForCuration && evaluateDemoAudience(selectedSlotForCuration)"
              class="space-y-4"
            >
              <!-- BANNER SKOR DAMPAK KESELURUHAN (CLEAN DARK CARD) -->
              <div class="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-3">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span class="px-2 py-0.5 rounded text-[10px] font-semibold" :class="evaluateDemoAudience(selectedSlotForCuration).verdictBadge">
                        {{ evaluateDemoAudience(selectedSlotForCuration).overallVerdict }}
                      </span>
                      <span v-if="evaluateDemoAudience(selectedSlotForCuration).isAiGenerated" class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <Sparkles class="w-3 h-3 text-emerald-400" />
                        <span>✨ AI Review Aktif (DeepSeek) • {{ evaluateDemoAudience(selectedSlotForCuration).evaluatedAt }}</span>
                      </span>
                      <span v-else class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                        <span>⚡ Simulator Cerdas (Baseline)</span>
                      </span>
                    </div>

                    <div class="flex items-baseline gap-2">
                      <span class="text-xs text-slate-400">Skor Resonansi Pasar Proyek:</span>
                      <span class="text-emerald-400 font-mono text-xl font-bold">{{ evaluateDemoAudience(selectedSlotForCuration).avgScore }}%</span>
                    </div>
                    <p class="text-xs text-slate-400 mt-1 max-w-2xl leading-normal">
                      {{ evaluateDemoAudience(selectedSlotForCuration).tips }}
                    </p>
                  </div>

                  <div class="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-2 shrink-0">
                    <button
                      @click="runAiAudienceReview()"
                      :disabled="isReviewingWithAi"
                      class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
                      title="Minta AI (DeepSeek) mengevaluasi naskah dari sudut pandang 10 persona pasar strategis secara real-time"
                    >
                      <RefreshCw v-if="isReviewingWithAi" class="w-3.5 h-3.5 animate-spin" />
                      <Bot v-else class="w-3.5 h-3.5" />
                      <span>{{ isReviewingWithAi ? 'AI Menganalisis 10 Pasar...' : (evaluateDemoAudience(selectedSlotForCuration).isAiGenerated ? 'Review Ulang via AI' : 'Jalankan AI Reviewer (10 Pasar)') }}</span>
                    </button>

                    <div class="text-left md:text-right mt-1">
                      <div class="text-[11px] text-slate-400">Resonansi Tertinggi:</div>
                      <div class="font-bold text-white text-xs flex items-center gap-1 justify-start md:justify-end mt-0.5">
                        <span>{{ evaluateDemoAudience(selectedSlotForCuration).topTarget.avatarEmoji }}</span>
                        <span>{{ evaluateDemoAudience(selectedSlotForCuration).topTarget.name }}</span>
                        <span class="text-[10px] font-medium text-emerald-400">({{ evaluateDemoAudience(selectedSlotForCuration).topTarget.strategicMarket }})</span>
                      </div>
                      <div class="text-[10px] text-slate-400">({{ evaluateDemoAudience(selectedSlotForCuration).topTarget.role }})</div>
                    </div>
                  </div>
                </div>

                <!-- STATISTIK DISTRIBUSI 10 AUDIENS -->
                <div class="pt-2.5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div class="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                    <div>
                      <div class="font-bold text-white text-xs">{{ evaluateDemoAudience(selectedSlotForCuration).positiveCount }}/10 Pasar</div>
                      <div class="text-[10px] text-slate-400">Tertarik (≥85%)</div>
                    </div>
                  </div>

                  <div class="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                    <div>
                      <div class="font-bold text-white text-xs">{{ evaluateDemoAudience(selectedSlotForCuration).hesitantCount }}/10 Pasar</div>
                      <div class="text-[10px] text-slate-400">Menimbang (70-84%)</div>
                    </div>
                  </div>

                  <div class="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60">
                    <div class="text-[10px] text-slate-400">Panel & Kontraktor:</div>
                    <div class="font-bold text-slate-200 text-xs mt-0.5">{{ evaluateDemoAudience(selectedSlotForCuration).segmentBreakdown.contractor }}% Minat</div>
                  </div>

                  <div class="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60">
                    <div class="text-[10px] text-slate-400">Konsultan & Estimator:</div>
                    <div class="font-bold text-slate-200 text-xs mt-0.5">{{ evaluateDemoAudience(selectedSlotForCuration).segmentBreakdown.engineering }}% Minat</div>
                  </div>
                </div>
              </div>

              <!-- NOTIFIKASI REVIEW AI -->
              <div
                v-if="aiAudienceReviewSuccess"
                class="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in"
              >
                <CheckCircle2 class="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{{ aiAudienceReviewSuccess }}</span>
              </div>
              <div
                v-if="aiAudienceReviewError"
                class="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2 animate-in fade-in"
              >
                <AlertCircle class="w-4 h-4 text-rose-600 shrink-0" />
                <span>{{ aiAudienceReviewError }}</span>
              </div>

              <!-- KOTAK ACTION: AUTO-IMPROVE DARI MASUKAN AUDIENS -->
              <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      Auto-Improve
                    </span>
                    <h5 class="font-bold text-slate-900 dark:text-white text-xs">
                      Perbaiki Naskah Otomatis Berdasarkan Masukan 10 Pasar
                    </h5>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-normal">
                    {{ evaluateDemoAudience(selectedSlotForCuration).mainCritique }}
                  </p>
                </div>

                <button
                  @click="improveContentFromAudienceFeedback"
                  :disabled="isImprovingWithAudience || isReviewingWithAi"
                  class="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-all shrink-0 disabled:opacity-50"
                >
                  <RefreshCw v-if="isImprovingWithAudience" class="w-3.5 h-3.5 animate-spin" />
                  <Sparkles v-else class="w-3.5 h-3.5" />
                  <span>{{ isImprovingWithAudience ? 'Menyempurnakan & Re-Review...' : 'Terapkan Masukan Audiens' }}</span>
                </button>
              </div>

              <!-- NOTIFIKASI SUKSES AUTO-IMPROVE -->
              <div
                v-if="audienceImproveSuccess"
                class="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2"
              >
                <div class="flex items-center gap-1.5">
                  <CheckCircle2 class="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{{ audienceImproveSuccess }}</span>
                </div>
                <button
                  @click="curationActiveTab = 'content'"
                  class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shrink-0"
                >
                  Lihat Hasil →
                </button>
              </div>

              <!-- DAFTAR 10 PERSONA PASAR STRATEGIS DENGAN FILTER -->
              <div class="space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h5 class="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Users class="w-3.5 h-3.5 text-slate-500" />
                    <span>Panel Suara 10 Pasar Strategis Proyek Kelistrikan</span>
                  </h5>

                  <!-- Filter Segmen Pasar Strategis -->
                  <div class="flex items-center gap-1 text-xs flex-wrap">
                    <button
                      @click="activeAudienceFilter = 'all'"
                      class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      :class="activeAudienceFilter === 'all'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                    >
                      Semua (10)
                    </button>
                    <button
                      @click="activeAudienceFilter = 'panel_maker'"
                      class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      :class="activeAudienceFilter === 'panel_maker'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                    >
                      Panel Maker
                    </button>
                    <button
                      @click="activeAudienceFilter = 'contractor'"
                      class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      :class="activeAudienceFilter === 'contractor'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                    >
                      Kontraktor
                    </button>
                    <button
                      @click="activeAudienceFilter = 'consultant'"
                      class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      :class="activeAudienceFilter === 'consultant'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                    >
                      Konsultan
                    </button>
                    <button
                      @click="activeAudienceFilter = 'end_user'"
                      class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      :class="activeAudienceFilter === 'end_user'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                    >
                      End User / Pabrik
                    </button>
                    <button
                      @click="activeAudienceFilter = 'estimator'"
                      class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      :class="activeAudienceFilter === 'estimator'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                    >
                      Estimator & Purchasing
                    </button>
                    <button
                      @click="activeAudienceFilter = 'field'"
                      class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      :class="activeAudienceFilter === 'field'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
                    >
                      Teknisi & Lapangan
                    </button>
                  </div>
                </div>

                <!-- GRID 10 KARTU AUDIENS -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div
                    v-for="persona in evaluateDemoAudience(selectedSlotForCuration).reviews.filter(p => activeAudienceFilter === 'all' || p.segment === activeAudienceFilter || p.strategicMarket === activeAudienceFilter)"
                    :key="persona.id"
                    class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-2 shadow-2xs flex flex-col justify-between"
                  >
                    <div class="space-y-2">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2">
                          <div class="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs shrink-0">
                            {{ persona.avatarEmoji }}
                          </div>
                          <div>
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class="font-semibold text-slate-900 dark:text-white text-xs">
                                {{ persona.name }} ({{ persona.age }} thn)
                              </span>
                              <span v-if="persona.strategicMarket" class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                {{ persona.strategicMarket }}
                              </span>
                            </div>
                            <div class="text-[10px] text-slate-400">
                              {{ persona.role }} • {{ persona.location }}
                            </div>
                          </div>
                        </div>

                        <div class="text-right shrink-0">
                          <div class="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {{ persona.score }}%
                          </div>
                          <div class="text-[9px] text-slate-400">Daya Tarik</div>
                        </div>
                      </div>

                      <div class="flex items-center gap-1 text-[10px]">
                        <span class="text-slate-400">Reaksi:</span>
                        <span class="font-medium text-slate-700 dark:text-slate-300">{{ persona.reaction }}</span>
                      </div>

                      <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 italic font-serif leading-relaxed border border-slate-100 dark:border-slate-700/50 text-[11px]">
                        {{ persona.quote }}
                      </div>

                      <div class="text-[10px] text-slate-500 dark:text-slate-400">
                        <span class="font-semibold text-slate-700 dark:text-slate-300">Penentu:</span> {{ persona.whatMatters }}
                      </div>
                    </div>

                    <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div class="text-[10px] text-slate-600 dark:text-slate-400 truncate flex items-center gap-1">
                        <Target class="w-3 h-3 text-slate-400 shrink-0" />
                        <span class="truncate">{{ persona.actionTriggered }}</span>
                      </div>

                      <button
                        @click="applyIndividualFeedback(persona)"
                        class="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-[10px] font-medium flex items-center gap-1 shrink-0 transition-colors"
                        title="Sisipkan penegasan kebutuhan persona ini ke naskah"
                      >
                        <Plus class="w-2.5 h-2.5" />
                        <span>Terapkan</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- FOOTER WORKSPACE AKSI SIMPAN -->
          <div class="pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <button
              @click="closeSlotDetail"
              class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
            >
              ← Kembali ke Daftar Slot
            </button>

            <div class="flex items-center gap-2">
              <button
                v-if="hasNextSlot"
                @click="saveAndGoToNextSlot"
                class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-800 dark:text-white text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <span>Simpan & Lanjut</span>
                <ChevronRight class="w-3 h-3" />
              </button>

              <button
                @click="saveSlotCuration(true)"
                class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs flex items-center gap-1"
              >
                <Check class="w-3.5 h-3.5" />
                <span>Simpan & Selesai</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- KONDISI B: OVERVIEW 7 SLOT PEKAN BERJALAN (CLEAN & MODERN)    -->
      <!-- ============================================================== -->
      <div v-else class="space-y-4">
        
        <!-- TOOLBAR PEKAN TERPADU & BERSIH -->
        <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs space-y-3">
          
          <!-- Baris 1: Stepper Pekan & Aksi Cepat -->
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <!-- Stepper Navigasi Pekan -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                @click="goToPreviousWeek"
                class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
                title="Pekan Sebelumnya"
              >
                <ChevronLeft class="w-3.5 h-3.5" />
              </button>

              <div class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Calendar class="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Pekan ke-{{ currentWeekNumber }}</span>
                <span class="text-slate-400 font-normal">({{ formatWeekRange(currentWeekMondayStr) }})</span>
              </div>

              <button
                @click="goToNextWeek"
                class="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs"
                title="Pekan Berikutnya"
              >
                <ChevronRight class="w-3.5 h-3.5" />
              </button>

              <!-- Pemilih Tanggal Kustom Minimalis -->
              <div class="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <span class="text-[10px] text-slate-400 font-medium">Mulai:</span>
                <input
                  type="date"
                  :value="currentWeekMondayStr"
                  @change="onCustomDateChange"
                  class="bg-transparent text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                />
              </div>
            </div>

            <!-- Tombol Aksi Utama -->
            <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <!-- Toggle Arahan Tema -->
              <button
                @click="showThemePromptBar = !showThemePromptBar"
                class="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-all"
                :class="showThemePromptBar
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'"
              >
                <Sparkles class="w-3.5 h-3.5 text-slate-500" />
                <span>{{ showThemePromptBar ? 'Tutup Arahan' : 'Arahan Tema' }}</span>
                <ChevronDown class="w-3 h-3 transition-transform" :class="showThemePromptBar ? 'rotate-180' : ''" />
              </button>

              <!-- Tombol Racik 1 Minggu -->
              <button
                @click="generateCurrentWeekPlan(true)"
                :disabled="isGeneratingAI"
                class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
              >
                <RefreshCw v-if="isGeneratingAI" class="w-3.5 h-3.5 animate-spin" />
                <Sparkles v-else class="w-3.5 h-3.5" />
                <span>{{ isGeneratingAI ? 'Meracik...' : 'Racik 1 Minggu' }}</span>
              </button>

              <!-- Tombol Terbitkan Pekan Ini -->
              <button
                @click="publishActiveWeekSlots"
                :disabled="isBatchPublishing || approvedCount === 0"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50"
              >
                <CheckCheck v-if="!isBatchPublishing" class="w-3.5 h-3.5" />
                <RefreshCw v-else class="w-3.5 h-3.5 animate-spin" />
                <span>Terbitkan ({{ approvedCount }})</span>
              </button>
            </div>
          </div>

          <!-- COLLAPSIBLE ARAHAN TEMA KHUSUS (RAPI & RINGKAS) -->
          <div v-if="showThemePromptBar" class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2 animate-in fade-in">
            <div class="flex items-center justify-between text-xs flex-wrap gap-2">
              <span class="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles class="w-3.5 h-3.5 text-amber-500" />
                <span>Pilih Pilar Tema Strategis atau Tulis Topik Bebas:</span>
              </span>
              <button
                type="button"
                @click="randomizeWeeklyTheme"
                class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-all"
                title="Pilih otomatis tema baru yang segar dan belum pernah dibahas"
              >
                <span>🎲 Acak Tema Segar (Surprise Me)</span>
              </button>
            </div>

            <!-- Input Bebas -->
            <div class="flex items-center gap-2">
              <input
                v-model="currentWeekFocusTopic"
                type="text"
                placeholder="Tulis tema khusus (misal: Audit Hemat Listrik Pabrik, Motor Starter SIRIUS, PJU Solar Cell)..."
                class="flex-1 px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
              <button
                @click="generateCurrentWeekPlan(true)"
                class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-semibold shrink-0 shadow-2xs"
              >
                Racik Tema Ini
              </button>
              <button
                v-if="currentWeekFocusTopic"
                @click="currentWeekFocusTopic = ''; generateCurrentWeekPlan(true)"
                class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 text-xs"
                title="Reset Tema ke Otomatis"
              >
                Reset
              </button>
            </div>

            <!-- 8 Pilar Tema Strategis (1-Klik Racik) -->
            <div class="space-y-1 pt-1">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">8 Pilar Tema Mingguan Siap Pakai (Klik untuk Ganti Konsep):</div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <button
                  v-for="theme in EDITORIAL_THEMES"
                  :key="theme.id"
                  @click="applyTopicPreset(theme.title)"
                  class="px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-all"
                  :class="currentWeekFocusTopic === theme.title
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 shadow-2xs font-semibold'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50'"
                  :title="theme.angle"
                >
                  <span>{{ theme.badge }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Baris 2: Filter Status, Progress Ringkas & Setujui Semua -->
          <div class="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-1.5">
              <button
                @click="activeCurationFilter = 'all'"
                class="px-2.5 py-1 rounded-md font-medium transition-all text-xs"
                :class="activeCurationFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'"
              >
                Semua ({{ currentWeekSlots.length }})
              </button>
              <button
                @click="activeCurationFilter = 'approved'"
                class="px-2.5 py-1 rounded-md font-medium transition-all text-xs flex items-center gap-1"
                :class="activeCurationFilter === 'approved'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50'"
              >
                ✓ Disetujui ({{ approvedCount }})
              </button>
              <button
                @click="activeCurationFilter = 'pending'"
                class="px-2.5 py-1 rounded-md font-medium transition-all text-xs flex items-center gap-1"
                :class="activeCurationFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50'"
              >
                ⏳ Perlu Kurasi ({{ pendingCount }})
              </button>
            </div>

            <div class="flex items-center gap-3">
              <span class="text-slate-500 dark:text-slate-400 text-[11px]">
                Progres: <strong class="text-slate-800 dark:text-slate-200 font-semibold">{{ approvedCount }}/7 Disetujui</strong> • {{ imageReadyCount }}/7 Desain Siap
              </span>
              <button
                @click="approveAllFilteredSlots"
                class="text-slate-700 dark:text-slate-300 font-medium hover:underline flex items-center gap-1 text-xs"
              >
                <CheckCheck class="w-3.5 h-3.5" />
                <span>Setujui Semua</span>
              </button>
            </div>
          </div>
        </div>

        <!-- NOTIFIKASI GENERASI / ERROR / NOTICE -->
        <div v-if="aiGenerationNotice" class="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <Sparkles class="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>{{ aiGenerationNotice }}</span>
          </div>
          <button @click="aiGenerationNotice = ''" class="text-xs text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div v-if="aiGenerationError" class="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <AlertCircle class="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span>{{ aiGenerationError }}</span>
          </div>
          <button @click="aiGenerationError = ''" class="text-xs text-red-400 hover:text-red-600">✕</button>
        </div>

        <!-- Banner Sukses Penerbitan Batch -->
        <div
          v-if="batchPublishSuccess"
          class="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
        >
          <div class="flex items-center gap-2">
            <CheckCircle2 class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{{ batchPublishSuccess }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              @click="goToNextWeek"
              class="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs hover:bg-slate-50 transition-colors flex items-center gap-1"
            >
              <span>Lanjut Pekan Berikutnya</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
            <button
              @click="emit('navigate-to-calendar')"
              class="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors flex items-center gap-1"
            >
              <Calendar class="w-3.5 h-3.5" />
              <span>Buka Kalender</span>
            </button>
          </div>
        </div>

        <!-- GRID 7 KARTU SLOT KONTEN PEKAN INI (CLEAN, TIDAK SALING TINDIH) -->
        <div v-if="filteredSlots.length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div
            v-for="slot in filteredSlots"
            :key="slot.id"
            @click="openSlotDetail(slot)"
            class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs relative group cursor-pointer"
            :class="slot.curationStatus === 'approved'
              ? 'border-emerald-300 dark:border-emerald-800/80 ring-1 ring-emerald-500/20'
              : slot.curationStatus === 'rejected'
              ? 'opacity-60 bg-slate-50/50'
              : ''"
          >
            <div class="space-y-2.5">
              <!-- Header Kartu: Hari & Status Kurasi -->
              <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                    <Calendar class="w-3 h-3 text-slate-500" />
                    {{ slot.dayLabel }}, {{ formatShortDate(slot.dateStr) }}
                  </span>
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-medium uppercase tracking-wider text-slate-400">
                    {{ slot.platform }}
                  </span>
                </div>

                <!-- Status Pill -->
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                  :class="slot.curationStatus === 'approved'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="slot.curationStatus === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'"></span>
                  {{ slot.curationStatus === 'approved' ? 'Disetujui' : 'Perlu Kurasi' }}
                </span>
              </div>

              <!-- Profil Agen Penulis -->
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs shrink-0">
                  {{ (SQUAD_AGENTS.find(a => a.id === slot.agentId) || SQUAD_AGENTS[0]).avatarEmoji }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                    {{ (SQUAD_AGENTS.find(a => a.id === slot.agentId) || SQUAD_AGENTS[0]).name }}
                  </div>
                  <div class="text-[10px] text-slate-400 truncate">
                    {{ slot.postType }} • {{ slot.category }}
                  </div>
                </div>
              </div>

              <!-- Judul Konten (Kecil, Rapi, line-clamp-2) -->
              <h4 class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                {{ slot.title }}
              </h4>

              <!-- Hook Preview (Rapi, line-clamp-2) -->
              <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 italic font-serif leading-relaxed pl-2 border-l border-slate-200 dark:border-slate-700 py-0.5">
                "{{ slot.hook }}"
              </p>

              <!-- Bar Status Desain & Resonansi -->
              <div class="flex items-center justify-between text-[10px] pt-1 text-slate-400">
                <span class="flex items-center gap-1 font-medium">
                  <Palette class="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{{ slot.designGuide?.dimensions || '1080x1350' }}</span>
                  <span>•</span>
                  <span :class="slot.uploadedImagePreview || slot.externalImageUrl ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'">
                    {{ slot.uploadedImagePreview || slot.externalImageUrl ? '✓ Desain Siap' : 'Menunggu Desain' }}
                  </span>
                </span>

                <span
                  v-if="evaluateDemoAudience(slot)"
                  class="font-mono font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1"
                  title="Skor Resonansi 10 Audiens B2B"
                >
                  <span>Resonansi:</span>
                  <span class="text-slate-800 dark:text-slate-200 font-bold">{{ evaluateDemoAudience(slot).avgScore }}%</span>
                </span>
              </div>
            </div>

            <!-- Footer Kartu: Quick Action Buttons -->
            <div class="pt-2.5 mt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
              <button
                @click.stop="toggleSlotStatus(slot, 'approved')"
                class="px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 border border-slate-200 dark:border-slate-700"
                :class="slot.curationStatus === 'approved'
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-500'"
              >
                <Check class="w-3 h-3" />
                <span>{{ slot.curationStatus === 'approved' ? 'Disetujui' : 'Setujui' }}</span>
              </button>

              <button
                @click.stop="openSlotDetail(slot)"
                class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <span>Meja Kerja</span>
                <ArrowRight class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State jika tidak ada slot sesuai filter -->
        <div v-else class="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <div class="text-xl">📅</div>
          <div class="font-bold text-xs text-slate-900 dark:text-white">Tidak ada konten pada filter ini</div>
          <p class="text-[11px] text-slate-400">Klik "Semua" atau racik rencana baru untuk pekan ini.</p>
        </div>
      </div>
    </div>


    <!-- VIEW 2: STUDIO MANDIRI (1 KONTEN DADAKAN)                                -->
    <!-- ========================================================================= -->
    <div v-if="activeViewMode === 'manual_studio'" class="space-y-4 animate-in fade-in duration-150">
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3.5">
        <div class="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-base shrink-0">
            {{ currentAgent.avatarEmoji }}
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
              Briefing Studio Mandiri untuk {{ currentAgent.name }}
            </h3>
            <p class="text-[11px] text-slate-400">
              Gunakan mode ini jika Anda ingin menyusun 1 naskah dadakan di luar rencana pekanan.
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Pilih Agen Penulis
              </label>
              <select
                v-model="selectedAgentId"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              >
                <option v-for="a in SQUAD_AGENTS" :key="a.id" :value="a.id">
                  {{ a.avatarEmoji }} {{ a.name }} ({{ a.nickname }})
                </option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Kategori Konten
              </label>
              <select
                v-model="contentCategory"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              >
                <option value="siemens">⚡ Siemens Power Distribution (MCCB, ACB, SIRIUS, PAC, S7-1200)</option>
                <option value="protection">🛡️ Rekayasa Proteksi & Standar IEC (Selektivitas, Kaskade, Arc Flash)</option>
                <option value="testing">🔬 Pengujian Lapangan & FAT/SAT (Injeksi Sekunder, Megger, TCC)</option>
                <option value="bts">🏢 Operasional & Keandalan Pasokan (Quality Control, CoO, Ready Stock)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Topik Naskah
            </label>
            <textarea
              v-model="customTopic"
              rows="3"
              placeholder="Tulis topik atau kebutuhan konten..."
              class="w-full p-2.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
            ></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- MODAL PENGATURAN MESIN AI                                                 -->
    <!-- ========================================================================= -->
    <div
      v-if="showSettingsModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in"
    >
      <div class="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-3.5 relative">
        <div class="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
              <Key class="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 class="font-bold text-slate-900 dark:text-white text-sm">
                Pengaturan Mesin Kecerdasan AI
              </h3>
              <p class="text-[11px] text-slate-400">Kelola koneksi model cerdas untuk {{ squadGangName }}</p>
            </div>
          </div>
          <button @click="showSettingsModal = false" class="text-slate-400 hover:text-slate-600 p-1 text-sm">
            ✕
          </button>
        </div>

        <div class="space-y-3">
          <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
            Kunci akses AI Anda disimpan secara aman di browser lokal Anda. Jika kunci dikosongkan, sistem otomatis beroperasi dalam <strong>Mode Cerdas Built-in HSO</strong>.
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Kunci Akses AI (API Key)
              </label>
              <button
                @click="showApiKeyText = !showApiKeyText"
                class="text-[10px] text-slate-500 hover:underline"
              >
                {{ showApiKeyText ? 'Sembunyikan' : 'Tampilkan' }}
              </button>
            </div>
            <input
              v-model="sumopodApiKey"
              :type="showApiKeyText ? 'text' : 'password'"
              placeholder="sp-..."
              class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-slate-400"
            />
          </div>

          <!-- PILIHAN CEPAT PROVIDER (1-KLIK) -->
          <div class="space-y-1">
            <label class="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
              Pilihan Cepat Provider:
            </label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                @click="applyProviderPreset('deepseek')"
                class="px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
                :class="sumopodBaseUrl.includes('api.deepseek.com')
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'"
              >
                <span>⚡ DeepSeek</span>
              </button>
              <button
                type="button"
                @click="applyProviderPreset('sumopod')"
                class="px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
                :class="sumopodBaseUrl.includes('ai.sumopod.com')
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'"
              >
                <span>🐙 SumoPod</span>
              </button>
              <button
                type="button"
                @click="applyProviderPreset('openai')"
                class="px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
                :class="sumopodBaseUrl.includes('api.openai.com')
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'"
              >
                <span>🌐 OpenAI</span>
              </button>
              <button
                type="button"
                @click="applyProviderPreset('groq')"
                class="px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
                :class="sumopodBaseUrl.includes('api.groq.com')
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'"
              >
                <span>🚀 Groq</span>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Base URL Endpoint
            </label>
            <input
              v-model="sumopodBaseUrl"
              type="text"
              placeholder="https://ai.sumopod.com/v1"
              class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-slate-400"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Pilihan Model AI
              </label>
              <div class="flex items-center gap-2">
                <button
                  @click="fetchSumopodModels(false)"
                  :disabled="isFetchingModels || !sumopodApiKey.trim()"
                  class="text-[10px] text-slate-600 dark:text-slate-400 font-medium hover:underline flex items-center gap-1 disabled:opacity-50"
                  title="Panggil /v1/models untuk menarik daftar model AI resmi"
                >
                  <RefreshCw class="w-3 h-3" :class="isFetchingModels ? 'animate-spin' : ''" />
                  <span>{{ isFetchingModels ? 'Memuat...' : 'Tarik Model (/v1/models)' }}</span>
                </button>
                <span class="text-slate-300">|</span>
                <button
                  @click="isManualModelInput = !isManualModelInput"
                  class="text-[10px] text-slate-400 hover:text-slate-600"
                >
                  {{ isManualModelInput ? 'Mode Pilihan' : 'Ketik Manual' }}
                </button>
              </div>
            </div>

            <div v-if="isManualModelInput">
              <input
                v-model="sumopodModel"
                type="text"
                placeholder="Contoh: deepseek-chat, gpt-4o-mini..."
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-slate-400"
              />
            </div>
            <div v-else>
              <select
                v-model="sumopodModel"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-slate-400"
              >
                <option v-for="m in availableModels" :key="m" :value="m">
                  {{ m }}
                </option>
              </select>
            </div>

            <!-- Rekomendasi Model Cepat -->
            <div class="flex items-center gap-1 flex-wrap pt-1.5">
              <span class="text-[10px] text-slate-400">Pilihan Cepat:</span>
              <button
                v-for="preset in ['deepseek-chat', 'deepseek/deepseek-chat', 'gpt-4o-mini', 'deepseek-reasoner']"
                :key="preset"
                @click="sumopodModel = preset"
                class="text-[10px] px-2 py-0.5 rounded border font-mono transition-colors"
                :class="sumopodModel === preset
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'"
              >
                {{ preset }}
              </button>
            </div>
          </div>

          <!-- UJI KONEKSI BUTTON & STATUS -->
          <div class="pt-1.5">
            <button
              @click="testSumopodConnection"
              :disabled="isTestingConnection || !sumopodApiKey.trim()"
              class="w-full py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw v-if="isTestingConnection" class="w-3 h-3 animate-spin" />
              <Zap v-else class="w-3 h-3 text-slate-500" />
              <span>{{ isTestingConnection ? 'Menguji Koneksi...' : 'Uji Koneksi Mesin AI' }}</span>
            </button>

            <div
              v-if="connectionStatus"
              class="mt-2 p-2 rounded-lg text-xs flex items-start gap-1.5"
              :class="connectionStatus === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'"
            >
              <CheckCircle2 v-if="connectionStatus === 'success'" class="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <AlertCircle v-else class="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <span>{{ connectionMessage }}</span>
            </div>
          </div>
        </div>

        <div class="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            @click="showSettingsModal = false"
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Tutup
          </button>
          <button
            @click="saveSettings"
            class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold shadow-2xs"
          >
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- VIEW 3: BANK DATA & INTELIJEN KELISTRIKAN HSO (4 PILAR TANPA MODAL)       -->
    <!-- ========================================================================= -->
    <div v-if="activeViewMode === 'bank_data'" class="space-y-4 animate-in fade-in duration-150">
      
      <!-- BREADCRUMB & HEADER BANK DATA -->
      <div class="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mb-1">
            <span>{{ squadGangName }}</span>
            <span>/</span>
            <span class="text-slate-700 dark:text-slate-300 font-semibold">Bank Data & Intelijen</span>
            <span>/</span>
            <span>5 Pilar Terhubung AI</span>
          </div>
          <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Bank Data & Intelijen HSO</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              5 Pilar Terhubung AI
            </span>
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-3xl leading-normal">
            Bank data resmi yang dipelajari Mas Tejo, Ir. Bagong, S.T., Mbak Sri, dan Ir. Broto Kusumo, M.T. Mengintegrasikan Situs Korporat, Artikel Rekayasa Teknik, Dokumen PDF & Datasheet, Database Produk Accurate, serta Analisis Studi Kasus Lapangan.
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            @click="activeViewMode = 'weekly_rolling'"
            class="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5 shadow-2xs hover:opacity-90 transition-all"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Kembali ke Jadwal Mingguan</span>
          </button>
        </div>
      </div>

      <!-- INFORMASI RESMI PANDUAN DOMAIN & PROMPTING DINAMIS -->
      <div class="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-blue-900 dark:text-blue-200">
        <div class="flex items-start sm:items-center gap-2">
          <span class="text-base shrink-0">📌</span>
          <div>
            <span class="font-bold">Panduan Domain Resmi:</span>
            <span> Cek Produk & Stok di <strong class="font-mono text-blue-700 dark:text-blue-300">shop.hokiindo.co.id</strong> (bukan di HSO internal) • Company Profile & Tender di <strong class="font-mono text-blue-700 dark:text-blue-300">hokiindo.co.id</strong>.</span>
          </div>
        </div>
        <div class="shrink-0 text-[11px] font-medium text-blue-700 dark:text-blue-300 bg-white dark:bg-blue-900/50 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
          ⚡ Semua penambahan bank data otomatis diserap AI
        </div>
      </div>

      <!-- 5 PILAR SUMMARY CARDS (CLEAN MINIMAL TABS) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        
        <!-- Card 1: Situs Sendiri -->
        <button
          @click="activeBankDataTab = 'websites'"
          class="p-3 rounded-xl border text-left transition-all relative group shadow-2xs bg-white dark:bg-slate-900"
          :class="activeBankDataTab === 'websites'
            ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-900/10'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-base">🌐</span>
            <span class="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {{ hsoWebsites.length }} Link
            </span>
          </div>
          <div class="font-bold text-slate-900 dark:text-white text-xs">1. Situs Sendiri & Web</div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">Portal hokiindo.com & katalog digital</div>
        </button>

        <!-- Card 2: Artikel Teknik -->
        <button
          @click="activeBankDataTab = 'articles'"
          class="p-3 rounded-xl border text-left transition-all relative group shadow-2xs bg-white dark:bg-slate-900"
          :class="activeBankDataTab === 'articles'
            ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-900/10'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-base">📰</span>
            <span class="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {{ hsoArticles.length }} Artikel
            </span>
          </div>
          <div class="font-bold text-slate-900 dark:text-white text-xs">2. Artikel & Kasus Teknik</div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">Standar PUIL 2020, IEC & lux SNI</div>
        </button>

        <!-- Card 3: Dokumen PDF Produk -->
        <button
          @click="activeBankDataTab = 'pdfs'"
          class="p-3 rounded-xl border text-left transition-all relative group shadow-2xs bg-white dark:bg-slate-900"
          :class="activeBankDataTab === 'pdfs'
            ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-900/10'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-base">📄</span>
            <span class="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {{ hsoPdfs.length }} Dokumen
            </span>
          </div>
          <div class="font-bold text-slate-900 dark:text-white text-xs">3. PDF Produk & Brosur</div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">Katalog resmi Sentron & G-Comin</div>
        </button>

        <!-- Card 4: Database Produk Accurate -->
        <button
          @click="activeBankDataTab = 'products'"
          class="p-3 rounded-xl border text-left transition-all relative group shadow-2xs bg-white dark:bg-slate-900"
          :class="activeBankDataTab === 'products'
            ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-900/10'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-base">📦</span>
            <span class="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {{ totalProductsCount }} Produk
            </span>
          </div>
          <div class="font-bold text-slate-900 dark:text-white text-xs">4. Database Produk Accurate</div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">Deskripsi lengkap Accurate & MLFB</div>
        </button>

        <!-- Card 5: Konten Referensi & Inspirasi Serupa -->
        <button
          @click="activeBankDataTab = 'references'"
          class="p-3 rounded-xl border text-left transition-all relative group shadow-2xs bg-white dark:bg-slate-900"
          :class="activeBankDataTab === 'references'
            ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-900/10'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-base">💡</span>
            <span class="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {{ hsoContentReferences.length }} Referensi
            </span>
          </div>
          <div class="font-bold text-slate-900 dark:text-white text-xs">5. Konten Referensi Serupa</div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">Formula sukses, hook & studi kasus</div>
        </button>
      </div>

      <!-- ===================================================================== -->
      <!-- TAB 1: SITUS SENDIRI & HALAMAN WEB RESMI HSO                          -->
      <!-- ===================================================================== -->
      <div v-show="activeBankDataTab === 'websites'" class="space-y-3">
        
        <!-- Filter Bar & Tambah Button -->
        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
          <div class="relative flex-1 max-w-md">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
            <input
              v-model="searchWebsiteQuery"
              type="text"
              placeholder="Cari situs sendiri, landing page, atau URL..."
              class="w-full pl-8 pr-3 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
            />
          </div>

          <button
            @click="isAddingWebsite = !isAddingWebsite"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ isAddingWebsite ? 'Tutup Form' : 'Tambah Halaman Web' }}</span>
          </button>
        </div>

        <!-- FORM INLINE TAMBAH SITUS SENDIRI -->
        <div v-if="isAddingWebsite" class="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in">
          <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
            <Globe class="w-3.5 h-3.5 text-slate-500" />
            Tambah Halaman Situs Web Hokiindo ke Bank Data
          </h4>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Nama / Judul Halaman Web</label>
              <input
                v-model="newWebsite.title"
                type="text"
                placeholder="Contoh: Katalog Online Siemens Sentron & Sirius"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">URL Halaman</label>
              <input
                v-model="newWebsite.url"
                type="text"
                placeholder="https://shop.hokiindo.co.id atau https://hokiindo.co.id"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Kategori Halaman</label>
              <input
                v-model="newWebsite.category"
                type="text"
                placeholder="Contoh: Solusi Rekayasa Panel / E-Commerce"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Deskripsi Singkat & Nilai Tambah (USP)</label>
              <input
                v-model="newWebsite.description"
                type="text"
                placeholder="Jelaskan peran halaman ini untuk calon pelanggan Hokiindo"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-semibold text-slate-500 mb-1">Poin-poin Unggulan (Pisahkan per baris baru enter)</label>
            <textarea
              v-model="newWebsite.highlightsText"
              rows="2"
              placeholder="- Jaminan 100% Produk Original&#10;- Sertifikat CoO untuk tender"
              class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            ></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button @click="isAddingWebsite = false" class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700">Batal</button>
            <button @click="saveNewWebsiteItem" class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold">Simpan Situs</button>
          </div>
        </div>

        <!-- GRID LIST SITUS SENDIRI -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="site in filteredWebsites"
            :key="site.id"
            class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-3 hover:border-slate-300 transition-all"
          >
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2.5">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm font-bold">
                    🌐
                  </div>
                  <div>
                    <h5 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{{ site.title }}</h5>
                    <span class="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{{ site.category }}</span>
                  </div>
                </div>

                <button
                  @click="deleteWebsiteItem(site.id)"
                  class="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                  title="Hapus Situs"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- URL Pill -->
              <div class="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                <span class="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">{{ site.url }}</span>
                <a
                  :href="site.url"
                  target="_blank"
                  class="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-white shrink-0"
                  title="Buka Website"
                >
                  <ExternalLink class="w-3 h-3" />
                </a>
              </div>

              <p class="text-xs text-slate-500 dark:text-slate-400 leading-normal">{{ site.description }}</p>

              <!-- Highlights -->
              <div v-if="site.highlights && site.highlights.length" class="space-y-0.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div class="text-[10px] font-semibold uppercase text-slate-400">Poin Kunci:</div>
                <ul class="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <li v-for="(h, idx) in site.highlights" :key="idx" class="flex items-start gap-1.5">
                    <span class="text-slate-400 font-bold shrink-0">•</span>
                    <span>{{ h }}</span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Footer Action Buttons -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <a
                :href="site.url"
                target="_blank"
                class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1"
              >
                <ExternalLink class="w-3 h-3" />
                <span>Buka Link ↗</span>
              </a>

              <button
                @click="useWebsiteInContent(site)"
                class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                title="Sisipkan link situs ke naskah"
              >
                <Zap class="w-3 h-3" />
                <span>Sisipkan ke Konten</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===================================================================== -->
      <!-- TAB 2: ARTIKEL TEKNIK & STUDI KASUS KELISTRIKAN                       -->
      <!-- ===================================================================== -->
      <div v-show="activeBankDataTab === 'articles'" class="space-y-3">
        
        <!-- Filter Bar & Tambah Button -->
        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
          <div class="relative flex-1 max-w-md">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
            <input
              v-model="searchArticleQuery"
              type="text"
              placeholder="Cari artikel, standar PUIL, IEC, studi kasus..."
              class="w-full pl-8 pr-3 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
            />
          </div>

          <button
            @click="isAddingArticle = !isAddingArticle"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ isAddingArticle ? 'Tutup Form' : 'Tambah Artikel Teknik' }}</span>
          </button>
        </div>

        <!-- FORM INLINE TAMBAH ARTIKEL -->
        <div v-if="isAddingArticle" class="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in">
          <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
            <FileText class="w-3.5 h-3.5 text-slate-500" />
            Tambah Artikel / Riset Teknik ke Bank Data
          </h4>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Judul Artikel</label>
              <input
                v-model="newArticle.title"
                type="text"
                placeholder="Contoh: Pedoman Selektivitas Breaker Sesuai PUIL 2020"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Penulis / Sumber Referensi</label>
              <input
                v-model="newArticle.author"
                type="text"
                placeholder="Contoh: Tim Engineering HSO (Ref: IEC 60947-2)"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Kategori Artikel</label>
              <input
                v-model="newArticle.category"
                type="text"
                placeholder="Standar Proteksi Siemens / PUIL / G-Comin"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Tags Pencarian (Pisahkan dengan koma)</label>
              <input
                v-model="newArticle.tags"
                type="text"
                placeholder="PUIL 2020, ACB 3WA, L-I-S-G, Selektivitas"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-semibold text-slate-500 mb-1">Ringkasan Teknis Artikel</label>
            <textarea
              v-model="newArticle.summary"
              rows="3"
              placeholder="Uraikan intisari teknis, rumus perhitungan, atau studi kasus..."
              class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            ></textarea>
          </div>

          <div>
            <label class="block text-[10px] font-semibold text-slate-500 mb-1">Key Takeaways / Poin Kunci (Pisahkan per baris enter)</label>
            <textarea
              v-model="newArticle.insightsText"
              rows="2"
              placeholder="- Nilai Ics 100% menjamin proteksi berulang&#10;- Kurva L-I-S-G mencegah tripping pada breaker utama"
              class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            ></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button @click="isAddingArticle = false" class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700">Batal</button>
            <button @click="saveNewArticleItem" class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold">Simpan Artikel</button>
          </div>
        </div>

        <!-- GRID LIST ARTIKEL -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="art in filteredArticles"
            :key="art.id"
            class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-3 hover:border-slate-300 transition-all"
          >
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2.5">
                <div>
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {{ art.category }}
                  </span>
                  <h5 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm mt-1 leading-snug">{{ art.title }}</h5>
                  <div class="text-[10px] text-slate-400 mt-0.5 font-medium">Oleh: {{ art.author }}</div>
                </div>

                <button
                  @click="deleteArticleItem(art.id)"
                  class="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                  title="Hapus Artikel"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-normal font-sans">
                {{ art.summary }}
              </div>

              <!-- Key Insights -->
              <div v-if="art.keyInsights && art.keyInsights.length" class="space-y-0.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div class="text-[10px] font-semibold uppercase text-slate-400">Poin Kunci Edukasi:</div>
                <ul class="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <li v-for="(k, idx) in art.keyInsights" :key="idx" class="flex items-start gap-1.5">
                    <span class="text-slate-400 font-bold shrink-0">✓</span>
                    <span>{{ k }}</span>
                  </li>
                </ul>
              </div>

              <!-- Tags -->
              <div v-if="art.tags && art.tags.length" class="flex flex-wrap gap-1 pt-0.5">
                <span v-for="tag in art.tags" :key="tag" class="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  #{{ tag }}
                </span>
              </div>
            </div>

            <!-- Footer Action Buttons -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                @click="useArticleInContent(art)"
                class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                title="Sisipkan kutipan artikel ke naskah aktif"
              >
                <Zap class="w-3 h-3" />
                <span>Kutip ke Konten</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===================================================================== -->
      <!-- TAB 3: DOKUMEN PDF PRODUK, BROSUR & DATASHEET                         -->
      <!-- ===================================================================== -->
      <div v-show="activeBankDataTab === 'pdfs'" class="space-y-3">
        
        <!-- Filter Bar & Tambah Button -->
        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
          <div class="relative flex-1 max-w-md">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
            <input
              v-model="searchPdfQuery"
              type="text"
              placeholder="Cari katalog PDF, kode brosur, seri 3VM, 3WA..."
              class="w-full pl-8 pr-3 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
            />
          </div>

          <button
            @click="isAddingPdf = !isAddingPdf"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ isAddingPdf ? 'Tutup Form' : 'Tambah Dokumen PDF' }}</span>
          </button>
        </div>

        <!-- FORM INLINE TAMBAH PDF -->
        <div v-if="isAddingPdf" class="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in">
          <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
            <FileText class="w-3.5 h-3.5 text-slate-500" />
            Tambah Katalog / Brosur / Datasheet PDF ke Bank Data
          </h4>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2">
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Nama Dokumen PDF</label>
              <input
                v-model="newPdf.title"
                type="text"
                placeholder="Contoh: Datasheet Teknis Siemens Sentron 3VM MCCB"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Brand</label>
              <select v-model="newPdf.brand" class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                <option value="SIEMENS">SIEMENS</option>
                <option value="G-COMIN">G-COMIN</option>
                <option value="SCHNEIDER">SCHNEIDER</option>
                <option value="LAINNYA">LAINNYA</option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Kategori Produk</label>
              <input
                v-model="newPdf.category"
                type="text"
                placeholder="MCCB / ACB / Lighting / Contactor"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Kode Dokumen / Seri</label>
              <input
                v-model="newPdf.code"
                type="text"
                placeholder="DS-3VM-2026"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-slate-500 mb-1">Link URL PDF (atau Google Drive)</label>
              <input
                v-model="newPdf.url"
                type="text"
                placeholder="https://hokiindo.com/downloads/datasheets/3vm.pdf"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-semibold text-slate-500 mb-1">Poin Ringkasan Spesifikasi (Pisahkan per baris enter)</label>
            <textarea
              v-model="newPdf.specsText"
              rows="2"
              placeholder="- Rentang arus 16A hingga 630A, 3P & 4P&#10;- Breaking capacity 36kA pada 415V AC"
              class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            ></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button @click="isAddingPdf = false" class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700">Batal</button>
            <button @click="saveNewPdfItem" class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold">Simpan PDF</button>
          </div>
        </div>

        <!-- GRID LIST PDF PRODUK -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="pdf in filteredPdfs"
            :key="pdf.id"
            class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-3 hover:border-slate-300 transition-all"
          >
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2.5">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm font-bold">
                    📄
                  </div>
                  <div>
                    <h5 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{{ pdf.title }}</h5>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {{ pdf.brand }}
                      </span>
                      <span class="text-[10px] text-slate-400 font-mono">{{ pdf.code }} • {{ pdf.size }}</span>
                    </div>
                  </div>
                </div>

                <button
                  @click="deletePdfItem(pdf.id)"
                  class="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                  title="Hapus PDF"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Poin Spesifikasi PDF -->
              <div v-if="pdf.specsSummary && pdf.specsSummary.length" class="space-y-0.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div class="text-[10px] font-semibold uppercase text-slate-400">Ringkasan Spesifikasi:</div>
                <ul class="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <li v-for="(sp, idx) in pdf.specsSummary" :key="idx" class="flex items-start gap-1.5">
                    <span class="text-slate-400 font-bold shrink-0">•</span>
                    <span>{{ sp }}</span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Footer Action Buttons -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <a
                :href="pdf.url"
                target="_blank"
                class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1"
              >
                <Download class="w-3 h-3" />
                <span>Buka PDF ↗</span>
              </a>

              <button
                @click="usePdfInContent(pdf)"
                class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                title="Sisipkan link PDF ke naskah konten"
              >
                <Zap class="w-3 h-3" />
                <span>Tarik ke Konten</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===================================================================== -->
      <!-- TAB 4: DATABASE PRODUK ACCURATE (KATALOG MASTER HSO)                  -->
      <!-- ===================================================================== -->
      <div v-show="activeBankDataTab === 'products'" class="space-y-3">
        
        <!-- Filter & Search Bar Database Produk Accurate -->
        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shadow-2xs">
          <div class="flex items-center gap-2 flex-1 flex-wrap sm:flex-nowrap">
            <div class="relative flex-1 min-w-[200px]">
              <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
              <input
                v-model="searchProductQuery"
                type="text"
                placeholder="Cari part number MLFB Accurate, nama produk, ampere, kA..."
                class="w-full pl-8 pr-3 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>

            <!-- Brand Filter -->
            <select
              v-model="productBrandFilter"
              class="px-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
            >
              <option value="all">Semua Brand</option>
              <option value="SIEMENS">⚡ Siemens</option>
              <option value="G-COMIN">💡 G-Comin</option>
            </select>

            <!-- Category Filter -->
            <select
              v-model="productCategoryFilter"
              class="px-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium max-w-[170px]"
            >
              <option value="all">Semua Kategori ({{ accurateProducts.length }})</option>
              <option value="MCCB">MCCB (Molded Case)</option>
              <option value="MCB">MCB (Miniature)</option>
              <option value="ACB">ACB (Air Circuit Breaker)</option>
              <option value="RCCB">RCCB / ELCB (Earth Leakage)</option>
              <option value="RCBO">RCBO (Leakage + Overload)</option>
              <option value="CONTACTOR">Contactor (Power)</option>
              <option value="CONTACTOR_RELAY">Contactor Relay / Auxiliary</option>
              <option value="TOR">TOR (Thermal Overload)</option>
              <option value="MPCB">MPCB (Motor Protection)</option>
              <option value="SOFT_STARTER">Soft Starter (Sirius)</option>
              <option value="VFD">Inverter / VFD (Sinamics)</option>
              <option value="PILOT_DEVICE">Pilot Device / Push Button</option>
              <option value="POWER_SUPPLY">Power Supply (Sitop 24V)</option>
              <option value="PLC_AUTOMATION">PLC & Otomasi (Simatic)</option>
              <option value="SPD_MODULAR">Surge Arrester (SPD)</option>
              <option value="LIGHTING">Lighting LED (G-Comin / HSO)</option>
              <option value="ACCESSORIES">Aksesoris Panel & Shunt</option>
              <option value="OTHER">Lainnya / Komponen Lain</option>
            </select>
          </div>

          <button
            @click="fetchProductsFromDatabase(true)"
            :disabled="isFetchingProducts"
            class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
            title="Tarik seluruh ribuan produk terbaru dari database Accurate / Supabase"
          >
            <RefreshCw class="w-3 h-3" :class="isFetchingProducts ? 'animate-spin' : ''" />
            <span>{{ isFetchingProducts ? 'Menyinkronkan...' : 'Sinkronkan Database Accurate' }}</span>
          </button>
        </div>

        <!-- INFO BANNER DATABASE ACCURATE -->
        <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Menampilkan <strong>{{ displayedProducts.length }}</strong> dari <strong>{{ filteredProducts.length.toLocaleString('id-ID') }}</strong> produk terfilter (Total Master: <strong>{{ accurateProducts.length.toLocaleString('id-ID') }}</strong> produk Accurate). Seluruh nomor part number MLFB, ampere, kA, harga, dan deskripsi produk lengkap dipelajari secara mendalam oleh {{ squadGangName }}.</span>
          </div>
          <div class="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
            <span class="px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
              ✓ {{ accurateProducts.length.toLocaleString('id-ID') }} Accurate Master Sync
            </span>
          </div>
        </div>

        <!-- GRID LIST PRODUK DENGAN DESKRIPSI LENGKAP -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="prod in displayedProducts"
            :key="prod.id || prod.item_no"
            class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-3 hover:border-slate-300 transition-all"
          >
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2.5">
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap mb-1">
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {{ prod.brand || 'HSO' }}
                    </span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {{ prod.category || 'KOMPONEN' }}
                    </span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      ✓ Ready Stock ({{ prod.stock_quantity || 100 }} Pcs)
                    </span>
                  </div>

                  <h5 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm leading-snug">{{ prod.item_name }}</h5>
                  <div class="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                    Part No / MLFB: <span class="text-slate-800 dark:text-slate-200 font-semibold select-all">{{ prod.item_no }}</span>
                  </div>
                </div>

                <div v-if="prod.unit_price" class="text-right shrink-0">
                  <div class="text-[10px] text-slate-400">Harga:</div>
                  <div class="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    Rp {{ Number(prod.unit_price).toLocaleString('id-ID') }}
                  </div>
                </div>
              </div>

              <!-- DESKRIPSI MASTER ACCURATE -->
              <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-normal font-sans space-y-1">
                <div class="text-[10px] font-semibold uppercase text-slate-400 tracking-wide flex items-center justify-between">
                  <span class="flex items-center gap-1">
                    <BookOpen class="w-3 h-3 text-slate-500" />
                    <span>Deskripsi Master Accurate Online:</span>
                  </span>
                  <span class="text-[9px] font-mono text-emerald-600 dark:text-emerald-400">🧠 Dipelajari AI</span>
                </div>
                <p class="select-text text-[11px] leading-relaxed">{{ prod.long_description || prod.description || prod.item_name }}</p>
              </div>

              <!-- DESKRIPSI PENDUKUNG TEKNIS, APLIKASI & PEMASARAN -->
              <div class="p-2.5 rounded-lg bg-blue-50/40 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-xs space-y-2">
                <div class="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center justify-between">
                  <span class="flex items-center gap-1">
                    <Zap class="w-3 h-3" />
                    <span>Deskripsi Pendukung (Wawasan Spesifikasi & Pasar):</span>
                  </span>
                  <button
                    @click="openEditSupportingNote(prod)"
                    class="text-[10px] text-blue-600 dark:text-blue-300 hover:underline flex items-center gap-0.5"
                  >
                    <Edit3 class="w-2.5 h-2.5" />
                    <span>{{ productSupportingNotes[prod.item_no] ? 'Ubah Catatan' : '+ Tambah Catatan' }}</span>
                  </button>
                </div>

                <!-- Chips Spesifikasi Pendukung -->
                <div class="flex items-center gap-1.5 flex-wrap text-[10px]">
                  <span v-if="resolveProductSupportingData(prod).currentRating" class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 font-mono font-medium text-blue-800 dark:text-blue-300">
                    ⚡ {{ resolveProductSupportingData(prod).currentRating }}
                  </span>
                  <span v-if="resolveProductSupportingData(prod).poles" class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 font-mono font-medium text-slate-700 dark:text-slate-300">
                    {{ resolveProductSupportingData(prod).poles }}
                  </span>
                  <span v-if="resolveProductSupportingData(prod).breakingCapacity" class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 font-mono font-medium text-emerald-700 dark:text-emerald-300">
                    🛡️ {{ resolveProductSupportingData(prod).breakingCapacity }}
                  </span>
                  <span class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-slate-600 dark:text-slate-400">
                    📜 {{ resolveProductSupportingData(prod).standard }}
                  </span>
                </div>

                <!-- Aplikasi Panel & Proteksi -->
                <div class="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                  <span class="font-semibold text-slate-700 dark:text-slate-200">Aplikasi Panel:</span>
                  {{ resolveProductSupportingData(prod).application }}.
                </div>

                <div v-if="resolveProductSupportingData(prod).tripUnit" class="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                  <span class="font-semibold text-slate-700 dark:text-slate-200">Karakteristik Proteksi:</span>
                  {{ resolveProductSupportingData(prod).tripUnit }}.
                </div>

                <!-- Catatan Tambahan Pengguna jika ada -->
                <div
                  v-if="productSupportingNotes[prod.item_no]"
                  class="p-1.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 leading-normal"
                >
                  <span class="font-bold">💡 Catatan Tambahan Khusus:</span>
                  "{{ productSupportingNotes[prod.item_no] }}"
                </div>
              </div>

              <!-- Datasheet link if available -->
              <div v-if="prod.datasheet" class="flex items-center gap-1.5 text-[11px]">
                <FileText class="w-3 h-3 text-slate-400" />
                <span class="text-slate-400">Datasheet:</span>
                <a :href="prod.datasheet" target="_blank" class="text-slate-700 dark:text-slate-300 hover:underline font-medium flex items-center gap-1">
                  <span>Lihat PDF Datasheet</span>
                  <ExternalLink class="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            <!-- Footer Action Buttons -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5 flex-wrap">
              <div class="flex items-center gap-1">
                <button
                  @click="copyProductDescription(prod)"
                  class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                  title="Salin deskripsi pendukung lengkap ke clipboard"
                >
                  <Copy class="w-3 h-3" />
                  <span>Salin Lengkap</span>
                </button>

                <button
                  @click="openEditSupportingNote(prod)"
                  class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors"
                  title="Tambah atau edit catatan pendukung khusus untuk produk ini"
                >
                  <Edit3 class="w-3 h-3 text-slate-500" />
                  <span>Catatan Khusus</span>
                </button>
              </div>

              <div class="flex items-center gap-1.5">
                <button
                  @click="createContentFromAccurateProduct(prod)"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors shadow-2xs"
                  title="Jadikan produk ini fokus ide konten AI"
                >
                  <Sparkles class="w-3 h-3 text-amber-500" />
                  <span>Buat Konten AI</span>
                </button>

                <button
                  @click="useProductInContent(prod)"
                  class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center gap-1 shadow-2xs transition-all"
                  title="Suntikkan spesifikasi lengkap ke naskah konten AI"
                >
                  <Zap class="w-3 h-3" />
                  <span>Pakai di Naskah</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- LOAD MORE / PROGRESIF RENDERING (MUDAH JELAJAH RIBUAN PRODUK) -->
        <div v-if="filteredProducts.length > displayedProducts.length" class="text-center pt-2 pb-4">
          <button
            @click="loadMoreProducts"
            class="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors shadow-2xs inline-flex items-center gap-1.5"
          >
            <span>Tampilkan 40 Produk Berikutnya</span>
            <span class="text-[10px] text-slate-400 font-normal font-mono">(Tersisa {{ (filteredProducts.length - displayedProducts.length).toLocaleString('id-ID') }} produk)</span>
          </button>
        </div>
      </div>

      <!-- ===================================================================== -->
      <!-- TAB 5: BANK KONTEN REFERENSI & INSPIRASI SERUPA (FORMULA SUKSES)       -->
      <!-- ===================================================================== -->
      <div v-show="activeBankDataTab === 'references'" class="space-y-3">
        
        <!-- Filter Bar & Tambah Button -->
        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
          <div class="flex items-center gap-2 flex-1 flex-wrap sm:flex-nowrap">
            <div class="relative flex-1 min-w-[200px]">
              <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
              <input
                v-model="searchReferenceQuery"
                type="text"
                placeholder="Cari konten referensi, formula viral, hook, topik..."
                class="w-full pl-8 pr-3 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>

            <!-- Platform Filter -->
            <select
              v-model="referencePlatformFilter"
              class="px-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
            >
              <option value="all">Semua Platform</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Instagram">Instagram / Reels</option>
              <option value="TikTok">TikTok</option>
              <option value="Facebook">Facebook</option>
              <option value="Email">Email Blast</option>
            </select>
          </div>

          <button
            @click="isAddingReference = !isAddingReference"
            class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ isAddingReference ? 'Tutup Form' : 'Tambah Konten Referensi' }}</span>
          </button>
        </div>

        <!-- FORM INLINE TAMBAH KONTEN REFERENSI BARU -->
        <div
          v-if="isAddingReference"
          class="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in duration-150"
        >
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wide flex items-center gap-1.5">
              <span>💡</span>
              <span>Tambah Contoh Konten Serupa ke Bank Data</span>
            </h5>
            <span class="text-[10px] text-slate-400">Formula & pola ini akan dipelajari AI untuk membuat konten berikutnya</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div class="sm:col-span-2">
              <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Judul Referensi / Topik Utama *
              </label>
              <input
                v-model="newReference.title"
                type="text"
                placeholder="Contoh: 'Studi Kasus Lolos Audit Tender CoO Siemens'"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Platform Konten
              </label>
              <select
                v-model="newReference.platform"
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 font-medium"
              >
                <option value="LinkedIn">LinkedIn</option>
                <option value="Instagram / Reels">Instagram / Reels</option>
                <option value="TikTok">TikTok</option>
                <option value="Facebook">Facebook</option>
                <option value="Email">Email</option>
                <option value="Website Blog">Website Blog</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Kategori Konten
              </label>
              <input
                v-model="newReference.category"
                type="text"
                placeholder="Contoh: 'Studi Kasus Tender', 'Hook Cepat Edukasi', 'Meme Proyek'..."
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Link Sumber / URL Postingan Asli (Opsional)
              </label>
              <input
                v-model="newReference.sourceUrl"
                type="url"
                placeholder="https://linkedin.com/posts/..."
                class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Mengapa Konten Ini Menarik? (Formula Sukses / Pola yang Ditiru) *
            </label>
            <input
              v-model="newReference.whyItWorks"
              type="text"
              placeholder="Contoh: 'Hook provokatif sebutkan kerugian uang Rp 120 juta + Solusi sertifikat CoO resmi + CTA santai konsultasi'"
              class="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 font-sans"
            />
          </div>

          <div>
            <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Cuplikan Naskah / Teks Konten Asli *
            </label>
            <textarea
              v-model="newReference.contentText"
              rows="4"
              placeholder="Tempel teks postingan asli, hook, atau narasi konten di sini..."
              class="w-full p-2.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 font-sans leading-relaxed"
            ></textarea>
          </div>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              @click="isAddingReference = false"
              class="px-3 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-700"
            >
              Batal
            </button>
            <button
              @click="saveNewReferenceItem"
              class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold shadow-2xs"
            >
              Simpan Konten Referensi
            </button>
          </div>
        </div>

        <!-- INFO BANNER PILAR 5 -->
        <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Tersimpan <strong>{{ filteredReferences.length }}</strong> konten referensi & inspirasi terbukti. Pola analisis teknis dan hook-nya otomatis diadopsi oleh {{ squadGangName }}.</span>
          </div>
          <span class="text-[10px] text-slate-400 shrink-0 hidden sm:inline">Formula Siap Tiru</span>
        </div>

        <!-- GRID LIST KONTEN REFERENSI -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="refItem in filteredReferences"
            :key="refItem.id"
            class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-3 hover:border-slate-300 transition-all"
          >
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2.5">
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap mb-1">
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {{ refItem.platform }}
                    </span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {{ refItem.category }}
                    </span>
                  </div>

                  <h5 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm leading-snug">{{ refItem.title }}</h5>
                </div>

                <button
                  @click="deleteReferenceItem(refItem.id)"
                  class="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                  title="Hapus referensi ini"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- FORMULA KENAPA MENARIK -->
              <div class="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200 leading-normal space-y-0.5">
                <div class="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <span>💡</span>
                  <span>Mengapa Menarik (Formula Sukses):</span>
                </div>
                <p class="text-[11px]">{{ refItem.whyItWorks }}</p>
              </div>

              <!-- CUPLIKAN TEKS NASKAH ASLI -->
              <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-normal font-sans space-y-1">
                <div class="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">
                  Cuplikan Naskah Contoh:
                </div>
                <p class="select-text text-[11px] whitespace-pre-line">{{ refItem.contentText }}</p>
              </div>

              <!-- Link Sumber jika ada -->
              <div v-if="refItem.sourceUrl" class="flex items-center gap-1.5 text-[11px]">
                <ExternalLink class="w-3 h-3 text-slate-400" />
                <a :href="refItem.sourceUrl" target="_blank" class="text-slate-500 dark:text-slate-400 hover:underline truncate">
                  {{ refItem.sourceUrl }}
                </a>
              </div>
            </div>

            <!-- Footer Action Buttons -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                @click="copyReferenceText(refItem)"
                class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                title="Salin teks dan formula"
              >
                <Copy class="w-3 h-3" />
                <span>Salin Teks</span>
              </button>

              <button
                @click="useReferenceInContent(refItem)"
                class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center gap-1 shadow-2xs transition-all"
                title="Terapkan formula konten ini ke slot aktif"
              >
                <Sparkles class="w-3 h-3" />
                <span>✨ Tiru Formula ke Konten</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL EDIT CATATAN PENDUKUNG PRODUK ACCURATE                   -->
    <!-- ============================================================== -->
    <div
      v-if="editingProductNoteItem"
      class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 max-w-lg w-full space-y-3 shadow-xl animate-in zoom-in-95 duration-150">
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <div>
            <h4 class="font-bold text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-1.5">
              <span>✏️</span>
              <span>Tambah / Ubah Deskripsi Pendukung Produk</span>
            </h4>
            <div class="text-[11px] text-slate-500 font-mono mt-0.5">
              {{ editingProductNoteItem.item_name }} (MLFB: {{ editingProductNoteItem.item_no }})
            </div>
          </div>
          <button
            @click="editingProductNoteItem = null"
            class="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400 leading-normal">
          Tuliskan catatan pendukung spesifik seperti keunggulan di lapangan, promo BoQ, catatan tender konsultan, atau kondisi ketersediaan gudang. Deskripsi pendukung ini akan otomatis disimpan dan dipelajari AI saat menyusun naskah & hook untuk produk ini.
        </p>

        <textarea
          v-model="editingNoteText"
          rows="4"
          placeholder="Contoh: 'Stok ready 140 pcs di gudang Cikarang siap sameday. Sangat dicari kontraktor panel maker gedung bertingkat karena trip unit TM220 presisi dan bersertifikat CoO resmi pabrikan...'"
          class="w-full p-2.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400 font-sans leading-relaxed"
        ></textarea>

        <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <button
            @click="editingProductNoteItem = null"
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Batal
          </button>
          <button
            @click="saveSupportingNote"
            class="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold shadow-2xs"
          >
            Simpan Deskripsi Pendukung
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
