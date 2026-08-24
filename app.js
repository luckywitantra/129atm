// TAMBAHKAN INI DI BARIS PALING ATAS APP.JS
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzawSNj45jOqdyEFKhF79w6-uW_MJansgX5c-nEoQ-aimJWCbxkH7lRNBYTVFAEp4VI/exec";
const API_URL = 'https://script.google.com/macros/s/AKfycbzawSNj45jOqdyEFKhF79w6-uW_MJansgX5c-nEoQ-aimJWCbxkH7lRNBYTVFAEp4VI/exec';

// ==========================================
// 0. API CALL WRAPPER (SISTEM AUTO-RETRY KEBAL ERROR)
// ==========================================
async function apiCall(action, dataPayload = null, customPeriod = null) {
    let period = customPeriod || getActivePeriod();
    let payload = { action: action, periode: period };
    if (dataPayload !== null) payload.data = dataPayload;

    let retries = 3; // Maksimal coba 3 kali jika server Google menolak
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return await response.json();
        } catch (err) {
            if (i === retries - 1) throw err; // Lempar error hanya jika sudah 3x gagal
            await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Jeda 1 detik, lalu 2 detik sebelum nembak ulang
        }
    }
}

// ==========================================
// 1. STATE MANAGEMENT, THEME & PAGINATION
// ==========================================
let pendingUploadData = [], pendingUploadType = '';
let databaseData = { gl: [], ej: [], selisih: [] }; 
let globalSelisihData = [], globalOpnameData = [], activeResolveRow = null;
let globalConfig = {}; 
let globalHistMap = new Map(), currentDetailData = [], detailType = ''; 

let pageState = { analisaKurang: 1, analisaLebih: 1, analisaSelesai: 1, master: 1, opname: 1, uploadHist: 1, histDetail: 1, arsipPage: 1 };
const PAGE_SIZE = 10;

function getActivePeriod() {
    let val = document.getElementById('globalPeriod').value;
    if(!val) {
        let d = new Date();
        val = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
        document.getElementById('globalPeriod').value = val;
    }
    let parts = val.split('-');
    return parts[1] + parts[0]; 
}

window.superApp = window.superApp || {};

// SAAT USER MENGGANTI BULAN DI NAVBAR
superApp.changePeriod = async function() {
    PlayfulAlert.fire({ title: 'Berpindah Bulan...', text: 'Memuat data dari dimensi waktu yang dipilih.', allowOutsideClick: false });
    PlayfulAlert.showLoading();
    try {
        await fetchDatabaseData();
        await fetchSelisihData();
        PlayfulAlert.close();
    } catch (e) {
        console.error("Gagal berpindah bulan:", e);
        PlayfulAlert.fire('Koneksi Lemah', 'Google menolak memuat data bulan ini. Silakan coba klik/refresh lagi.', 'error');
    }
};

function changePage(section, newPage) {
    pageState[section] = newPage;
    if(section.includes('analisa')) renderSelisihTablesFiltered();
    else if(section === 'master') renderDataMaster();
    else if(section === 'opname') renderOpnameTable();
    else if(section === 'uploadHist') renderUploadHistory();
    else if(section === 'histDetail') renderHistoryDetailTable();
}

const formatRp = (angka) => (angka ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka) : "Rp 0");
const formatNum = (angka) => (angka ? new Intl.NumberFormat('id-ID').format(angka) : "0");

const PlayfulAlert = Swal.mixin({ customClass: { popup: 'rounded-5 shadow-lg border-0', confirmButton: 'btn btn-primary rounded-pill px-4 fw-bold shadow-sm mx-1 bouncy-hover', cancelButton: 'btn btn-light rounded-pill px-4 fw-bold shadow-sm mx-1 bouncy-hover' }, buttonsStyling: false });

document.addEventListener("DOMContentLoaded", () => {
    getActivePeriod(); 
    fetchConfig(); 
    fetchDatabaseData(); 
    const settingModal = document.getElementById('modal-system-settings');
    if(settingModal) settingModal.addEventListener('show.bs.modal', renderTellerConfig);
});

async function fetchConfig() {
    try {
        const result = await apiCall('getConfig');
        if(result && result.success) {
            globalConfig = result.data; 
            document.getElementById('cfgCabang').value = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu';
            document.getElementById('cfgAlamat').value = globalConfig.cfgAlamat || 'Jl. Propinsi KM. 48 RT. 05 RW. 02';
            document.getElementById('cfgPimpinan').value = globalConfig.cfgPimpinan || 'ENDY PRATAMA';
            document.getElementById('cfgAdmin').value = globalConfig.cfgAdmin || 'SUCI AINUL FITRI';
            document.getElementById('cfgSecurity').value = globalConfig.cfgSecurity || 'DADAN'; 
            
            // Terapkan Logo Jika Ada
            if(globalConfig.cfgLogoKiri) {
                document.getElementById('previewLogoKiri').src = globalConfig.cfgLogoKiri;
                document.getElementById('previewLogoKiri').style.display = 'block';
                document.getElementById('textLogoKiri').style.display = 'none';
                document.getElementById('cetakKop_logoKiri1').src = globalConfig.cfgLogoKiri;
                document.getElementById('cetakKop_logoKiri1').style.display = 'inline-block';
                document.getElementById('cetakKop_logoKiri2').src = globalConfig.cfgLogoKiri;
                document.getElementById('cetakKop_logoKiri2').style.display = 'inline-block';
            }
            if(globalConfig.cfgLogoKanan) {
                document.getElementById('previewLogoKanan').src = globalConfig.cfgLogoKanan;
                document.getElementById('previewLogoKanan').style.display = 'block';
                document.getElementById('textLogoKanan').style.display = 'none';
                document.getElementById('cetakKop_logoKanan1').src = globalConfig.cfgLogoKanan;
                document.getElementById('cetakKop_logoKanan1').style.display = 'inline-block';
                document.getElementById('cetakKop_logoKanan2').src = globalConfig.cfgLogoKanan;
                document.getElementById('cetakKop_logoKanan2').style.display = 'inline-block';
            }
        }
    } catch (e) { console.error("Gagal memuat konfigurasi cloud", e); }
}

// ==========================================
// UTILITAS FILE READER & FAKE PROGRESS BAR
// ==========================================
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

let progressInterval;
function showProgressAlert(title, text) {
    Swal.fire({
        title: `<h5 class="fw-black mb-0">${title}</h5>`,
        html: `<p class="small text-muted mb-3">${text}</p>
               <div class="progress progress-swal"><div id="swalProgressBar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 0%">0%</div></div>`,
        allowOutsideClick: false, showConfirmButton: false, buttonsStyling: false
    });
}

function updateProgress(percent) {
    const pb = document.getElementById('swalProgressBar');
    if(pb) { pb.style.width = Math.round(percent) + '%'; pb.innerText = Math.round(percent) + '%'; }
}

function startFakeProgress(maxPercent = 90) {
    let p = 0;
    progressInterval = setInterval(() => {
        p += Math.random() * 5; // Naik acak
        if (p > maxPercent) p = maxPercent;
        updateProgress(p);
    }, 400);
}

function stopFakeProgress() {
    clearInterval(progressInterval);
    updateProgress(100);
    setTimeout(() => { Swal.close(); }, 600); // Tutup otomatis saat 100%
}

// Inisialisasi Efek Visual Drag & Drop
document.addEventListener("DOMContentLoaded", () => {
    ['dzGL', 'dzEJ'].forEach(id => {
        const zone = document.getElementById(id);
        const input = zone ? zone.querySelector('input[type="file"]') : null;
        const badge = zone ? zone.querySelector('.file-count-badge') : null;
        if(!zone || !input) return;

        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('dragover'); });
        zone.addEventListener('drop', e => {
            e.preventDefault(); zone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                if(badge) { badge.innerText = `${input.files.length} File`; badge.classList.remove('d-none'); }
            }
        });
        input.addEventListener('change', () => {
            if(input.files.length && badge) { badge.innerText = `${input.files.length} File`; badge.classList.remove('d-none'); }
        });
    });
});

function renderTellerConfig() {
    const container = document.getElementById('tellerConfigContainer');
    if(!container) return;
    let atms = new Set();
    (databaseData.ej || []).forEach(r => { if(r[2]) atms.add(String(r[2]).trim().toUpperCase()); });
    (databaseData.gl || []).forEach(r => { if(r[2]) atms.add(String(r[2]).trim().toUpperCase()); });
    let atmArray = Array.from(atms).filter(a => a !== 'ATM' && a !== 'ID MESIN' && a !== '');
    if(atmArray.length === 0) atmArray = ['KTM12901'];
    
    let html = '<label class="small fw-bold text-muted mb-2"><i class="bi bi-people-fill text-primary"></i> Penanggung Jawab (Teller) per Mesin ATM</label><div class="row g-2">';
    atmArray.forEach(atm => {
        let savedTeller = globalConfig['cfgTeller_' + atm] || '';
        html += `<div class="col-md-6"><div class="input-group input-group-sm shadow-sm rounded-pill overflow-hidden"><span class="input-group-text bg-primary text-white fw-bold border-0" style="width: 90px; justify-content: center;">${atm}</span><input type="text" class="form-control cfg-teller-input border-0 bg-light fw-bold" data-atm="${atm}" value="${savedTeller}" placeholder="Nama Teller"></div></div>`;
    });
    container.innerHTML = html + '</div>';
}

// Fungsi mengecilkan gambar agar tidak memberatkan Database (Max 300px)
function compressImageToBase64(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 300; 
                let width = img.width; let height = img.height;
                if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', 0.8));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

superApp.saveBAConfig = async function() {
    let payload = { 
        cfgCabang: document.getElementById('cfgCabang').value, 
        cfgAlamat: document.getElementById('cfgAlamat').value, 
        cfgPimpinan: document.getElementById('cfgPimpinan').value, 
        cfgAdmin: document.getElementById('cfgAdmin').value,
        cfgSecurity: document.getElementById('cfgSecurity').value,
        cfgLogoKiri: globalConfig.cfgLogoKiri || '',
        cfgLogoKanan: globalConfig.cfgLogoKanan || ''
    };
    document.querySelectorAll('.cfg-teller-input').forEach(input => { payload['cfgTeller_' + input.getAttribute('data-atm')] = input.value.toUpperCase(); });
    
    PlayfulAlert.fire({ title: 'Menyimpan & Memproses Gambar...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    
    try {
        // Proses Logo Kiri
        const fileKiri = document.getElementById('uploadLogoKiri').files[0];
        if(fileKiri) payload.cfgLogoKiri = await compressImageToBase64(fileKiri);
        // Proses Logo Kanan
        const fileKanan = document.getElementById('uploadLogoKanan').files[0];
        if(fileKanan) payload.cfgLogoKanan = await compressImageToBase64(fileKanan);

        const result = await apiCall('saveConfig', payload);
        if(result && result.success) {
            globalConfig = payload; 
            fetchConfig(); // Reload view
            PlayfulAlert.fire('Berhasil!', 'Konfigurasi Surat & Logo berhasil disimpan ke Database Cloud.', 'success');
        } else PlayfulAlert.fire('Gagal', result.message, 'error');
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
};

// ==========================================
// SMART ROUTER (PENCEGAH LAYAR BLANK PUTIH)
// ==========================================
function showPage(pageId) {
    // 1. Pemetaan Otomatis (Legacy Mapping) untuk ID yang sudah digabung
    const legacyMap = {
        'kalender': 'dashboard',
        'datamaster': 'pusatdata',
        'upload': 'pusatdata'
    };
    
    // Tentukan ID target (Gunakan pemetaan baru jika itu adalah ID lama)
    let targetId = legacyMap[pageId] || pageId;
    let targetSection = document.getElementById(targetId);
    
    // 2. Safety Net: Jika halaman tidak ada, hentikan fungsi agar tidak Blank Putih
    if (!targetSection) {
        console.warn("Smart Router: Mengabaikan navigasi karena ID tidak ditemukan ->", targetId);
        return; 
    }

    // 3. Sembunyikan semua section utama (Sapu bersih layar)
    document.querySelectorAll('.page-section').forEach(el => {
        el.classList.add('d-none');
        el.classList.remove('fade-in');
    });

    // 4. Munculkan section yang dituju
    targetSection.classList.remove('d-none');
    
    // Beri sedikit delay untuk memicu animasi masuk (fade-in) yang mulus
    setTimeout(() => {
        targetSection.classList.add('fade-in');
    }, 10);

    // 5. Auto-Klik Tab yang Sesuai (Keajaiban Transisi)
    // Jika sistem mendeteksi panggilan ke ID lama, router akan memindahkannya ke Tab yang tepat
    if (pageId === 'kalender') {
        let tab = document.getElementById('tab-dash-calendar');
        if (tab) tab.click();
    } 
    else if (pageId === 'datamaster') {
        let tab = document.getElementById('tab-data-master');
        if (tab) tab.click();
    } 
    else if (pageId === 'upload') {
        let tab = document.getElementById('tab-data-upload');
        if (tab) tab.click();
    }

    // 6. Gulir layar kembali ke atas dengan halus
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement; html.setAttribute('data-bs-theme', html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
});

function renderPagination(totalItems, currentPage, pageSize, callbackSection) {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (totalItems === 0) return '';
    let html = `<div class="d-flex justify-content-between align-items-center mt-2 px-3 py-2 bg-light rounded-bottom-4 border-top"><small class="text-muted fw-bold" style="font-size:0.7rem">Menampilkan ${(currentPage-1)*pageSize + 1} - ${Math.min(currentPage*pageSize, totalItems)} dari ${totalItems} baris</small><nav><ul class="pagination pagination-sm mb-0 shadow-sm">`;
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link rounded-start-pill fw-bold" href="#" onclick="changePage('${callbackSection}', ${currentPage - 1})">Prev</a></li>`;
    let startPage = Math.max(1, currentPage - 1); let endPage = Math.min(totalPages, currentPage + 1);
    if(startPage > 1) html += `<li class="page-item disabled"><a class="page-link" href="#">...</a></li>`;
    for(let i=startPage; i<=endPage; i++){ html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link fw-bold" href="#" onclick="changePage('${callbackSection}', ${i})">${i}</a></li>`; }
    if(endPage < totalPages) html += `<li class="page-item disabled"><a class="page-link" href="#">...</a></li>`;
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link rounded-end-pill fw-bold" href="#" onclick="changePage('${callbackSection}', ${currentPage + 1})">Next</a></li></ul></nav></div>`;
    return html;
}

function populateDatalist(listId, dataSet) {
    const dl = document.getElementById(listId); if (!dl) return;
    dl.innerHTML = Array.from(dataSet).filter(Boolean).map(val => `<option value="${val}">`).join('');
}

// ==========================================
// 2. PARSER DATA (MULTI-FILE) & PREVIEW UPLOAD
// ==========================================
async function processGL() {
    const fileInput = document.getElementById('glFile');
    const files = fileInput.files;
    if (!files.length) return PlayfulAlert.fire('Error', 'Silakan pilih/tarik file GL terlebih dahulu!', 'error');

    let glData = [];
    showProgressAlert('Membaca File GL...', 'Sedang mengekstrak ribuan baris data...');
    let processedFiles = 0;

    for (let file of files) {
        let text = await readFileAsText(file);
        
        // [ANTI-ERROR] VALIDASI FILE TERTUKAR
        if (text.includes("TRANSACTION START") || text.includes("PIN ENTERED") || text.includes("CASH TAKEN")) {
            Swal.close();
            return PlayfulAlert.fire('File Tertukar!', `File <b>${file.name}</b> sepertinya adalah file Jurnal Mesin (EJ). Anda menaruhnya di kolom GL.`, 'error');
        }

        const lines = text.split('\n');
        const regex = /^\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})\s+.*?\s+(\w*(?:\d{4})KTM\d+)\s+([\d,]+(?:\.\d+)?)/;
        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const noResi = parseInt(match[2].split('KTM')[0], 10).toString(); 
                const nominal = parseFloat(match[3].replace(/,/g, ''));
                const atm = "KTM" + match[2].split('KTM')[1]; 
                const tglSplit = match[1].split(/[-/]/);
                const formatTgl = `${tglSplit[2]}-${tglSplit[1].padStart(2, '0')}-${tglSplit[0].padStart(2, '0')}`;
                glData.push([formatTgl, atm, noResi, nominal, 'TARIK TUNAI', match[2]]);
            }
        });
        processedFiles++;
        updateProgress((processedFiles / files.length) * 100);
    }
    
    setTimeout(() => {
        Swal.close();
        if(glData.length === 0) return PlayfulAlert.fire('Data Kosong', 'Tidak ada data GL yang valid pada file ini.', 'warning');
        showPreviewModal(glData, 'GL');
    }, 500);
}

