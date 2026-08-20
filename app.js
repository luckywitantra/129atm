const API_URL = 'https://script.google.com/macros/s/AKfycbwnLjfPZrOM21ln6-crxdnGebqHUQSXInpk6sa5kzxatf9vhUFsZakMFDyr-UxTCUM_/exec';

// ==========================================
// 1. UI ROUTER, NAVIGASI & THEME SETUP
// ==========================================
let pendingUploadData = [];
let pendingUploadType = '';
let databaseData = { gl: [], ej: [], selisih: [] }; 
let globalSelisihData = []; 
let globalOpnameData = []; 
let activeResolveRow = null;

const formatRp = (angka) => (angka ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka) : "Rp 0");
const formatNum = (angka) => (angka ? new Intl.NumberFormat('id-ID').format(angka) : "0");

const PlayfulAlert = Swal.mixin({
    customClass: {
        popup: 'rounded-5 shadow-lg border-0',
        confirmButton: 'btn btn-primary rounded-pill px-4 fw-bold shadow-sm mx-1 bouncy-hover',
        cancelButton: 'btn btn-light rounded-pill px-4 fw-bold shadow-sm mx-1 bouncy-hover'
    },
    buttonsStyling: false
});

window.superApp = window.superApp || {};

document.addEventListener("DOMContentLoaded", () => {
    // Load Konfigurasi BA
    document.getElementById('cfgCabang').value = localStorage.getItem('cfgCabang') || 'Kantor Cabang Pembantu Babulu';
    document.getElementById('cfgAlamat').value = localStorage.getItem('cfgAlamat') || 'Jl. Propinsi KM. 48 RT. 05 RW. 02';
    document.getElementById('cfgPimpinan').value = localStorage.getItem('cfgPimpinan') || 'ENDY PRATAMA';
    document.getElementById('cfgTeller').value = localStorage.getItem('cfgTeller') || 'FISTRI ARIANDINI';
    document.getElementById('cfgAdmin').value = localStorage.getItem('cfgAdmin') || 'SUCI AINUL FITRI';
});

superApp.saveBAConfig = function() {
    localStorage.setItem('cfgCabang', document.getElementById('cfgCabang').value);
    localStorage.setItem('cfgAlamat', document.getElementById('cfgAlamat').value);
    localStorage.setItem('cfgPimpinan', document.getElementById('cfgPimpinan').value);
    localStorage.setItem('cfgTeller', document.getElementById('cfgTeller').value);
    localStorage.setItem('cfgAdmin', document.getElementById('cfgAdmin').value);
    PlayfulAlert.fire('Berhasil!', 'Konfigurasi Surat & Pejabat berhasil disimpan.', 'success');
};

function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.add('d-none'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.remove('d-none');

    document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => {
        el.classList.remove('active-bottom');
        el.classList.remove('text-primary');
        el.classList.add('text-secondary');
    });

    if (event && event.currentTarget) {
        if(event.currentTarget.classList.contains('nav-link')) {
            event.currentTarget.classList.add('active'); 
        } else {
            event.currentTarget.classList.add('active-bottom'); 
            event.currentTarget.classList.remove('text-secondary');
            event.currentTarget.classList.add('text-primary');
        }
    }

    if(pageId === 'analisa') fetchSelisihData();
    if(pageId === 'datamaster') fetchDatabaseData(); 
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    html.setAttribute('data-bs-theme', html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
});

