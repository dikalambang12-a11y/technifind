# 🔧 TechniFind — Panduan Setup Lengkap

## Apa yang sudah dibuat:
- ✅ Login / Daftar (Email + Google)
- ✅ 2 Role: Guru/Staff & Teknisi
- ✅ Peta nyata (OpenStreetMap) dengan lokasi GPS
- ✅ Tombol WhatsApp langsung ke teknisi
- ✅ Sistem laporan gangguan
- ✅ Dashboard teknisi (toggle online/offline, terima laporan)
- ✅ Riwayat laporan
- ✅ Real-time (laporan masuk langsung muncul)

---

## LANGKAH 1 — Buat Firebase Project (10 menit)

1. Buka https://console.firebase.google.com
2. Klik **"Add project"** → nama: `technifind` → klik Continue → Finish
3. Di halaman project, klik ikon **"</>"** (Web App)
4. Beri nama app: `technifind-web` → klik **Register app**
5. Salin seluruh isi `firebaseConfig` yang muncul (seperti di bawah ini):

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "technifind-xxx.firebaseapp.com",
  projectId: "technifind-xxx",
  storageBucket: "technifind-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc123"
};
```

6. Buka file `src/firebase-config.js` di folder TechniFind
7. **Ganti** semua nilai `GANTI_DENGAN_...` dengan nilai dari firebaseConfig kamu

---

## LANGKAH 2 — Aktifkan Authentication

Di Firebase Console → **Authentication** → **Sign-in method**:
- ✅ Aktifkan **Email/Password**
- ✅ Aktifkan **Google**

---

## LANGKAH 3 — Buat Firestore Database

Di Firebase Console → **Firestore Database** → **Create database**:
- Pilih **"Start in test mode"** → Next
- Pilih region: `asia-southeast2 (Jakarta)` → Enable

Setelah database dibuat:
- Klik tab **Rules**
- Hapus semua isi rules yang ada
- Salin & paste seluruh isi file `firestore.rules` dari folder TechniFind
- Klik **Publish**

---

## LANGKAH 4 — Deploy ke Vercel (5 menit)

### Cara paling mudah (drag & drop):

1. Buka https://vercel.com → Sign up gratis dengan akun GitHub
2. Setelah login, klik **"Add New Project"**
3. Pilih **"Upload"** (atau drag & drop folder `technifind`)
4. Upload seluruh folder `technifind`
5. Klik **Deploy**
6. Selesai! Kamu dapat link seperti: `https://technifind-xxx.vercel.app`

### Cara via GitHub (lebih profesional):
1. Buat repo baru di https://github.com
2. Upload semua file ke repo tersebut
3. Di Vercel → Import Git Repository → pilih repo tadi
4. Deploy otomatis setiap kamu update file

---

## LANGKAH 5 — Daftarkan Teknisi Pertama

1. Buka app kamu di Vercel
2. Klik **Daftar** → pilih role **Teknisi 🔧**
3. Isi nama, email, **nomor WhatsApp aktif**, dan keahlian
4. Teknisi login → toggle **Online** → izinkan akses lokasi GPS

---

## Alur Kerja App (setelah live):

```
GURU membuka app
  → Deteksi lokasi otomatis
  → Lihat daftar teknisi terdekat + jarak nyata
  → Klik teknisi → Lihat di peta
  → Tombol WhatsApp → Chat langsung ke teknisi
  → ATAU buat Laporan Gangguan

TEKNISI membuka app
  → Toggle Online (lokasi GPS tersimpan ke database)
  → Laporan masuk muncul real-time
  → Klik "Terima" → WhatsApp terbuka ke guru otomatis
```

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| "Firebase: Error (auth/...)" | Cek kredensial di firebase-config.js |
| Peta tidak muncul | Cek koneksi internet, refresh halaman |
| Teknisi tidak muncul | Pastikan teknisi sudah toggle Online |
| WhatsApp tidak terbuka | Pastikan nomor WA diisi saat daftar (format: 08xx) |
| Deploy gagal di Vercel | Pastikan upload seluruh folder termasuk folder `src/` |

---

## Butuh bantuan?
Kirim pesan ke Claude dengan error yang kamu temui, saya bantu debug! 🚀
