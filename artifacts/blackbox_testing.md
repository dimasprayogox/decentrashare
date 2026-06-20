# Black Box Testing - DecentraShare Web3

Dokumen ini berisi rancangan dan hasil pengujian *Black Box Testing* untuk keseluruhan sistem **DecentraShare** (sistem berbagi berkas berbasis Web3 dan blockchain). Pengujian ini dirancang untuk memvalidasi fungsi masukan dan keluaran sistem tanpa melihat kode program secara langsung, mengacu pada spesifikasi fungsionalitas antarmuka dan RESTful API.

---

### A. Metodologi Pengujian
Pengujian menggunakan teknik *Black Box Testing* dengan pendekatan analisis nilai batas (*Boundary Value Analysis*) dan pengujian transisi status (*State Transition Testing*). Pengujian dilakukan pada fungsionalitas utama seperti autentikasi MetaMask, unggah berkas, perekaman metadata ke blockchain (smart contract), berbagi dokumen, pengecekan integritas, dan manajemen kapasitas penyimpanan oleh admin.

---

### B. Tabel Pengujian Fungsionalitas Sistem

#### 1. Pengujian Halaman Login (`/login`)
Pengujian ini bertujuan memvalidasi mekanisme login berbasis dompet kripto Web3 (MetaMask) dengan pembuktian kepemilikan kunci pribadi (*signature*) menggunakan *nonce* satu kali pakai.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Deteksi MetaMask | Login tanpa ekstensi MetaMask terpasang di browser. | 1. Buka browser tanpa MetaMask.<br>2. Akses halaman `/login`.<br>3. Klik tombol **Connect MetaMask**. | Sistem menampilkan pesan error "MetaMask not detected!" dalam banner merah. | Sesuai Harapan | Valid |
| 2 | Otorisasi Koneksi | Klik login namun menolak permintaan koneksi akun di MetaMask. | 1. Akses halaman `/login`.<br>2. Klik **Connect MetaMask**.<br>3. Saat pop-up MetaMask muncul meminta koneksi akun, klik **Cancel / Tolak**. | Koneksi gagal, sistem menampilkan pesan kesalahan "Error: User rejected the request." atau status kembali meminta koneksi. | Sesuai Harapan | Valid |
| 3 | Autentikasi Akun Baru | Menghubungkan alamat wallet yang belum terdaftar di sistem. | 1. Siapkan wallet address baru yang belum terdaftar.<br>2. Klik **Connect MetaMask**.<br>3. Otorisasi koneksi akun. | Sistem berhasil melakukan koneksi wallet, mendeteksi alamat tidak terdaftar, dan melempar error "Wallet not registered. Please register first." atau meminta pengguna menuju halaman Register. | Sesuai Harapan | Valid |
| 4 | Penandatanganan Pesan (Signature) | Menolak menandatangani pesan pembuktian (*personal_sign*). | 1. Hubungkan wallet yang sudah terdaftar.<br>2. Tunggu hingga status "Please sign the message in your wallet...".<br>3. Pada pop-up MetaMask, klik tombol **Cancel / Reject** untuk tanda tangan. | Autentikasi dibatalkan, sistem menampilkan banner merah berisi pesan error penolakan tanda tangan dari MetaMask. | Sesuai Harapan | Valid |
| 5 | Perubahan Wallet saat Login | Mengubah akun wallet terpilih di MetaMask di tengah proses login. | 1. Hubungkan wallet A.<br>2. Dapatkan pesan nonce.<br>3. Sebelum menandatangani, ubah akun aktif di MetaMask ke wallet B.<br>4. Lakukan tanda tangan. | Sistem mendeteksi ketidakcocokan alamat pengirim dan penandatangan, lalu menampilkan error "Wallet changed during login. Please try again." | Sesuai Harapan | Valid |
| 6 | Kedaluwarsa Nonce | Login dengan nonce yang telah melewati batas waktu kedaluwarsa. | 1. Hubungkan wallet terdaftar.<br>2. Diamkan proses login selama lebih dari 5 menit (masa aktif nonce habis).<br>3. Lakukan tanda tangan pesan. | Backend menolak tanda tangan dan mengembalikan error "Authentication nonce expired. Please request a new nonce." | Sesuai Harapan | Valid |
| 7 | Login Sukses | Login dengan wallet terdaftar dan tanda tangan valid. | 1. Klik **Connect MetaMask**.<br>2. Otorisasi koneksi akun terdaftar.<br>3. Klik **Sign** pada pop-up MetaMask.<br>4. Tunggu verifikasi identitas selesai. | Token sesi disimpan di `localStorage`, muncul notifikasi "Login successful! Redirecting...", dan pengguna diarahkan ke `/storage`. | Sesuai Harapan | Valid |