// ==========================================
// 2. PARSER DATA (GL & EJ)
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
    };
    reader.readAsText(file);
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
                if (currentTx.cashTaken) currentTx.status = "SUKSES";
                else if (!currentTx.status) {
                    currentTx.status = (currentTx.jenis === "TARIK TUNAI" && (!currentTx.nominal || currentTx.nominal === 0)) ? "GAGAL - TIDAK ADA UANG KELUAR" : (currentTx.nominal ? "SUKSES" : "NON-FINANSIAL");
                }
                if (!currentTx.nominal) currentTx.nominal = 0;
                let finalAtmId = currentTx.atm; if (!finalAtmId || /^\d+$/.test(finalAtmId)) finalAtmId = lastValidAtmId;
                ejData.push([currentTx.tanggal, finalAtmId, currentTx.noResi, currentTx.nominal, currentTx.status]);
            }
            currentTx = {}; isLookingForJumlah = false;
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line.includes("<- TRANSACTION END") || line.includes("-> TRANSACTION START") || line.includes("EMV AID ")) { if (currentTx.noResi) saveCurrentTransaction(); }
            if (line.includes("CASH TAKEN")) currentTx.cashTaken = true;
            const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([A-Z0-9]+)/);
            if (dateMatch) { currentTx.tanggal = `20${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; lastValidDate = currentTx.tanggal; currentTx.atm = dateMatch[5]; if (/[A-Z]/.test(currentTx.atm)) lastValidAtmId = currentTx.atm; }
            const resiMatch = line.match(/(?:NO\s+RESI|NO\s+REF\.?|REFF\s+NO)\s*:?\s*(\d+)/i);
            if (resiMatch) currentTx.noResi = parseInt(resiMatch[1], 10).toString();
            const smartEmvMatch = line.match(/SMART EMV\s+(\d+)/);
            if (smartEmvMatch) currentTx.noResi = parseInt(smartEmvMatch[1], 10).toString();
            if (line.includes("PENARIKAN TUNAI") || line.includes("TARIK TUNAI") || line.includes("WITHDRAWAL") || line.includes("PENARIKAN TUNAI TANPA KARTU")) currentTx.jenis = "TARIK TUNAI";
            else if (line.includes("TRANSFER") || line.includes("PEMINDAH BUKUAN") || line.includes("KE BANK") || line.includes("REK TUJUAN")) currentTx.jenis = "TRANSFER";

            if ((line.includes("JUMLAH") || line.includes("AMOUNT")) && !line.includes("ENTERED")) {
                isLookingForJumlah = true; const inlineJumlah = line.match(/RP\.?\s*([\d,]+(?:\.\d+)?)/i);
                if (inlineJumlah) { currentTx.nominal = parseFloat(inlineJumlah[1].replace(/,/g, '')); isLookingForJumlah = false; }
            } else if (isLookingForJumlah) {
                if (!line.match(/^\d{2}:\d{2}:\d{2}/)) { const nextLineJumlah = line.match(/^([\d,]+(?:\.\d+)?)/); if (nextLineJumlah) currentTx.nominal = parseFloat(nextLineJumlah[1].replace(/,/g, '')); }
                isLookingForJumlah = false; 
            }
            if (line.includes("TRANSAKSI SUKSES") || line.includes("SUCCESSFUL")) currentTx.status = (currentTx.jenis === "TRANSFER") ? "SUKSES (TRANSFER)" : "SUKSES";

            const errorKeywords = ["SALDO KURANG", "SALAH MASUKKAN PIN", "KARTU ANDA SUDAH KADALUARSA", "HIGH BILL MIX ERROR", "LOW BILL MIX ERROR", "DISPENSER ERROR", "COMMUNICATION ERROR", "CDM ERROR", "KD.ARE/NO.TELP TDK TERDAFTA", "RESTRICTED PHONE NUMBER", "MELEBIHI LIMIT", "INACTIVE ACCOUNT", "UNABLE TO PROCESS", "INVALID ZERO AMOUNT", "INVALID INSTITUTION", "RESPONSE CODE GAGAL", "CHIP CARD SECURITY FAILURE", "PROCESSOR TEMP DOWN", "KARTU ANDA TERDAFTAR SBG"];
            errorKeywords.forEach(err => { if (line.includes(err) && !currentTx.cashTaken) currentTx.status = "GAGAL - " + err; });
            if (line.match(/TRANSACTION \d+ FAILED/) && !currentTx.cashTaken) currentTx.status = "GAGAL - TRANSACTION FAILED";
        }
        if (currentTx.noResi) saveCurrentTransaction();
        if (ejData.length === 0) return PlayfulAlert.fire('Data Kosong', 'Tidak ditemukan transaksi pada file EJ ini.', 'warning');
        showPreviewModal(ejData, 'EJ');
    };
    reader.readAsText(file);
}

// ==========================================
// 3. FITUR PREVIEW DATA (POPUP UPLOAD)
// ==========================================
function showPreviewModal(data, type) {
    pendingUploadData = data; pendingUploadType = type === 'GL' ? 'uploadGL' : 'uploadEJ';
    document.getElementById('previewType').innerText = type; document.getElementById('previewCount').innerText = data.length.toLocaleString('id-ID');
    const thead = document.getElementById('previewTableHeader'); const tbody = document.getElementById('previewTableBody');

    thead.innerHTML = type === 'GL' 
        ? `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Jenis</th><th>Referensi</th></tr>`
        : `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Status Transaksi</th></tr>`;

    const renderLimit = 100;
    const rowsHtml = data.slice(0, renderLimit).map(row => {
        if (type === 'GL') {
            return `<tr><td class="text-secondary fw-medium">${row[0]}</td><td><span class="badge bg-secondary rounded-pill">${row[1]}</span></td><td class="fw-bold">${row[2]}</td><td class="text-primary fw-bold">${formatRp(row[3])}</td><td><span class="badge bg-info text-dark rounded-pill">${row[4]}</span></td><td class="text-muted"><small>${row[5]}</small></td></tr>`;
        } else {
            let badge = row[4].includes('SUKSES') ? `bg-success-subtle text-success` : row[4].includes('GAGAL') ? `bg-danger-subtle text-danger` : `bg-light text-secondary`;
            return `<tr><td class="text-secondary fw-medium">${row[0]}</td><td><span class="badge bg-secondary rounded-pill">${row[1]}</span></td><td class="fw-bold">${row[2]}</td><td class="text-primary fw-bold">${formatRp(row[3])}</td><td><span class="badge rounded-pill px-3 py-1 ${badge}">${row[4]}</span></td></tr>`;
        }
    }).join('');
    
    let extraMsg = data.length > renderLimit ? `<tr><td colspan="6" class="text-center text-muted fst-italic py-3 bg-light">Menampilkan ${renderLimit} baris pertama dari ${data.length.toLocaleString('id-ID')} baris...</td></tr>` : '';
    tbody.innerHTML = rowsHtml + extraMsg;
    new bootstrap.Modal(document.getElementById('previewModal')).show();
}

document.getElementById('btnConfirmUpload').addEventListener('click', () => {
    const m = bootstrap.Modal.getInstance(document.getElementById('previewModal')); if(m) m.hide();
    sendToBackend(pendingUploadType, pendingUploadData);
});

// ==========================================
// 4. API & ANALISA SELISIH (DENGAN AI MATCHER)
// ==========================================
async function sendToBackend(action, data) {
    PlayfulAlert.fire({ title: 'Menyinkronkan Data...', allowOutsideClick: false }); 
    PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: action, data: data }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await response.json();
        if(result.success) PlayfulAlert.fire('Berhasil!', `Dimasukkan: <b>${result.data.added}</b> data baru.<br>Dilewati (Duplikat): <b>${data.length - result.data.added}</b> data.`, 'success');
        else PlayfulAlert.fire('Error Backend', result.message, 'error');
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function triggerAnalysis() {
    PlayfulAlert.fire({ title: 'Menganalisa Pintar...', allowOutsideClick: false }); 
    PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'analyze' }) });
        const result = await response.json();
        
        if(result.success) {
            const alertMsg = result.data.infoMsg ? result.data.infoMsg : "Perhitungan terbaru berhasil dimuat.";
            const iconType = alertMsg.includes('ditangguhkan') ? 'info' : 'success';
            PlayfulAlert.fire('Analisa Selesai', alertMsg, iconType);
            
            globalSelisihData = result.data.tableData;
            renderSelisihTablesFiltered(); 
        } else {
            PlayfulAlert.fire('Gagal', result.message, 'error');
        }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function fetchSelisihData() {
    document.getElementById('tableBodyLebih').innerHTML = `<tr><td colspan="6" class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>`;
    document.getElementById('tableBodyKurang').innerHTML = `<tr><td colspan="6" class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>`;
    try {
        const [resSelisih, resOpname] = await Promise.all([
            fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getSelisih' })}),
            fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getOpname' })})
        ]);
        const resultSelisih = await resSelisih.json();
        const resultOpname = await resOpname.json();
        
        if(resultSelisih.success) globalSelisihData = resultSelisih.data;
        if(resultOpname.success) globalOpnameData = resultOpname.data;
        
        renderSelisihTablesFiltered();
    } catch (err) { console.error(err); }
}

function renderSelisihTablesFiltered() {
    if (!globalSelisihData) return;
    
    const fResi = document.getElementById('filterResiAn').value.toLowerCase();
    const fAtm = document.getElementById('filterAtmAn').value.toLowerCase();
    const fNom = document.getElementById('filterNominalAn').value;
    const sortDate = document.getElementById('sortDateAn').value;

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

    const totLebih = lebihArr.reduce((sum, row) => sum + parseFloat(row[3]), 0);
    const totKurang = kurangArr.reduce((sum, row) => sum + parseFloat(row[3]), 0);
    document.getElementById('totalLebihRp').innerText = formatRp(totLebih);
    document.getElementById('totalKurangRp').innerText = formatRp(totKurang);
    document.getElementById('countLebih').innerText = lebihArr.length;
    document.getElementById('countKurang').innerText = kurangArr.length;

    // --- MENGHITUNG KUOTA BA YANG SUDAH TERPAKAI ---
    let baUsageMap = new Map();
    selesaiArr.forEach(r => {
        let reason = String(r[6] || '');
        let nominalTerpakai = parseFloat(r[3]) || 0;
        let atmTerpakai = String(r[1]).trim();
        let match = reason.match(/tanggal (\d{4}-\d{2}-\d{2})/);
        if (match) {
            let key = `${match[1]}_${atmTerpakai}`;
            baUsageMap.set(key, (baUsageMap.get(key) || 0) + nominalTerpakai);
        }
    });

    const renderTable = (arr, type) => {
        if(arr.length === 0) return `<tr><td colspan="6" class="text-center py-5 text-muted small"><i class="bi bi-emoji-smile fs-4 d-block mb-1"></i> Data bersih atau tidak ditemukan.</td></tr>`;
        return arr.map(row => {
            const tglTrxStr = String(row[0] || '').substring(0,10);
            const nominalSelisih = parseFloat(row[3]);
            const atmTrx = String(row[1]).trim();
            const rawStr = encodeURIComponent(JSON.stringify(row));
            
            let aiBadgeHtml = '';
            let aiSaranTeks = ''; 
            
            // 🤖 SMART AI MATCHER (DENGAN SISTEM KUOTA)
            if (type === 'belum' && typeof globalOpnameData !== 'undefined' && globalOpnameData.length > 0) {
                
                let sortedOpname = [...globalOpnameData].sort((a,b) => new Date(String(a[1]).replace(' ', 'T')) - new Date(String(b[1]).replace(' ', 'T')));
                let trxTime = new Date(tglTrxStr + "T00:00:00").getTime();
                
                // Helper extract numbers untuk mengabaikan KTM dll
                const extractNumbers = (str) => String(str).replace(/\D/g, '');
                
                let matchedBA = sortedOpname.find(ba => {
                    let tglBA_str = String(ba[1]).substring(0,10);
                    let baTime = new Date(tglBA_str + "T00:00:00").getTime();
                    
                    let atmBA_Clean = extractNumbers(ba[2]);
                    let atmTrx_Clean = extractNumbers(atmTrx);
                    
                    let totalFisik = parseFloat(ba[7]) || 0; 
                    
                    // Hitung Sisa Kuota
                    let keyBA = `${tglBA_str}_${String(ba[2]).trim()}`;
                    let terpakai = baUsageMap.get(keyBA) || 0;
                    let sisaKuota = Math.abs(totalFisik) - terpakai;
                    
                    if (atmBA_Clean !== atmTrx_Clean) return false;
                    if (baTime < trxTime) return false;
                    if (sisaKuota < nominalSelisih) return false;
                    
                    let isValid = (row[4] === 'SELISIH LEBIH' && totalFisik > 0) || (row[4] === 'SELISIH KURANG' && totalFisik < 0);
                    return isValid;
                });

                if (matchedBA) {
                    let tglMatched = String(matchedBA[1]).substring(0,10);
                    aiSaranTeks = `Selesai: Kompensasi selisih tercakup dalam Berita Acara Opname fisik ATM tanggal ${tglMatched}.`;
                    aiBadgeHtml = `<div class="mt-1"><span class="badge bg-warning text-dark border border-warning shadow-sm rounded-pill bouncy-hover" style="font-size:0.65rem" title="Klik Selesaikan, alasan otomatis pakai BA tgl ${tglMatched}"><i class="bi bi-robot text-primary"></i> <b>Saran AI:</b> Pakai BA ${tglMatched}</span></div>`;
                }
            }

            let actionBtn = "";
            if (type === 'belum') {
                let encodedSaran = encodeURIComponent(aiSaranTeks);
                actionBtn = `<button class="btn btn-sm btn-success rounded-pill fw-bold shadow-sm bouncy-hover text-nowrap" style="font-size:0.7rem" onclick="event.stopPropagation(); openResolveModal('${rawStr}', '${encodedSaran}')"><i class="bi bi-check2-circle"></i> Selesaikan</button>`;
            } else {
                actionBtn = `<button class="btn btn-sm btn-outline-danger rounded-pill fw-bold me-1 shadow-sm bouncy-hover text-nowrap" style="font-size:0.7rem" onclick="event.stopPropagation(); revertSelisih('${rawStr}')"><i class="bi bi-arrow-counterclockwise"></i> Batal</button>
                             <button class="btn btn-sm btn-dark rounded-pill shadow-sm bouncy-hover text-nowrap" style="font-size:0.7rem" onclick="event.stopPropagation(); generateBA('${rawStr}')"><i class="bi bi-printer"></i> B/A</button>`;
            }

            return `<tr class="align-middle" style="cursor:pointer;" onclick="showDetailPopup('${rawStr}')">
                <td class="fw-medium text-secondary">${tglTrxStr}</td>
                <td><span class="badge bg-secondary shadow-sm rounded-pill">${row[1]}</span></td>
                <td class="fw-bold">${row[2]}</td>
                <td class="text-primary fw-bold">${formatRp(nominalSelisih)}</td>
                <td><small class="text-muted d-block text-truncate" style="max-width:150px;">${row[6]}</small>${aiBadgeHtml}</td>
                <td>${actionBtn}</td>
            </tr>`;
        }).join('');
    };

    document.getElementById('tableBodyLebih').innerHTML = renderTable(lebihArr, 'belum');
    document.getElementById('tableBodyKurang').innerHTML = renderTable(kurangArr, 'belum');
    document.getElementById('tableBodySelesai').innerHTML = renderTable(selesaiArr, 'selesai');
}

// ==========================================
// 5. ENGINE WORKFLOW PENYELESAIAN (SELESAI & B/A)
// ==========================================
function openResolveModal(rawStr, encodedSaran = '') {
    activeResolveRow = JSON.parse(decodeURIComponent(rawStr));
    let saranText = encodedSaran ? decodeURIComponent(encodedSaran) : '';
    let nominal = formatRp(activeResolveRow[3]);
    let tglTrx = String(activeResolveRow[0]).substring(0,10);
    
    document.getElementById('resolveInfoBox').innerHTML = `
        <h6 class="fw-bold mb-1"><i class="bi bi-info-circle"></i> Info Transaksi</h6>
        <p class="mb-1 small">ATM: <b>${activeResolveRow[1]}</b> | Tgl: <b>${tglTrx}</b> | Resi: <b>${activeResolveRow[2]}</b></p>
        <p class="mb-1 small text-danger fw-bold">Nominal Selisih: ${nominal}</p>
        ${saranText ? `<hr class="my-2"><p class="mb-0 small text-success fw-bold"><i class="bi bi-robot"></i> Rekomendasi AI: ${saranText}</p>` : ''}
    `;
    
    let existingReason = activeResolveRow[6] || '';
    if (existingReason.toLowerCase() === 'belum' || existingReason === '') {
        if(saranText) {
            document.getElementById('resolveReason').value = `Transaksi ATM tidak tercatat pada EJ dengan keterangan GAGAL sehingga terjadi selisih lebih ${nominal} pada mesin ${activeResolveRow[1]}. ${saranText}`;
        } else {
            document.getElementById('resolveReason').value = `Transaksi ATM tidak tercatat pada EJ dengan keterangan COMMUNICATION ERROR sehingga terjadi selisih pada mesin ${activeResolveRow[1]}`;
        }
    } else {
        document.getElementById('resolveReason').value = existingReason; 
    }
    
    document.getElementById('resRekening').value = '';
    document.getElementById('resNama').value = '';
    
    new bootstrap.Modal(document.getElementById('resolveModal')).show();
}

async function submitResolve() {
    const reason = document.getElementById('resolveReason').value.trim();
    const rekening = document.getElementById('resRekening').value.trim() || "-";
    const nama = document.getElementById('resNama').value.trim().toUpperCase() || "-";
    const trx = document.getElementById('resTrx').value;
    const problem = document.getElementById('resProblem').value;
    
    if(!reason) return PlayfulAlert.fire('Tunggu dulu!', 'Harap isi keterangan/jurnal penyelesaian.', 'warning');
    
    let detailNasabah = JSON.stringify({rek: rekening, nama: nama, trx: trx, problem: problem});
    let finalKeterangan = `${reason} ||| ${detailNasabah}`;
    
    bootstrap.Modal.getInstance(document.getElementById('resolveModal')).hide();
    
    const tgl = String(activeResolveRow[0]).substring(0,10);
    const payload = { tanggal: tgl, atm: activeResolveRow[1], resi: activeResolveRow[2], status: 'Selesai', keterangan: finalKeterangan };
    
    PlayfulAlert.fire({ title: 'Menyimpan & Membuat B/A...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateSelisih', data: payload }) });
        const result = await response.json();
        if(result.success) {
            PlayfulAlert.close();
            activeResolveRow[5] = 'Selesai'; 
            activeResolveRow[6] = finalKeterangan; 
            renderSelisihTablesFiltered(); 
            generateBA(encodeURIComponent(JSON.stringify(activeResolveRow))); 
        } else { PlayfulAlert.fire('Gagal', 'Gagal update ke database', 'error'); }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function revertSelisih(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    const confirm = await PlayfulAlert.fire({ title: 'Batalkan Selesai?', text: "Data akan dikembalikan ke tab Belum Selesai.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Kembalikan!', cancelButtonText: 'Batal'});
    if(!confirm.isConfirmed) return;

    const tgl = String(row[0]).substring(0,10);
    const payload = { tanggal: tgl, atm: row[1], resi: row[2], status: 'Belum', keterangan: row[6] };
    
    PlayfulAlert.fire({ title: 'Mengembalikan...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateSelisih', data: payload }) });
        const result = await response.json();
        if(result.success) {
            PlayfulAlert.fire('Berhasil', 'Data dikembalikan ke tabel awal.', 'success');
            fetchSelisihData(); 
        }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

function generateBA(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    const tglTrx = String(row[0]).substring(0,10);
    const atmId = row[1];
    const resi = row[2];
    const nominalRaw = formatRp(row[3]);
    
    let fullReason = row[6] || '';
    let reasonText = fullReason;
    let detail = {rek: ".......", nama: ".......", trx: "Tarik Tunai On Us", problem: "Transaksi terdebet namun uang tidak keluar"};
    
    if (fullReason.includes('|||')) {
        let parts = fullReason.split('|||');
        reasonText = parts[0].trim();
        try { detail = JSON.parse(parts[1].trim()); } catch(e){}
    }

    let dateObj = new Date();
    let hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    let bulanArr = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    let tglCetak = `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
    
    let namaCabang = localStorage.getItem('cfgCabang') || 'Kantor Cabang Pembantu Babulu';
    let kota = namaCabang.replace('Kantor Cabang Pembantu', '').trim();
    
    document.getElementById('cetak_cabang').innerText = namaCabang;
    document.getElementById('cetak_alamat').innerText = localStorage.getItem('cfgAlamat') || 'Jl. Propinsi KM. 48 RT. 05 RW. 02';
    document.getElementById('cetak_pimpinan').innerText = localStorage.getItem('cfgPimpinan') || 'ENDY PRATAMA';
    document.getElementById('cetak_teller').innerText = localStorage.getItem('cfgTeller') || 'FISTRI ARIANDINI';
    document.getElementById('cetak_admin').innerText = localStorage.getItem('cfgAdmin') || 'SUCI AINUL FITRI';
    
    document.getElementById('cetak_kota').innerText = kota;
    document.getElementById('cetak_tgl_ttd').innerText = tglCetak;
    
    document.getElementById('cetak_atm_judul').innerText = atmId;
    document.getElementById('cetak_hari').innerText = hariArr[dateObj.getDay()];
    document.getElementById('cetak_tgl').innerText = tglCetak;
    document.getElementById('cetak_atm').innerText = `${atmId} (${namaCabang})`;
    document.getElementById('cetak_nominal').innerText = nominalRaw;
    
    document.getElementById('cetak_rek').innerText = detail.rek;
    document.getElementById('cetak_nama').innerText = detail.nama;
    document.getElementById('cetak_resi').innerText = `${resi}${atmId.replace('KTM','')}`;
    document.getElementById('cetak_trx').innerText = detail.trx;
    document.getElementById('cetak_problem').innerText = detail.problem;
    document.getElementById('cetak_jurnal_ket').innerText = detail.problem;
    
    document.getElementById('cetak_keterangan').innerText = reasonText;
    
    document.getElementById('cetak_kredit_rek').innerText = detail.rek;
    document.getElementById('cetak_kredit_nama').innerText = detail.nama;
    document.getElementById('cetak_jurnal_nom').innerText = nominalRaw;
    
    new bootstrap.Modal(document.getElementById('beritaAcaraModal')).show();
}

