const API_URL = 'https://script.google.com/macros/s/AKfycbyDAzjzdg6QvXPrTK-hvEptq2i8SlRC_4WQcBBd4WXYTabFYoeQYd4hSc6t1bD-B6uH/exec'; // Masukkan Web App URL dari Langkah 2

// UI Router Sederhana dengan Null-Check
function showPage(pageId) {
    // Sembunyikan semua halaman
    document.querySelectorAll('.page-section').forEach(el => el.classList.add('d-none'));
    
    // Cari halaman target
    const targetPage = document.getElementById(pageId);
    
    // Pengecekan: Jika halaman ditemukan, tampilkan. Jika tidak, log error ke console.
    if (targetPage) {
        targetPage.classList.remove('d-none');
    } else {
        console.error(`Halaman dengan ID '${pageId}' belum dibuat di HTML.`);
        return; // Hentikan fungsi agar tidak terjadi error lanjutan
    }

    // Reset warna menu dan beri warna 'active' pada menu yang diklik
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    // Pengecekan event agar aman saat dipanggil manual lewat console
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

// Fitur Dark Mode
document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-bs-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
});

// Parser GL ATM
function processGL() {
    const file = document.getElementById('glFile').files[0];
    if (!file) return Swal.fire('Error', 'Pilih file GL terlebih dahulu', 'error');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const glData = [];
        
        // Asumsi format: 22-05-2026 22-05-2026 TARIK TUNAI 7161KTM12901 2,000,000.00
        const regex = /^(\d{2}-\d{2}-\d{4})\s+.*?\s+(\w*(?:\d{4})KTM\d+)\s+([\d,]+(?:\.\d+)?)/;
        
        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const rawResi = match[2];
                // Ekstraksi resi (misal dari 7161KTM12901 ambil 7161)
                const noResi = rawResi.split('KTM')[0]; 
                const nominal = parseFloat(match[3].replace(/,/g, ''));
                const atm = "KTM" + rawResi.split('KTM')[1]; // KTM12901
                
                // [Tanggal, ATM, No Resi, Nominal, Jenis, Referensi]
                glData.push([match[1], atm, noResi, nominal, 'TARIK TUNAI', rawResi]);
            }
        });
        
        sendToBackend('uploadGL', glData);
    };
    reader.readAsText(file);
}