---

#### 2. Pengujian Halaman Register (`/register`)
Pengujian untuk memvalidasi proses pendaftaran pengguna baru menggunakan wallet address, nama pengguna (*username*), dan email.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Koneksi Awal | Melakukan inisiasi pendaftaran dengan menghubungkan MetaMask. | 1. Akses halaman `/register`.<br>2. Klik **Connect MetaMask**. | Sistem berhasil membaca alamat wallet dan melanjutkan ke langkah 2 (form data profil). | Sesuai Harapan | Valid |
| 2 | Validasi Kosong Username | Mendaftarkan pengguna tanpa mengisi kolom Username. | 1. Hubungkan wallet.<br>2. Biarkan kolom Username kosong.<br>3. Isi Email dengan format valid.<br>4. Klik **Create Account**. | Sistem memblokir submit dan menampilkan pesan error "Username is required" di bawah kolom terkait. | Sesuai Harapan | Valid |
| 3 | Validasi Format Username | Mengisi Username kurang dari 3 karakter atau mengandung karakter khusus. | 1. Isi Username dengan "ab" atau "user@123".<br>2. Klik **Create Account**. | Sistem menampilkan error "3-20 chars, letters/numbers/underscore only" dan registrasi dihentikan. | Sesuai Harapan | Valid |
| 4 | Validasi Kosong Email | Mendaftarkan pengguna tanpa mengisi kolom Email. | 1. Isi Username yang valid.<br>2. Kosongkan kolom Email.<br>3. Klik **Create Account**. | Sistem menampilkan pesan error "Email is required" dan menghentikan proses submit. | Sesuai Harapan | Valid |
| 5 | Validasi Format Email | Mengisi Email dengan format tidak valid. | 1. Isi kolom Email dengan "user.domain.com" atau "user@".<br>2. Klik **Create Account**. | Muncul pesan error "Please enter a valid email address" di bawah input Email. | Sesuai Harapan | Valid |
| 6 | Penolakan Tanda Tangan Registrasi | Menolak tanda tangan transaksi registrasi pada MetaMask. | 1. Isi Username dan Email secara valid.<br>2. Klik **Create Account**.<br>3. Saat MetaMask meminta tanda tangan pesan registrasi, klik **Reject**. | Registrasi dibatalkan secara aman, sistem menampilkan error banner terkait penolakan tanda tangan. | Sesuai Harapan | Valid |
| 7 | Registrasi Sukses | Melengkapi formulir secara valid dan menandatangani pesan. | 1. Isi data valid pada formulir.<br>2. Klik **Create Account**.<br>3. Tandatangani pesan di MetaMask.<br>4. Tunggu pembuatan akun selesai. | Akun baru terdaftar di database, token JWT disimpan, dan pengguna diarahkan ke `/settings/profile` untuk melengkapi profil atau langsung ke `/storage`. | Sesuai Harapan | Valid |
| 8 | Ganti Dompet (Change Wallet) | Membatalkan pendaftaran dengan wallet saat ini untuk mengganti dengan wallet lain. | 1. Hubungkan wallet A pada langkah pertama.<br>2. Pada langkah pengisian detail, klik tombol **Change** atau **Use Different Wallet**. | Status terhubung dibersihkan, input formulir direset, dan sistem kembali ke langkah 1 (Connect Wallet). | Sesuai Harapan | Valid |

---

