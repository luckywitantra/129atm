const API_URL = 'https://script.google.com/macros/s/AKfycbwnLjfPZrOM21ln6-crxdnGebqHUQSXInpk6sa5kzxatf9vhUFsZakMFDyr-UxTCUM_/exec';

// ==========================================
// 1. UI ROUTER & NAVIGASI
// ==========================================
let pendingUploadData = [];
let pendingUploadType = '';
let databaseData = { gl: [], ej: [], selisih: [] }; // Memori Data Master

function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.add('d-none'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.remove('d-none');

    document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => {
        el.classList.remove('active-bottom');
        el.classList.add('text-secondary');
    });

    if (event && event.currentTarget) {
        if(event.currentTarget.classList.contains('nav-link')) {
            event.currentTarget.classList.add('active'); 
        } else {
            event.currentTarget.classList.add('active-bottom'); 
            event.currentTarget.classList.remove('text-secondary');
        }
    }

    if(pageId === 'analisa') fetchSelisihData();
    if(pageId === 'datamaster') fetchDatabaseData(); // Trigger Load Data Master
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    html.setAttribute('data-bs-theme', html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
});

// ==========================================
// 2. PARSER DATA (GL & EJ) & PREVIEW
// ==========================================
// [Gunakan Fungsi processGL() dan processEJ() versi terakhir Anda di sini tanpa ubahan]
// -- KARENA KODE PARSER SUDAH SEMPURNA, SAYA SINGKAT BAGIAN INI AGAR FOKUS KE FITUR BARU --

function processGL() {
    const file = document.getElementById('glFile').files[0];
    if (!file) return Swal.fire('Error', 'Pilih file GL', 'error');
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
    if (!file) return Swal.fire('Error', 'Pilih file EJ', 'error');
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
        if (ejData.length === 0) return Swal.fire('Data Kosong', 'Tidak ditemukan transaksi pada file EJ ini.', 'warning');
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
    const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka);

    thead.innerHTML = type === 'GL' 
        ? `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Jenis</th><th>Referensi</th></tr>`
        : `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Status Transaksi</th></tr>`;

    const renderLimit = 100;
    const rowsHtml = data.slice(0, renderLimit).map(row => {
        if (type === 'GL') {
            return `<tr><td class="text-secondary fw-medium">${row[0]}</td><td><span class="badge bg-secondary">${row[1]}</span></td><td class="fw-bold">${row[2]}</td><td class="text-primary fw-bold">${formatRp(row[3])}</td><td><span class="badge bg-info text-dark border">${row[4]}</span></td><td class="text-muted"><small>${row[5]}</small></td></tr>`;
        } else {
            let badge = row[4].includes('SUKSES') ? `bg-success-subtle text-success border border-success` : row[4].includes('GAGAL') ? `bg-danger-subtle text-danger border border-danger` : `bg-light text-secondary border`;
            return `<tr><td class="text-secondary fw-medium">${row[0]}</td><td><span class="badge bg-secondary">${row[1]}</span></td><td class="fw-bold">${row[2]}</td><td class="text-primary fw-bold">${formatRp(row[3])}</td><td><span class="badge px-2 py-1 ${badge}">${row[4]}</span></td></tr>`;
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
// 4. API & ANALISA SELISIH (DILENGKAPI FILTER & PENYELESAIAN)
// ==========================================
let globalSelisihData = []; 
let activeResolveRow = null;

async function sendToBackend(action, data) {
    Swal.fire({ title: 'Menyinkronkan Data...', allowOutsideClick: false }); Swal.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: action, data: data }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await response.json();
        if(result.success) Swal.fire('Berhasil!', `Dimasukkan: <b>${result.data.added}</b> data baru.<br>Dilewati (Duplikat): <b>${data.length - result.data.added}</b> data.`, 'success');
        else Swal.fire('Error Backend', result.message, 'error');
    } catch (err) { Swal.fire('Error', err.toString(), 'error'); }
}

async function triggerAnalysis() {
    Swal.fire({ title: 'Menganalisa Pintar...', allowOutsideClick: false }); Swal.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'analyze' }) });
        const result = await response.json();
        if(result.success) {
            Swal.fire('Analisa Selesai', `Perhitungan terbaru berhasil dimuat.`, 'success');
            globalSelisihData = result.data.tableData;
            renderSelisihTablesFiltered(); 
        } else Swal.fire('Gagal', result.message, 'error');
    } catch (err) { Swal.fire('Error', err.toString(), 'error'); }
}