function showDetailPopup(rowDataStr) {
    const row = JSON.parse(decodeURIComponent(rowDataStr));
    document.getElementById('detailTanggal').innerText = String(row[0]).substring(0,10);
    document.getElementById('detailAtm').innerText = row[1];
    document.getElementById('detailResi').innerText = row[2];
    document.getElementById('detailNominal').innerText = formatRp(row[3]);
    
    let keterangan = row[6] || '-';
    if (keterangan.includes('|||')) {
        keterangan = keterangan.split('|||')[0].trim();
    }
    document.getElementById('detailKeterangan').innerText = keterangan;
    
    const badge = document.getElementById('detailJenisBadge');
    const header = document.getElementById('detailModalHeader');
    const saran = document.getElementById('detailSaran');

    if (row[4] === 'SELISIH LEBIH') {
        badge.innerHTML = '<i class="bi bi-arrow-up-circle-fill"></i> UANG MESIN LEBIH';
        badge.className = 'badge rounded-pill shadow-sm mb-2 bg-success text-white';
        header.className = 'modal-header border-0 py-3 text-white bg-success';
        saran.innerHTML = `Sistem GL merekam transaksi terpotong, namun jurnal EJ mesin <b>GAGAL</b>. <br>Pastikan saldo telah dikredit kembali ke nasabah.`;
    } else {
        badge.innerHTML = '<i class="bi bi-arrow-down-circle-fill"></i> UANG MESIN HILANG';
        badge.className = 'badge rounded-pill shadow-sm mb-2 bg-danger text-white';
        header.className = 'modal-header border-0 py-3 text-white bg-danger';
        saran.innerHTML = `Mesin sukses mengeluarkan uang fisik, namun transaksi <b>TIDAK TERCATAT</b> di pembukuan GL. <br>Lakukan pengecekan jurnal suspense (rek. gantung) / debet manual.`;
    }

    new bootstrap.Modal(document.getElementById('detailSelisihModal')).show();
}