#### 3. Pengujian Halaman Storage (Manajemen Berkas & Folder - `/storage`)
Halaman ini adalah pusat pengelolaan data pengguna di mana mereka dapat mengunggah berkas, membuat folder, dan membagikannya.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Pembuatan Folder Kosong | Membuat folder baru tanpa memberikan nama folder. | 1. Klik tombol **New Folder**.<br>2. Biarkan input nama folder kosong.<br>3. Klik tombol **Create**. | Sistem mencegah pembuatan folder dan menampilkan validasi error "Folder name is required". | Sesuai Harapan | Valid |
| 2 | Pembuatan Folder Valid | Membuat folder dengan nama yang valid. | 1. Klik tombol **New Folder**.<br>2. Masukkan nama folder "Skripsi_Dimas".<br>3. Klik **Create**. | Folder baru berhasil dibuat, terdaftar di database, dan muncul di daftar penyimpanan aktif pengguna. | Sesuai Harapan | Valid |
| 3 | Unggah Berkas (Upload) | Mengunggah satu atau beberapa berkas sekaligus dari perangkat lokal. | 1. Klik tombol **Upload File** atau drag-and-drop berkas ke area unggahan.<br>2. Pilih berkas "draft_bab4.pdf".<br>3. Tunggu hingga proses unggah ke IPFS selesai. | Berkas terunggah ke IPFS (Pinata), metadata tersimpan di database, dan berkas muncul di daftar penyimpanan. | Sesuai Harapan | Valid |
| 4 | Pencatatan Blockchain (Single/Batch) | Menandatangani transaksi perekaman berkas di blockchain setelah unggahan selesai. | 1. Setelah berkas terunggah, sistem memicu permintaan transaksi MetaMask.<br>2. Klik **Confirm** pada pop-up MetaMask untuk memanggil method `recordFile` atau `recordFilesBatch`. | Transaksi terkirim ke jaringan blockchain, status hash transaksi disimpan di database, dan ikon verifikasi on-chain aktif (hijau/terverifikasi). | Sesuai Harapan | Valid |
| 5 | Pembatalan Pencatatan Blockchain | Menolak/membatalkan penandatanganan transaksi blockchain setelah berkas terunggah. | 1. Lakukan unggah berkas.<br>2. Saat pop-up MetaMask konfirmasi transaksi blockchain muncul, klik **Reject / Tolak**. | Berkas tetap tersimpan di database (secara off-chain), tetapi sistem menampilkan ikon status blockchain tidak terverifikasi (kuning/pending). | Sesuai Harapan | Valid |
| 6 | Pengubahan Privasi Berkas | Mengubah status privasi berkas antara Publik dan Privat. | 1. Klik ikon opsi (titik tiga) pada berkas.<br>2. Pilih **Change Privacy**.<br>3. Ubah pilihan ke **Public** atau **Private** lalu simpan. | Status privasi berkas berubah di database. Berkas publik dapat dicari di menu Explore, sedangkan berkas privat hanya dapat diakses pemilik/penerima sah. | Sesuai Harapan | Valid |
| 7 | Berbagi Berkas via Username | Membagikan akses dokumen privat kepada pengguna lain menggunakan nama pengguna (*username*). | 1. Klik opsi **Share** pada berkas.<br>2. Ketik username penerima "budi_web3".<br>3. Pilih tingkat akses.<br>4. Klik **Share**. | Berkas sukses dibagikan. Akses dokumen terdaftar untuk user "budi_web3" dan berkas muncul di menu *Shared with me* milik Budi. | Sesuai Harapan | Valid |
| 8 | Berbagi Berkas via Email | Membagikan dokumen menggunakan alamat email terdaftar pengguna lain. | 1. Klik opsi **Share** pada berkas.<br>2. Ketik email penerima "budi@example.com".<br>3. Klik **Share**. | Sistem mencocokkan email dengan database, memberikan hak akses dokumen ke pemilik email tersebut. | Sesuai Harapan | Valid |
| 9 | Berbagi Berkas via Wallet Address | Membagikan dokumen menggunakan alamat wallet kripto pengguna lain. | 1. Klik opsi **Share** pada berkas.<br>2. Tempel alamat wallet tujuan (format heksadesimal).<br>3. Klik **Share**. | Sistem mencocokkan wallet address, lalu memberikan hak akses dokumen kepada wallet tersebut. | Sesuai Harapan | Valid |
| 10 | Berbagi Berkas Gagal (Tidak Terdaftar) | Mengisi data penerima yang tidak terdaftar di sistem. | 1. Klik opsi **Share**.<br>2. Ketik nama pengguna acak "user_palsu_123".<br>3. Klik **Share**. | Sistem menolak proses berbagi dan menampilkan pesan error "User not found". | Sesuai Harapan | Valid |
| 11 | Pembuatan Tautan Berbagi (Shared Link) | Membuat tautan berbagi berkas/folder dengan visibilitas umum (*link-only sharing*). | 1. Klik opsi **Share** pada berkas/folder.<br>2. Ubah tipe pembagian ke **Link Sharing**.<br>3. Salin tautan yang digenerasikan oleh sistem. | Tautan berbagi terbuat (misal `/shared/link/document/[id]`). Tautan ini dapat diakses oleh siapa saja yang memiliki link tersebut tanpa harus mendaftar/login. | Sesuai Harapan | Valid |
| 12 | Pindah ke Trash (Arsip) | Mengarsipkan berkas atau folder dengan memindahkannya ke Trash. | 1. Klik opsi (titik tiga) pada berkas/folder.<br>2. Pilih **Move to Trash / Archive**.<br>3. Konfirmasi tindakan. | Berkas/folder disembunyikan dari daftar utama dan dipindahkan ke tabel arsip (Trash). | Sesuai Harapan | Valid |
| 13 | Pencarian Berkas/Folder | Melakukan pencarian berkas berdasarkan kata kunci tertentu pada kotak pencarian. | 1. Ketik kata "draft" pada bilah pencarian di bagian atas halaman. | Daftar berkas secara dinamis menyaring dan hanya menampilkan item yang namanya mengandung kata "draft". | Sesuai Harapan | Valid |

