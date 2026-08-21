const API_URL = 'https://script.google.com/macros/s/AKfycbzawSNj45jOqdyEFKhF79w6-uW_MJansgX5c-nEoQ-aimJWCbxkH7lRNBYTVFAEp4VI/exec';

// ==========================================
// 1. STATE MANAGEMENT, THEME & PAGINATION
// ==========================================
let pendingUploadData = [], pendingUploadType = '';
let databaseData = { gl: [], ej: [], selisih: [] }; 
let globalSelisihData = [], globalOpnameData = [], activeResolveRow = null;
let globalConfig = {}; 
let globalHistMap = new Map(), currentDetailData = [], detailType = ''; 

let pageState = { analisaKurang: 1, analisaLebih: 1, analisaSelesai: 1, master: 1, opname: 1, uploadHist: 1, histDetail: 1 };
const PAGE_SIZE = 10;

// MENGAMBIL FORMAT BULAN AKTIF (Contoh: "082026")
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
    
    // [PERBAIKAN] Eksekusi berurutan agar tidak terjadi tabrakan di server Google
    try {
        await fetchDatabaseData();
        await fetchSelisihData();
    } catch (e) {
        console.error("Gagal berpindah bulan:", e);
    } finally {
        PlayfulAlert.close();
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

const PlayfulAlert = Swal.mixin({
    customClass: { popup: 'rounded-5 shadow-lg border-0', confirmButton: 'btn btn-primary rounded-pill px-4 fw-bold shadow-sm mx-1 bouncy-hover', cancelButton: 'btn btn-light rounded-pill px-4 fw-bold shadow-sm mx-1 bouncy-hover' }, buttonsStyling: false
});

document.addEventListener("DOMContentLoaded", () => {
    getActivePeriod(); // Setel Input Tgl Bulan ke Hari Ini
    fetchConfig(); 
    fetchDatabaseData(); 
    const settingModal = document.getElementById('modal-system-settings');
    if(settingModal) settingModal.addEventListener('show.bs.modal', renderTellerConfig);
});

async function fetchConfig() {
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getConfig' }) });
        const result = await response.json();
        if(result.success) {
            globalConfig = result.data; 
            document.getElementById('cfgCabang').value = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu';
            document.getElementById('cfgAlamat').value = globalConfig.cfgAlamat || 'Jl. Propinsi KM. 48 RT. 05 RW. 02';
            document.getElementById('cfgPimpinan').value = globalConfig.cfgPimpinan || 'ENDY PRATAMA';
            document.getElementById('cfgAdmin').value = globalConfig.cfgAdmin || 'SUCI AINUL FITRI';
        }
    } catch (e) { console.error("Gagal memuat konfigurasi cloud", e); }
}

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

superApp.saveBAConfig = async function() {
    let payload = {
        cfgCabang: document.getElementById('cfgCabang').value, cfgAlamat: document.getElementById('cfgAlamat').value,
        cfgPimpinan: document.getElementById('cfgPimpinan').value, cfgAdmin: document.getElementById('cfgAdmin').value
    };
    document.querySelectorAll('.cfg-teller-input').forEach(input => { payload['cfgTeller_' + input.getAttribute('data-atm')] = input.value.toUpperCase(); });
    PlayfulAlert.fire({ title: 'Menyimpan ke Cloud...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveConfig', data: payload }) });
        const result = await response.json();
        if(result.success) {
            globalConfig = payload; 
            PlayfulAlert.fire('Berhasil!', 'Konfigurasi Surat & Teller berhasil disimpan ke Database Cloud.', 'success');
        } else PlayfulAlert.fire('Gagal', result.message, 'error');
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
};

function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.add('d-none'));
    const targetPage = document.getElementById(pageId); if (targetPage) targetPage.classList.remove('d-none');
    document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => { el.classList.remove('active-bottom'); el.classList.remove('text-primary'); el.classList.add('text-secondary'); });
    if (event && event.currentTarget) {
        if(event.currentTarget.classList.contains('nav-link')) event.currentTarget.classList.add('active'); 
        else { event.currentTarget.classList.add('active-bottom'); event.currentTarget.classList.remove('text-secondary'); event.currentTarget.classList.add('text-primary'); }
    }
    if(pageId === 'analisa') fetchSelisihData();
    if(pageId === 'datamaster') fetchDatabaseData(); 
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement; html.setAttribute('data-bs-theme', html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
});

function renderPagination(totalItems, currentPage, pageSize, callbackSection) {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (totalItems === 0) return '';
    let html = `<div class="d-flex justify-content-between align-items-center mt-2 px-3 py-2 bg-light rounded-bottom-4 border-top">
                <small class="text-muted fw-bold" style="font-size:0.7rem">Menampilkan ${(currentPage-1)*pageSize + 1} - ${Math.min(currentPage*pageSize, totalItems)} dari ${totalItems} baris</small>
                <nav><ul class="pagination pagination-sm mb-0 shadow-sm">`;
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link rounded-start-pill fw-bold" href="#" onclick="changePage('${callbackSection}', ${currentPage - 1})">Prev</a></li>`;
    let startPage = Math.max(1, currentPage - 1); let endPage = Math.min(totalPages, currentPage + 1);
    if(startPage > 1) html += `<li class="page-item disabled"><a class="page-link" href="#">...</a></li>`;
    for(let i=startPage; i<=endPage; i++){ html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link fw-bold" href="#" onclick="changePage('${callbackSection}', ${i})">${i}</a></li>`; }
    if(endPage < totalPages) html += `<li class="page-item disabled"><a class="page-link" href="#">...</a></li>`;
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link rounded-end-pill fw-bold" href="#" onclick="changePage('${callbackSection}', ${currentPage + 1})">Next</a></li>`;
    html += `</ul></nav></div>`;
    return html;
}

function populateDatalist(listId, dataSet) {
    const dl = document.getElementById(listId); if (!dl) return;
    dl.innerHTML = Array.from(dataSet).filter(Boolean).map(val => `<option value="${val}">`).join('');
}

// ==========================================
// 2. PARSER DATA & PREVIEW UPLOAD
// ==========================================
function processGL() {
    const file = document.getElementById('glFile').files[0];
    if (!file) return PlayfulAlert.fire('Error', 'Pilih file GL terlebih dahulu!', 'error');
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result; const lines = text.split('\n'); const glData = [];
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
        showPreviewModal(glData, 'GL');
    }; reader.readAsText(file);
}