// ==========================================
// 6. ENGINE DATA MASTER (PREVIEW GL & EJ)
// ==========================================
async function fetchDatabaseData() {
    document.getElementById('tableBodyDataMaster').innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-1"></div><br><small>Mengunduh Database...</small></td></tr>`;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getDatabase' })});
        const result = await response.json();
        if(result.success) {
            databaseData = result.data;
            renderDataMaster();
        }
    } catch (err) { console.error(err); }
}

function renderDataMaster() {
    const fStart = document.getElementById('filterStart').value;
    const fResi = document.getElementById('filterResiDm').value.toLowerCase();
    const fAtm = document.getElementById('filterAtmDm').value.toLowerCase();
    const fNom = document.getElementById('filterNominalDm').value;
    const fStatus = document.getElementById('filterStatus').value;

    const selisihKeys = new Set();
    databaseData.selisih.forEach(row => { 
        selisihKeys.add(`${String(row[0]).substring(0,10)}_${String(row[1]).trim()}_${String(row[2]).trim()}`); 
    });

    let combinedData = [];
    databaseData.gl.forEach(row => {
        const tgl = String(row[1]).substring(0,10);
        combinedData.push({ sumber: 'GL', tanggal: tgl, atm: row[2], resi: row[3], nominal: row[4], ket: `${row[5]}`, isSelisih: selisihKeys.has(`${tgl}_${String(row[2]).trim()}_${String(row[3]).trim()}`) });
    });
    databaseData.ej.forEach(row => {
        const tgl = String(row[1]).substring(0,10);
        combinedData.push({ sumber: 'EJ', tanggal: tgl, atm: row[2], resi: row[3], nominal: row[4], ket: `Status: ${row[5]}`, isSelisih: selisihKeys.has(`${tgl}_${String(row[2]).trim()}_${String(row[3]).trim()}`) });
    });

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
    const tbody = document.getElementById('tableBodyDataMaster');
    if (filteredData.length === 0) return tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted small"><i class="bi bi-emoji-frown d-block fs-4 mb-1"></i> Tidak ada data yang cocok dengan filter.</td></tr>`;

    tbody.innerHTML = filteredData.slice(0, 500).map(item => {
        const badgeSumber = item.sumber === 'GL' ? `<span class="badge bg-primary px-3 rounded-pill shadow-sm"><i class="bi bi-file-earmark-text"></i> GL</span>` : `<span class="badge bg-success px-3 rounded-pill shadow-sm"><i class="bi bi-receipt"></i> EJ</span>`;
        const warnIcon = item.isSelisih ? `<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i>` : ``;
        const rowClass = item.isSelisih ? 'row-selisih' : 'row-aman';

        return `<tr class="${rowClass}">
            <td>${badgeSumber}</td>
            <td class="fw-medium text-secondary">${item.tanggal}</td>
            <td class="fw-bold">${item.atm}</td>
            <td class="fw-bold">${warnIcon}${item.resi}</td>
            <td class="text-primary fw-bold">${formatRp(item.nominal)}</td>
            <td class="text-muted small text-truncate" style="max-width:180px;" title="${item.ket}">${item.ket}</td>
        </tr>`;
    }).join('');
}