---

#### 4. Pengujian Halaman Detail Dokumen (`/storage/document/[id]`)
Pengujian fungsional pada halaman informasi rinci dokumen tunggal.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Tampilan Metadata Berkas | Menampilkan kelengkapan informasi metadata berkas secara akurat. | 1. Klik nama berkas "draft_bab4.pdf" di halaman Storage utama. | Sistem mengarahkan ke halaman detail dokumen, menampilkan CID IPFS, Hash Berkas (SHA-256), nama pemilik, ukuran file, tanggal unggah, status privasi, dan riwayat aktivitas berkas. | Sesuai Harapan | Valid |
| 2 | Unduh Berkas (Download) | Mengunduh berkas fisik yang disimpan di IPFS melalui antarmuka sistem. | 1. Pada halaman detail dokumen, klik tombol **Download**. | Berkas berhasil diunduh dari IPFS ke perangkat pengguna dengan nama dan format file asli. | Sesuai Harapan | Valid |
| 3 | Mengubah Nama Berkas (Rename) | Mengubah nama berkas terunggah yang disimpan di database. | 1. Klik tombol **Rename** di halaman detail berkas.<br>2. Ubah nama berkas menjadi "draft_bab4_revisi.pdf".<br>3. Klik **Save**. | Nama berkas berhasil diperbarui di database dan tampilan antarmuka ter-update secara instan. | Sesuai Harapan | Valid |
| 4 | Verifikasi Integritas Blockchain | Memeriksa kecocokan data berkas lokal dengan rekaman on-chain secara otomatis. | 1. Masuk ke detail berkas.<br>2. Amati indikator status blockchain (On-Chain Status). | Sistem menampilkan label hijau "Valid/Verified" jika data hash berkas di DB cocok dengan yang terdaftar di smart contract blockchain, atau "Not Verified" jika sebaliknya. | Sesuai Harapan | Valid |
| 5 | Pengarsipan Dokumen | Mengarsipkan dokumen langsung melalui tombol aksi di halaman detail. | 1. Klik tombol **Archive / Move to Trash** di halaman detail berkas.<br>2. Konfirmasi pengarsipan. | Berkas diarsipkan, dan pengguna secara otomatis dialihkan kembali ke halaman utama `/storage`. | Sesuai Harapan | Valid |

---

#### 5. Pengujian Halaman Shared with Me & Shared Link
Menguji aksesibilitas dokumen yang telah dibagikan, baik secara langsung maupun melalui tautan publik.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Akses Berkas Masuk | Melihat berkas yang dibagikan langsung oleh pengguna lain. | 1. Login menggunakan akun B.<br>2. Akses halaman `/shared`. | Dokumen "draft_bab4.pdf" yang dibagikan oleh akun A tampil dalam daftar dokumen masuk di halaman `/shared` milik akun B. | Sesuai Harapan | Valid |
| 2 | Akses Tautan Berbagi Dokumen | Mengakses tautan berbagi berkas publik (*link-only sharing*) tanpa autentikasi. | 1. Buka tab samaran (*incognito*) atau keluar dari akun.<br>2. Akses URL tautan berbagi berkas yang disalin (misal `/shared/link/document/123`). | Halaman dimuat dengan sukses, menampilkan metadata dokumen publik, dan mengizinkan pengunduhan tanpa harus login. | Sesuai Harapan | Valid |
| 3 | Akses Tautan Berbagi Folder | Mengakses tautan berbagi folder publik. | 1. Akses URL tautan berbagi folder (misal `/shared/link/folder/456`). | Halaman memuat daftar semua dokumen yang ada di dalam folder tersebut dan memperbolehkan navigasi ke sub-dokumen di dalamnya. | Sesuai Harapan | Valid |