function processEJ() {
    const file = document.getElementById('ejFile').files[0];
    if (!file) return PlayfulAlert.fire('Error', 'Pilih file EJ terlebih dahulu!', 'error');
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result; const lines = text.split('\n'); const ejData = [];
        let currentTx = {}; let isLookingForJumlah = false; let lastValidAtmId = 'UNKNOWN'; let lastValidDate = '';
        
        function saveCurrentTransaction() {
            if (currentTx.noResi) {
                if (!currentTx.tanggal) currentTx.tanggal = lastValidDate;
                
                // [PENYEMPURNAAN PENENTUAN STATUS]
                if (currentTx.cashTaken) {
                    currentTx.status = "SUKSES";
                } else if (!currentTx.status) {
                    if (currentTx.jenis === "TARIK TUNAI" && (!currentTx.nominal || currentTx.nominal === 0)) {
                        currentTx.status = "GAGAL - TIDAK ADA UANG KELUAR";
                    } else if (currentTx.nominal > 0) {
                        // Jika nominal > 0 tapi bukan tarik tunai, berarti Transfer atau Pembayaran
                        if (currentTx.jenis === "TRANSFER") currentTx.status = "SUKSES (TRANSFER)";
                        else if (currentTx.jenis === "PEMBAYARAN") currentTx.status = "SUKSES (PEMBELIAN/PAYMENT)";
                        else currentTx.status = "SUKSES";
                    } else {
                        currentTx.status = "NON-FINANSIAL";
                    }
                }
                
                if (!currentTx.nominal) currentTx.nominal = 0;
                
                let finalAtmId = currentTx.atm; if (!finalAtmId || /^\d+$/.test(finalAtmId)) finalAtmId = lastValidAtmId;
                ejData.push([currentTx.tanggal, finalAtmId, currentTx.noResi, currentTx.nominal, currentTx.status]);
            }
            currentTx = {}; isLookingForJumlah = false;
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            
            if (line.includes("<- TRANSACTION END") || 
                line.includes("-> TRANSACTION START") || 
                line.includes("EMV AID ") || 
                line.includes("PIN ENTERED") || 
                line.includes("TRACK 2 DATA")) { 
                if (currentTx.noResi) saveCurrentTransaction(); 
            }
            
            if (line.includes("CASH TAKEN")) currentTx.cashTaken = true;
            
            const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([A-Z0-9]+)/);
            if (dateMatch) { 
                currentTx.tanggal = `20${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; 
                lastValidDate = currentTx.tanggal; 
                let tempAtm = dateMatch[5];
                if (/[A-Z]/i.test(tempAtm)) lastValidAtmId = tempAtm;
                currentTx.atm = lastValidAtmId; 
            }
            
            const resiMatch = line.match(/(?:NO\s+RESI|NO\s+REF\.?|REFF\s+NO)\s*:?\s*(\d+)/i);
            if (resiMatch) currentTx.noResi = parseInt(resiMatch[1], 10).toString();
            const smartEmvMatch = line.match(/SMART EMV\s+(\d+)/);
            if (smartEmvMatch) currentTx.noResi = parseInt(smartEmvMatch[1], 10).toString();
            
            // [PERBAIKAN] DETEKSI KATEGORI PEMBELIAN VOUCHER & PEMBAYARAN TAGIHAN
            let textUpper = line.toUpperCase();
            if (textUpper.includes("PENARIKAN TUNAI") || textUpper.includes("TARIK TUNAI") || textUpper.includes("WITHDRAWAL")) {
                currentTx.jenis = "TARIK TUNAI";
            }
            else if (textUpper.includes("TRANSFER") || textUpper.includes("PEMINDAH BUKUAN") || textUpper.includes("KE BANK") || textUpper.includes("REK TUJUAN")) {
                currentTx.jenis = "TRANSFER";
            }
            else if (textUpper.includes("PEMBELIAN") || textUpper.includes("PEMBAYARAN") || textUpper.includes("VOUCHER") || textUpper.includes("PAYMENT") || textUpper.includes("TOKEN")) {
                currentTx.jenis = "PEMBAYARAN";
            }
            else if (textUpper.includes("INFORMASI SALDO") || textUpper.includes("UBAH/GANTI PIN") || textUpper.includes("PIN CHANGE") || textUpper.includes("PIN SUCCESSFULLY") || textUpper.includes("FORCE CHANGE PIN")) {
                currentTx.jenis = "NON-FINANSIAL";
                currentTx.status = "NON-FINANSIAL"; 
            }
            
            // Perluasan deteksi kata JUMLAH, AMOUNT, atau TOTAL
            if ((textUpper.includes("JUMLAH") || textUpper.includes("AMOUNT") || textUpper.includes("TOTAL")) && !textUpper.includes("ENTERED") && !textUpper.includes("SALDO")) {
                isLookingForJumlah = true; 
                const inlineJumlah = line.match(/(?:RP\.?|:|\.)\s*([\d,]+(?:\.\d+)?)/i);
                if (inlineJumlah) { currentTx.nominal = parseFloat(inlineJumlah[1].replace(/,/g, '')); isLookingForJumlah = false; }
            } else if (isLookingForJumlah) {
                if (!line.match(/^\d{2}:\d{2}:\d{2}/)) { 
                    const nextLineJumlah = line.match(/^([\d,]+(?:\.\d+)?)/); 
                    if (nextLineJumlah) currentTx.nominal = parseFloat(nextLineJumlah[1].replace(/,/g, '')); 
                }
                isLookingForJumlah = false; 
            }
            
            if (textUpper.includes("TRANSAKSI SUKSES") || (textUpper.includes("SUCCESSFUL") && !textUpper.includes("PIN"))) {
                currentTx.status = (currentTx.jenis === "TRANSFER") ? "SUKSES (TRANSFER)" : 
                                   (currentTx.jenis === "PEMBAYARAN") ? "SUKSES (PEMBELIAN/PAYMENT)" : "SUKSES";
            }
            
            const errorKeywords = [
                "SALDO KURANG", "SALAH MASUKKAN PIN", "KARTU ANDA SUDAH KADALUARSA", "HIGH BILL MIX ERROR", 
                "LOW BILL MIX ERROR", "DISPENSER ERROR", "COMMUNICATION ERROR", "CDM ERROR", 
                "KD.ARE/NO.TELP TDK TERDAFTA", "RESTRICTED PHONE NUMBER", "MELEBIHI LIMIT", 
                "INACTIVE ACCOUNT", "UNABLE TO PROCESS", "INVALID ZERO AMOUNT", "INVALID INSTITUTION", 
                "RESPONSE CODE GAGAL", "CHIP CARD SECURITY FAILURE", "PROCESSOR TEMP DOWN", 
                "KARTU ANDA TERDAFTAR SBG", "TRANSAKSI SEDANG DIPROSES", "SUSPECT"
            ];
            errorKeywords.forEach(err => { if (textUpper.includes(err) && !currentTx.cashTaken) currentTx.status = "GAGAL - " + err; });
            if (line.match(/TRANSACTION \d+ FAILED/i) && !currentTx.cashTaken) currentTx.status = "GAGAL - TRANSACTION FAILED";
        }
        if (currentTx.noResi) saveCurrentTransaction();
        if (ejData.length === 0) return PlayfulAlert.fire('Data Kosong', 'Tidak ditemukan transaksi pada file EJ ini.', 'warning');
        showPreviewModal(ejData, 'EJ');
    }; reader.readAsText(file);
}
function showPreviewModal(data, type) {
    pendingUploadData = data; pendingUploadType = type === 'GL' ? 'uploadGL' : 'uploadEJ';
    document.getElementById('previewType').innerText = type; document.getElementById('previewCount').innerText = data.length.toLocaleString('id-ID');
    const thead = document.getElementById('previewTableHeader'); const tbody = document.getElementById('previewTableBody');
    thead.innerHTML = type === 'GL' 
        ? `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Jenis</th><th>Referensi</th></tr>`
        : `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Status Transaksi</th></tr>`;
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

// ==========================================
// 3. API PENGIRIMAN & RIWAYAT UPLOAD (GROUP BY DATE)
// ==========================================
async function sendToBackend(action, data) {
    let currentPeriod = getActivePeriod();
    PlayfulAlert.fire({ title: 'Menyinkronkan Data...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: action, periode: currentPeriod, data: data }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await response.json();
        if(result.success) {
            PlayfulAlert.fire('Berhasil!', `Data didistribusikan otomatis ke Sheet bulan transaksi. Dimasukkan: <b>${result.data.added}</b> baris baru.`, 'success');
            fetchDatabaseData(); 
        } else PlayfulAlert.fire('Error Backend', result.message, 'error');
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

function renderUploadHistory() {
    if(!databaseData.gl && !databaseData.ej) return;
    globalHistMap.clear();
    
    (databaseData.gl || []).forEach(r => {
        let tgl = String(r[1]).substring(0,10); if(!tgl || tgl === 'undefined') return;
        let key = `GL_${tgl}`; if(!globalHistMap.has(key)) globalHistMap.set(key, {date: tgl, type: 'GL', data: []});
        globalHistMap.get(key).data.push(r);
    });
    (databaseData.ej || []).forEach(r => {
        let tgl = String(r[1]).substring(0,10); if(!tgl || tgl === 'undefined') return;
        let key = `EJ_${tgl}`; if(!globalHistMap.has(key)) globalHistMap.set(key, {date: tgl, type: 'EJ', data: []});
        globalHistMap.get(key).data.push(r);
    });

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
    renderHistoryDetailTable();
    new bootstrap.Modal(document.getElementById('historyDetailModal')).show();
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
async function triggerAnalysis() {
    let currentPeriod = getActivePeriod();
    PlayfulAlert.fire({ title: 'Menganalisa Pintar...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'analyze', periode: currentPeriod }) });
        const result = await response.json();
        if(result.success) {
            const alertMsg = result.data.infoMsg ? result.data.infoMsg : "Perhitungan bulan ini berhasil dimuat.";
            const iconType = alertMsg.includes('ditangguhkan') ? 'info' : 'success';
            PlayfulAlert.fire('Analisa Selesai', alertMsg, iconType);
            globalSelisihData = result.data.tableData;
            renderSelisihTablesFiltered(); 
        } else PlayfulAlert.fire('Gagal', result.message, 'error');
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function fetchSelisihData() {
    let currentPeriod = getActivePeriod();
    try {
        // [PERBAIKAN] Tarik data satu per satu (Sekuensial) agar Google tidak memblokir koneksi
        const resSelisih = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getSelisih', periode: currentPeriod })});
        const resultSelisih = await resSelisih.json();
        
        const resOpname = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getOpname', periode: currentPeriod })});
        const resultOpname = await resOpname.json();
        
        if(resultSelisih.success) globalSelisihData = resultSelisih.data;
        if(resultOpname.success) globalOpnameData = resultOpname.data;
        
        let dAtms = new Set(), dResis = new Set(), dNoms = new Set();
        (globalSelisihData||[]).forEach(r => { dAtms.add(String(r[1]).trim()); dResis.add(String(r[2]).trim()); dNoms.add(parseFloat(r[3])); });
        populateDatalist('dl-atm', dAtms); populateDatalist('dl-resi', dResis); populateDatalist('dl-nominal', dNoms);
        renderSelisihTablesFiltered();
    } catch (err) { console.error("Error Fetch Selisih:", err); }
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
function openResolveModal(rawStr, encodedSaran = '') {
    activeResolveRow = JSON.parse(decodeURIComponent(rawStr)); let saranText = encodedSaran ? decodeURIComponent(encodedSaran) : ''; let nominal = formatRp(activeResolveRow[3]); let tglTrx = String(activeResolveRow[0]).substring(0,10);
    document.getElementById('resolveInfoBox').innerHTML = `<h6 class="fw-bold mb-1"><i class="bi bi-info-circle"></i> Info Transaksi</h6><p class="mb-1 small">ATM: <b>${activeResolveRow[1]}</b> | Tgl: <b>${tglTrx}</b> | Resi: <b>${activeResolveRow[2]}</b></p><p class="mb-1 small text-danger fw-bold">Nominal Selisih: ${nominal}</p>${saranText ? `<hr class="my-2"><p class="mb-0 small text-success fw-bold"><i class="bi bi-robot"></i> Rekomendasi AI: ${saranText}</p>` : ''}`;
    let existingReason = activeResolveRow[6] || '';
    if (existingReason.toLowerCase() === 'belum' || existingReason === '') {
        if(saranText) document.getElementById('resolveReason').value = `Transaksi ATM tidak tercatat pada EJ dengan keterangan GAGAL sehingga terjadi selisih lebih ${nominal} pada mesin ${activeResolveRow[1]}. ${saranText}`;
        else document.getElementById('resolveReason').value = `Transaksi ATM tidak tercatat pada EJ dengan keterangan COMMUNICATION ERROR sehingga terjadi selisih pada mesin ${activeResolveRow[1]}`;
    } else { document.getElementById('resolveReason').value = existingReason; }
    document.getElementById('resRekening').value = ''; document.getElementById('resNama').value = '';
    new bootstrap.Modal(document.getElementById('resolveModal')).show();
}

async function submitResolve() {
    const reason = document.getElementById('resolveReason').value.trim(); const rekening = document.getElementById('resRekening').value.trim() || "-"; const nama = document.getElementById('resNama').value.trim().toUpperCase() || "-"; const trx = document.getElementById('resTrx').value; const problem = document.getElementById('resProblem').value;
    if(!reason) return PlayfulAlert.fire('Tunggu dulu!', 'Harap isi keterangan penyelesaian.', 'warning');
    let finalKeterangan = `${reason} ||| ${JSON.stringify({rek: rekening, nama: nama, trx: trx, problem: problem})}`;
    bootstrap.Modal.getInstance(document.getElementById('resolveModal')).hide();
    
    const tglSafe = String(activeResolveRow[0]).substring(0,10); const atmSafe = String(activeResolveRow[1]).trim(); const resiSafe = String(activeResolveRow[2]).trim();
    const payload = { tanggal: tglSafe, atm: atmSafe, resi: resiSafe, status: 'Selesai', keterangan: finalKeterangan };
    
    PlayfulAlert.fire({ title: 'Menyimpan & Membuat B/A...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateSelisih', periode: getActivePeriod(), data: payload }) });
        const result = await response.json();
        if(result.success) {
            PlayfulAlert.close();
            let targetRow = globalSelisihData.find(r => String(r[0]).substring(0,10) === tglSafe && String(r[1]).trim() === atmSafe && String(r[2]).trim() === resiSafe);
            if (targetRow) { targetRow[5] = 'Selesai'; targetRow[6] = finalKeterangan; }
            activeResolveRow[5] = 'Selesai'; activeResolveRow[6] = finalKeterangan; 
            renderSelisihTablesFiltered(); renderOpnameTable(); generateBA(encodeURIComponent(JSON.stringify(activeResolveRow))); 
        } else PlayfulAlert.fire('Gagal', 'Gagal update ke database', 'error');
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function revertSelisih(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    const confirm = await PlayfulAlert.fire({ title: 'Batalkan Selesai?', text: "Data dikembalikan ke tab Belum Selesai.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Kembalikan!', cancelButtonText: 'Batal'});
    if(!confirm.isConfirmed) return;

    const tglSafe = String(row[0]).substring(0,10); const atmSafe = String(row[1]).trim(); const resiSafe = String(row[2]).trim();
    const payload = { tanggal: tglSafe, atm: atmSafe, resi: resiSafe, status: 'Belum', keterangan: row[6] };
    
    PlayfulAlert.fire({ title: 'Mengembalikan...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateSelisih', periode: getActivePeriod(), data: payload }) });
        const result = await response.json();
        if(result.success) { 
            PlayfulAlert.fire('Berhasil', 'Data dikembalikan.', 'success'); 
            let targetRow = globalSelisihData.find(r => String(r[0]).substring(0,10) === tglSafe && String(r[1]).trim() === atmSafe && String(r[2]).trim() === resiSafe);
            if (targetRow) targetRow[5] = 'Belum';
            renderSelisihTablesFiltered(); renderOpnameTable(); 
        }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

function generateBA(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr)); const tglTrx = String(row[0]).substring(0,10); const atmId = row[1]; const resi = row[2]; const nominalRaw = formatRp(row[3]);
    let reasonText = row[6] || ''; let detail = {rek: ".......", nama: ".......", trx: "Tarik Tunai On Us", problem: "Transaksi terdebet namun uang tidak keluar"};
    if (reasonText.includes('|||')) { let parts = reasonText.split('|||'); reasonText = parts[0].trim(); try { detail = JSON.parse(parts[1].trim()); } catch(e){} }

    let dateObj = new Date(); let hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]; let bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    let tglCetak = `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
    let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; let kota = namaCabang.replace('Kantor Cabang Pembantu', '').trim();
    
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
    
    new bootstrap.Modal(document.getElementById('beritaAcaraModal')).show();
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
    let currentPeriod = getActivePeriod();
    const tbody = document.getElementById('tableBodyDataMaster');
    if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-1"></div><br><small>Menyinkronkan Database...</small></td></tr>`;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getDatabase', periode: currentPeriod })});
        const result = await response.json();
        if(result.success) { databaseData = result.data; renderUploadHistory(); renderDataMaster(); updateDataCompletenessBanner(); }
    } catch (err) { console.error(err); }
}

