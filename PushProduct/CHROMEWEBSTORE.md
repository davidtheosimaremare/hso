# Chrome Web Store Listing — PushProduct

> Last Updated: 2026-10-16

## Store Listing

**Extension Name** [REQUIRED]
PushProduct - SiePortal to Accurate Online

**Short Description** [REQUIRED]
Ekstrak produk Siemens dari SiePortal dan masukkan ke formulir Barang & Jasa Accurate Online dengan 1-klik otomatis.

**Detailed Description** [REQUIRED]
PushProduct adalah ekstensi Chrome produktivitas khusus untuk distributor dan pengguna sistem Siemens & Accurate Online (seperti PT Hokiindo Raya) untuk mempercepat proses pembuatan master barang & jasa.

Fitur Utama:
1. Otomatisasi Ekstraksi SiePortal: Mendeteksi kode produk (MLFB), spesifikasi teknis (Poles, Ampere, Breaking Capacity, Voltage, Curve), dan harga langsung dari katalog Siemens SiePortal.
2. Standardisasi Deskripsi Barang: Mengubah deskripsi katalog menjadi format baku Accurate (contoh: "SIEMENS MCB, 5TJ4110-6, SINOPLUS, 1P, 10A, CURVE B, 10KA, 240/415V AC").
3. Perhitungan Otomatis Pricelist Accurate: Menghitung harga jual resmi secara real-time berdasarkan rumus margin resmi: Pricelist = Harga SIEPortal / 0.63 / 0.7.
4. Auto-Fill 1-Klik ke Accurate Online: Cukup klik "Buka & Isi di Accurate", ekstensi akan membuka atau beralih ke tab Accurate Online dan mengisi kolom Kode Barang, Nama Barang, Kategori, Jenis Barang (Persediaan), Satuan (pcs), dan Harga Jual secara otomatis.
5. Mode Input Manual & Riwayat: Mendukung konversi cepat secara mandiri tanpa harus membuka web SiePortal dan menyimpan riwayat produk yang pernah dipush.

Cara Penggunaan:
1. Buka halaman detail produk di Siemens SiePortal (contoh: detail/5TJ4110-6).
2. Klik tombol mengambang "Push to Accurate" di pojok kanan bawah atau buka ikon ekstensi di toolbar.
3. Tinjau judul produk dan harga pricelist yang otomatis terhitung.
4. Klik "Buka & Isi di Accurate Online". Formulir Barang & Jasa di Accurate akan otomatis terisi dan siap disimpan!

Catatan Privasi:
Ekstensi ini 100% berjalan secara lokal di browser Anda. Tidak ada data pribadi, data login, maupun data produk yang dikirimkan ke server pihak ketiga mana pun.

Dukungan & Masukan:
Dibuat untuk operasional PT Hokiindo Raya. Untuk pertanyaan dan dukungan teknis, hubungi tim IT / Administrator HSO.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Mengekstrak data produk Siemens dari SiePortal dan mengisi formulir Barang & Jasa Accurate Online secara otomatis.

**Primary Language** [REQUIRED]
Indonesian

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | screenshots/sieportal-drawer.png |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | screenshots/accurate-autofill.png |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | promo/promo-small.png |

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Digunakan untuk menyimpan preferensi pengguna (koefisien rumus diskon, default satuan) dan antrian data produk sementara (pending item) yang akan diisi ke tab Accurate Online. |
| `tabs` | permissions | Digunakan untuk mendeteksi apakah tab Accurate Online sudah terbuka sehingga ekstensi dapat mengaktifkan tab tersebut alih-alih membuka tab baru yang duplikat. |
| `activeTab` | permissions | Digunakan untuk membaca URL dan status halaman SiePortal yang sedang aktif saat pengguna mengeklik ikon toolbar ekstensi. |
| `clipboardWrite` | permissions | Digunakan untuk fitur 1-klik salin judul dan ringkasan data produk ke clipboard pengguna. |
| `https://sieportal.siemens.com/*` | host_permissions | Diperlukan agar content script dapat berjalan di portal katalog Siemens untuk mengekstrak informasi produk, kode MLFB, dan harga. |
| `https://*.accurate.id/*` | host_permissions | Diperlukan agar content script dapat mengisi formulir pembuatan master barang & jasa di sistem web Accurate Online. |
| `https://generativelanguage.googleapis.com/*` | host_permissions | Diperlukan untuk memanggil Google Gemini Flash AI guna menganalisis spesifikasi teknis katalog Siemens dan memformat nama barang secara 100% presisi. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Distribution

**Visibility**: Unlisted / Private (Internal PT Hokiindo Raya)
**Regions**: Indonesia
**Pricing**: Free

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-10-16 | Rilis inisial PushProduct: Integrasi SiePortal ke Accurate Online dengan auto-title MCB/MCCB dan rumus Pricelist (/ 0.63 / 0.7). | Draft |