---

#### 6. Pengujian Halaman Trash (`/trash`)
Pengujian sistem pengelolaan berkas/folder yang telah dihapus sementara (diarsipkan).

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Tampilan Daftar Sampah | Melihat seluruh item yang diarsipkan oleh pengguna aktif. | 1. Akses halaman `/trash`. | Halaman menampilkan semua berkas/folder yang sebelumnya telah dipindahkan ke Trash dengan status terarsip. | Sesuai Harapan | Valid |
| 2 | Pemulihan Berkas (Restore) | Mengembalikan berkas dari Trash ke penyimpanan aktif. | 1. Klik ikon opsi berkas di halaman Trash.<br>2. Pilih **Restore**.<br>3. Konfirmasi pemulihan. | Berkas menghilang dari halaman Trash dan kembali muncul di halaman `/storage` utama dengan struktur direktori yang sama seperti semula. | Sesuai Harapan | Valid |
| 3 | Penghapusan Permanen (Destroy) | Menghapus berkas secara permanen dari basis data sistem. | 1. Klik ikon opsi berkas di halaman Trash.<br>2. Pilih **Delete Permanently / Destroy**.<br>3. Konfirmasi penghapusan permanen. | Berkas dihapus sepenuhnya dari database dan tidak dapat dipulihkan kembali. Berkas fisik di IPFS/jaringan tidak lagi diakses oleh antarmuka sistem. | Sesuai Harapan | Valid |

---

#### 7. Pengujian Halaman Validate (Validasi Integritas Mandiri - `/validate`)
Menguji fungsi pencocokan integritas berkas secara manual dengan mengunggah berkas lokal dan membandingkan hash-nya langsung dengan rekaman smart contract di blockchain.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Uji Berkas Tidak Terdaftar | Memvalidasi berkas lokal yang belum pernah direkam di blockchain. | 1. Akses halaman `/validate`.<br>2. Unggah/drag berkas baru "skripsi_palsu.docx".<br>3. Klik tombol **Validate / Periksa**. | Sistem menghitung hash SHA-256 berkas lokal, mencarinya di blockchain via smart contract, dan menampilkan hasil "Document NOT FOUND on-chain" (tidak valid / tidak terdaftar) dengan indikator merah. | Sesuai Harapan | Valid |
| 2 | Uji Berkas Valid (Match) | Memvalidasi berkas asli yang telah sukses direkam di blockchain sebelumnya. | 1. Unggah berkas asli "draft_bab4.pdf".<br>2. Klik **Validate / Periksa**. | Sistem mendeteksi kecocokan hash berkas di blockchain dan menampilkan status "Document VALID & verified on-chain" dengan indikator hijau lengkap dengan nama berkas, CID, dan owner awal. | Sesuai Harapan | Valid |
| 3 | Uji Berkas Hasil Modifikasi (Mismatch) | Memvalidasi berkas yang telah dirubah isinya (walau nama file sama). | 1. Ambil berkas "draft_bab4.pdf", ubah isinya (misal menambahkan satu karakter spasi di dalamnya), lalu simpan.<br>2. Unggah berkas hasil modifikasi tersebut di `/validate`.<br>3. Klik **Validate**. | Sistem mendeteksi hash berkas yang berubah (tidak cocok dengan hash awal di blockchain) dan mengeluarkan peringatan bahwa berkas telah dimodifikasi (tampered) atau tidak valid. | Sesuai Harapan | Valid |

---

#### 8. Pengujian Halaman Activity (Audit Logs - `/activity`)
Menguji fungsionalitas pencatatan log audit sistem untuk melacak aktivitas pengguna.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Pencatatan Aktivitas Otomatis | Menampilkan riwayat aksi logis pengguna secara tepat waktu. | 1. Lakukan aktivitas (misal mengunggah berkas, mengunduh berkas, atau mengubah status berbagi).<br>2. Akses halaman `/activity`. | Log audit mencatat aktivitas tersebut secara urut waktu (terbaru di atas) dengan detail jenis aktivitas, nama berkas, alamat IP (opsional), dan timestamp. | Sesuai Harapan | Valid |
| 2 | Filter & Pencarian Log | Memfilter log aktivitas berdasarkan jenis aksi atau kata kunci berkas. | 1. Pilih filter kategori aktivitas "Upload".<br>2. Ketik kata kunci berkas di pencarian aktivitas. | Daftar aktivitas terfilter secara akurat dan hanya menampilkan log berjenis "Upload" yang sesuai dengan kata kunci. | Sesuai Harapan | Valid |