// ==========================================
// 7. ENGINE OPNAME FISIK ATM & A4 PDF
// ==========================================

function calcOpname() {
    let sSblm = parseFloat(document.getElementById('opSysSebelum').value) || 0;
    let sTmbh = parseFloat(document.getElementById('opSysTambah').value) || 0;
    let fisik = parseFloat(document.getElementById('opFisik').value) || 0;
    
    let sysTotal = sSblm + sTmbh;
    document.getElementById('opSysTotal').innerText = formatRp(sysTotal);
    
    let selisih = fisik - sSblm;
    
    let textSelisih = document.getElementById('opSelisihText');
    let badgeSelisih = document.getElementById('opSelisihBadge');
    
    textSelisih.innerText = formatRp(Math.abs(selisih));
    
    if (selisih > 0) {
        textSelisih.className = "fw-black mb-0 text-success";
        badgeSelisih.className = "badge bg-success rounded-pill mt-2 px-3";
        badgeSelisih.innerText = "Selisih LEBIH (Uang Sisa)";
    } else if (selisih < 0) {
        textSelisih.className = "fw-black mb-0 text-danger";
        badgeSelisih.className = "badge bg-danger rounded-pill mt-2 px-3";
        badgeSelisih.innerText = "Selisih KURANG (Uang Hilang)";
    } else {
        textSelisih.className = "fw-black mb-0 text-secondary";
        badgeSelisih.className = "badge bg-secondary rounded-pill mt-2 px-3";
        badgeSelisih.innerText = "Balance / Seimbang";
    }
}