async function processEJ() {
    const fileInput = document.getElementById('ejFile');
    const files = fileInput.files;
    if (!files.length) return PlayfulAlert.fire('Error', 'Silakan pilih/tarik file EJ terlebih dahulu!', 'error');

    let ejData = [];
    showProgressAlert('Membaca File EJ...', 'Sedang merakit jurnal mesin...');
    let processedFiles = 0;

    for (let file of files) {
        let text = await readFileAsText(file);
        
        // [ANTI-ERROR] VALIDASI FILE TERTUKAR
        if (!text.includes("TRANSACTION START") && !text.includes("PIN ENTERED") && !text.includes("EMV AID")) {
            Swal.close();
            return PlayfulAlert.fire('File Tertukar!', `File <b>${file.name}</b> sepertinya BUKAN file Jurnal Mesin. Pastikan ini bukan file GL.`, 'error');
        }

        const lines = text.split('\n');
        let currentTx = {}; let isLookingForJumlah = false; let lastValidAtmId = 'UNKNOWN'; let lastValidDate = '';
        
        function saveCurrentTransaction() {
            if (currentTx.noResi) {
                if (!currentTx.tanggal) currentTx.tanggal = lastValidDate;
                if (currentTx.cashTaken) currentTx.status = "SUKSES";
                else if (!currentTx.status) {
                    if (currentTx.jenis === "TARIK TUNAI" && (!currentTx.nominal || currentTx.nominal === 0)) currentTx.status = "GAGAL - TIDAK ADA UANG KELUAR";
                    else if (currentTx.nominal > 0) {
                        if (currentTx.jenis === "TRANSFER") currentTx.status = "SUKSES (TRANSFER)";
                        else if (currentTx.jenis === "PEMBAYARAN") currentTx.status = "SUKSES (PEMBELIAN/PAYMENT)";
                        else currentTx.status = "SUKSES";
                    } else currentTx.status = "NON-FINANSIAL";
                }
                if (!currentTx.nominal) currentTx.nominal = 0;
                let finalAtmId = currentTx.atm; if (!finalAtmId || /^\d+$/.test(finalAtmId)) finalAtmId = lastValidAtmId;
                ejData.push([currentTx.tanggal, finalAtmId, currentTx.noResi, currentTx.nominal, currentTx.status]);
            }
            currentTx = {}; isLookingForJumlah = false;
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line.includes("<- TRANSACTION END") || line.includes("-> TRANSACTION START") || line.includes("EMV AID ") || line.includes("PIN ENTERED") || line.includes("TRACK 2 DATA")) { if (currentTx.noResi) saveCurrentTransaction(); }
            if (line.includes("CASH TAKEN")) currentTx.cashTaken = true;
            
            const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([A-Z0-9]+)/);
            if (dateMatch) { 
                currentTx.tanggal = `20${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; lastValidDate = currentTx.tanggal; 
                let tempAtm = dateMatch[5]; if (/[A-Z]/i.test(tempAtm)) lastValidAtmId = tempAtm; currentTx.atm = lastValidAtmId; 
            }
            
            const resiMatch = line.match(/(?:NO\s+RESI|NO\s+REF\.?|REFF\s+NO)\s*:?\s*(\d+)/i);
            if (resiMatch) currentTx.noResi = parseInt(resiMatch[1], 10).toString();
            const smartEmvMatch = line.match(/SMART EMV\s+(\d+)/);
            if (smartEmvMatch) currentTx.noResi = parseInt(smartEmvMatch[1], 10).toString();
            
            let textUpper = line.toUpperCase();
            if (textUpper.includes("PENARIKAN TUNAI") || textUpper.includes("TARIK TUNAI") || textUpper.includes("WITHDRAWAL")) currentTx.jenis = "TARIK TUNAI";
            else if (textUpper.includes("TRANSFER") || textUpper.includes("PEMINDAH BUKUAN") || textUpper.includes("KE BANK") || textUpper.includes("REK TUJUAN")) currentTx.jenis = "TRANSFER";
            else if (textUpper.includes("PEMBELIAN") || textUpper.includes("PEMBAYARAN") || textUpper.includes("VOUCHER") || textUpper.includes("PAYMENT") || textUpper.includes("TOKEN")) currentTx.jenis = "PEMBAYARAN";
            else if (textUpper.includes("INFORMASI SALDO") || textUpper.includes("UBAH/GANTI PIN") || textUpper.includes("PIN CHANGE") || textUpper.includes("PIN SUCCESSFULLY") || textUpper.includes("FORCE CHANGE PIN")) { currentTx.jenis = "NON-FINANSIAL"; currentTx.status = "NON-FINANSIAL"; }
            
            if ((textUpper.includes("JUMLAH") || textUpper.includes("AMOUNT") || textUpper.includes("TOTAL")) && !textUpper.includes("ENTERED") && !textUpper.includes("SALDO")) {
                isLookingForJumlah = true; const inlineJumlah = line.match(/(?:RP\.?|:|\.)\s*([\d,]+(?:\.\d+)?)/i);
                if (inlineJumlah) { currentTx.nominal = parseFloat(inlineJumlah[1].replace(/,/g, '')); isLookingForJumlah = false; }
            } else if (isLookingForJumlah) {
                if (!line.match(/^\d{2}:\d{2}:\d{2}/)) { const nextLineJumlah = line.match(/^([\d,]+(?:\.\d+)?)/); if (nextLineJumlah) currentTx.nominal = parseFloat(nextLineJumlah[1].replace(/,/g, '')); }
                isLookingForJumlah = false; 
            }
            
            if (textUpper.includes("TRANSAKSI SUKSES") || (textUpper.includes("SUCCESSFUL") && !textUpper.includes("PIN"))) {
                currentTx.status = (currentTx.jenis === "TRANSFER") ? "SUKSES (TRANSFER)" : (currentTx.jenis === "PEMBAYARAN") ? "SUKSES (PEMBELIAN/PAYMENT)" : "SUKSES";
            }
            
            const errorKeywords = ["SALDO KURANG", "SALAH MASUKKAN PIN", "KARTU ANDA SUDAH KADALUARSA", "HIGH BILL MIX ERROR", "LOW BILL MIX ERROR", "DISPENSER ERROR", "COMMUNICATION ERROR", "CDM ERROR", "KD.ARE/NO.TELP TDK TERDAFTA", "RESTRICTED PHONE NUMBER", "MELEBIHI LIMIT", "INACTIVE ACCOUNT", "UNABLE TO PROCESS", "INVALID ZERO AMOUNT", "INVALID INSTITUTION", "RESPONSE CODE GAGAL", "CHIP CARD SECURITY FAILURE", "PROCESSOR TEMP DOWN", "KARTU ANDA TERDAFTAR SBG", "TRANSAKSI SEDANG DIPROSES", "SUSPECT"];
            errorKeywords.forEach(err => { if (textUpper.includes(err) && !currentTx.cashTaken) currentTx.status = "GAGAL - " + err; });
            if (line.match(/TRANSACTION \d+ FAILED/i) && !currentTx.cashTaken) currentTx.status = "GAGAL - TRANSACTION FAILED";
        }
        if (currentTx.noResi) saveCurrentTransaction();
        processedFiles++;
        updateProgress((processedFiles / files.length) * 100);
    }
    
    setTimeout(() => {
        Swal.close();
        if (ejData.length === 0) return PlayfulAlert.fire('Data Kosong', 'Tidak ditemukan transaksi pada file EJ ini.', 'warning');
        showPreviewModal(ejData, 'EJ');
    }, 500);
}

function showPreviewModal(data, type) {
    pendingUploadData = data; pendingUploadType = type === 'GL' ? 'uploadGL' : 'uploadEJ';
    document.getElementById('previewType').innerText = type; document.getElementById('previewCount').innerText = data.length.toLocaleString('id-ID');
    const thead = document.getElementById('previewTableHeader'); const tbody = document.getElementById('previewTableBody');
    thead.innerHTML = type === 'GL' ? `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Jenis</th><th>Referensi</th></tr>` : `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Status Transaksi</th></tr>`;
    const rowsHtml = data.slice(0, 100).map(row => {
        if (type === 'GL') return `<tr><td class="text-secondary fw-medium">${row[0]}</td><td><span class="badge bg-secondary rounded-pill">${row[1]}</span></td><td class="fw-bold">${row[2]}</td><td class="text-primary fw-bold">${formatRp(row[3])}</td><td><span class="badge bg-info text-dark rounded-pill">${row[4]}</span></td><td class="text-muted"><small>${row[5]}</small></td></tr>`;
        let badge = row[4].includes('SUKSES') ? `bg-success-subtle text-success` : row[4].includes('GAGAL') ? `bg-danger-subtle text-danger` : `bg-light text-secondary`;
        return `<tr><td class="text-secondary fw-medium">${row[0]}</td><td><span class="badge bg-secondary rounded-pill">${row[1]}</span></td><td class="fw-bold">${row[2]}</td><td class="text-primary fw-bold">${formatRp(row[3])}</td><td><span class="badge rounded-pill px-3 py-1 ${badge}">${row[4]}</span></td></tr>`;
    }).join('');
    let extraMsg = data.length > 100 ? `<tr><td colspan="6" class="text-center text-muted fst-italic py-3 bg-light">Menampilkan 100 baris pertama dari ${data.length.toLocaleString('id-ID')} baris...</td></tr>` : '';
    tbody.innerHTML = rowsHtml + extraMsg;
    new bootstrap.Modal(document.getElementById('previewModal')).show();
}

document.getElementById('btnConfirmUpload').addEventListener('click', () => {
    const m = bootstrap.Modal.getInstance(document.getElementById('previewModal')); if(m) m.hide();
    sendToBackend(pendingUploadType, pendingUploadData);
});

async function sendToBackend(action, data) {
    showProgressAlert('Menyinkronkan ke Cloud...', 'Sedang mendistribusikan puluhan ribu data ke database bulanan...');
    startFakeProgress(95); // Simulasikan loading naik pelan-pelan sampai 95%
    
    try {
        const result = await apiCall(action, data);
        stopFakeProgress(); // Paksa loading jadi 100% karena data berhasil diterima
        
        setTimeout(() => {
            if(result && result.success) {
                PlayfulAlert.fire('Berhasil!', `Data sukses disimpan. Dimasukkan: <b>${result.data.added}</b> baris baru.`, 'success');
                // Hapus badge dan input
                document.querySelectorAll('.file-count-badge').forEach(el => el.classList.add('d-none'));
                document.getElementById('glFile').value = ""; document.getElementById('ejFile').value = "";
                fetchDatabaseData(); 
            } else PlayfulAlert.fire('Error Backend', result ? result.message : 'Koneksi terputus', 'error');
        }, 500);
    } catch (err) { 
        Swal.close();
        PlayfulAlert.fire('Error', err.toString(), 'error'); 
    }
}

async function triggerAnalysis() {
    showProgressAlert('Analisa AI Berjalan...', 'Sedang mencocokkan data lintas bulan. Ini mungkin memakan waktu beberapa detik...');
    startFakeProgress(92);
    
    try {
        const result = await apiCall('analyze');
        stopFakeProgress();
        
        setTimeout(() => {
            if(result && result.success) {
                const alertMsg = result.data.infoMsg ? result.data.infoMsg : "Perhitungan bulan ini berhasil dimuat.";
                const iconType = alertMsg.includes('ditangguhkan') ? 'info' : 'success';
                PlayfulAlert.fire('Analisa Selesai', alertMsg, iconType);
                globalSelisihData = result.data.tableData;
                renderSelisihTablesFiltered(); 
            } else PlayfulAlert.fire('Gagal', result ? result.message : 'Koneksi terputus', 'error');
        }, 500);
    } catch (err) { 
        Swal.close();
        PlayfulAlert.fire('Error', err.toString(), 'error'); 
    }
}

function renderUploadHistory() {
    if(!databaseData.gl && !databaseData.ej) return;
    globalHistMap.clear();
    (databaseData.gl || []).forEach(r => { let tgl = String(r[1]).substring(0,10); if(!tgl || tgl === 'undefined') return; let key = `GL_${tgl}`; if(!globalHistMap.has(key)) globalHistMap.set(key, {date: tgl, type: 'GL', data: []}); globalHistMap.get(key).data.push(r); });
    (databaseData.ej || []).forEach(r => { let tgl = String(r[1]).substring(0,10); if(!tgl || tgl === 'undefined') return; let key = `EJ_${tgl}`; if(!globalHistMap.has(key)) globalHistMap.set(key, {date: tgl, type: 'EJ', data: []}); globalHistMap.get(key).data.push(r); });

    let histArr = Array.from(globalHistMap.values()).sort((a,b) => new Date(b.date) - new Date(a.date));
    const fTerm = document.getElementById('filterUploadHist').value.toLowerCase();
    if(fTerm) histArr = histArr.filter(h => h.date.toLowerCase().includes(fTerm) || h.type.toLowerCase().includes(fTerm));

    const pageData = histArr.slice((pageState.uploadHist - 1) * PAGE_SIZE, pageState.uploadHist * PAGE_SIZE);
    let tbody = document.getElementById('tableBodyUploadHist');
    if(pageData.length === 0) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted"><i class="bi bi-inbox fs-4 d-block mb-1"></i>Belum ada data transaksi.</td></tr>`;
    else tbody.innerHTML = pageData.map(h => `<tr><td><span class="badge ${h.type==='GL'?'bg-primary':'bg-success'} rounded-pill shadow-sm px-3"><i class="bi ${h.type==='GL'?'bi-file-earmark-text':'bi-receipt'}"></i> Data ${h.type}</span></td><td class="fw-bold text-secondary">${h.date}</td><td><span class="badge bg-light text-dark border rounded-pill">${h.data.length.toLocaleString('id-ID')} Transaksi</span></td><td><button class="btn btn-sm btn-outline-primary rounded-pill fw-bold shadow-sm bouncy-hover" style="font-size:0.7rem" onclick="openHistoryDetail('${h.type}_${h.date}')"><i class="bi bi-eye"></i> Rincian</button></td></tr>`).join('');
    document.getElementById('paginationUploadHist').innerHTML = renderPagination(histArr.length, pageState.uploadHist, PAGE_SIZE, 'uploadHist');
}

function openHistoryDetail(key) {
    detailType = key.split('_')[0]; currentDetailData = globalHistMap.get(key).data; 
    document.getElementById('histDetailTitle').innerText = `${detailType} - ${key.split('_')[1]}`;
    document.getElementById('histDetailSearch').value = ''; pageState.histDetail = 1;
    renderHistoryDetailTable(); new bootstrap.Modal(document.getElementById('historyDetailModal')).show();
}

function renderHistoryDetailTable() {
    let term = document.getElementById('histDetailSearch').value.toLowerCase();
    let filtered = currentDetailData.filter(r => String(r[3]).toLowerCase().includes(term) || String(r[2]).toLowerCase().includes(term));
    document.getElementById('histDetailCount').innerText = filtered.length;
    const thead = document.getElementById('histDetailThead'); const tbody = document.getElementById('histDetailTbody');
    thead.innerHTML = detailType === 'GL' ? `<tr><th>ATM</th><th>Resi</th><th>Nominal</th><th>Jenis Transaksi</th><th>Referensi</th></tr>` : `<tr><th>ATM</th><th>Resi</th><th>Nominal</th><th>Status Mesin</th></tr>`;
    let pageData = filtered.slice((pageState.histDetail - 1) * PAGE_SIZE, pageState.histDetail * PAGE_SIZE);
    if (pageData.length === 0) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted small"><i class="bi bi-emoji-smile fs-4 d-block mb-1"></i> Tidak ada transaksi yang cocok.</td></tr>`;
    else tbody.innerHTML = pageData.map(r => detailType === 'GL' ? `<tr><td><span class="badge bg-secondary rounded-pill">${r[2]}</span></td><td class="fw-bold">${r[3]}</td><td class="text-primary fw-bold">${formatRp(r[4])}</td><td><span class="badge bg-light text-secondary border rounded-pill">${r[5]}</span></td><td><small class="text-muted">${r[6] || '-'}</small></td></tr>` : `<tr><td><span class="badge bg-secondary rounded-pill">${r[2]}</span></td><td class="fw-bold">${r[3]}</td><td class="text-primary fw-bold">${formatRp(r[4])}</td><td><span class="badge rounded-pill px-3 py-1 ${String(r[5]).includes('SUKSES') ? 'bg-success-subtle text-success' : String(r[5]).includes('GAGAL') ? 'bg-danger-subtle text-danger' : 'bg-light text-secondary'}">${r[5]}</span></td></tr>`).join('');
    document.getElementById('histDetailPagination').innerHTML = renderPagination(filtered.length, pageState.histDetail, PAGE_SIZE, 'histDetail');
}

// ==========================================
// 4. ANALISA SELISIH (AI MATCHER & HIERARKI)
// ==========================================


async function fetchSelisihData() {
    try {
        const resultSelisih = await apiCall('getSelisih');
        const resultOpname = await apiCall('getOpname');
        
        if(resultSelisih && resultSelisih.success) globalSelisihData = resultSelisih.data;
        if(resultOpname && resultOpname.success) globalOpnameData = resultOpname.data;
        
        let dAtms = new Set(), dResis = new Set(), dNoms = new Set();
        (globalSelisihData||[]).forEach(r => { dAtms.add(String(r[1]).trim()); dResis.add(String(r[2]).trim()); dNoms.add(parseFloat(r[3])); });
        populateDatalist('dl-atm', dAtms); populateDatalist('dl-resi', dResis); populateDatalist('dl-nominal', dNoms);
        renderSelisihTablesFiltered();
        renderCalendar();
        renderDashboard();
    } catch (err) { console.error("Error Fetch Selisih:", err); throw err; }
}

function renderSelisihTablesFiltered() {
    if (!globalSelisihData) return;
    const fResi = document.getElementById('filterResiAn').value.toLowerCase(); const fAtm = document.getElementById('filterAtmAn').value.toLowerCase();
    const fNom = document.getElementById('filterNominalAn').value; const sortDate = document.getElementById('sortDateAn').value;

    let filteredData = globalSelisihData.filter(row => {
        let match = true;
        if(fResi) match = match && String(row[2]).toLowerCase().includes(fResi);
        if(fAtm) match = match && String(row[1]).toLowerCase().includes(fAtm);
        if(fNom) match = match && String(row[3]) === fNom;
        return match;
    });

    filteredData.sort((a, b) => sortDate === 'desc' ? new Date(b[0]) - new Date(a[0]) : new Date(a[0]) - new Date(b[0]));

    const lebihArr = filteredData.filter(row => row[4] === 'SELISIH LEBIH' && String(row[5]).toLowerCase() === 'belum');
    const kurangArr = filteredData.filter(row => row[4] === 'SELISIH KURANG' && String(row[5]).toLowerCase() === 'belum');
    const selesaiArr = filteredData.filter(row => String(row[5]).toLowerCase() !== 'belum');

    const totLebih = lebihArr.reduce((sum, row) => sum + parseFloat(row[3]), 0); const totKurang = kurangArr.reduce((sum, row) => sum + parseFloat(row[3]), 0);
    const totSelesai = selesaiArr.reduce((sum, row) => sum + parseFloat(row[3]), 0); const totSemua = totSelesai + totLebih + totKurang;

    document.getElementById('totalLebihRp').innerText = formatRp(totLebih); document.getElementById('totalKurangRp').innerText = formatRp(totKurang);
    document.getElementById('countLebih').innerText = lebihArr.length; document.getElementById('countKurang').innerText = kurangArr.length;
    document.getElementById('hierarki-tot-selisih').innerText = formatRp(totSemua); document.getElementById('hierarki-tot-selesai').innerText = formatRp(totSelesai);
    document.getElementById('hierarki-tot-belum').innerText = formatRp(totLebih + totKurang); document.getElementById('hierarki-progress').style.width = `${totSemua === 0 ? 0 : (totSelesai / totSemua) * 100}%`;

    let baUsageMap = new Map();
    selesaiArr.forEach(r => {
        let reason = String(r[6] || ''); let nominalTerpakai = parseFloat(r[3]) || 0; let atmTerpakai = String(r[1]).trim();
        let match = reason.match(/tanggal (\d{4}-\d{2}-\d{2})/);
        if (match) { let key = `${match[1]}_${atmTerpakai}`; baUsageMap.set(key, (baUsageMap.get(key) || 0) + nominalTerpakai); }
    });

    const renderTable = (arr, type, pageKey) => {
        const pageData = arr.slice((pageState[pageKey] - 1) * PAGE_SIZE, pageState[pageKey] * PAGE_SIZE);
        if(pageData.length === 0) return `<tr><td colspan="6" class="text-center py-5 text-muted small"><i class="bi bi-emoji-smile fs-4 d-block mb-1"></i> Data bersih/tidak ditemukan.</td></tr>`;
        
        return pageData.map(row => {
            const tglTrxStr = String(row[0] || '').substring(0,10); const nominalSelisih = parseFloat(row[3]); const atmTrx = String(row[1]).trim();
            const rawStr = encodeURIComponent(JSON.stringify(row)); let aiBadgeHtml = ''; let aiSaranTeks = ''; 
            
            if (type === 'belum' && typeof globalOpnameData !== 'undefined' && globalOpnameData.length > 0) {
                let sortedOpname = [...globalOpnameData].sort((a,b) => new Date(String(a[1]).replace(' ', 'T')) - new Date(String(b[1]).replace(' ', 'T')));
                let trxTime = new Date(tglTrxStr + "T00:00:00").getTime(); const extNum = (str) => String(str).replace(/\D/g, '');
                
                let matchedBA = sortedOpname.find(ba => {
                    let tglBA_str = String(ba[1]).substring(0,10); let baTime = new Date(tglBA_str + "T00:00:00").getTime(); let totalFisik = parseFloat(ba[7]) || 0; 
                    let keyBA = `${tglBA_str}_${String(ba[2]).trim()}`; let terpakai = baUsageMap.get(keyBA) || 0;
                    if (extNum(ba[2]) !== extNum(atmTrx) || baTime < trxTime || Math.abs(totalFisik) - terpakai < nominalSelisih) return false;
                    return (row[4] === 'SELISIH LEBIH' && totalFisik > 0) || (row[4] === 'SELISIH KURANG' && totalFisik < 0);
                });
                if (matchedBA) {
                    let tglMatched = String(matchedBA[1]).substring(0,10); aiSaranTeks = `Selesai: Kompensasi selisih tercakup dalam Berita Acara Opname fisik ATM tanggal ${tglMatched}.`;
                    aiBadgeHtml = `<div class="mt-1"><span class="badge bg-warning text-dark border border-warning shadow-sm rounded-pill bouncy-hover" style="font-size:0.65rem" title="Klik Selesaikan, alasan otomatis pakai BA tgl ${tglMatched}"><i class="bi bi-robot text-primary"></i> <b>Saran AI:</b> Pakai BA ${tglMatched}</span></div>`;
                }
            }

            let actionBtn = type === 'belum' 
                ? `<button class="btn btn-sm btn-success rounded-pill fw-bold shadow-sm bouncy-hover text-nowrap" style="font-size:0.7rem" onclick="event.stopPropagation(); openResolveModal('${rawStr}', '${encodeURIComponent(aiSaranTeks)}')"><i class="bi bi-check2-circle"></i> Selesaikan</button>` 
                : `<button class="btn btn-sm btn-outline-danger rounded-pill fw-bold me-1 shadow-sm bouncy-hover text-nowrap" style="font-size:0.7rem" onclick="event.stopPropagation(); revertSelisih('${rawStr}')"><i class="bi bi-arrow-counterclockwise"></i> Batal</button><button class="btn btn-sm btn-dark rounded-pill shadow-sm bouncy-hover text-nowrap" style="font-size:0.7rem" onclick="event.stopPropagation(); generateBA('${rawStr}')"><i class="bi bi-printer"></i> B/A</button>`;

            return `<tr class="align-middle" style="cursor:pointer;" onclick="showDetailPopup('${rawStr}')"><td class="fw-medium text-secondary" style="font-size:0.75rem">${tglTrxStr}</td><td><span class="badge bg-secondary shadow-sm rounded-pill">${row[1]}</span></td><td class="fw-bold">${row[2]}</td><td class="text-primary fw-bold">${formatRp(nominalSelisih)}</td><td><small class="text-muted d-block text-truncate" style="max-width:150px;">${row[6]}</small>${aiBadgeHtml}</td><td>${actionBtn}</td></tr>`;
        }).join('');
    };

    document.getElementById('tableBodyLebih').innerHTML = renderTable(lebihArr, 'belum', 'analisaLebih'); document.getElementById('paginationAnalisaLebih').innerHTML = renderPagination(lebihArr.length, pageState.analisaLebih, PAGE_SIZE, 'analisaLebih');
    document.getElementById('tableBodyKurang').innerHTML = renderTable(kurangArr, 'belum', 'analisaKurang'); document.getElementById('paginationAnalisaKurang').innerHTML = renderPagination(kurangArr.length, pageState.analisaKurang, PAGE_SIZE, 'analisaKurang');
    document.getElementById('tableBodySelesai').innerHTML = renderTable(selesaiArr, 'selesai', 'analisaSelesai'); document.getElementById('paginationAnalisaSelesai').innerHTML = renderPagination(selesaiArr.length, pageState.analisaSelesai, PAGE_SIZE, 'analisaSelesai');
}

// ==========================================
// 5. PENYELESAIAN (INSTA-SYNC) & B/A PDF
// ==========================================
// ==========================================
// PENYELESAIAN, CETAK PDF ANTI-BLANK, & DOCX EXPORT
// ==========================================
function openResolveModal(rawStr, encodedSaran = '') {
    activeResolveRow = JSON.parse(decodeURIComponent(rawStr)); 
    let saranText = encodedSaran ? decodeURIComponent(encodedSaran) : ''; 
    let nominal = formatRp(activeResolveRow[3]); 
    let tglTrx = String(activeResolveRow[0]).substring(0,10);
    
    document.getElementById('resolveInfoBox').innerHTML = `<h6 class="fw-bold mb-1"><i class="bi bi-info-circle"></i> Info Transaksi</h6><p class="mb-1 small">ATM: <b>${activeResolveRow[1]}</b> | Tgl: <b>${tglTrx}</b> | Resi: <b>${activeResolveRow[2]}</b></p><p class="mb-1 small text-danger fw-bold">Nominal Selisih: ${nominal}</p>${saranText ? `<hr class="my-2"><p class="mb-0 small text-success fw-bold"><i class="bi bi-robot"></i> Rekomendasi AI: ${saranText}</p>` : ''}`;
    
    // Set default tanggal hari ini
    let today = new Date().toISOString().split('T')[0];
    document.getElementById('resTanggal').value = today;

    let existingReason = activeResolveRow[6] || '';
    if (existingReason.toLowerCase() === 'belum' || existingReason === '') {
        if(saranText) document.getElementById('resolveReason').value = `Transaksi ATM tidak tercatat pada EJ dengan keterangan GAGAL sehingga terjadi selisih lebih ${nominal} pada mesin ${activeResolveRow[1]}. ${saranText}`;
        else document.getElementById('resolveReason').value = `Transaksi ATM tidak tercatat pada EJ dengan keterangan COMMUNICATION ERROR sehingga terjadi selisih pada mesin ${activeResolveRow[1]}`;
        document.getElementById('resRekening').value = ''; document.getElementById('resNama').value = '';
    } else { 
        // Mode Edit: Pecah JSON dari Keterangan
        let parts = existingReason.split('|||');
        document.getElementById('resolveReason').value = parts[0].trim();
        if(parts.length > 1) {
            try {
                let detail = JSON.parse(parts[1].trim());
                document.getElementById('resRekening').value = detail.rek || '';
                document.getElementById('resNama').value = detail.nama || '';
                document.getElementById('resTrx').value = detail.trx || 'Tarik Tunai On Us';
                document.getElementById('resProblem').value = detail.problem || 'Transaksi terdebet namun uang tidak keluar';
                if(detail.tglSelesai) document.getElementById('resTanggal').value = detail.tglSelesai;
            } catch(e){}
        }
    }
    new bootstrap.Modal(document.getElementById('resolveModal')).show();
}

async function submitResolve() {
    const reason = document.getElementById('resolveReason').value.trim(); 
    const rekening = document.getElementById('resRekening').value.trim() || "-"; 
    const nama = document.getElementById('resNama').value.trim().toUpperCase() || "-"; 
    const trx = document.getElementById('resTrx').value; 
    const problem = document.getElementById('resProblem').value;
    const tglSelesai = document.getElementById('resTanggal').value;

    if(!reason || !tglSelesai) return PlayfulAlert.fire('Tunggu dulu!', 'Harap isi Tanggal dan Keterangan penyelesaian.', 'warning');
    
    // Simpan tanggal penyelesaian di dalam JSON agar tidak merusak struktur database
    let finalKeterangan = `${reason} ||| ${JSON.stringify({rek: rekening, nama: nama, trx: trx, problem: problem, tglSelesai: tglSelesai})}`;
    bootstrap.Modal.getInstance(document.getElementById('resolveModal')).hide();
    
    const tglSafe = String(activeResolveRow[0]).substring(0,10); const atmSafe = String(activeResolveRow[1]).trim(); const resiSafe = String(activeResolveRow[2]).trim();
    const payload = { tanggal: tglSafe, atm: atmSafe, resi: resiSafe, status: 'Selesai', keterangan: finalKeterangan };
    
    PlayfulAlert.fire({ title: 'Menyimpan Data...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const result = await apiCall('updateSelisih', payload);
        if(result && result.success) {
            PlayfulAlert.close();
            let targetRow = globalSelisihData.find(r => String(r[0]).substring(0,10) === tglSafe && String(r[1]).trim() === atmSafe && String(r[2]).trim() === resiSafe);
            if (targetRow) { targetRow[5] = 'Selesai'; targetRow[6] = finalKeterangan; }
            activeResolveRow[5] = 'Selesai'; activeResolveRow[6] = finalKeterangan; 
            renderSelisihTablesFiltered(); renderOpnameTable(); renderDashboard();
            generateBA(encodeURIComponent(JSON.stringify(activeResolveRow))); 
        } else PlayfulAlert.fire('Gagal', 'Gagal update ke database', 'error');
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

function generateBA(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr)); 
    const tglTrx = String(row[0]).substring(0,10); const atmId = row[1]; const resi = row[2]; const nominalRaw = formatRp(row[3]);
    let reasonText = row[6] || ''; 
    let detail = {rek: ".......", nama: ".......", trx: "Tarik Tunai On Us", problem: "Transaksi terdebet namun uang tidak keluar", tglSelesai: new Date().toISOString().split('T')[0]};
    
    if (reasonText.includes('|||')) { 
        let parts = reasonText.split('|||'); reasonText = parts[0].trim(); 
        try { detail = { ...detail, ...JSON.parse(parts[1].trim()) }; } catch(e){} 
    }

    let dateObj = new Date(detail.tglSelesai); 
    let hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]; 
    let bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    let tglCetak = `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
    
    let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; let kota = namaCabang.replace('Kantor Cabang Pembantu', '').replace('Kantor Cabang', '').trim();
    
    document.getElementById('cetak_cabang').innerText = namaCabang; document.getElementById('cetak_alamat').innerText = globalConfig.cfgAlamat || 'Jl. Propinsi KM. 48 RT. 05 RW. 02';
    document.getElementById('cetak_pimpinan').innerText = globalConfig.cfgPimpinan || 'ENDY PRATAMA'; document.getElementById('cetak_admin').innerText = globalConfig.cfgAdmin || 'SUCI AINUL FITRI';
    document.getElementById('cetak_teller').innerText = globalConfig['cfgTeller_' + atmId.toUpperCase()] || 'TELLER AKTIF';
    document.getElementById('cetak_kota').innerText = kota; document.getElementById('cetak_tgl_ttd').innerText = tglCetak;
    document.getElementById('cetak_atm_judul').innerText = atmId; document.getElementById('cetak_hari').innerText = hariArr[dateObj.getDay()];
    document.getElementById('cetak_tgl').innerText = tglCetak; document.getElementById('cetak_atm').innerText = `${atmId} (${namaCabang})`;
    document.getElementById('cetak_nominal').innerText = nominalRaw; document.getElementById('cetak_rek').innerText = detail.rek;
    document.getElementById('cetak_nama').innerText = detail.nama; document.getElementById('cetak_resi').innerText = `${resi}${atmId.replace('KTM','')}`;
    document.getElementById('cetak_trx').innerText = detail.trx; document.getElementById('cetak_problem').innerText = detail.problem;
    document.getElementById('cetak_jurnal_ket').innerText = detail.problem; document.getElementById('cetak_keterangan').innerText = reasonText;
    document.getElementById('cetak_kredit_rek').innerText = detail.rek; document.getElementById('cetak_kredit_nama').innerText = detail.nama; document.getElementById('cetak_jurnal_nom').innerText = nominalRaw;
    
  // --- GANTI BAGIAN INI ---
    // Set QR Code Verifikasi B/A Penyelesaian mengarah ke Frontend (GitHub)
    let frontendUrl = window.location.origin + window.location.pathname;
    let qrData = encodeURIComponent(`${frontendUrl}?verify=ba&resi=${resi}&atm=${atmId}`);
    document.getElementById('qrBAPenyelesaian').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;

    new bootstrap.Modal(document.getElementById('beritaAcaraModal')).show();
}

function previewBAOpname() {
    let atmId = document.getElementById('opAtmId').value || "......."; let waktuInput = document.getElementById('opWaktu').value;
    if (!waktuInput) return PlayfulAlert.fire('Oops!', 'Isi waktu pelaksanaan dulu ya.', 'warning');
    let dateObj = new Date(waktuInput); let hariArr = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"]; let bulanArr = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    let sSblm = parseFloat(document.getElementById('opSysSebelum').value) || 0; let sTmbh = parseFloat(document.getElementById('opSysTambah').value) || 0; let fisik = parseFloat(document.getElementById('opFisik').value) || 0;
    let selisih = fisik - sSblm; 
    
    let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; 
    let upperCabang = namaCabang.toUpperCase();
    
    // Helper aman dari error null
    function safeSet(id, val) { let el = document.getElementById(id); if (el) el.innerText = val; }

    safeSet('cetakOp_cabang_header', upperCabang);
    safeSet('cetakOp_cabang_sub', upperCabang);
    safeSet('cetakOp_cabang', upperCabang); 
    safeSet('cetakOp_cabang_text', namaCabang);
    safeSet('cetakOp_cabang_text2', namaCabang);
    safeSet('cetakOp_alamat', globalConfig.cfgAlamat || 'Jl. Propinsi KM. 48 RT. 05 RW. 02');
    
    // 4 Penanda Tangan Resmi
    safeSet('cetakOp_petugasTellerName', globalConfig['cfgTeller_' + atmId.toUpperCase()] || 'SUCI AINUL FITRI');
    safeSet('cetakOp_petugasAdminName', globalConfig.cfgAdmin || 'FISTRI ARIANDINI');
   // --- GANTI BAGIAN SECURITY MENJADI INI ---
    let inputSecurity = document.getElementById('opSecurityName') ? document.getElementById('opSecurityName').value.trim() : '';
    safeSet('cetakOp_petugasSecurityName', inputSecurity || globalConfig.cfgSecurity || 'DADAN');
    safeSet('cetakOp_pimpinanName', globalConfig.cfgPimpinan || 'ENDY PRATAMA');
    safeSet('cetakOp_pimpinanJabatan', `Pemimpin ${namaCabang}`);

    safeSet('cetakHari', hariArr[dateObj.getDay()]); 
    safeSet('cetakTgl', `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`);
    safeSet('cetakJam', dateObj.toTimeString().substring(0,5)); 
    safeSet('cetakAtm', `${atmId.toUpperCase()} (${namaCabang})`);
    
    safeSet('cetakSysSebelum', formatNum(sSblm)); 
    safeSet('cetakSysTambah', formatNum(sTmbh)); 
    safeSet('cetakSysTotal', formatNum(sSblm + sTmbh)); 
    safeSet('cetakFisik', formatNum(fisik)); 
    safeSet('cetakKurang', formatNum(selisih < 0 ? Math.abs(selisih) : 0)); 
    safeSet('cetakLebih', formatNum(selisih > 0 ? selisih : 0));
    
    // Set QR Code Dinamis
    let frontendUrl = window.location.origin + window.location.pathname;
    let tglTrx = String(waktuInput).substring(0,10);
    let qrData = encodeURIComponent(`${frontendUrl}?verify=opname&atm=${atmId}&tgl=${tglTrx}`);
    let qrEl = document.getElementById('qrBAOpname');
    if (qrEl) qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;

    new bootstrap.Modal(document.getElementById('baOpnameModal')).show();
}

function printRiwayatBAOpname(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr)); let waktuInput = row[1]; let atmId = row[2]; let sSblm = parseFloat(row[3]) || 0; let sTmbh = parseFloat(row[4]) || 0; let fisik = parseFloat(row[6]) || 0; let selisih = parseFloat(row[7]) || 0;
    let dateObj = new Date(waktuInput.replace(' ', 'T')); let hariArr = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"]; let bulanArr = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    
    let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; 
    let upperCabang = namaCabang.toUpperCase();
    
    function safeSet(id, val) { let el = document.getElementById(id); if (el) el.innerText = val; }

    safeSet('cetakOp_cabang_header', upperCabang);
    safeSet('cetakOp_cabang_sub', upperCabang);
    safeSet('cetakOp_cabang', upperCabang); 
    safeSet('cetakOp_cabang_text', namaCabang);
    safeSet('cetakOp_cabang_text2', namaCabang);
    safeSet('cetakOp_alamat', globalConfig.cfgAlamat || 'Jl. Propinsi KM. 48 RT. 05 RW. 02');
    
    // 4 Penanda Tangan Resmi
    safeSet('cetakOp_petugasTellerName', globalConfig['cfgTeller_' + atmId.toUpperCase()] || 'SUCI AINUL FITRI');
    safeSet('cetakOp_petugasAdminName', globalConfig.cfgAdmin || 'FISTRI ARIANDINI');
    safeSet('cetakOp_petugasSecurityName', globalConfig.cfgSecurity || 'DADAN');
    safeSet('cetakOp_pimpinanName', globalConfig.cfgPimpinan || 'ENDY PRATAMA');
    safeSet('cetakOp_pimpinanJabatan', `Pemimpin ${namaCabang}`);

    safeSet('cetakHari', hariArr[dateObj.getDay()]); 
    safeSet('cetakTgl', `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`); 
    safeSet('cetakJam', String(dateObj.toTimeString()).substring(0,5)); 
    safeSet('cetakAtm', `${atmId.toUpperCase()} (${namaCabang})`);
    
    safeSet('cetakSysSebelum', formatNum(sSblm)); 
    safeSet('cetakSysTambah', formatNum(sTmbh)); 
    safeSet('cetakSysTotal', formatNum(sSblm + sTmbh)); 
    safeSet('cetakFisik', formatNum(fisik)); 
    safeSet('cetakKurang', formatNum(selisih < 0 ? Math.abs(selisih) : 0)); 
    safeSet('cetakLebih', formatNum(selisih > 0 ? selisih : 0));
    
    // Set QR Code Dinamis
    let frontendUrl = window.location.origin + window.location.pathname;
    let tglTrx = String(waktuInput).substring(0,10);
    let qrData = encodeURIComponent(`${frontendUrl}?verify=opname&atm=${atmId}&tgl=${tglTrx}`);
    let qrEl = document.getElementById('qrBAOpname');
    if (qrEl) qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;

    new bootstrap.Modal(document.getElementById('baOpnameModal')).show();
}

// ==========================================
// FUNGSI PRINT PDF INSTAN (ZERO-DELAY FIX)
// ==========================================
function cetakPDF(areaId) {
    const printArea = document.getElementById(areaId);
    if (!printArea) return;

    const originalParent = printArea.parentNode; 
    const originalNextSibling = printArea.nextSibling; 

    // 1. Kunci kertas untuk mode cetak
    printArea.classList.add('print-active-area');

    // 2. Kumpulkan elemen body ke dalam Array statis
    const bodyChildren = Array.from(document.body.children);
    
    // 3. Sembunyikan semua UI di latar belakang
    bodyChildren.forEach(el => {
        if (el.id !== areaId && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'LINK') {
            el.classList.add('d-none-print-temp');
            el.style.display = 'none';
        }
    });

    // 4. Pindahkan kertas ke luar modal (ke <body> utama) untuk di-print
    document.body.appendChild(printArea);

    let isRestored = false;

    // 5. Fungsi pemulihan instan (Dipanggil secepat kilat begitu dialog cetak ditutup)
    const restoreUI = () => {
        if (isRestored) return;
        isRestored = true;

        printArea.classList.remove('print-active-area');
        
        // Kembalikan kertas persis ke posisi asalnya di dalam Modal
        if (originalNextSibling) {
            originalParent.insertBefore(printArea, originalNextSibling);
        } else {
            originalParent.appendChild(printArea);
        }

        // Munculkan kembali seluruh elemen UI aplikasi dengan paksa
        document.querySelectorAll('.d-none-print-temp').forEach(el => {
            el.classList.remove('d-none-print-temp');
            el.style.display = '';
        });

        // Hapus event listener
        window.removeEventListener('afterprint', restoreUI);
        
        // Paksa browser merender ulang layar secara instan (Menghilangkan efek freeze)
        window.requestAnimationFrame(() => {
            document.body.style.display = 'none';
            document.body.offsetHeight; // Trigger reflow
            document.body.style.display = '';
        });
    };

    // Daftarkan event afterprint
    window.addEventListener('afterprint', restoreUI);

    // 6. Eksekusi perintah cetak browser
    window.print();

    // Jaring pengaman darurat (Fallback 300ms setelah jendela print ditutup/dibatalkan)
    setTimeout(() => {
        restoreUI();
    }, 400); 
}

// Meng-ekspor isi HTML menjadi file Word (.docx)
function exportHTMLToDoc(elementId, filename = '') {
    const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Berita Acara</title></head><body>";
    const postHtml = "</body></html>";
    const html = preHtml + document.getElementById(elementId).innerHTML + postHtml;
    
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(html);
    filename = filename ? filename + '.doc' : 'Berita_Acara.doc';
    
    const downloadLink = document.createElement("a");
    document.body.appendChild(downloadLink);
    
    if(navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, filename); // IE10+
    } else {
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.click();
    }
    document.body.removeChild(downloadLink);
}

async function revertSelisih(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    const confirm = await PlayfulAlert.fire({ title: 'Batalkan Selesai?', text: "Data dikembalikan ke tab Belum Selesai.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Kembalikan!', cancelButtonText: 'Batal'});
    if(!confirm.isConfirmed) return;

    const tglSafe = String(row[0]).substring(0,10); const atmSafe = String(row[1]).trim(); const resiSafe = String(row[2]).trim();
    const payload = { tanggal: tglSafe, atm: atmSafe, resi: resiSafe, status: 'Belum', keterangan: row[6] };
    
    PlayfulAlert.fire({ title: 'Mengembalikan...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const result = await apiCall('updateSelisih', payload);
        if(result && result.success) { 
            PlayfulAlert.fire('Berhasil', 'Data dikembalikan.', 'success'); 
            let targetRow = globalSelisihData.find(r => String(r[0]).substring(0,10) === tglSafe && String(r[1]).trim() === atmSafe && String(r[2]).trim() === resiSafe);
            if (targetRow) targetRow[5] = 'Belum';
            renderSelisihTablesFiltered(); renderOpnameTable(); 
        }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}



function showDetailPopup(rowDataStr) {
    const row = JSON.parse(decodeURIComponent(rowDataStr));
    document.getElementById('detailTanggal').innerText = String(row[0]).substring(0,10); document.getElementById('detailAtm').innerText = row[1];
    document.getElementById('detailResi').innerText = row[2]; document.getElementById('detailNominal').innerText = formatRp(row[3]);
    let ket = row[6] || '-'; if (ket.includes('|||')) ket = ket.split('|||')[0].trim(); document.getElementById('detailKeterangan').innerText = ket;
    
    const badge = document.getElementById('detailJenisBadge'); const header = document.getElementById('detailModalHeader'); const saran = document.getElementById('detailSaran');
    if (row[4] === 'SELISIH LEBIH') {
        badge.innerHTML = '<i class="bi bi-arrow-up-circle-fill"></i> UANG MESIN LEBIH'; badge.className = 'badge rounded-pill shadow-sm mb-2 bg-success text-white'; header.className = 'modal-header border-0 py-3 text-white bg-success'; saran.innerHTML = `Sistem GL merekam transaksi terpotong, namun jurnal EJ mesin <b>GAGAL</b>. <br>Pastikan saldo telah dikredit kembali ke nasabah.`;
    } else {
        badge.innerHTML = '<i class="bi bi-arrow-down-circle-fill"></i> UANG MESIN HILANG'; badge.className = 'badge rounded-pill shadow-sm mb-2 bg-danger text-white'; header.className = 'modal-header border-0 py-3 text-white bg-danger'; saran.innerHTML = `Mesin sukses mengeluarkan uang fisik, namun transaksi <b>TIDAK TERCATAT</b> di pembukuan GL. <br>Lakukan pengecekan jurnal suspense (rek. gantung) / debet manual.`;
    }
    new bootstrap.Modal(document.getElementById('detailSelisihModal')).show();
}

// ==========================================
// 6. ENGINE DATA MASTER 
// ==========================================
async function fetchDatabaseData() {
    const tbody = document.getElementById('tableBodyDataMaster');
    if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-1"></div><br><small>Menyinkronkan Database...</small></td></tr>`;
    try {
        const result = await apiCall('getDatabase');
        if(result && result.success) { databaseData = result.data; renderUploadHistory(); renderDataMaster(); updateDataCompletenessBanner(); renderCalendar(); renderDashboard();}
    } catch (err) { console.error("fetchDatabaseData Error:", err); throw err; }
}

function renderDataMaster() {
    const fStart = document.getElementById('filterStart').value; const fResi = document.getElementById('filterResiDm').value.toLowerCase();
    const fAtm = document.getElementById('filterAtmDm').value.toLowerCase(); const fNom = document.getElementById('filterNominalDm').value;
    const fStatus = document.getElementById('filterStatus').value;

    const selisihKeys = new Set();
    (databaseData.selisih||[]).forEach(row => { selisihKeys.add(`${String(row[0]).substring(0,10)}_${String(row[1]).trim()}_${String(row[2]).trim()}`); });

    // --- TAMBAHKAN 4 BARIS INI UNTUK MENGHIDUPKAN WIDGET ---
    if (document.getElementById('dmTotalGL')) {
        document.getElementById('dmTotalGL').innerText = formatNum(databaseData.gl ? databaseData.gl.length : 0);
        document.getElementById('dmTotalEJ').innerText = formatNum(databaseData.ej ? databaseData.ej.length : 0);
        document.getElementById('dmTotalSelisih').innerText = formatNum(selisihKeys.size);
    }
    // ---------------------------------------------------------
    
    let combinedData = [];
    (databaseData.gl||[]).forEach(row => { combinedData.push({ sumber: 'GL', tanggal: String(row[1]).substring(0,10), atm: row[2], resi: row[3], nominal: row[4], ket: `${row[5]}`, isSelisih: selisihKeys.has(`${String(row[1]).substring(0,10)}_${String(row[2]).trim()}_${String(row[3]).trim()}`) }); });
    (databaseData.ej||[]).forEach(row => { combinedData.push({ sumber: 'EJ', tanggal: String(row[1]).substring(0,10), atm: row[2], resi: row[3], nominal: row[4], ket: `Status: ${row[5]}`, isSelisih: selisihKeys.has(`${String(row[1]).substring(0,10)}_${String(row[2]).trim()}_${String(row[3]).trim()}`) }); });

    let filteredData = combinedData.filter(item => {
        let match = true;
        if (fStart) match = match && (item.tanggal === fStart);
        if (fResi) match = match && String(item.resi).toLowerCase().includes(fResi);
        if (fAtm) match = match && String(item.atm).toLowerCase().includes(fAtm);
        if (fNom) match = match && String(item.nominal) === fNom;
        if (fStatus === 'SELISIH') match = match && item.isSelisih;
        if (fStatus === 'AMAN') match = match && !item.isSelisih;
        return match;
    });

    filteredData.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    const pageData = filteredData.slice((pageState.master - 1) * PAGE_SIZE, pageState.master * PAGE_SIZE);
    const tbody = document.getElementById('tableBodyDataMaster');
    
    if (pageData.length === 0) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted small"><i class="bi bi-emoji-frown d-block fs-4 mb-1"></i> Tidak ada data yang cocok.</td></tr>`;
    else tbody.innerHTML = pageData.map(item => `<tr class="${item.isSelisih ? 'row-selisih' : 'row-aman'}"><td>${item.sumber === 'GL' ? `<span class="badge bg-primary px-3 rounded-pill shadow-sm"><i class="bi bi-file-earmark-text"></i> GL</span>` : `<span class="badge bg-success px-3 rounded-pill shadow-sm"><i class="bi bi-receipt"></i> EJ</span>`}</td><td class="fw-medium text-secondary" style="font-size:0.75rem">${item.tanggal}</td><td class="fw-bold">${item.atm}</td><td class="fw-bold">${item.isSelisih ? `<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i>` : ``}${item.resi}</td><td class="text-primary fw-bold">${formatRp(item.nominal)}</td><td class="text-muted small text-truncate" style="max-width:180px;" title="${item.ket}">${item.ket}</td></tr>`).join('');
    document.getElementById('paginationMaster').innerHTML = renderPagination(filteredData.length, pageState.master, PAGE_SIZE, 'master');
}

// ==========================================
// 7. ENGINE OPNAME FISIK ATM & A4 PDF
// ==========================================
function calcOpname() {
    let sSblm = parseFloat(document.getElementById('opSysSebelum').value) || 0; 
    let sTmbh = parseFloat(document.getElementById('opSysTambah').value) || 0; 
    let fisik = parseFloat(document.getElementById('opFisik').value) || 0;
    
    document.getElementById('opSysTotal').innerText = formatRp(sSblm + sTmbh);
    
    let selisih = fisik - sSblm; 
    let textSelisih = document.getElementById('opSelisihText'); 
    let badgeSelisih = document.getElementById('opSelisihBadge');
    let boxSelisih = document.getElementById('opSelisihBox');
    
    textSelisih.innerText = formatRp(Math.abs(selisih));
    
    if (selisih > 0) { 
        textSelisih.className = "fw-black mb-0 text-success"; 
        badgeSelisih.className = "badge bg-success rounded-pill mt-2 px-3 py-2 shadow-sm"; 
        badgeSelisih.innerHTML = "<i class='bi bi-arrow-up-circle-fill'></i> Selisih LEBIH (Uang Sisa)"; 
        boxSelisih.className = "p-3 rounded-4 text-center border mt-auto transition-all bg-success-subtle border-success-subtle";
    } 
    else if (selisih < 0) { 
        textSelisih.className = "fw-black mb-0 text-danger"; 
        badgeSelisih.className = "badge bg-danger rounded-pill mt-2 px-3 py-2 shadow-sm"; 
        badgeSelisih.innerHTML = "<i class='bi bi-arrow-down-circle-fill'></i> Selisih KURANG (Uang Hilang)"; 
        boxSelisih.className = "p-3 rounded-4 text-center border mt-auto transition-all bg-danger-subtle border-danger-subtle";
    } 
    else { 
        textSelisih.className = "fw-black mb-0 text-dark"; 
        badgeSelisih.className = "badge bg-secondary rounded-pill mt-2 px-3 py-2 shadow-sm"; 
        badgeSelisih.innerHTML = "<i class='bi bi-check-circle-fill'></i> Balance / Seimbang"; 
        boxSelisih.className = "p-3 rounded-4 text-center border mt-auto transition-all bg-secondary-subtle";
    }
}
// ==========================================
// INTERAKTIVITAS MENU OPNAME ATM
// ==========================================

// Fungsi memunculkan Insight Cerdas saat ATM diketik
function updateOpnameSmartInfo() {
    let atmInput = document.getElementById('opAtmId');
    let atm = atmInput.value.toUpperCase().replace(/\s/g, '');
    
    // Auto-format KTM (opsional)
    if (/^\d/.test(atm) && atm.length > 0) {
        atm = 'KTM' + atm;
        atmInput.value = atm;
    }

    let infoPanel = document.getElementById('opSmartInfoPanel');
    if(!atm || atm.length < 5) {
        infoPanel.classList.add('d-none');
        return;
    }

    // Cari selisih belum selesai untuk ATM ini di database globalSelisihData
    let pending = (globalSelisihData || []).filter(r => String(r[1]).toUpperCase() === atm && String(r[5]).toLowerCase() === 'belum');
    let totLebih = 0, totKurang = 0;
    
    pending.forEach(r => {
        if(r[4] === 'SELISIH LEBIH') totLebih += parseFloat(r[3]);
        else totKurang += parseFloat(r[3]);
    });

    let contentHtml = '';
    if(totLebih === 0 && totKurang === 0) {
        infoPanel.className = "card bg-success-subtle border-0 rounded-4 shadow-sm bouncy-hover transition-all";
        contentHtml = `
            <div class="text-success fw-bold d-flex align-items-center mb-1"><i class="bi bi-shield-check fs-5 me-2"></i> Mesin Bersih!</div>
            <p class="text-muted small mb-0" style="font-size:0.75rem; line-height:1.2;">Bagus! Saat ini tidak ada catatan selisih sistem yang menggantung pada mesin <b>${atm}</b> di bulan ini.</p>
        `;
    } else {
        infoPanel.className = "card bg-danger-subtle border-0 rounded-4 shadow-sm bouncy-hover transition-all";
        contentHtml = `
            <div class="text-danger fw-bold d-flex align-items-center mb-2 pb-2 border-bottom border-danger-subtle"><i class="bi bi-exclamation-triangle-fill fs-5 me-2"></i> Ada Kasus Menggantung!</div>
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small text-muted fw-bold" style="font-size:0.7rem">POTENSI UANG SISA (LEBIH)</span>
                <span class="text-success fw-black">${formatRp(totLebih)}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <span class="small text-muted fw-bold" style="font-size:0.7rem">POTENSI UANG HILANG (KURANG)</span>
                <span class="text-danger fw-black">${formatRp(totKurang)}</span>
            </div>
        `;
    }
    
    document.getElementById('opSmartContent').innerHTML = contentHtml;
    infoPanel.classList.remove('d-none');
}


async function fetchOpnameHistory() {
    document.getElementById('tableBodyOpname').innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary mb-1"></div></td></tr>`;
    try {
        const result = await apiCall('getOpname');
        if(result && result.success) { globalOpnameData = result.data; renderOpnameTable(); renderDashboard(); }
    } catch (err) { console.error(err); }
}

// ==========================================
// RENDER TABEL RIWAYAT OPNAME FISIK
// ==========================================
function renderOpnameTable() {
    const tbody = document.getElementById('tableBodyOpname');
    if(!tbody) return;

    let raw = globalOpnameData || [];
    const term = document.getElementById('filterAtmOp') ? document.getElementById('filterAtmOp').value.toLowerCase() : '';
    const tgl = document.getElementById('filterTglOp') ? document.getElementById('filterTglOp').value : '';

    let filtered = raw.filter(r => {
        let match = true;
        if (term) match = match && String(r[2]).toLowerCase().includes(term);
        if (tgl) match = match && String(r[1]).substring(0, 10) === tgl;
        return match;
    });

    const pageData = filtered.slice((pageState.opname - 1) * PAGE_SIZE, pageState.opname * PAGE_SIZE);
    
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-1"></i> Belum ada data Berita Acara Opname.</td></tr>`;
        document.getElementById('paginationOpname').innerHTML = '';
        return;
    }

    tbody.innerHTML = pageData.map(r => {
        let id = r[0];
        let waktu = String(r[1]).substring(0, 16);
        let atm = String(r[2]).trim().toUpperCase();
        let selisih = parseFloat(r[7]) || 0;
        
        let badgeFisik = selisih === 0 ? `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill px-3 shadow-sm">BALANCE</span>` :
                         selisih > 0 ? `<span class="badge bg-success rounded-pill px-3 shadow-sm">LEBIH ${formatRp(selisih)}</span>` : 
                                       `<span class="badge bg-danger rounded-pill px-3 shadow-sm">KURANG ${formatRp(Math.abs(selisih))}</span>`;

        let statusAI = selisih === 0 ? `<span class="text-muted small fw-bold">-</span>` : `<span class="small fw-bold text-warning">Tersisa: ${formatRp(Math.abs(selisih))}</span>`;

        const rawStr = encodeURIComponent(JSON.stringify(r));

        return `
            <tr>
                <td class="fw-medium text-secondary ps-3" style="font-size:0.8rem">${waktu}</td>
                <td><span class="badge bg-light text-dark border rounded-pill shadow-sm px-3">${atm}</span></td>
                <td>${badgeFisik}</td>
                <td>${statusAI}</td>
                <td class="text-center pe-3">
                    <div class="d-flex justify-content-center gap-2">
                        <!-- Tombol Edit Dikembalikan -->
                        <button class="btn btn-sm btn-primary rounded-pill fw-bold shadow-sm bouncy-hover px-3" onclick="editOpname('${rawStr}')" title="Edit Data"><i class="bi bi-pencil-square me-1"></i> Edit</button>
                        <button class="btn btn-sm btn-dark rounded-pill fw-bold shadow-sm bouncy-hover px-3" onclick="printRiwayatBAOpname('${rawStr}')" title="Cetak Berita Acara"><i class="bi bi-printer-fill"></i></button>
                        <button class="btn btn-sm btn-outline-danger rounded-pill fw-bold shadow-sm bouncy-hover px-2" onclick="deleteOpname('${id}')" title="Hapus Data"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('paginationOpname').innerHTML = renderPagination(filtered.length, pageState.opname, PAGE_SIZE, 'opname');
}

// ==========================================
// FUNGSI EDIT OPNAME (MENGISI FORM OTOMATIS)
// ==========================================
function editOpname(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    
    // Set ID tersembunyi agar sistem tahu ini adalah update, bukan data baru
    document.getElementById('opEditId').value = row[0];
    
    // Format tanggal ke input HTML (YYYY-MM-DDTHH:mm)
    let rawWaktu = String(row[1]);
    if (rawWaktu.includes(' ')) rawWaktu = rawWaktu.replace(' ', 'T').substring(0, 16);
    document.getElementById('opWaktu').value = rawWaktu;
    
    document.getElementById('opAtmId').value = row[2];
    document.getElementById('opSysSebelum').value = row[3] || 0;
    document.getElementById('opSysTambah').value = row[4] || 0;
    document.getElementById('opFisik').value = row[6] || 0;
    
    // Picu kalkulator visual dan Smart AI
    calcOpname();
    if(typeof updateOpnameSmartInfo === 'function') updateOpnameSmartInfo();
    
    // Gulir halus ke atas dan Pindah ke Tab Form secara otomatis
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('tab-op-form').click();
    
    PlayfulAlert.fire({
        title: 'Mode Edit Aktif',
        text: 'Data telah dimuat ke Kalkulator. Silakan ubah angka fisik atau waktu, lalu tekan Simpan.',
        icon: 'info',
        timer: 3000,
        showConfirmButton: false
    });
}

async function deleteOpname(id) {
    const confirm = await PlayfulAlert.fire({ title: 'Hapus BA?', text: "Data tidak bisa dikembalikan.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus!', cancelButtonText: 'Batal'});
    if(!confirm.isConfirmed) return;
    PlayfulAlert.fire({ title: 'Menghapus...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const result = await apiCall('deleteOpname', id);
        if(result && result.success) { PlayfulAlert.fire('Dihapus', 'Riwayat berhasil dibuang.', 'success'); fetchOpnameHistory(); }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function saveOpnameData() {
    let payload = { id: document.getElementById('opEditId').value, atm: document.getElementById('opAtmId').value, waktu: document.getElementById('opWaktu').value, sysSebelum: document.getElementById('opSysSebelum').value, sysTambah: document.getElementById('opSysTambah').value, fisik: document.getElementById('opFisik').value };
    if(!payload.atm || !payload.waktu || !payload.fisik) return PlayfulAlert.fire('Isian Kurang', 'Pastikan ID ATM, Waktu, dan Saldo Fisik terisi.', 'warning');
    PlayfulAlert.fire({ title: 'Menyimpan...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const result = await apiCall('uploadOpname', payload);
        if(result && result.success) { PlayfulAlert.fire('Berhasil!', 'Data Opname sukses tersimpan.', 'success'); document.getElementById('opEditId').value = ''; document.getElementById('opSysSebelum').value = ''; document.getElementById('opSysTambah').value = ''; document.getElementById('opFisik').value = ''; calcOpname(); fetchSelisihData(); } 
        else { PlayfulAlert.fire('Gagal', result ? result.message : 'Koneksi gagal', 'error'); }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

// ==========================================
// 8. ASISTEN REKOMENDASI UPLOAD
// ==========================================
// ==========================================
// 8. ASISTEN REKOMENDASI UPLOAD
// ==========================================
function updateDataCompletenessBanner() {
    if (!databaseData || (!databaseData.gl && !databaseData.ej)) return;

    let glMap = new Map(); 
    (databaseData.gl || []).forEach(r => { 
        let atm = String(r[2]).trim().toUpperCase();
        if (atm && atm !== 'ATM') {
            let d = new Date(String(r[1]).substring(0,10) + "T00:00:00").getTime();
            // Pengaman ekstra: Pastikan tanggal valid (bukan baris kosong/NaN)
            if (!isNaN(d)) {
                if (!glMap.has(atm) || d > glMap.get(atm)) glMap.set(atm, d);
            }
        }
    });
    
    let ejMap = new Map(); 
    (databaseData.ej || []).forEach(r => { 
        let atm = String(r[2]).trim().toUpperCase();
        if (atm && atm !== 'ATM') {
            let d = new Date(String(r[1]).substring(0,10) + "T00:00:00").getTime();
            if (!isNaN(d)) {
                if (!ejMap.has(atm) || d > ejMap.get(atm)) ejMap.set(atm, d);
            }
        }
    });

    let missingEJ = [], missingGL = [], laggingEJ = [], laggingGL = [];

    // Evaluasi Ketertinggalan Data EJ
    for (let [atm, glDate] of glMap.entries()) {
        if (!ejMap.has(atm)) { 
            missingEJ.push(atm); 
        } else { 
            let ejDate = ejMap.get(atm); 
            let diffDays = Math.round((glDate - ejDate) / (1000*60*60*24)); 
            if (diffDays > 1) laggingEJ.push(`${atm} (Tertinggal ${diffDays} Hari)`); 
        }
    }

    // Evaluasi Ketertinggalan Data GL
    for (let [atm, ejDate] of ejMap.entries()) {
        if (!glMap.has(atm)) { 
            missingGL.push(atm); 
        } else { 
            let glDate = glMap.get(atm); 
            let diffDays = Math.round((ejDate - glDate) / (1000*60*60*24)); 
            if (diffDays > 1) laggingGL.push(`${atm} (Tertinggal ${diffDays} Hari)`); 
        }
    }

    let bannerHtml = '';
    if (missingEJ.length > 0 || missingGL.length > 0 || laggingEJ.length > 0 || laggingGL.length > 0) {
        bannerHtml = `
            <div class="alert bg-warning-subtle border-0 text-dark py-3 px-4 rounded-4 shadow-sm mb-3 bouncy-hover">
                <div class="d-flex align-items-center mb-2">
                    <i class="bi bi-exclamation-triangle-fill text-warning fs-5 me-2"></i>
                    <h6 class="fw-bold text-dark mb-0">Asisten Rekomendasi Upload</h6>
                </div>
                <p class="mb-2 small">Sistem mendeteksi ketidakseimbangan data pada database bulan ini. Agar analisa selisih maksimal, mohon lengkapi:</p>
                <ul class="mb-0 small fw-bold text-danger">`;
                
        if (missingEJ.length > 0) bannerHtml += `<li>Belum ada data <span class="badge bg-success rounded-pill px-2">EJ</span> sama sekali untuk mesin: <b>${missingEJ.join(', ')}</b></li>`;
        if (missingGL.length > 0) bannerHtml += `<li class="mt-1">Belum ada data <span class="badge bg-primary rounded-pill px-2">GL</span> sama sekali untuk mesin: <b>${missingGL.join(', ')}</b></li>`;
        if (laggingEJ.length > 0) bannerHtml += `<li class="mt-1">Data <span class="badge bg-success rounded-pill px-2">EJ</span> butuh diupdate untuk mesin: <span class="text-dark fw-medium">${laggingEJ.join(', ')}</span></li>`;
        if (laggingGL.length > 0) bannerHtml += `<li class="mt-1">Data <span class="badge bg-primary rounded-pill px-2">GL</span> butuh diupdate untuk mesin: <span class="text-dark fw-medium">${laggingGL.join(', ')}</span></li>`;
        bannerHtml += `</ul></div>`;
    }
    
    document.querySelectorAll('.data-completeness-banner').forEach(el => el.innerHTML = bannerHtml);
}


// ==========================================
// 9. ENGINE BUKU BESAR (LAPORAN REKENING GANTUNG)
// ==========================================
superApp.bukaLaporanModal = async function() {
    PlayfulAlert.fire({ title: 'Menyusun Buku Besar...', text: 'Menggabungkan seluruh riwayat selisih dari awal tahun...', allowOutsideClick: false });
    PlayfulAlert.showLoading();
    
    try {
        const result = await apiCall('getLaporan');
        if(!result || !result.success) throw new Error(result ? result.message : "Gagal memuat laporan");
        
        let rawData = result.data;
        let ledger = [];
        
        rawData.forEach(r => {
            let tglTrx = String(r[0]).substring(0,10);
            let atm = r[1].replace('KTM', ''); 
            let resi = r[2]; let nom = parseFloat(r[3]) || 0; let jenis = r[4]; let status = String(r[5]).toLowerCase();
            let ket = r[6] || ''; let tglSelesai = r[7] ? String(r[7]).substring(0,10) : tglTrx; let isResolved = status !== 'belum';

            if (jenis === 'SELISIH LEBIH') {
                let ketKredit = isResolved ? `Selesai/ON US, EJ & GL Klop, Menunggu Pengaduan Nasabah (${formatNum(nom)})` : `EJ & GL Klop, Menunggu Pengaduan Nasabah`;
                ledger.push({ dateObj: new Date(tglTrx), resi: resi, atm: atm, debet: 0, kredit: nom, ket: ketKredit, isRes: false, statusAkhir: status });
                if (isResolved) ledger.push({ dateObj: new Date(tglSelesai), resi: resi, atm: atm, debet: nom, kredit: 0, ket: `PENY. ON US (${formatDateIndo(new Date(tglTrx))})`, isRes: true, statusAkhir: status });
            } else if (jenis === 'SELISIH KURANG') {
                let ketDebet = isResolved ? `KANTOR PUSAT SALAH DEBET (EJ GAGAL & GL TDK TERCATAT) (${formatNum(nom)})` : `KANTOR PUSAT SALAH DEBET (EJ GAGAL & GL TDK TERCATAT)`;
                ledger.push({ dateObj: new Date(tglTrx), resi: resi, atm: atm, debet: nom, kredit: 0, ket: ketDebet, isRes: false, statusAkhir: status });
                if (isResolved) ledger.push({ dateObj: new Date(tglSelesai), resi: resi, atm: atm, debet: 0, kredit: nom, ket: `KOREKSI PUSAT - ${ket}`, isRes: true, statusAkhir: status });
            }
        });

        ledger.sort((a,b) => a.dateObj - b.dateObj);
        
        let tbodyHtml = ''; let saldo = 0; let totalUnresolved = 0;
        ledger.forEach((item, index) => {
            saldo += (item.kredit - item.debet); 
            let unresHtml = '';
            if (!item.isRes && item.statusAkhir === 'belum') { let amt = item.kredit > 0 ? item.kredit : item.debet; unresHtml = formatNum(amt); totalUnresolved += amt; }
            tbodyHtml += `<tr><td class="text-center">${index + 1}</td><td>${formatDateIndo(item.dateObj)}</td><td class="text-center">${item.resi}</td><td class="text-center">${item.atm}</td><td class="text-end text-success">${item.kredit > 0 ? formatNum(item.kredit) : ''}</td><td class="text-end text-danger">${item.debet > 0 ? formatNum(item.debet) : ''}</td><td class="text-end fw-bold">${formatNum(saldo)}</td><td>${item.ket}</td><td class="text-end text-danger">${unresHtml}</td><td></td></tr>`;
        });
        
        tbodyHtml += `<tr class="fw-bold bg-light"><td colspan="6" class="text-end pe-3">TOTAL KESELURUHAN</td><td class="text-end">${formatNum(saldo)}</td><td></td><td class="text-end text-danger">${formatNum(totalUnresolved)}</td><td></td></tr>`;
        document.getElementById('lap_tbody').innerHTML = tbodyHtml;
        
        let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; let kota = namaCabang.replace('Kantor Cabang Pembantu', '').replace('Cabang', '').trim();
        let dateSelect = document.getElementById('globalPeriod').value; let year = dateSelect.split('-')[0]; let monthIdx = parseInt(dateSelect.split('-')[1]) - 1;
        const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        
        document.getElementById('lap_periode').innerText = `${bulanArr[monthIdx]} ${year}`;
        document.getElementById('lap_judul_atas').innerText = `LAPORAN SELISIH ATM ${namaCabang.toUpperCase()}`;
        document.getElementById('lap_kota').innerText = kota;
        document.getElementById('lap_tgl_cetak').innerText = `${bulanArr[new Date().getMonth()]} ${new Date().getFullYear()}`;
        document.getElementById('lap_cabang_bawah').innerText = namaCabang;
        document.getElementById('lap_pimpinan').innerText = globalConfig.cfgPimpinan || 'ENDY PRATAMA';

        PlayfulAlert.close();
        new bootstrap.Modal(document.getElementById('laporanModal')).show();
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
};

// ==========================================
// 10. ENGINE KALENDER REKONSILIASI CERDAS
// ==========================================
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarMonthLabel');
    if (!grid) return;

    const period = getActivePeriod(); // cth: "082026"
    const year = parseInt(period.substring(2,6));
    const month = parseInt(period.substring(0,2)) - 1; 

    const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    if (label) label.innerText = `${bulanArr[month]} ${year}`;

    // Cari tahu jumlah hari dan hari pertama di bulan ini
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Minggu

    // Siapkan wadah memori per tanggal
    let dayData = {};
    for(let i=1; i<=daysInMonth; i++) dayData[i] = { gl: 0, ej: 0, selisihBelum: 0, selisihSelesai: 0 };

    // 1. Ekstrak Tanggal dari GL
    (databaseData.gl || []).forEach(r => {
        let d = new Date(String(r[1]).substring(0,10));
        if(d.getMonth() === month && d.getFullYear() === year) dayData[d.getDate()].gl++;
    });
    // 2. Ekstrak Tanggal dari EJ
    (databaseData.ej || []).forEach(r => {
        let d = new Date(String(r[1]).substring(0,10));
        if(d.getMonth() === month && d.getFullYear() === year) dayData[d.getDate()].ej++;
    });
    // 3. Ekstrak Tanggal dari Data Selisih
    (globalSelisihData || []).forEach(r => {
        let d = new Date(String(r[0]).substring(0,10));
        if(d.getMonth() === month && d.getFullYear() === year) {
            if (String(r[5]).toLowerCase() === 'belum') dayData[d.getDate()].selisihBelum++;
            else dayData[d.getDate()].selisihSelesai++;
        }
    });

    const hariHeader = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    let html = '';
    
    // Render Judul Hari
    hariHeader.forEach(h => html += `<div class="calendar-day-header">${h}</div>`);
    
    // Render Kotak Kosong Sebelum Tanggal 1
    for(let i=0; i<firstDay; i++) {
        html += `<div class="calendar-cell border-0 bg-transparent"></div>`;
    }
    
    // Render Isi Tanggal
    for(let i=1; i<=daysInMonth; i++) {
        let d = dayData[i];
        let hasData = d.gl > 0 || d.ej > 0 || d.selisihBelum > 0 || d.selisihSelesai > 0;
        let contentHtml = '';
        
        if (hasData) {
            let glBadge = d.gl > 0 ? `<div class="cal-indicator cal-gl"><span>GL</span><span><i class="bi bi-check-lg"></i></span></div>` : '';
            let ejBadge = d.ej > 0 ? `<div class="cal-indicator cal-ej"><span>EJ</span><span><i class="bi bi-check-lg"></i></span></div>` : '';
            let selisihBadge = '';
            
            if (d.selisihBelum > 0) {
                // Efek Merah Berkedip Jika Ada Selisih Menggantung!
                selisihBadge = `<div class="cal-indicator cal-selisih-bad"><span>Gantung</span><span>${d.selisihBelum}</span></div>`;
            } else if (d.selisihSelesai > 0) {
                selisihBadge = `<div class="cal-indicator cal-selisih-good"><span>Selesai</span><span><i class="bi bi-shield-check"></i></span></div>`;
            }

            contentHtml = `${glBadge}${ejBadge}${selisihBadge}`;
        }

        let cls = hasData ? 'calendar-cell active' : 'calendar-cell';
        // Fungsi klik cerdas -> Lempar user ke Data Master dan filter otomatis sesuai tanggal kotak yang diklik
        let tglFormatKlik = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let clickAttr = hasData ? `onclick="changePage('master', 1); document.getElementById('filterStart').value = '${tglFormatKlik}'; renderDataMaster(); showPage('datamaster');"` : '';

        html += `
            <div class="${cls}" ${clickAttr} title="${hasData ? 'Klik untuk melihat semua transaksi pada tanggal ini' : ''}">
                <div class="cal-date">${i}</div>
                ${contentHtml}
            </div>
        `;
    }
    
    grid.innerHTML = html;
}

// ==========================================
// 11. ENGINE ARSIP & REKAM JEJAK UNIVERSAL
// ==========================================
let universalDataCache = { selisih: [], opname: [] };

superApp.fetchUniversalData = async function() {
    document.getElementById('arsipTbody').innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted"><div class="spinner-border text-primary mb-2"></div><br>Menarik riwayat seluruh dimensi waktu...</td></tr>`;
    try {
        const result = await apiCall('getUniversal');
        if(result && result.success) {
            universalDataCache = result.data;
            // Urutkan dari yang terbaru
            universalDataCache.selisih.sort((a,b) => new Date(b[0]) - new Date(a[0]));
            superApp.renderArsip();
        }
    } catch (e) { PlayfulAlert.fire('Error', 'Gagal memuat arsip universal.', 'error'); }
};

superApp.renderArsip = function() {
    let raw = universalDataCache.selisih;
    const term = document.getElementById('arsipCari').value.toLowerCase();
    const stat = document.getElementById('arsipStatus').value;
    const tgl = document.getElementById('arsipTgl').value; // Ambil nilai filter tanggal baru

    // 1. Hitung Live Metrics untuk Widget Raksasa
    let totSemua = 0, totSelesai = 0, totBelum = 0;
    raw.forEach(r => {
        totSemua++;
        if (String(r[5]).toLowerCase() !== 'belum') totSelesai++;
        else totBelum++;
    });
    
    // Tembakkan angka ke HTML
    if(document.getElementById('arsipTotSemua')) {
        document.getElementById('arsipTotSemua').innerText = formatNum(totSemua);
        document.getElementById('arsipTotSelesai').innerText = formatNum(totSelesai);
        document.getElementById('arsipTotBelum').innerText = formatNum(totBelum);
    }

    // 2. Eksekusi Filter Pencarian
    let filtered = raw.filter(r => {
        let match = true;
        if(term) match = match && (String(r[1]).toLowerCase().includes(term) || String(r[2]).toLowerCase().includes(term));
        if(tgl) match = match && (String(r[0]).substring(0,10) === tgl);
        if(stat) {
            let isSelesai = String(r[5]).toLowerCase() !== 'belum';
            if(stat === 'selesai' && !isSelesai) match = false;
            if(stat === 'belum' && isSelesai) match = false;
        }
        return match;
    });

    const pageData = filtered.slice((pageState.arsipPage - 1) * PAGE_SIZE, pageState.arsipPage * PAGE_SIZE);
    const tbody = document.getElementById('arsipTbody');
    
    if(pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-1"></i> Arsip kosong / Tidak ditemukan.</td></tr>`;
        document.getElementById('arsipPagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = pageData.map(r => {
        const isSelesai = String(r[5]).toLowerCase() !== 'belum';
        const badgeColor = r[4].includes('LEBIH') ? 'bg-success' : 'bg-danger';
        const statusBadge = isSelesai ? `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-1"><i class="bi bi-check-all"></i> Selesai Ditutup</span>` : `<span class="badge bg-warning-subtle text-danger border border-warning-subtle rounded-pill px-3 py-1" style="animation: pulse-red 2s infinite;"><i class="bi bi-hourglass-split"></i> Menggantung</span>`;
        const rawStr = encodeURIComponent(JSON.stringify(r));
        return `
            <tr>
                <td class="fw-medium text-secondary ps-3" style="font-size:0.8rem">${String(r[0]).substring(0,10)}</td>
                <td><span class="badge bg-secondary rounded-pill shadow-sm">${r[1]}</span></td>
                <td class="fw-bold text-dark">${r[2]}</td>
                <td><span class="badge ${badgeColor} rounded-pill shadow-sm px-3 py-1" style="font-size: 0.75rem;">${formatRp(r[3])}</span></td>
                <td>${statusBadge}</td>
                <td class="text-center pe-3"><button class="btn btn-sm btn-dark rounded-pill fw-bold shadow-sm bouncy-hover" onclick="superApp.bukaJejak('${rawStr}')"><i class="bi bi-diagram-3-fill text-warning me-1"></i> Telusuri Jejak</button></td>
            </tr>
        `;
    }).join('');

    document.getElementById('arsipPagination').innerHTML = renderPagination(filtered.length, pageState.arsipPage, PAGE_SIZE, 'arsipPage');
};

superApp.bukaJejak = function(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    const tglTrx = String(row[0]).substring(0,10);
    const atm = String(row[1]).trim();
    const resi = String(row[2]);
    const nominal = parseFloat(row[3]);
    const jenis = row[4];
    const isSelesai = String(row[5]).toLowerCase() !== 'belum';
    const ket = row[6] || '-';
    const tglAnalisa = row[7] || tglTrx;

    document.getElementById('jejakSub').innerText = `${atm} | Resi: ${resi}`;

    // 1. NODE: INSIDEN SELISIH
    const icon1 = jenis.includes('LEBIH') ? 'bg-success bi-arrow-up-circle' : 'bg-danger bi-arrow-down-circle';
    let html = `
        <div class="timeline-item fade-in" style="animation-delay: 0.1s;">
            <div class="timeline-icon ${icon1} shadow"><i class="bi"></i></div>
            <div class="timeline-content">
                <div class="d-flex justify-content-between mb-2">
                    <span class="badge bg-dark rounded-pill">1. Kejadian Awal</span>
                    <small class="text-muted fw-bold">${tglTrx}</small>
                </div>
                <h6 class="fw-black mb-1">${jenis}</h6>
                <p class="mb-0 text-secondary small">Sistem mendeteksi ada anomali transaksi senilai <b class="text-primary">${formatRp(nominal)}</b> pada proses analisa tanggal ${String(tglAnalisa).substring(0,10)}.</p>
            </div>
        </div>
    `;

    // 2. MENCARI PASANGAN OPNAME (PENGISIAN ATM)
    let tglBAselesai = null;
    let matchBA = ket.match(/tanggal (\d{4}-\d{2}-\d{2})/);
    if(matchBA) tglBAselesai = matchBA[1];

    let matchedOpname = null;
    if(tglBAselesai) {
        matchedOpname = universalDataCache.opname.find(o => String(o[1]).substring(0,10) === tglBAselesai && String(o[2]).trim() === atm);
    } else {
        // Cari opname terdekat SETELAH tanggal transaksi
        let dTrx = new Date(tglTrx + "T00:00:00");
        let possible = universalDataCache.opname.filter(o => String(o[2]).trim() === atm && new Date(String(o[1]).substring(0,10) + "T00:00:00") >= dTrx);
        if(possible.length > 0) {
            possible.sort((a,b) => new Date(String(a[1]).substring(0,10)) - new Date(String(b[1]).substring(0,10)));
            matchedOpname = possible[0];
        }
    }

    if(matchedOpname) {
        let opWaktu = String(matchedOpname[1]).substring(0,16);
        let sSblm = parseFloat(matchedOpname[3]) || 0;
        let sTmbh = parseFloat(matchedOpname[4]) || 0;
        let sFisik = parseFloat(matchedOpname[6]) || 0;
        let sSelisih = parseFloat(matchedOpname[7]) || 0;

        html += `
        <div class="timeline-item fade-in" style="animation-delay: 0.2s;">
            <div class="timeline-icon bg-warning shadow"><i class="bi bi-safe-fill text-dark"></i></div>
            <div class="timeline-content border-warning-subtle">
                <div class="d-flex justify-content-between mb-2">
                    <span class="badge bg-warning text-dark rounded-pill">2. Opname & Pengisian ATM</span>
                    <small class="text-muted fw-bold">${opWaktu.replace('T', ' ')}</small>
                </div>
                <div class="row text-center mt-2 g-2">
                    <div class="col-4 border-end"><span class="d-block small text-muted" style="font-size:0.6rem">SALDO AWAL</span><span class="fw-bold" style="font-size:0.8rem">${formatRp(sSblm)}</span></div>
                    <div class="col-4 border-end"><span class="d-block small text-muted" style="font-size:0.6rem">KAS DITAMBAH</span><span class="fw-bold text-success" style="font-size:0.8rem">${formatRp(sTmbh)}</span></div>
                    <div class="col-4"><span class="d-block small text-muted" style="font-size:0.6rem">FISIK LACI</span><span class="fw-black text-dark" style="font-size:0.8rem">${formatRp(sFisik)}</span></div>
                </div>
                <div class="mt-2 p-2 bg-light rounded text-center border">
                    <span class="small fw-bold">Hasil Akhir: Terdapat ${sSelisih > 0 ? 'Kelebihan Uang Fisik' : 'Kekurangan Uang Fisik'} senilai <b class="${sSelisih>0?'text-success':'text-danger'}">${formatRp(Math.abs(sSelisih))}</b></span>
                </div>
            </div>
        </div>`;
    } else {
        html += `
        <div class="timeline-item fade-in" style="animation-delay: 0.2s;">
            <div class="timeline-icon bg-secondary shadow"><i class="bi bi-dash"></i></div>
            <div class="timeline-content bg-light opacity-75">
                <span class="badge bg-secondary rounded-pill mb-2">2. Riwayat Pengisian (Opname)</span>
                <p class="mb-0 text-muted small fst-italic">Belum ada Berita Acara Opname fisik ATM yang terikat dengan transaksi ini.</p>
            </div>
        </div>`;
    }

    // 3. NODE: STATUS PENYELESAIAN
    if (isSelesai) {
        html += `
        <div class="timeline-item fade-in" style="animation-delay: 0.3s;">
            <div class="timeline-icon bg-primary shadow"><i class="bi bi-check-all"></i></div>
            <div class="timeline-content border-primary-subtle bg-primary-subtle">
                <div class="d-flex justify-content-between mb-2">
                    <span class="badge bg-primary rounded-pill">3. Kasus Ditutup (Selesai)</span>
                    <small class="text-primary fw-bold">Berhasil Diselesaikan</small>
                </div>
                <p class="mb-2 text-dark small fw-medium"><i class="bi bi-quote text-secondary fs-5"></i> ${ket.split('|||')[0]}</p>
                <button class="btn btn-sm btn-dark rounded-pill fw-bold shadow-sm w-100" onclick="generateBA('${rawStr}')"><i class="bi bi-printer"></i> Cetak Ulang B/A Penyelesaian</button>
            </div>
        </div>`;
    } else {
        html += `
        <div class="timeline-item fade-in" style="animation-delay: 0.3s;">
            <div class="timeline-icon bg-danger shadow" style="animation: pulse-red 2s infinite;"><i class="bi bi-hourglass-split"></i></div>
            <div class="timeline-content border-danger-subtle bg-danger-subtle">
                <span class="badge bg-danger rounded-pill mb-2">3. Status Saat Ini</span>
                <h6 class="fw-bold text-danger mb-0">Transaksi Masih Menggantung!</h6>
                <p class="mb-0 text-dark small mt-1">Harap segera selesaikan anomali ini di menu "Analisa" atau sesuaikan dengan Berita Acara Opname.</p>
            </div>
        </div>`;
    }

    document.getElementById('jejakTimeline').innerHTML = html;
    new bootstrap.Modal(document.getElementById('jejakModal')).show();
};

superApp.printLaporan = function() {
    const style = document.createElement('style');
    style.innerHTML = `@page { size: A4 landscape; margin: 10mm; }`;
    document.head.appendChild(style); window.print(); setTimeout(() => style.remove(), 1000); 
};

function formatDateIndo(dateObj) {
    const hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${hariArr[dateObj.getDay()]}, ${String(dateObj.getDate()).padStart(2,'0')} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

// ==========================================
// DASBOR EXECUTIVE (LIVE METRICS)
// ==========================================
function renderDashboard() {
    if (!document.getElementById('dashTotalTrx')) return; // Pengaman jika elemen belum siap

    // 1. Update Teks Bulan
    const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    let period = getActivePeriod();
    let y = period.substring(2,6); let m = parseInt(period.substring(0,2)) - 1;
    document.getElementById('dashBulan').innerText = `Periode Aktif: ${bulanArr[m]} ${y}`;

    // 2. Hitung Data Master (Trx)
    let glCount = databaseData.gl ? databaseData.gl.length : 0;
    let ejCount = databaseData.ej ? databaseData.ej.length : 0;
    document.getElementById('dashTotalTrx').innerText = formatNum(glCount + ejCount);
    document.getElementById('dashSubTrx').innerText = `GL: ${formatNum(glCount)} | EJ: ${formatNum(ejCount)}`;

    // 3. Hitung Analisa (Selisih)
    let selisihLebih = 0, selisihKurang = 0, selisihSelesai = 0;
    let nomLebih = 0, nomKurang = 0, nomSelesai = 0;

    (globalSelisihData || []).forEach(r => {
        let stat = String(r[5]).toLowerCase();
        let nom = Math.abs(parseFloat(r[3]) || 0);
        if(stat === 'belum') {
            if(r[4] === 'SELISIH LEBIH') { selisihLebih++; nomLebih += nom; }
            else { selisihKurang++; nomKurang += nom; }
        } else {
            selisihSelesai++; nomSelesai += nom;
        }
    });

    let totalGantung = selisihLebih + selisihKurang;
    let totalKasus = totalGantung + selisihSelesai;
    let rate = totalKasus === 0 ? 100 : Math.round((selisihSelesai / totalKasus) * 100);

    document.getElementById('dashTotalGantung').innerText = formatNum(totalGantung);
    document.getElementById('dashSubGantung').innerText = `Lebih: ${selisihLebih} | Kurang: ${selisihKurang}`;
    document.getElementById('dashTotalSelesai').innerText = formatNum(selisihSelesai);
    
    document.getElementById('dashNomLebih').innerText = formatRp(nomLebih);
    document.getElementById('dashNomKurang').innerText = formatRp(nomKurang);
    document.getElementById('dashNomSelesai').innerText = formatRp(nomSelesai);
    
    document.getElementById('dashRateTxt').innerText = rate + "%";
    document.getElementById('dashRateBar').style.width = rate + "%";
    // Ganti warna bar sesuai persentase
    let bar = document.getElementById('dashRateBar');
    bar.className = rate === 100 ? "progress-bar bg-success progress-bar-striped progress-bar-animated" : 
                    rate > 50 ? "progress-bar bg-primary progress-bar-striped progress-bar-animated" : 
                    "progress-bar bg-danger progress-bar-striped progress-bar-animated";

    // 4. Hitung Opname (Semua Waktu)
    let opnameCount = globalOpnameData ? globalOpnameData.length : 0;
    let totSelisihOpname = 0;
    (globalOpnameData || []).forEach(r => { totSelisihOpname += Math.abs(parseFloat(r[7]) || 0); });
    document.getElementById('dashTotalOpname').innerText = formatNum(opnameCount);
    document.getElementById('dashSubOpname').innerText = `Penyelesaian Fisik: ${formatRp(totSelisihOpname)}`;

    // 5. Kesimpulan Teks AI
    let aiText = "Semua mesin terpantau aman dan berimbang. Kinerja rekonsiliasi yang sangat baik!";
    if (glCount === 0 && ejCount === 0) aiText = "Database kosong. Silakan upload data GL dan EJ terbaru untuk memulai hari ini.";
    else if (totalGantung > 0) aiText = `Terdapat <b class="text-warning">${totalGantung} anomali</b> (selisih) senilai <b class="text-danger">${formatRp(nomLebih + nomKurang)}</b> yang belum diselesaikan. Segera cek menu Analisa!`;
    else if (rate === 100 && totalKasus > 0) aiText = `Luar Biasa! <b class="text-success">100% kasus anomali</b> telah berhasil Anda selesaikan dan tutup. Laporan siap dicetak.`;
    
    document.getElementById('dashAiText').innerHTML = aiText;
    updateNavigationBadges();
}

// ==========================================
// NOTIFIKASI MENU NAVIGASI (LIVE BADGES)
// ==========================================
function updateNavigationBadges() {
    // 1. Lencana Menu Analisa (Kasus Selisih Gantung)
    let totalGantung = 0;
    (globalSelisihData || []).forEach(r => {
        if (String(r[5]).toLowerCase() === 'belum') totalGantung++;
    });

    const badgeAn = document.getElementById('navBadgeAnalisa');
    const badgeAnMob = document.getElementById('navBadgeAnalisaMobile');
    if (totalGantung > 0) {
        if(badgeAn) { badgeAn.innerText = totalGantung; badgeAn.classList.remove('d-none'); badgeAn.classList.add('pulse-animation'); }
        if(badgeAnMob) { badgeAnMob.innerText = totalGantung; badgeAnMob.classList.remove('d-none'); }
    } else {
        if(badgeAn) { badgeAn.classList.add('d-none'); badgeAn.classList.remove('pulse-animation'); }
        if(badgeAnMob) badgeAnMob.classList.add('d-none');
    }

    // 2. Lencana Menu Data Master (Total Baris Data)
    let totalTrx = (databaseData.gl ? databaseData.gl.length : 0) + (databaseData.ej ? databaseData.ej.length : 0);
    const badgeDm = document.getElementById('navBadgeMaster');
    if(badgeDm) {
        if(totalTrx > 0) {
            // Format angka ribuan (cth: 1500 jadi 1.5k)
            badgeDm.innerText = totalTrx >= 1000 ? (totalTrx / 1000).toFixed(1) + 'k' : totalTrx;
            badgeDm.classList.remove('d-none');
        } else {
            badgeDm.classList.add('d-none');
        }
    }

    // 3. Lencana Menu Upload (Peringatan Jika EJ/GL Belum Seimbang)
    // Mengecek apakah fungsi Asisten Rekomendasi memunculkan banner peringatan
    setTimeout(() => {
        const badgeUp = document.getElementById('navBadgeUpload');
        const badgeUpMob = document.getElementById('navBadgeUploadMobile');
        let isWarning = document.querySelectorAll('.data-completeness-banner .alert').length > 0;
        
        if (isWarning) {
            if(badgeUp) badgeUp.classList.remove('d-none');
            if(badgeUpMob) badgeUpMob.classList.remove('d-none');
        } else {
            if(badgeUp) badgeUp.classList.add('d-none');
            if(badgeUpMob) badgeUpMob.classList.add('d-none');
        }
    }, 500); // Tunggu sebentar agar banner completeness selesai di-render
}

// ==========================================
// 12. SMART ONBOARDING WIZARD
// ==========================================
let currentOnboardingStep = 1;
const totalOnboardingSteps = 5;

superApp.openOnboarding = function() {
    new bootstrap.Modal(document.getElementById('onboardingModal')).show();
};

superApp.nextOnboardingStep = function() {
    if (currentOnboardingStep < totalOnboardingSteps) {
        // Hilangkan yang lama
        document.getElementById(`step${currentOnboardingStep}`).classList.remove('active');
        document.querySelectorAll('.step-indicator')[currentOnboardingStep-1].classList.remove('active');
        
        currentOnboardingStep++;
        
        // Munculkan yang baru
        document.getElementById(`step${currentOnboardingStep}`).classList.add('active');
        document.querySelectorAll('.step-indicator')[currentOnboardingStep-1].classList.add('active');
        
        // Ubah tombol di step terakhir
        if (currentOnboardingStep === totalOnboardingSteps) {
            let btn = document.getElementById('btnNextOnboarding');
            btn.innerHTML = '<i class="bi bi-stars"></i> Mulai Bekerja';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-dark');
            btn.onclick = superApp.closeOnboarding;
        }
    }
};

superApp.closeOnboarding = function() {
    const modalInstance = bootstrap.Modal.getInstance(document.getElementById('onboardingModal'));
    if (modalInstance) modalInstance.hide();
    
    // Tanamkan ke memori LocalStorage agar tidak muncul lagi besok
    localStorage.setItem('reconOnboardingDone', 'true');
    
    // Beri sapaan penutup manis
    setTimeout(() => {
        PlayfulAlert.fire({
            title: 'Siap Dimulai!',
            text: 'Selamat bekerja. Dasbor Anda sudah siap menerima data.',
            icon: 'success',
            timer: 2500,
            showConfirmButton: false
        });
    }, 500);
};

// Deteksi Otomatis Saat Aplikasi Dimuat
document.addEventListener("DOMContentLoaded", () => {
    // Jika belum ada memori 'reconOnboardingDone' di browser
    if (!localStorage.getItem('reconOnboardingDone')) {
        setTimeout(superApp.openOnboarding, 1500); // Munculkan popup setelah loading selesai (1.5 detik)
    }
});

// ==========================================
// E-DOCUMENT VERIFIER (MODE SCAN AUDITOR VANILLA JS)
// ==========================================
async function runEDocumentVerifier() {
    // Membaca URL Parameter langsung dari Browser
    const urlParams = new URLSearchParams(window.location.search);
    const verifyMode = urlParams.get('verify');
    
    // Jika tidak ada parameter verify di URL (berarti buka web normal), abaikan dan jangan lakukan apa-apa
    if (!verifyMode) return; 

    // 1. Sembunyikan Seluruh Elemen UI Aplikasi untuk Mode Auditor
    let sidebar = document.querySelector('.sidebar'); if(sidebar) sidebar.classList.replace('d-md-block', 'd-none');
    let botNav = document.querySelector('.floating-bottom-nav'); if(botNav) botNav.classList.add('d-none');
    let topHeader = document.querySelector('.bg-gradient-playful'); if(topHeader) topHeader.classList.add('d-none');
    let mainContent = document.querySelector('.main-content'); 
    if(mainContent) { mainContent.classList.remove('col-md-9', 'ms-sm-auto', 'col-lg-10', 'px-md-4'); mainContent.classList.add('col-12', 'px-2'); }
    document.body.style.paddingTop = '0';
    document.body.style.backgroundColor = '#f8f9fa';

    PlayfulAlert.fire({ title: 'Memverifikasi Dokumen', html: 'Menghubungkan ke Database Cloud Bankaltimtara...', allowOutsideClick: false }); 
    PlayfulAlert.showLoading();

    try {
        await fetchConfig();
        const result = await apiCall('getUniversal');
        
        if(result && result.success) {
            Swal.close();
            let uniData = result.data;
            
            // 3A. Logika Verifikasi BA Penyelesaian
            if (verifyMode === 'ba') {
                let resi = urlParams.get('resi'); let atm = urlParams.get('atm');
                let rowData = uniData.selisih.find(r => String(r[1]).trim() === atm && String(r[2]).trim() === resi);
                
                if (rowData) {
                    generateBA(encodeURIComponent(JSON.stringify(rowData)));
                    // Ubah tombol Modal agar sesuai dengan tampilan Verifikator
                    document.querySelector('#beritaAcaraModal .modal-footer').innerHTML = `<div class="alert alert-success w-100 text-center mb-0 fw-bold border-0 shadow-sm" style="font-size: 1.1rem;"><i class="bi bi-shield-fill-check fs-4 d-block mb-1"></i> E-Document Valid & Terverifikasi Database Sistem</div>`;
                } else {
                    PlayfulAlert.fire('Tidak Ditemukan', 'QR Code tidak valid atau dokumen telah dihapus dari database.', 'error');
                }
            } 
            // 3B. Logika Verifikasi BA Opname
            else if (verifyMode === 'opname') {
                let atm = urlParams.get('atm'); let tgl = urlParams.get('tgl');
                let rowData = uniData.opname.find(r => String(r[2]).trim() === atm && String(r[1]).substring(0,10) === tgl);
                
                if (rowData) {
                    printRiwayatBAOpname(encodeURIComponent(JSON.stringify(rowData)));
                    document.querySelector('#baOpnameModal .modal-footer').innerHTML = `<div class="alert alert-success w-100 text-center mb-0 fw-bold border-0 shadow-sm" style="font-size: 1.1rem;"><i class="bi bi-shield-fill-check fs-4 d-block mb-1"></i> E-Document Valid & Terverifikasi Database Sistem</div>`;
                } else {
                    PlayfulAlert.fire('Tidak Ditemukan', 'QR Code B/A Opname tidak valid.', 'error');
                }
            }
        }
    } catch (e) { PlayfulAlert.fire('Error', 'Gagal memverifikasi dokumen dari server.', 'error'); }
}

// Memicu pengecekan otomatis saat aplikasi selesai dimuat
document.addEventListener("DOMContentLoaded", () => {
    runEDocumentVerifier();
});

// ==========================================
// AUTO-DETECT MESIN ATM (SMART SUGGESTION)
// ==========================================
function populateAtmSuggestions() {
    let atmSet = new Set();
    
    // 1. Ekstrak dari Pengaturan Penanggung Jawab Teller
    if (typeof globalConfig !== 'undefined') {
        Object.keys(globalConfig).forEach(key => {
            if (key.startsWith('cfgTeller_')) atmSet.add(key.replace('cfgTeller_', '').toUpperCase());
        });
    }
    
    // 2. Ekstrak dari Riwayat Opname Sebelumnya
    if (typeof globalOpnameData !== 'undefined') {
        globalOpnameData.forEach(r => {
            if (r[2]) atmSet.add(String(r[2]).trim().toUpperCase());
        });
    }
    
    // Masukkan semua ID unik yang ditemukan ke dalam Datalist
    const dlAtm = document.getElementById('dl-atm');
    if (dlAtm) {
        dlAtm.innerHTML = '';
        atmSet.forEach(atm => {
            if(atm && atm.length > 2) dlAtm.innerHTML += `<option value="${atm}">`;
        });
    }
}

// Pasang pendeteksi otomatis saat petugas mengeklik/fokus ke kolom ID Mesin ATM
document.addEventListener("DOMContentLoaded", () => {
    let opAtmInput = document.getElementById('opAtmId');
    if(opAtmInput) {
        opAtmInput.addEventListener('focus', populateAtmSuggestions);
        opAtmInput.addEventListener('click', populateAtmSuggestions);
    }
});

// ==========================================
// FUNGSI NAVIGASI GESER BULAN (KALENDER)
// ==========================================
function geserBulan(arah) {
    const inputPeriod = document.getElementById('globalPeriod');
    if (!inputPeriod || !inputPeriod.value) return;

    // Ambil tahun dan bulan saat ini dari input (Format input type="month" adalah YYYY-MM)
    let [year, month] = inputPeriod.value.split('-');
    year = parseInt(year, 10);
    month = parseInt(month, 10);

    // Tambah / Kurangi bulan berdasarkan arah tombol (-1 atau +1)
    month += arah;

    // Logika jika menyeberang tahun (Desember ke Januari atau sebaliknya)
    if (month > 12) {
        month = 1;
        year += 1;
    } else if (month < 1) {
        month = 12;
        year -= 1;
    }

    // Format kembali ke YYYY-MM (Pastikan angka bulan selalu 2 digit, misal: 08)
    let newMonth = month < 10 ? '0' + month : month;
    inputPeriod.value = `${year}-${newMonth}`;

    // Membangkitkan "Trigger" seolah-olah pengguna mengklik langsung input bulan
    // Ini akan otomatis memanggil fungsi superApp.changePeriod() milik Anda
    inputPeriod.dispatchEvent(new Event('change'));
}

// ==========================================
// INTERACTIVE GUIDED TOUR: OPNAME ATM
// ==========================================
function startOpnameTour() {
    // Pastikan pengguna berada di tab Form Input saat tour dimulai
    let tabForm = document.getElementById('tab-op-form');
    if (tabForm) tabForm.click();

    Swal.fire({
        title: '🏦 Selamat Datang di Modul Opname ATM',
        html: 'Tur profesional ini akan memandu Anda memahami cara menghitung uang fisik laci dan mencetak Berita Acara resmi dengan 4 penanda tangan.',
        icon: 'info',
        confirmButtonText: 'Mulai Tur (<span id="tour-step">1</span>/4)',
        confirmButtonColor: '#4f46e5',
        allowOutsideClick: false,
        showCancelButton: true,
        cancelButtonText: 'Lewati',
        customClass: { popup: 'rounded-4 shadow-lg' }
    }).then((result) => {
        if (result.isConfirmed) {
            tourStep2();
        }
    });
}

function tourStep2() {
    // Fokuskan panduan ke kotak Identitas Mesin
    let el = document.getElementById('opAtmId');
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.classList.add('border', 'border-danger', 'shadow');
        setTimeout(() => el.classList.remove('border', 'border-danger', 'shadow'), 3000);
    }

    Swal.fire({
        title: '1️⃣ Identitas Mesin & Waktu',
        html: 'Ketik atau pilih <b>ID Mesin ATM</b> (sistem akan mendeteksi otomatis sugesti mesin). Tentukan juga waktu pelaksanaan opname dan ubah nama <b>Security</b> yang bertugas pada shift tersebut jika diperlukan.',
        icon: 'question',
        confirmButtonText: 'Selanjutnya (2/4)',
        confirmButtonColor: '#4f46e5',
        allowOutsideClick: false,
        showCancelButton: true,
        cancelButtonText: 'Kembali',
    }).then((result) => {
        if (result.isConfirmed) {
            tourStep3();
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            startOpnameTour();
        }
    });
}

function tourStep3() {
    // Fokuskan panduan ke Kalkulator
    let el = document.getElementById('opFisik');
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.classList.add('border', 'border-warning', 'shadow');
        setTimeout(() => el.classList.remove('border', 'border-warning', 'shadow'), 3000);
    }

    Swal.fire({
        title: '2️⃣ Kalkulator Rekonsiliasi Kas',
        html: 'Masukkan saldo sebelum pengisian dan uang yang ditambahkan dari sistem core. Masukkan hasil hitung uang <b>Fisik Laci</b>. Sistem akan otomatis menghitung apakah kas <i>Balance</i>, Lebih, atau Kurang.',
        icon: 'warning',
        confirmButtonText: 'Selanjutnya (3/4)',
        confirmButtonColor: '#4f46e5',
        allowOutsideClick: false,
        showCancelButton: true,
        cancelButtonText: 'Sebelumnya',
    }).then((result) => {
        if (result.isConfirmed) {
            tourStep4();
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            tourStep2();
        }
    });
}

function tourStep4() {
    Swal.fire({
        title: '3️⃣ Pratinjau & Simpan Berita Acara',
        html: 'Tekan tombol <b>Pratinjau</b> untuk melihat lembar kerja A4 resmi yang dilengkapi struktur 4 penanda tangan (Teller, Admin, Security, Pemimpin) beserta Barcode e-Document. Jika sudah klop, tekan <b>Simpan ke Database</b>.',
        icon: 'success',
        confirmButtonText: 'Selesai 🚀',
        confirmButtonColor: '#198754',
        allowOutsideClick: false,
        showCancelButton: true,
        cancelButtonText: 'Sebelumnya',
    }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
            tourStep3();
        } else {
            Swal.fire({
                title: '🎉 Tur Selesai!',
                text: 'Anda sekarang siap menggunakan modul Opname ATM secara profesional.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });
}