---

#### 9. Pengujian Halaman Contract & Wallet Activity (`/contract-activity` & `/wallet-activity`)
Menguji riwayat interaksi pengguna dengan blockchain (smart contract) serta detail biaya gas.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Riwayat Transaksi Kontrak | Menampilkan daftar transaksi yang melibatkan smart contract DecentraShare. | 1. Akses halaman `/contract-activity`. | Menampilkan riwayat transaksi smart contract, seperti panggilan fungsi `recordFile` dan `recordFilesBatch`, nomor blok, dan hash transaksi yang dapat diklik untuk diarahkan ke Etherscan/Block Explorer. | Sesuai Harapan | Valid |
| 2 | Riwayat Aktivitas Dompet | Menampilkan daftar detail biaya gas dan riwayat dompet kripto terhubung. | 1. Akses halaman `/wallet-activity`. | Menampilkan catatan transaksi keluar/masuk gas fee yang dikeluarkan dompet aktif pengguna saat melakukan interaksi dengan sistem DecentraShare. | Sesuai Harapan | Valid |

---

#### 10. Pengujian Halaman Explore (`/explore`)
Menguji fungsi penelusuran berkas publik yang dibagikan secara terbuka oleh semua pengguna di sistem.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Eksplorasi Berkas Publik | Menampilkan daftar seluruh dokumen publik. | 1. Akses halaman `/explore`. | Sistem memuat dan menampilkan berkas-berkas milik pengguna lain yang status privasinya diatur sebagai **Public**. Berkas privat pemilik lain tidak dimunculkan di halaman ini. | Sesuai Harapan | Valid |
| 2 | Pencarian Berkas Publik | Mencari dokumen publik menggunakan kata kunci pencarian. | 1. Masukkan kata kunci pencarian di halaman Explore. | Sistem secara responsif memfilter daftar berkas publik yang namanya mengandung kata kunci tersebut. | Sesuai Harapan | Valid |

---

#### 11. Pengujian Halaman Settings (Profile & Set Limit - `/settings`)
Pengujian manajemen profil oleh pengguna biasa dan administrasi limit penyimpanan oleh Administrator.

| No | Pengujian | Test Case | Prosedur Uji | Hasil yang Diharapkan | Hasil Pengujian | Kesimpulan |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | Pembaruan Informasi Profil | Mengubah nama lengkap, alamat email, bio, atau mengunggah gambar profil. | 1. Akses `/settings/profile`.<br>2. Edit informasi pada kolom isian.<br>3. Klik **Save Changes**. | Data profil tersimpan di database dan perubahan langsung tecermin di pojok kanan atas profil antarmuka pengguna. | Sesuai Harapan | Valid |
| 2 | Akses Kontrol Halaman Admin | Mencoba mengakses halaman set-limit menggunakan akun non-admin (USER). | 1. Login menggunakan akun bersatus role **USER**.<br>2. Buka URL `/settings/set-limit` secara manual. | Sistem menolak akses dan menampilkan pesan error 403 "Forbidden. Admin access only" atau mengarahkan kembali ke dashboard utama. | Sesuai Harapan | Valid |
| 3 | Pengaturan Batas Penyimpanan Valid | Administrator mengubah kapasitas penyimpanan (*storage limit*) pengguna ke nilai yang lebih tinggi. | 1. Login dengan akun **ADMIN**.<br>2. Akses halaman `/settings/set-limit`.<br>3. Cari pengguna A.<br>4. Klik **Set Limit**.<br>5. Masukkan kapasitas baru "10 GB".<br>6. Klik **Save Limit**. | Kapasitas limit penyimpanan pengguna diperbarui di database. Pengguna tersebut kini memiliki kapasitas penyimpanan baru sebesar 10 GB. | Sesuai Harapan | Valid |
| 4 | Validasi Limit di Bawah Penggunaan Aktif | Mengatur batas penyimpanan lebih kecil dari kapasitas yang sedang digunakan saat ini. | 1. Pilih pengguna B yang sedang menggunakan penyimpanan sebesar 2 GB.<br>2. Klik **Set Limit** pada pengguna B.<br>3. Masukkan batas baru "1 GB" atau "500 MB".<br>4. Klik **Save Limit**. | Sistem menolak perubahan dan menampilkan pesan error validasi: "Limit cannot be lower than used storage". | Sesuai Harapan | Valid |