function renderDataMaster() {
    const fStart = document.getElementById('filterStart').value; const fResi = document.getElementById('filterResiDm').value.toLowerCase();
    const fAtm = document.getElementById('filterAtmDm').value.toLowerCase(); const fNom = document.getElementById('filterNominalDm').value;
    const fStatus = document.getElementById('filterStatus').value;

    const selisihKeys = new Set();
    (databaseData.selisih||[]).forEach(row => { selisihKeys.add(`${String(row[0]).substring(0,10)}_${String(row[1]).trim()}_${String(row[2]).trim()}`); });

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
    let sSblm = parseFloat(document.getElementById('opSysSebelum').value) || 0; let sTmbh = parseFloat(document.getElementById('opSysTambah').value) || 0; let fisik = parseFloat(document.getElementById('opFisik').value) || 0;
    document.getElementById('opSysTotal').innerText = formatRp(sSblm + sTmbh);
    let selisih = fisik - sSblm; 
    let textSelisih = document.getElementById('opSelisihText'); let badgeSelisih = document.getElementById('opSelisihBadge');
    textSelisih.innerText = formatRp(Math.abs(selisih));
    if (selisih > 0) { textSelisih.className = "fw-black mb-0 text-success"; badgeSelisih.className = "badge bg-success rounded-pill mt-2 px-3"; badgeSelisih.innerText = "Selisih LEBIH (Uang Sisa)"; } 
    else if (selisih < 0) { textSelisih.className = "fw-black mb-0 text-danger"; badgeSelisih.className = "badge bg-danger rounded-pill mt-2 px-3"; badgeSelisih.innerText = "Selisih KURANG (Uang Hilang)"; } 
    else { textSelisih.className = "fw-black mb-0 text-secondary"; badgeSelisih.className = "badge bg-secondary rounded-pill mt-2 px-3"; badgeSelisih.innerText = "Balance / Seimbang"; }
}

