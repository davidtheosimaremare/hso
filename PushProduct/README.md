# 🚀 PushProduct — Chrome Extension (SiePortal ➜ Accurate Online)

Ekstensi Google Chrome khusus untuk mengekstrak data produk dari **Siemens SiePortal** dan secara otomatis mengisi formulir **Barang & Jasa (Item)** di **Accurate Online** dengan 1-klik.

---

## 📌 Fitur Utama

1. **Auto-Detect & Parse dari SiePortal**:
   - Mendeteksi halaman produk aktif seperti: `https://sieportal.siemens.com/en-id/products-services/detail/5TJ4110-6?tree=CatalogTree`.
   - Mengambil Kode Produk (MLFB), Deskripsi Lengkap, dan Harga Beli web.

2. **AI-Powered Title & Spec Refinement (Google Gemini Flash)**:
   - Terintegrasi langsung dengan model AI mutakhir **Gemini 1.5 Flash** untuk menjamin akurasi deskripsi hingga 100%.
   - Gemini membaca parameter teknis kompleks dari halaman SiePortal (tipe produk, seri, poles, ampere, kurva trip, breaking capacity kA, tegangan, dan auxiliary contacts) lalu menyusunnya menjadi format baku Accurate:
     - **Deskripsi Asli di SiePortal**:
       `SINOPLUS, Miniature Circuit Breaker 240/415V 10kA, 1-pole B, 10 A`
     - **Hasil Format Judul Accurate**:
       `SIEMENS MCB, 5TJ4110-6, SINOPLUS, 1P, 10A, CURVE B, 10KA, 240/415V AC`
   - Tersedia tombol **"✨ Sempurnakan Judul dengan Gemini Flash"** di laci SiePortal maupun di popup ekstensi.

3. **Perhitungan Otomatis Pricelist Accurate**:
   - Menggunakan rumus margin resmi:
     $$\text{Pricelist} = \frac{\text{Harga SIEPortal}}{0.63 \times 0.7} = \frac{\text{Harga SIEPortal}}{0.441}$$
   - Contoh: Jika harga SiePortal adalah **Rp 63.000**, maka Pricelist otomatis terhitung: **Rp 142.857**.
   - Dilengkapi input real-time jika harga di web SiePortal memerlukan login atau tersembunyi.

4. **Pemetaan Kolom Formulir Accurate Online**:
   | Kolom Accurate | Nilai Otomatis | Keterangan |
   |----------------|----------------|------------|
   | **Nama Barang / Judul** | `SIEMENS MCB, 5TJ4110-6, SINOPLUS, 1P, 10A, CURVE B, 10KA, 240/415V AC` | Sesuai deskripsi terstruktur |
   | **Kode Barang** | `5TJ4110-6` | Sesuai MLFB produk |
   | **Brand** | `Siemens` | Otomatis Siemens |
   | **Kategori** | `MCB` | Auto-detect kategori Accurate |
   | **Jenis Barang** | `Persediaan` | Default inventory item |
   | **Satuan** | `pcs` | Default satuan Accurate |
   | **Harga Jual / Pricelist** | `Rp 142.857` | Hasil $\text{Harga} / 0.63 / 0.7$ |

5. **Auto-Fill 1-Klik**:
   - Klik **"🚀 Buka & Isi di Accurate Online"**.
   - Jika tab Accurate Online sudah terbuka, ekstensi langsung berpindah ke tab tersebut dan memunculkan tombol **"⚡ Isi Formulir Sekarang"**.
   - Jika belum terbuka, ekstensi membuka tab baru `https://accurate.id/accurate/`.
   - Mengisi kolom secara reaktif (kompatibel dengan sistem Single Page App Accurate).

---

## 🛠️ Panduan Instalasi di Google Chrome

1. Buka browser **Google Chrome**.
2. Masuk ke halaman pengelolaan ekstensi dengan mengetikkan di address bar:
   ```text
   chrome://extensions/
   ```
3. Aktifkan tombol **"Developer mode"** (Mode pengembang) di pojok kanan atas.
4. Klik tombol **"Load unpacked"** (Muat yang belum dibongkar) di pojok kiri atas.
5. Arahkan dan pilih folder:
   ```text
   /Users/davidtheo/01_HOKIINDO/WEBSITE/hso/PushProduct
   ```
6. Ekstensi **PushProduct - SiePortal to Accurate** kini telah aktif dan terpasang di Chrome Anda!
7. *(Opsional)* Klik ikon puzzle di toolbar Chrome dan sematkan (Pin) ikon **PushProduct** agar selalu mudah diakses.

---

## 📖 Cara Penggunaan

### Cara 1: Menggunakan Tombol Mengambang (Floating Action Button) di SiePortal
1. Buka produk Siemens di SiePortal, contohnya:
   `https://sieportal.siemens.com/en-id/products-services/detail/5TJ4110-6?tree=CatalogTree`