function previewBAOpname() {
    let atmId = document.getElementById('opAtmId').value || ".......";
    let waktuInput = document.getElementById('opWaktu').value;
    
    if (!waktuInput) return PlayfulAlert.fire('Oops!', 'Isi waktu pelaksanaan dulu ya.', 'warning');
    
    let dateObj = new Date(waktuInput);
    let hariArr = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    let bulanArr = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    
    let sSblm = parseFloat(document.getElementById('opSysSebelum').value) || 0;
    let sTmbh = parseFloat(document.getElementById('opSysTambah').value) || 0;
    let fisik = parseFloat(document.getElementById('opFisik').value) || 0;
    let sysTotal = sSblm + sTmbh;
    let selisih = fisik - sSblm; 
    
    let kurang = selisih < 0 ? Math.abs(selisih) : 0;
    let lebih = selisih > 0 ? selisih : 0;

    let namaCabang = localStorage.getItem('cfgCabang') || 'Kantor Cabang Pembantu Babulu';
    let teller = localStorage.getItem('cfgTeller') || 'FISTRI ARIANDINI';
    let admin = localStorage.getItem('cfgAdmin') || 'SUCI AINUL FITRI';

    document.getElementById('cetakOp_cabang').innerText = namaCabang.toUpperCase();
    document.getElementById('cetakOp_cabang_text').innerText = namaCabang;
    document.getElementById('cetakOp_petugas1').innerText = `( ${teller} )`;
    document.getElementById('cetakOp_petugas2').innerText = `( ${admin} )`;

    document.getElementById('cetakHari').innerText = hariArr[dateObj.getDay()];
    document.getElementById('cetakTgl').innerText = `${dateObj.getDate()} ${bulanArr[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
    document.getElementById('cetakJam').innerText = dateObj.toTimeString().substring(0,5);
    document.getElementById('cetakAtm').innerText = atmId.toUpperCase();
    
    document.getElementById('cetakSysSebelum').innerText = formatNum(sSblm);
    document.getElementById('cetakSysTambah').innerText = formatNum(sTmbh);
    document.getElementById('cetakSysTotal').innerText = formatNum(sysTotal);
    document.getElementById('cetakFisik').innerText = formatNum(fisik);
    document.getElementById('cetakKurang').innerText = formatNum(kurang);
    document.getElementById('cetakLebih').innerText = formatNum(lebih);
    
    new bootstrap.Modal(document.getElementById('baOpnameModal')).show();
}

async function fetchOpnameHistory() {
    document.getElementById('tableBodyOpname').innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary mb-1"></div></td></tr>`;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getOpname' })});
        const result = await response.json();
        if(result.success) {
            globalOpnameData = result.data;
            renderOpnameTable();
        }
    } catch (err) { console.error(err); }
}