function previewBAOpname() {
    let atmId = document.getElementById('opAtmId').value || "......."; let waktuInput = document.getElementById('opWaktu').value;
    if (!waktuInput) return PlayfulAlert.fire('Oops!', 'Isi waktu pelaksanaan dulu ya.', 'warning');
    let dateObj = new Date(waktuInput); let hariArr = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"]; let bulanArr = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    let sSblm = parseFloat(document.getElementById('opSysSebelum').value) || 0; let sTmbh = parseFloat(document.getElementById('opSysTambah').value) || 0; let fisik = parseFloat(document.getElementById('opFisik').value) || 0;
    let selisih = fisik - sSblm; 
    
    let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; let admin = globalConfig.cfgAdmin || 'SUCI AINUL FITRI';
    document.getElementById('cetakOp_cabang').innerText = namaCabang.toUpperCase(); document.getElementById('cetakOp_cabang_text').innerText = namaCabang;
    document.getElementById('cetakOp_petugas1').innerText = `( ${globalConfig['cfgTeller_' + atmId.toUpperCase()] || 'TELLER AKTIF'} )`; document.getElementById('cetakOp_petugas2').innerText = `( ${admin} )`;
    document.getElementById('cetakHari').innerText = hariArr[dateObj.getDay()]; document.getElementById('cetakTgl').innerText = `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
    document.getElementById('cetakJam').innerText = dateObj.toTimeString().substring(0,5); document.getElementById('cetakAtm').innerText = atmId.toUpperCase();
    document.getElementById('cetakSysSebelum').innerText = formatNum(sSblm); document.getElementById('cetakSysTambah').innerText = formatNum(sTmbh); document.getElementById('cetakSysTotal').innerText = formatNum(sSblm + sTmbh); document.getElementById('cetakFisik').innerText = formatNum(fisik); document.getElementById('cetakKurang').innerText = formatNum(selisih < 0 ? Math.abs(selisih) : 0); document.getElementById('cetakLebih').innerText = formatNum(selisih > 0 ? selisih : 0);
    new bootstrap.Modal(document.getElementById('baOpnameModal')).show();
}

function printRiwayatBAOpname(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr)); let waktuInput = row[1]; let atmId = row[2]; let sSblm = parseFloat(row[3]) || 0; let sTmbh = parseFloat(row[4]) || 0; let fisik = parseFloat(row[6]) || 0; let selisih = parseFloat(row[7]) || 0;
    let dateObj = new Date(waktuInput.replace(' ', 'T')); let hariArr = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"]; let bulanArr = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; let admin = globalConfig.cfgAdmin || 'SUCI AINUL FITRI';
    document.getElementById('cetakOp_cabang').innerText = namaCabang.toUpperCase(); document.getElementById('cetakOp_cabang_text').innerText = namaCabang;
    document.getElementById('cetakOp_petugas1').innerText = `( ${globalConfig['cfgTeller_' + atmId.toUpperCase()] || 'TELLER AKTIF'} )`; document.getElementById('cetakOp_petugas2').innerText = `( ${admin} )`;
    document.getElementById('cetakHari').innerText = hariArr[dateObj.getDay()]; document.getElementById('cetakTgl').innerText = `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`; document.getElementById('cetakJam').innerText = String(dateObj.toTimeString()).substring(0,5); document.getElementById('cetakAtm').innerText = atmId.toUpperCase();
    document.getElementById('cetakSysSebelum').innerText = formatNum(sSblm); document.getElementById('cetakSysTambah').innerText = formatNum(sTmbh); document.getElementById('cetakSysTotal').innerText = formatNum(sSblm + sTmbh); document.getElementById('cetakFisik').innerText = formatNum(fisik); document.getElementById('cetakKurang').innerText = formatNum(selisih < 0 ? Math.abs(selisih) : 0); document.getElementById('cetakLebih').innerText = formatNum(selisih > 0 ? selisih : 0);
    new bootstrap.Modal(document.getElementById('baOpnameModal')).show();
}

async function fetchOpnameHistory() {
    let currentPeriod = getActivePeriod();
    document.getElementById('tableBodyOpname').innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary mb-1"></div></td></tr>`;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getOpname', periode: currentPeriod })});
        const result = await response.json();
        if(result.success) { globalOpnameData = result.data; renderOpnameTable(); }
    } catch (err) { console.error(err); }
}

