const API_URL = 'https://script.google.com/macros/s/AKfycbyDAzjzdg6QvXPrTK-hvEptq2i8SlRC_4WQcBBd4WXYTabFYoeQYd4hSc6t1bD-B6uH/exec'; // Masukkan Web App URL dari Langkah 2

// UI Router Sederhana
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

// Parser EJ ATM
function processEJ() {
    const file = document.getElementById('ejFile').files[0];
    if (!file) return Swal.fire('Error', 'Pilih file EJ terlebih dahulu', 'error');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const ejData = [];
        
        // Logika parser disesuaikan dengan pola file JRN (contoh dasar)
        lines.forEach(line => {
            // Placeholder: Modifikasi regex menyesuaikan struktur raw .jrn aktual
            // Anggap resi ada di kolom tertentu
            const parts = line.trim().split(/\s+/);
            if(parts.length > 5 && parts[0].match(/\d{2}-\d{2}-\d{2}/)) {
                const date = parts[0];
                const resi = parts[1]; 
                const nominal = parseFloat(parts[3].replace(/,/g, ''));
                ejData.push([date, 'UNKNOWN_ATM', resi, nominal, 'SUCCESS']);
            }
        });
        
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