2. Di pojok kanan bawah halaman akan muncul tombol mengambang:
   **`⚡ Push to Accurate [5TJ4110-6]`**
3. Klik tombol tersebut untuk membuka laci pratinjau (slide-in drawer).
4. Periksa judul dan masukkan harga jika harga di web belum tampil.
5. Klik **"🚀 Buka & Isi di Accurate Online"**.
6. Tab Accurate Online akan otomatis aktif dan formulir Barang & Jasa siap diisi!

### Cara 2: Menggunakan Popup Ekstensi di Toolbar
1. Klik ikon **PushProduct** di toolbar Chrome.
2. Ekstensi otomatis membaca produk di tab aktif atau memungkinkan input manual.
3. Anda dapat menyalin judul langsung dengan tombol **"Salin"** atau mengeklik **"Buka & Isi di Accurate Online"**.

---

## 📁 Struktur File Ekstensi `PushProduct`

```
PushProduct/
├── manifest.json              # Konfigurasi Chrome Extension Manifest V3
├── parser.js                  # Engine parsing deskripsi & perhitungan rumus pricelist
├── background.js              # Service worker penghubung SiePortal dan Accurate
├── content-sieportal.js       # Script injeksi untuk membaca SiePortal & floating widget
├── content-sieportal.css      # Desain laci mengambang & floating action button
├── content-accurate.js        # Script injeksi untuk auto-fill di Accurate Online
├── content-accurate.css       # Desain banner notifikasi di Accurate Online
├── popup.html                 # Antarmuka popup toolbar
├── popup.css                  # Desain visual popup modern
├── popup.js                   # Logika popup, riwayat, dan pengaturan
├── icons/                     # Ikon PNG resmi ekstensi
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── CHROMEWEBSTORE.md          # Dokumentasi kesiapan publikasi Chrome Web Store
└── README.md                  # Panduan lengkap penggunaan
```

---

## 🤖 Cara Mengaktifkan Google Gemini Flash AI
Untuk mendapatkan akurasi maksimal dalam membaca katalog Siemens:
1. Dapatkan API Key Google Gemini gratis di [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Klik ikon ekstensi **PushProduct** di toolbar Chrome.
3. Masuk ke tab **"⚙️ Pengaturan"**.
4. Tempel API Key Anda pada kolom **"Google Gemini API Key"**.
5. Pilih model (disarankan **Gemini 1.5 Flash**).
6. Klik **"🔌 Uji Koneksi AI"** untuk memastikan koneksi berhasil, lalu klik **"💾 Simpan API Key"**.
7. Sekarang setiap membuka produk di SiePortal, klik **"✨ Sempurnakan Judul dengan Gemini Flash"** untuk mendapatkan judul inventori yang 100% presisi!

---

## 🏷️ Integrasi Kategori Barang dari Accurate Online
Ekstensi secara khusus dirancang agar pemilihan kategori produk **selalu sesuai dengan database Kategori Barang di Accurate Online**:
1. **Daftar Kategori Resmi Accurate**:
   - Secara default telah disinkronkan dengan standar Accurate:
     `ACB`, `MCB`, `MCCB`, `RCCB`, `RCBO`, `CONTACTOR`, `CONTACTOR_RELAY`, `TOR`, `MPCB`, `SOFT_STARTER`, `VFD`, `PILOT_DEVICE`, `POWER_SUPPLY`, `PLC_AUTOMATION`, `SPD_MODULAR`, `ACCESSORIES`, `OTHER`.
2. **Sinkronisasi Otomatis dari Tab Accurate**:
   - Saat Anda membuka Accurate Online, ekstensi secara otomatis membaca daftar kategori barang dari session API Accurate (`/accurate/api/item-category/list.do`) maupun elemen dropdown di formulir.
3. **Tarik Kategori 1-Klik dari Toolbar Popup**:
   - Di tab **"⚙️ Pengaturan"**, klik tombol **"🔄 Tarik dari Tab Accurate"** untuk menarik dan menyimpan daftar kategori perusahaan Anda secara instan.
4. **Terikat dengan Gemini Flash AI**:
   - Saat AI Gemini Flash menganalisis produk SiePortal, Gemini diinstruksikan secara ketat (*anti-hallucination*) untuk memilih kategori yang HANYA ada di daftar Kategori Accurate Anda.
5. **Auto-Fill Pintar di Accurate**:
   - Di formulir Barang & Jasa Accurate, ekstensi otomatis mencocokkan input/combobox kategori serta menyediakan tombol salin 1-klik untuk setiap field pada banner mengambang.

---

## ⚙️ Kustomisasi Rumus Diskon
Jika persentase diskon atau margin perusahaan berubah:
1. Buka popup ekstensi di toolbar.
2. Pilih tab **"⚙️ Pengaturan"**.
3. Sesuaikan nilai **Diskon 1** (default: `0.63`) dan **Diskon 2** (default: `0.70`).
4. Klik **"Simpan Pengaturan"**. Rumus perhitungan akan langsung diperbarui.