async function fetchSelisihData() {
    document.getElementById('tableBodyLebih').innerHTML = `<tr><td colspan="6" class="text-center py-5">Memuat Data...</td></tr>`;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getSelisih' })});
        const result = await response.json();
        if(result.success) {
            globalSelisihData = result.data;
            renderSelisihTablesFiltered();
        }
    } catch (err) { console.error(err); }
}

const formatRp = (angka) => (angka ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka) : "Rp 0");

function renderSelisihTablesFiltered() {
    if (!globalSelisihData) return;
    
    // Ambil Nilai Filter
    const fResi = document.getElementById('filterResiAn').value.toLowerCase();
    const fAtm = document.getElementById('filterAtmAn').value.toLowerCase();
    const fNom = document.getElementById('filterNominalAn').value;
    const sortDate = document.getElementById('sortDateAn').value;

    // Filter Data
    let filteredData = globalSelisihData.filter(row => {
        let match = true;
        if(fResi) match = match && String(row[2]).toLowerCase().includes(fResi);
        if(fAtm) match = match && String(row[1]).toLowerCase().includes(fAtm);
        if(fNom) match = match && String(row[3]) === fNom;
        return match;
    });

    // Sort Tanggal
    filteredData.sort((a, b) => sortDate === 'desc' ? new Date(b[0]) - new Date(a[0]) : new Date(a[0]) - new Date(b[0]));

    // Pisahkan Data (Belum Selesai Lebih, Belum Selesai Kurang, Sudah Selesai)
    const lebihArr = filteredData.filter(row => row[4] === 'SELISIH LEBIH' && String(row[5]).toLowerCase() === 'belum');
    const kurangArr = filteredData.filter(row => row[4] === 'SELISIH KURANG' && String(row[5]).toLowerCase() === 'belum');
    const selesaiArr = filteredData.filter(row => String(row[5]).toLowerCase() !== 'belum');

    // Hitung Akumulasi Total
    const totLebih = lebihArr.reduce((sum, row) => sum + parseFloat(row[3]), 0);
    const totKurang = kurangArr.reduce((sum, row) => sum + parseFloat(row[3]), 0);
    document.getElementById('totalLebihRp').innerText = formatRp(totLebih);
    document.getElementById('totalKurangRp').innerText = formatRp(totKurang);

    document.getElementById('countLebih').innerText = lebihArr.length;
    document.getElementById('countKurang').innerText = kurangArr.length;

    // Render Function
    const renderTable = (arr, type) => {
        if(arr.length === 0) return `<tr><td colspan="6" class="text-center py-5 text-muted">Data bersih atau tidak ditemukan.</td></tr>`;
        return arr.map(row => {
            const tgl = String(row[0] || '').substring(0,10);
            const rawStr = encodeURIComponent(JSON.stringify(row));
            
            let actionBtn = "";
            if (type === 'belum') {
                actionBtn = `<button class="btn btn-sm btn-success rounded-pill fw-bold" onclick="openResolveModal('${rawStr}')"><i class="bi bi-check2-circle"></i> Selesaikan</button>`;
            } else {
                actionBtn = `<button class="btn btn-sm btn-outline-danger rounded-pill fw-bold" onclick="revertSelisih('${rawStr}')"><i class="bi bi-arrow-counterclockwise"></i> Batalkan Selesai</button>
                             <button class="btn btn-sm btn-outline-dark rounded-pill" onclick="generateBA('${rawStr}')"><i class="bi bi-printer"></i> B/A</button>`;
            }

            return `<tr class="align-middle">
                <td class="fw-medium text-secondary">${tgl}</td>
                <td><span class="badge bg-secondary shadow-sm">${row[1]}</span></td>
                <td class="fw-bold fs-6">${row[2]}</td>
                <td class="text-primary fw-bold">${formatRp(row[3])}</td>
                <td><small class="text-muted d-block text-truncate" style="max-width:200px;" title="${row[6]}">${row[6]}</small></td>
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
function openResolveModal(rawStr) {
    activeResolveRow = JSON.parse(decodeURIComponent(rawStr));
    document.getElementById('resolveIdText').innerText = `Resi ${activeResolveRow[2]} (Rp ${activeResolveRow[3].toLocaleString()})`;
    document.getElementById('resolveReason').value = activeResolveRow[6]; // Isi dgn keterangan lama jika ada
    new bootstrap.Modal(document.getElementById('resolveModal')).show();
}

async function submitResolve() {
    const reason = document.getElementById('resolveReason').value.trim();
    if(!reason) return Swal.fire('Peringatan', 'Harap isi alasan / tindakan penyelesaian!', 'warning');
    
    // Tutup Modal
    bootstrap.Modal.getInstance(document.getElementById('resolveModal')).hide();
    
    // Siapkan Payload ke Backend
    const tgl = String(activeResolveRow[0]).substring(0,10);
    const payload = { tanggal: tgl, atm: activeResolveRow[1], resi: activeResolveRow[2], status: 'Selesai', keterangan: reason };
    
    Swal.fire({ title: 'Memperbarui Status...', allowOutsideClick: false }); Swal.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateSelisih', data: payload }) });
        const result = await response.json();
        if(result.success) {
            Swal.close();
            activeResolveRow[5] = 'Selesai'; activeResolveRow[6] = reason; // Update lokal memori
            renderSelisihTablesFiltered(); // Render ulang UI
            generateBA(encodeURIComponent(JSON.stringify(activeResolveRow))); // Langsung buka preview B/A
        } else { Swal.fire('Gagal', 'Gagal update ke database', 'error'); }
    } catch (err) { Swal.fire('Error', err.toString(), 'error'); }
}

async function revertSelisih(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    const confirm = await Swal.fire({ title: 'Batalkan Selesai?', text: "Data akan dikembalikan ke status Belum Selesai.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Kembalikan!'});
    if(!confirm.isConfirmed) return;

    const tgl = String(row[0]).substring(0,10);
    const payload = { tanggal: tgl, atm: row[1], resi: row[2], status: 'Belum', keterangan: row[6] };
    
    Swal.fire({ title: 'Mengembalikan...', allowOutsideClick: false }); Swal.showLoading();
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateSelisih', data: payload }) });
        const result = await response.json();
        if(result.success) {
            Swal.fire('Berhasil', 'Data dikembalikan ke tabel awal.', 'success');
            fetchSelisihData(); // Muat ulang total
        }
    } catch (err) { Swal.fire('Error', err.toString(), 'error'); }
}

function generateBA(rawStr) {
    const row = JSON.parse(decodeURIComponent(rawStr));
    const tgl = String(row[0]).substring(0,10);
    document.getElementById('baTglCetak').innerText = new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'});
    document.getElementById('baTanggal').innerText = tgl;
    document.getElementById('baAtm').innerText = row[1];
    document.getElementById('baResi').innerText = row[2];
    document.getElementById('baNominal').innerText = formatRp(row[3]);
    document.getElementById('baJenis').innerText = row[4];
    document.getElementById('baKeterangan').innerText = row[6]; // Alasan penyelesaian
    
    new bootstrap.Modal(document.getElementById('beritaAcaraModal')).show();
}

// ==========================================
// 6. ENGINE DATA MASTER (PREVIEW GL & EJ)
// ==========================================
let databaseData = { gl: [], ej: [], selisih: [] }; 

async function fetchDatabaseData() {
    document.getElementById('tableBodyDataMaster').innerHTML = `<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-primary"></div><br><span class="text-muted">Mengunduh...</span></td></tr>`;
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getDatabase' })});
        const result = await response.json();
        if(result.success) { databaseData = result.data; renderDataMaster(); }
    } catch (err) { console.error(err); }
}

function renderDataMaster() {
    const fStart = document.getElementById('filterStart').value;
    const fResi = document.getElementById('filterResiDm').value.toLowerCase();
    const fAtm = document.getElementById('filterAtmDm').value.toLowerCase();
    const fNom = document.getElementById('filterNominalDm').value;
    const fStatus = document.getElementById('filterStatus').value;

    const selisihKeys = new Set();
    databaseData.selisih.forEach(row => { selisihKeys.add(`${String(row[0]).substring(0,10)}_${String(row[1]).trim()}_${String(row[2]).trim()}`); });

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
    if (filteredData.length === 0) return tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted">Tidak ada data yang cocok dengan filter.</td></tr>`;

    tbody.innerHTML = filteredData.slice(0, 500).map(item => {
        const badgeSumber = item.sumber === 'GL' ? `<span class="badge bg-primary px-3">Data GL</span>` : `<span class="badge bg-success px-3">Data EJ</span>`;
        const warnIcon = item.isSelisih ? `<i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>` : ``;
        return `<tr class="${item.isSelisih ? 'row-selisih' : 'row-aman'}">
            <td>${badgeSumber}</td>
            <td class="fw-medium text-secondary">${item.tanggal}</td>
            <td class="fw-bold">${item.atm}</td>
            <td class="fw-bold">${warnIcon}${item.resi}</td>
            <td class="text-primary fw-bold">${formatRp(item.nominal)}</td>
            <td class="text-muted small">${item.ket}</td>
        </tr>`;
    }).join('');
}

// ==========================================
// 5. ENGINE POPUP DETAIL SELISIH
// ==========================================
function showDetailPopup(rowDataStr) {
    const row = JSON.parse(decodeURIComponent(rowDataStr));
    // Data Format: [Tanggal, ATM, Resi, Nominal, Jenis(Lebih/Kurang), Status, Keterangan]

    // Set Data
    document.getElementById('detailTanggal').innerText = String(row[0]).substring(0,10);
    document.getElementById('detailAtm').innerText = row[1];
    document.getElementById('detailResi').innerText = row[2];
    document.getElementById('detailNominal').innerText = formatRp(row[3]);
    document.getElementById('detailKeterangan').innerText = row[6];
    
    // Set Gaya Berdasarkan Jenis Selisih
    const badge = document.getElementById('detailJenisBadge');
    const header = document.getElementById('detailModalHeader');
    const saran = document.getElementById('detailSaran');

    if (row[4] === 'SELISIH LEBIH') {
        badge.innerHTML = '<i class="bi bi-arrow-up-circle-fill"></i> SELISIH LEBIH (Uang Mesin Berlebih)';
        badge.className = 'badge rounded-pill fs-6 px-4 py-2 shadow-sm mb-2 bg-success text-white';
        header.style.background = 'linear-gradient(135deg, #198754 0%, #0f5132 100%)';
        
        saran.innerHTML = `Sistem GL merekam transaksi terpotong, namun jurnal EJ mesin <b>GAGAL</b>. <br><b>Tindakan:</b> Pastikan saldo nasabah telah dikembalikan (Kredit) atau mesin memang mengalami kendala *Dispenser*.`;
    } else {
        badge.innerHTML = '<i class="bi bi-arrow-down-circle-fill"></i> SELISIH KURANG (Uang Mesin Hilang)';
        badge.className = 'badge rounded-pill fs-6 px-4 py-2 shadow-sm mb-2 bg-danger text-white';
        header.style.background = 'linear-gradient(135deg, #dc3545 0%, #842029 100%)';
        
        saran.innerHTML = `Mesin sukses mengeluarkan uang fisik, namun transaksi <b>TIDAK TERCATAT</b> di pembukuan GL bank. <br><b>Tindakan:</b> Lakukan pengecekan jurnal suspense (rek. gantung) atau segera lakukan pendebetan manual ke rekening nasabah terkait.`;
    }

    new bootstrap.Modal(document.getElementById('detailSelisihModal')).show();
}

// ==========================================
// 6. ENGINE DATA MASTER (PREVIEW GL & EJ)
// ==========================================
async function fetchDatabaseData() {
    document.getElementById('tableBodyDataMaster').innerHTML = `<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-primary"></div><br><span class="text-muted mt-2 d-block">Mengunduh Database...</span></td></tr>`;
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
    const filterStart = document.getElementById('filterStart').value;
    const filterEnd = document.getElementById('filterEnd').value;
    const filterSumber = document.getElementById('filterSumber').value;
    const filterStatus = document.getElementById('filterStatus').value;

    // Buat Set Kunci Selisih untuk penandaan cepat
    const selisihKeys = new Set();
    databaseData.selisih.forEach(row => {
        selisihKeys.add(`${String(row[0]).substring(0,10)}_${String(row[1]).trim()}_${String(row[2]).trim()}`);
    });

    let combinedData = [];

    // Gabungkan GL
    if (filterSumber === 'SEMUA' || filterSumber === 'GL') {
        databaseData.gl.forEach(row => {
            const tgl = String(row[1]).substring(0,10);
            const isSelisih = selisihKeys.has(`${tgl}_${String(row[2]).trim()}_${String(row[3]).trim()}`);
            combinedData.push({
                sumber: 'GL', tanggal: tgl, atm: row[2], resi: row[3], nominal: row[4], ket: `${row[5]} / Ref: ${row[6]}`, isSelisih: isSelisih
            });
        });
    }
    // Gabungkan EJ
    if (filterSumber === 'SEMUA' || filterSumber === 'EJ') {
        databaseData.ej.forEach(row => {
            const tgl = String(row[1]).substring(0,10);
            const isSelisih = selisihKeys.has(`${tgl}_${String(row[2]).trim()}_${String(row[3]).trim()}`);
            combinedData.push({
                sumber: 'EJ', tanggal: tgl, atm: row[2], resi: row[3], nominal: row[4], ket: `Status: ${row[5]}`, isSelisih: isSelisih
            });
        });
    }

    // Terapkan Filter Tanggal & Status
    let filteredData = combinedData.filter(item => {
        let passDate = true; let passStatus = true;
        if (filterStart) passDate = passDate && (item.tanggal >= filterStart);
        if (filterEnd) passDate = passDate && (item.tanggal <= filterEnd);
        if (filterStatus === 'SELISIH') passStatus = item.isSelisih === true;
        if (filterStatus === 'AMAN') passStatus = item.isSelisih === false;
        return passDate && passStatus;
    });

    // Urutkan (Paling baru di atas)
    filteredData.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

    // Render HTML
    const tbody = document.getElementById('tableBodyDataMaster');
    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted">Tidak ada data yang cocok dengan filter.</td></tr>`;
        return;
    }

    // Limit tampilan agar tidak lag (Max 500 baris)
    const limitData = filteredData.slice(0, 500);
    
    tbody.innerHTML = limitData.map(item => {
        const badgeSumber = item.sumber === 'GL' ? `<span class="badge bg-primary px-3 rounded-pill">Data GL</span>` : `<span class="badge bg-success px-3 rounded-pill">Data EJ</span>`;
        const rowClass = item.isSelisih ? 'row-selisih' : 'row-aman';
        const warnIcon = item.isSelisih ? `<i class="bi bi-exclamation-triangle-fill text-danger me-2" title="Data ini mengalami selisih!"></i>` : ``;

        return `<tr class="${rowClass}">
            <td>${badgeSumber}</td>
            <td class="fw-medium text-secondary">${item.tanggal}</td>
            <td class="fw-bold text-dark">${item.atm}</td>
            <td class="fw-bold">${warnIcon}${item.resi}</td>
            <td class="text-primary fw-bold">${formatRp(item.nominal)}</td>
            <td class="text-muted small text-truncate" style="max-width:200px;">${item.ket}</td>
        </tr>`;
    }).join('');
}