function renderOpnameTable() {
    const tbody = document.getElementById('tableBodyOpname');
    if (globalOpnameData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted small"><i class="bi bi-inbox fs-4 d-block mb-1"></i> Belum ada riwayat Opname di bulan ini.</td></tr>`;
        return;
    }
    
    const fAtm = document.getElementById('filterAtmOp') ? document.getElementById('filterAtmOp').value.toLowerCase() : '';
    const fTgl = document.getElementById('filterTglOp') ? document.getElementById('filterTglOp').value : '';

    let filteredData = globalOpnameData.filter(row => {
        let match = true;
        if(fAtm) match = match && String(row[2]).toLowerCase().includes(fAtm);
        if(fTgl) match = match && String(row[1]).substring(0,10) === fTgl;
        return match;
    });
    
    let baUsageMap = new Map(); let totalFisikSemuaBA = 0; let totalDigunakan = 0;
    if (globalSelisihData) {
        let selesaiData = globalSelisihData.filter(r => String(r[5]).toLowerCase() !== 'belum');
        selesaiData.forEach(r => {
            let reason = String(r[6] || ''); let nominalTerpakai = parseFloat(r[3]) || 0; let atmTerpakai = String(r[1]).trim();
            let match = reason.match(/tanggal (\d{4}-\d{2}-\d{2})/);
            if (match) { let key = `${match[1]}_${atmTerpakai}`; baUsageMap.set(key, (baUsageMap.get(key) || 0) + nominalTerpakai); totalDigunakan += nominalTerpakai; }
        });
    }
    
    let sortedData = [...filteredData].sort((a,b) => new Date(String(b[1]).replace(' ', 'T')) - new Date(String(a[1]).replace(' ', 'T')));
    const pageData = sortedData.slice((pageState.opname - 1) * PAGE_SIZE, pageState.opname * PAGE_SIZE);

    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted small"><i class="bi bi-emoji-smile d-block fs-4 mb-1"></i> Tidak ada data Opname yang cocok.</td></tr>`;
    } else {
        tbody.innerHTML = pageData.map(row => {
            let tglBA_str = String(row[1]).substring(0,10); let atmBA = String(row[2]).trim(); let selisihAsli = parseFloat(row[7]);
            totalFisikSemuaBA += Math.abs(selisihAsli); 
            let keyBA = `${tglBA_str}_${atmBA}`; let terpakai = baUsageMap.get(keyBA) || 0; let sisa = Math.abs(selisihAsli) - terpakai; let persenPakai = Math.abs(selisihAsli) === 0 ? 0 : (terpakai / Math.abs(selisihAsli)) * 100;
            let badgeClass = selisihAsli > 0 ? "bg-success" : (selisihAsli < 0 ? "bg-danger" : "bg-secondary"); let badgeText = selisihAsli > 0 ? "LEBIH" : (selisihAsli < 0 ? "KURANG" : "BALANCE");
            let progressHtml = '';
            if (Math.abs(selisihAsli) > 0) {
                let statusTeks = sisa === 0 ? '<span class="text-success"><i class="bi bi-check-all"></i> Selesai (Tuntas)</span>' : `<span class="text-warning">Tersisa: ${formatRp(sisa)}</span>`;
                progressHtml = `<div class="mt-1" style="width: 130px;"><div class="d-flex justify-content-between text-[0.6rem] mb-1 fw-bold text-muted" style="font-size:0.6rem"><span>${statusTeks}</span></div><div class="progress" style="height: 4px;"><div class="progress-bar ${sisa === 0 ? 'bg-success' : 'bg-info'}" role="progressbar" style="width: ${persenPakai}%"></div></div></div>`;
            } else { progressHtml = `<span class="text-muted" style="font-size:0.65rem">- Tidak ada selisih -</span>`; }
            let rowDataStr = encodeURIComponent(JSON.stringify(row));
            return `<tr><td class="fw-medium text-secondary" style="font-size:0.75rem">${row[1].substring(0,16).replace('T', ' ')}</td><td><span class="badge border border-secondary text-secondary rounded-pill">${atmBA}</span></td><td><span class="badge ${badgeClass} rounded-pill shadow-sm" style="font-size:0.65rem">${badgeText} ${formatRp(Math.abs(selisihAsli))}</span></td><td>${progressHtml}</td><td><button class="btn btn-sm btn-light text-success rounded-circle border shadow-sm bouncy-hover me-1" onclick="printRiwayatBAOpname('${rowDataStr}')" title="Cetak Ulang B/A"><i class="bi bi-printer-fill"></i></button><button class="btn btn-sm btn-light text-primary rounded-circle border shadow-sm bouncy-hover me-1" onclick="editOpname('${rowDataStr}')" title="Edit"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-light text-danger rounded-circle border shadow-sm bouncy-hover" onclick="deleteOpname('${row[0]}')" title="Hapus"><i class="bi bi-trash-fill"></i></button></td></tr>`;
        }).join('');
    }

    document.getElementById('op-hierarki-tot').innerText = formatRp(totalFisikSemuaBA); document.getElementById('op-hierarki-pakai').innerText = formatRp(totalDigunakan); document.getElementById('op-hierarki-sisa').innerText = formatRp(totalFisikSemuaBA - totalDigunakan); document.getElementById('op-hierarki-progress').style.width = `${totalFisikSemuaBA === 0 ? 0 : (totalDigunakan / totalFisikSemuaBA) * 100}%`;
    document.getElementById('paginationOpname').innerHTML = renderPagination(filteredData.length, pageState.opname, PAGE_SIZE, 'opname');
}