// Parser EJ ATM (SUDAH DIPERBARUI SESUAI STRUKTUR JRN ATM)
// Parser EJ ATM (DIUPDATE UNTUK MENANGKAP SMART EMV & COMMUNICATION ERROR)
// Parser EJ ATM (FINAL UPDATE: MENANGANI SEMUA VARIASI GAGAL TARIK TUNAI)
function processEJ() {
    const file = document.getElementById('ejFile').files[0];
    if (!file) return Swal.fire('Error', 'Pilih file EJ terlebih dahulu', 'error');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const ejData = [];
        
        let currentTx = {}; 
        let isLookingForJumlah = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            // 1. Ekstrak Tanggal dan ATM
            const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([A-Z0-9]+)/);
            if (dateMatch) {
                currentTx.tanggal = dateMatch[1]; 
                currentTx.atm = dateMatch[3];     
            }

            // 2. Ekstrak Nomor Resi / Ref
            const resiMatch = line.match(/(?:NO RESI|NO REF\.?|REFF NO)\s*:?\s*(\d+)/);
            if (resiMatch) {
                currentTx.noResi = resiMatch[1];
            }
            
            // Tangkap Resi dari log SMART EMV (Kasus Communication Error)
            const smartEmvMatch = line.match(/SMART EMV\s+(\d+)/);
            if (smartEmvMatch) {
                currentTx.noResi = smartEmvMatch[1];
            }

            // 3. Deteksi Jenis Transaksi (Penting untuk Kasus 1)
            if (line.includes("PENARIKAN TUNAI") || line.includes("TARIK TUNAI")) {
                currentTx.jenis = "TARIK TUNAI";
            }

            // 4. Ekstrak Nominal (Jumlah)
            if (line.includes("JUMLAH")) {
                isLookingForJumlah = true;
                const inlineJumlah = line.match(/RP\.\s*([\d,]+\.\d{2})/i);
                if (inlineJumlah) {
                    currentTx.nominal = parseFloat(inlineJumlah[1].replace(/,/g, ''));
                    isLookingForJumlah = false;
                }
            } else if (isLookingForJumlah) {
                const nextLineJumlah = line.match(/^([\d,]+\.\d{2})/);
                if (nextLineJumlah) {
                    currentTx.nominal = parseFloat(nextLineJumlah[1].replace(/,/g, ''));
                    isLookingForJumlah = false;
                }
            }

            // 5. Deteksi Error Fisik & Jaringan (Kasus 2, 3, dan 4)
            const errorKeywords = [
                "SALDO KURANG", "SALAH MASUKKAN PIN", "KARTU ANDA SUDAH KADALUARSA", 
                "HIGH BILL MIX ERROR", "DISPENSER ERROR", "COMMUNICATION ERROR", "CDM ERROR"
            ];
            
            errorKeywords.forEach(err => {
                if (line.includes(err)) {
                    currentTx.status = "GAGAL - " + err;
                }
            });
            // Tangkap pola "TRANSACTION 7125 FAILED"
            if (line.match(/TRANSACTION \d+ FAILED/)) {
                currentTx.status = "GAGAL - TRANSACTION FAILED";
            }

            // 6. Menyimpan Data saat Blok Transaksi Selesai
            if (line.includes("<- TRANSACTION END")) {
                if (currentTx.noResi) {
                    
                    // Evaluasi Final Status
                    if (!currentTx.status) {
                        // KASUS 1: Jika jenisnya Tarik Tunai tapi tidak ada Nominal yang keluar
                        if (currentTx.jenis === "TARIK TUNAI" && !currentTx.nominal) {
                            currentTx.status = "GAGAL - TIDAK ADA UANG KELUAR";
                        } else {
                            currentTx.status = currentTx.nominal ? "SUKSES" : "NON-FINANSIAL";
                        }
                    }
                    
                    if (!currentTx.nominal) currentTx.nominal = 0;
                    
                    // Masukkan ke Array
                    ejData.push([
                        currentTx.tanggal, 
                        currentTx.atm || 'UNKNOWN_ATM', 
                        currentTx.noResi, 
                        currentTx.nominal, 
                        currentTx.status
                    ]);
                }
                
                // Reset State
                currentTx = {};
                isLookingForJumlah = false;
            }
        }
        
        if (ejData.length === 0) {
            return Swal.fire('Data Kosong', 'Tidak ditemukan transaksi dengan nomor resi pada file EJ ini.', 'warning');
        }

        sendToBackend('uploadEJ', ejData);
    };
    reader.readAsText(file);
}

// Fungsi API Komunikasi
async function sendToBackend(action, data) {
    Swal.fire({ title: 'Memproses...', text: 'Mengunggah dan menyesuaikan data', allowOutsideClick: false });
    Swal.showLoading();
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: action, data: data }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } // text/plain menghindari CORS preflight issues pada GAS
        });
        const result = await response.json();
        if(result.success) {
            Swal.fire('Berhasil!', `Data berhasil di-merge. Total baris database: ${result.data.total}`, 'success');
        } else {
            Swal.fire('Error Backend', result.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error Koneksi', err.toString(), 'error');
    }
}

// Memicu Analisa
async function triggerAnalysis() {
    Swal.fire({ title: 'Menganalisa...', text: 'Melakukan rekonsiliasi GL & EJ', allowOutsideClick: false });
    Swal.showLoading();
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'analyze' })
        });
        const result = await response.json();
        Swal.fire('Analisa Selesai', `Selisih Lebih: ${result.data.selisihLebih} | Selisih Kurang: ${result.data.selisihKurang}`, 'info');
    } catch (err) {
        Swal.fire('Error', 'Gagal memproses analisa', 'error');
    }
}