function renderOpnameTable() {
    const tbody = document.getElementById('tableBodyOpname');
    if (globalOpnameData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted small"><i class="bi bi-inbox fs-4 d-block mb-1"></i> Belum ada riwayat Opname.</td></tr>`;
        return;
    }
    
    let baUsageMap = new Map();
    if (globalSelisihData) {
        let selesaiData = globalSelisihData.filter(r => String(r[5]).toLowerCase() !== 'belum');
        selesaiData.forEach(r => {
            let reason = String(r[6] || '');
            let nominalTerpakai = parseFloat(r[3]) || 0;
            let atmTerpakai = String(r[1]).trim();
            let match = reason.match(/tanggal (\d{4}-\d{2}-\d{2})/);
            if (match) {
                let key = `${match[1]}_${atmTerpakai}`;
                baUsageMap.set(key, (baUsageMap.get(key) || 0) + nominalTerpakai);
            }
        });
    }
    
    let sortedData = [...globalOpnameData].sort((a,b) => new Date(String(b[1]).replace(' ', 'T')) - new Date(String(a[1]).replace(' ', 'T')));
    
    tbody.innerHTML = sortedData.map(row => {
        let tglBA_str = String(row[1]).substring(0,10);
        let atmBA = String(row[2]).trim();
        let selisihAsli = parseFloat(row[7]);
        
        let keyBA = `${tglBA_str}_${atmBA}`;
        let terpakai = baUsageMap.get(keyBA) || 0;
        let sisa = Math.abs(selisihAsli) - terpakai;
        let persenPakai = Math.abs(selisihAsli) === 0 ? 0 : (terpakai / Math.abs(selisihAsli)) * 100;
        
        let badgeClass = selisihAsli > 0 ? "bg-success" : (selisihAsli < 0 ? "bg-danger" : "bg-secondary");
        let badgeText = selisihAsli > 0 ? "LEBIH" : (selisihAsli < 0 ? "KURANG" : "BALANCE");
        
        let progressHtml = '';
        if (Math.abs(selisihAsli) > 0) {
            let statusTeks = sisa === 0 ? '<span class="text-success"><i class="bi bi-check-all"></i> Selesai (Tuntas)</span>' : `<span class="text-warning">Tersisa: ${formatRp(sisa)}</span>`;
            progressHtml = `
                <div class="mt-1" style="width: 130px;">
                    <div class="d-flex justify-content-between text-[0.6rem] mb-1 fw-bold text-muted" style="font-size:0.6rem">
                        <span>${statusTeks}</span>
                    </div>
                    <div class="progress" style="height: 4px;">
                        <div class="progress-bar ${sisa === 0 ? 'bg-success' : 'bg-warning'}" role="progressbar" style="width: ${persenPakai}%"></div>
                    </div>
                </div>`;
        } else {
            progressHtml = `<span class="text-muted" style="font-size:0.65rem">- Tidak ada selisih -</span>`;
        }
        
        let rowDataStr = encodeURIComponent(JSON.stringify(row));
        
        return `<tr>
            <td class="fw-medium text-secondary" style="font-size:0.75rem">${row[1].substring(0,16).replace('T', ' ')}</td>
            <td><span class="badge border border-secondary text-secondary rounded-pill">${atmBA}</span></td>
            <td><span class="badge ${badgeClass} rounded-pill shadow-sm" style="font-size:0.65rem">${badgeText} ${formatRp(Math.abs(selisihAsli))}</span></td>
            <td>${progressHtml}</td>
            <td>
                <button class="btn btn-sm btn-light text-primary rounded-circle border shadow-sm bouncy-hover me-1" onclick="editOpname('${rowDataStr}')" title="Edit"><i class="bi bi-pencil-fill"></i></button>
                <button class="btn btn-sm btn-light text-danger rounded-circle border shadow-sm bouncy-hover" onclick="deleteOpname('${row[0]}')" title="Hapus"><i class="bi bi-trash-fill"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function editOpname(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    document.getElementById('opEditId').value = row[0]; 
    document.getElementById('opWaktu').value = row[1]; 
    document.getElementById('opAtmId').value = row[2];
    document.getElementById('opSysSebelum').value = row[3];
    document.getElementById('opSysTambah').value = row[4];
    document.getElementById('opFisik').value = (parseFloat(row[3]) + parseFloat(row[7])); // reverse rumus: sSblm + selisih
    calcOpname();
    
    const tabInput = document.querySelector('[data-bs-target="#op-form-tab"]');
    if(tabInput) { const bsTab = new bootstrap.Tab(tabInput); bsTab.show(); }
    PlayfulAlert.fire({title: 'Mode Edit Aktif', icon: 'info', timer: 1500, showConfirmButton: false});
}

async function deleteOpname(id) {
    const confirm = await PlayfulAlert.fire({ title: 'Hapus Riwayat BA?', text: "Data tidak bisa dikembalikan.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Hapus!', cancelButtonText: 'Batal'});
    if(!confirm.isConfirmed) return;

    PlayfulAlert.fire({ title: 'Menghapus...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'deleteOpname', data: id }) });
        const result = await response.json();
        if(result.success) {
            PlayfulAlert.fire('Dihapus', 'Riwayat berhasil dibuang.', 'success');
            fetchOpnameHistory(); 
        }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

async function saveOpnameData() {
    let payload = {
        id: document.getElementById('opEditId').value, 
        atm: document.getElementById('opAtmId').value,
        waktu: document.getElementById('opWaktu').value,
        sysSebelum: document.getElementById('opSysSebelum').value,
        sysTambah: document.getElementById('opSysTambah').value,
        fisik: document.getElementById('opFisik').value
    };
    
    if(!payload.atm || !payload.waktu || !payload.fisik) {
        return PlayfulAlert.fire('Isian Kurang', 'Pastikan ID ATM, Waktu, dan Saldo Fisik terisi.', 'warning');
    }
    
    PlayfulAlert.fire({ title: 'Menyimpan Opname...', allowOutsideClick: false }); PlayfulAlert.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'uploadOpname', data: payload }) });
        const result = await response.json();
        if(result.success) {
            PlayfulAlert.fire('Berhasil!', 'Data Opname Fisik sukses tersimpan.', 'success');
            document.getElementById('opEditId').value = '';
            document.getElementById('opSysSebelum').value = '';
            document.getElementById('opSysTambah').value = '';
            document.getElementById('opFisik').value = '';
            calcOpname();
            fetchSelisihData();
        } else { PlayfulAlert.fire('Gagal', result.message, 'error'); }
    } catch (err) { PlayfulAlert.fire('Error', err.toString(), 'error'); }
}

document.getElementById('opAtmId').addEventListener('input', function() {
    let val = this.value.toUpperCase().replace(/\s/g, '');
    if (/^\d/.test(val) && val.length > 0) {
        this.value = 'KTM' + val;
    } else {
        this.value = val;
    }
});