function editOpname(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    document.getElementById('opEditId').value = row[0]; document.getElementById('opWaktu').value = row[1]; document.getElementById('opAtmId').value = row[2]; document.getElementById('opSysSebelum').value = row[3]; document.getElementById('opSysTambah').value = row[4]; document.getElementById('opFisik').value = (parseFloat(row[3]) + parseFloat(row[7])); 
    calcOpname();
    const tabInput = document.querySelector('[data-bs-target="#op-form-tab"]'); if(tabInput) { const bsTab = new bootstrap.Tab(tabInput); bsTab.show(); }
    PlayfulAlert.fire({title: 'Mode Edit', icon: 'info', timer: 1500, showConfirmButton: false});
}

async function deleteOpname(id) {
    const confirm = await PlayfulAlert.fire({ title: 'Hapus BA?', text: "Data tidak bisa dikembalikan.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus!', cancelButtonText: 'Batal'});
    if(!confirm.isConfirmed) return;
    PlayfulAlert.fire({ title: 'Menghapus...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'deleteOpname', periode: getActivePeriod(), data: id }) });
        const result = await response.json();
        if(result.success) { PlayfulAlert.fire('Dihapus', 'Riwayat berhasil dibuang.', 'success'); fetchOpnameHistory(); }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function saveOpnameData() {
    let payload = { id: document.getElementById('opEditId').value, atm: document.getElementById('opAtmId').value, waktu: document.getElementById('opWaktu').value, sysSebelum: document.getElementById('opSysSebelum').value, sysTambah: document.getElementById('opSysTambah').value, fisik: document.getElementById('opFisik').value };
    if(!payload.atm || !payload.waktu || !payload.fisik) return PlayfulAlert.fire('Isian Kurang', 'Pastikan ID ATM, Waktu, dan Saldo Fisik terisi.', 'warning');
    PlayfulAlert.fire({ title: 'Menyimpan...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'uploadOpname', periode: getActivePeriod(), data: payload }) });
        const result = await response.json();
        if(result.success) { PlayfulAlert.fire('Berhasil!', 'Data Opname sukses tersimpan.', 'success'); document.getElementById('opEditId').value = ''; document.getElementById('opSysSebelum').value = ''; document.getElementById('opSysTambah').value = ''; document.getElementById('opFisik').value = ''; calcOpname(); fetchSelisihData(); } 
        else { PlayfulAlert.fire('Gagal', result.message, 'error'); }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

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
            if (!glMap.has(atm) || d > glMap.get(atm)) glMap.set(atm, d);
        }
    });
    
    let ejMap = new Map(); 
    (databaseData.ej || []).forEach(r => { 
        let atm = String(r[2]).trim().toUpperCase();
        if (atm && atm !== 'ATM') {
            let d = new Date(String(r[1]).substring(0,10) + "T00:00:00").getTime();
            if (!ejMap.has(atm) || d > ejMap.get(atm)) ejMap.set(atm, d);
        }
    });

    let missingEJ = [], missingGL = [], laggingEJ = [], laggingGL = [];

    for (let [atm, glDate] of glMap.entries()) {
        if (!ejMap.has(atm)) { missingEJ.push(atm); } 
        else { let ejDate = ejMap.get(atm); let diffDays = Math.round((glDate - ejDate) / (1000*60*60*24)); if (diffDays > 1) laggingEJ.push(`${atm} (Tertinggal ${diffDays} Hari)`); }
    }

    for (let [atm, ejDate] of ejMap.entries()) {
        if (!glMap.has(atm)) { missingGL.push(atm); } 
        else { let glDate = glMap.get(atm); let diffDays = Math.round((ejDate - glDate) / (1000*60*60*24)); if (diffDays > 1) laggingGL.push(`${atm} (Tertinggal ${diffDays} Hari)`); }
    }

    let bannerHtml = '';
    if (missingEJ.length > 0 || missingGL.length > 0 || laggingEJ.length > 0 || laggingGL.length > 0) {
        bannerHtml = `
            <div class="alert bg-warning-subtle border-0 text-dark py-3 px-4 rounded-4 shadow-sm mb-3 bouncy-hover">
                <div class="d-flex align-items-center mb-2"><i class="bi bi-exclamation-triangle-fill text-warning fs-5 me-2"></i><h6 class="fw-bold text-dark mb-0">Asisten Rekomendasi Upload</h6></div>
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
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getLaporan' }) });
        const result = await response.json();
        if(!result.success) throw new Error(result.message);
        
        let rawData = result.data;
        let ledger = [];
        
        // Terjemahkan baris demi baris menjadi format Akuntansi
        rawData.forEach(r => {
            let tglTrx = String(r[0]).substring(0,10);
            let atm = r[1].replace('KTM', ''); // Buang "KTM" agar persis PDF
            let resi = r[2];
            let nom = parseFloat(r[3]) || 0;
            let jenis = r[4];
            let status = String(r[5]).toLowerCase();
            let ket = r[6] || '';
            let tglSelesai = r[7] ? String(r[7]).substring(0,10) : tglTrx;
            let isResolved = status !== 'belum';

            if (jenis === 'SELISIH LEBIH') {
                // POSISI KREDIT (Uang Fisik Lebih = Sistem Kurang Debet = Masuk Rek. Gantung)
                let ketKredit = isResolved ? `Selesai/ON US, EJ & GL Klop, Menunggu Pengaduan Nasabah (${formatNum(nom)})` : `EJ & GL Klop, Menunggu Pengaduan Nasabah`;
                ledger.push({ dateObj: new Date(tglTrx), resi: resi, atm: atm, debet: 0, kredit: nom, ket: ketKredit, isRes: false, statusAkhir: status });
                
                // JIKA SELESAI -> POSISI DEBET (Uang ditarik dari Rek Gantung untuk Nasabah)
                if (isResolved) {
                    ledger.push({ dateObj: new Date(tglSelesai), resi: resi, atm: atm, debet: nom, kredit: 0, ket: `PENY. ON US (${formatDateIndo(new Date(tglTrx))})`, isRes: true, statusAkhir: status });
                }
            } else if (jenis === 'SELISIH KURANG') {
                // POSISI DEBET (Uang Fisik Hilang = Sistem Kurang Kredit = Beban Sementara Rek. Gantung)
                let ketDebet = isResolved ? `KANTOR PUSAT SALAH DEBET (EJ GAGAL & GL TDK TERCATAT) (${formatNum(nom)})` : `KANTOR PUSAT SALAH DEBET (EJ GAGAL & GL TDK TERCATAT)`;
                ledger.push({ dateObj: new Date(tglTrx), resi: resi, atm: atm, debet: nom, kredit: 0, ket: ketDebet, isRes: false, statusAkhir: status });
                
                // JIKA SELESAI -> POSISI KREDIT (Kompensasi masuk menutupi Rek Gantung)
                if (isResolved) {
                    ledger.push({ dateObj: new Date(tglSelesai), resi: resi, atm: atm, debet: 0, kredit: nom, ket: `KOREKSI PUSAT - ${ket}`, isRes: true, statusAkhir: status });
                }
            }
        });

        // Urutkan secara mutlak berdasarkan waktu kejadian
        ledger.sort((a,b) => a.dateObj - b.dateObj);
        
        let tbodyHtml = '';
        let saldo = 0;
        let totalUnresolved = 0;
        
        ledger.forEach((item, index) => {
            saldo += (item.kredit - item.debet); // Selisih Lebih menaikkan saldo, Selisih Kurang menurunkan saldo.
            
            let unresHtml = '';
            if (!item.isRes && item.statusAkhir === 'belum') {
                let amt = item.kredit > 0 ? item.kredit : item.debet;
                unresHtml = formatNum(amt);
                totalUnresolved += amt; 
            }

            tbodyHtml += `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${formatDateIndo(item.dateObj)}</td>
                    <td class="text-center">${item.resi}</td>
                    <td class="text-center">${item.atm}</td>
                    <td class="text-end text-success">${item.kredit > 0 ? formatNum(item.kredit) : ''}</td>
                    <td class="text-end text-danger">${item.debet > 0 ? formatNum(item.debet) : ''}</td>
                    <td class="text-end fw-bold">${formatNum(saldo)}</td>
                    <td>${item.ket}</td>
                    <td class="text-end text-danger">${unresHtml}</td>
                    <td></td>
                </tr>
            `;
        });
        
        // Baris TOTAL Bawah
        tbodyHtml += `
            <tr class="fw-bold bg-light">
                <td colspan="6" class="text-end pe-3">TOTAL KESELURUHAN</td>
                <td class="text-end">${formatNum(saldo)}</td>
                <td></td>
                <td class="text-end text-danger">${formatNum(totalUnresolved)}</td>
                <td></td>
            </tr>
        `;

        document.getElementById('lap_tbody').innerHTML = tbodyHtml;
        
        // Suntikkan Variabel Kantor dari Pengaturan Cloud
        let namaCabang = globalConfig.cfgCabang || 'Kantor Cabang Pembantu Babulu'; 
        let kota = namaCabang.replace('Kantor Cabang Pembantu', '').replace('Cabang', '').trim();
        let dateSelect = document.getElementById('globalPeriod').value; // cth: "2026-08"
        let year = dateSelect.split('-')[0];
        let monthIdx = parseInt(dateSelect.split('-')[1]) - 1;
        const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        
        document.getElementById('lap_periode').innerText = `${bulanArr[monthIdx]} ${year}`;
        document.getElementById('lap_judul_atas').innerText = `LAPORAN SELISIH ATM ${namaCabang.toUpperCase()}`;
        document.getElementById('lap_kota').innerText = kota;
        document.getElementById('lap_tgl_cetak').innerText = `${bulanArr[new Date().getMonth()]} ${new Date().getFullYear()}`;
        document.getElementById('lap_cabang_bawah').innerText = namaCabang;
        document.getElementById('lap_pimpinan').innerText = globalConfig.cfgPimpinan || 'ENDY PRATAMA';

        PlayfulAlert.close();
        new bootstrap.Modal(document.getElementById('laporanModal')).show();

    } catch (err) {
        PlayfulAlert.fire('Error', err.toString(), 'error');
    }
};

// Fungsi Rahasia: Mengubah Kertas Menjadi Landscape Hanya Saat Cetak Laporan Ini
superApp.printLaporan = function() {
    const style = document.createElement('style');
    style.innerHTML = `@page { size: A4 landscape; margin: 10mm; }`;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => style.remove(), 1000); // Cabut kembali agar BA lain tetap Portrait
};

function formatDateIndo(dateObj) {
    const hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${hariArr[dateObj.getDay()]}, ${String(dateObj.getDate()).padStart(2,'0')} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

document.getElementById('opAtmId').addEventListener('input', function() {
    let val = this.value.toUpperCase().replace(/\s/g, ''); if (/^\d/.test(val) && val.length > 0) this.value = 'KTM' + val; else this.value = val;
});
