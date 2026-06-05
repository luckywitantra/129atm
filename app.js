const API_URL = 'https://script.google.com/macros/s/AKfycbwnLjfPZrOM21ln6-crxdnGebqHUQSXInpk6sa5kzxatf9vhUFsZakMFDyr-UxTCUM_/exec';

// ==========================================
// 1. UI ROUTER & NAVIGASI SUPER APP
// ==========================================
// Variabel penyimpan data sementara sebelum dikonfirmasi
let pendingUploadData = [];
let pendingUploadType = '';

function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.add('d-none'));
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('d-none');
    } else {
        console.error(`Halaman dengan ID '${pageId}' belum dibuat di HTML.`);
        return; 
    }

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
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-bs-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', newTheme);
});


// ==========================================
// 2. PARSER DATA (GL & EJ)
// ==========================================
function processGL() {
    const file = document.getElementById('glFile').files[0];
    if (!file) return Swal.fire('Error', 'Pilih file GL terlebih dahulu', 'error');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        const glData = [];
        
        const regex = /^\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})\s+.*?\s+(\w*(?:\d{4})KTM\d+)\s+([\d,]+(?:\.\d+)?)/;
        
        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const rawResi = match[2];
                const noResi = parseInt(rawResi.split('KTM')[0], 10).toString(); 
                const nominal = parseFloat(match[3].replace(/,/g, ''));
                const atm = "KTM" + rawResi.split('KTM')[1]; 
                
                const tglSplit = match[1].split(/[-/]/);
                const dd = tglSplit[0].padStart(2, '0');
                const mm = tglSplit[1].padStart(2, '0');
                const yyyy = tglSplit[2];
                
                const formatTgl = `${yyyy}-${mm}-${dd}`;

                glData.push([formatTgl, atm, noResi, nominal, 'TARIK TUNAI', rawResi]);
            }
        });
        
        // Menampilkan Preview GL, BUKAN langsung kirim
        showPreviewModal(glData, 'GL');
    };
    reader.readAsText(file);
}

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
        let lastValidAtmId = 'UNKNOWN_ATM'; 
        let lastValidDate = '';

        function saveCurrentTransaction() {
            if (currentTx.noResi) {
                if (!currentTx.tanggal) currentTx.tanggal = lastValidDate;

                if (currentTx.cashTaken) {
                    currentTx.status = "SUKSES";
                } else if (!currentTx.status) {
                    if (currentTx.jenis === "TARIK TUNAI" && (!currentTx.nominal || currentTx.nominal === 0)) {
                        currentTx.status = "GAGAL - TIDAK ADA UANG KELUAR";
                    } else {
                        currentTx.status = currentTx.nominal ? "SUKSES" : "NON-FINANSIAL";
                    }
                }
                
                if (!currentTx.nominal) currentTx.nominal = 0;
                
                let finalAtmId = currentTx.atm;
                if (!finalAtmId || /^\d+$/.test(finalAtmId)) finalAtmId = lastValidAtmId;
                
                ejData.push([currentTx.tanggal, finalAtmId, currentTx.noResi, currentTx.nominal, currentTx.status]);
            }
            currentTx = {};
            isLookingForJumlah = false;
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            if (line.includes("<- TRANSACTION END") || 
                line.includes("-> TRANSACTION START") || 
                line.includes("EMV AID ")) {
                if (currentTx.noResi) saveCurrentTransaction();
            }

            if (line.includes("CASH TAKEN")) {
                currentTx.cashTaken = true;
            }

            const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([A-Z0-9]+)/);
            if (dateMatch) {
                currentTx.tanggal = `20${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; 
                lastValidDate = currentTx.tanggal; 
                currentTx.atm = dateMatch[5];
                if (/[A-Z]/.test(currentTx.atm)) {
                    lastValidAtmId = currentTx.atm;
                }
            }

            const resiMatch = line.match(/(?:NO\s+RESI|NO\s+REF\.?|REFF\s+NO)\s*:?\s*(\d+)/i);
            if (resiMatch) currentTx.noResi = parseInt(resiMatch[1], 10).toString();
            
            const smartEmvMatch = line.match(/SMART EMV\s+(\d+)/);
            if (smartEmvMatch) currentTx.noResi = parseInt(smartEmvMatch[1], 10).toString();

            if (line.includes("PENARIKAN TUNAI") || line.includes("TARIK TUNAI") || line.includes("WITHDRAWAL") || line.includes("PENARIKAN TUNAI TANPA KARTU")) {
                currentTx.jenis = "TARIK TUNAI";
            } else if (line.includes("TRANSFER") || line.includes("PEMINDAH BUKUAN") || line.includes("KE BANK") || line.includes("REK TUJUAN")) {
                currentTx.jenis = "TRANSFER";
            }

            if ((line.includes("JUMLAH") || line.includes("AMOUNT")) && !line.includes("ENTERED")) {
                isLookingForJumlah = true;
                const inlineJumlah = line.match(/RP\.?\s*([\d,]+(?:\.\d+)?)/i);
                if (inlineJumlah) {
                    currentTx.nominal = parseFloat(inlineJumlah[1].replace(/,/g, ''));
                    isLookingForJumlah = false;
                }
            } else if (isLookingForJumlah) {
                if (!line.match(/^\d{2}:\d{2}:\d{2}/)) {
                    const nextLineJumlah = line.match(/^([\d,]+(?:\.\d+)?)/);
                    if (nextLineJumlah) {
                        currentTx.nominal = parseFloat(nextLineJumlah[1].replace(/,/g, ''));
                    }
                }
                isLookingForJumlah = false; 
            }

            if (line.includes("TRANSAKSI SUKSES") || line.includes("SUCCESSFUL")) {
                currentTx.status = (currentTx.jenis === "TRANSFER") ? "SUKSES (TRANSFER)" : "SUKSES";
            }

            const errorKeywords = [
                "SALDO KURANG", "SALAH MASUKKAN PIN", "KARTU ANDA SUDAH KADALUARSA", 
                "HIGH BILL MIX ERROR", "LOW BILL MIX ERROR", "DISPENSER ERROR", 
                "COMMUNICATION ERROR", "CDM ERROR", "KD.ARE/NO.TELP TDK TERDAFTA", 
                "RESTRICTED PHONE NUMBER", "MELEBIHI LIMIT", "INACTIVE ACCOUNT",
                "UNABLE TO PROCESS", "INVALID ZERO AMOUNT", "INVALID INSTITUTION",
                "RESPONSE CODE GAGAL", "CHIP CARD SECURITY FAILURE", 
                "PROCESSOR TEMP DOWN", "KARTU ANDA TERDAFTAR SBG"
            ];
            
            errorKeywords.forEach(err => {
                if (line.includes(err) && !currentTx.cashTaken) {
                    currentTx.status = "GAGAL - " + err;
                }
            });
            
            if (line.match(/TRANSACTION \d+ FAILED/) && !currentTx.cashTaken) {
                currentTx.status = "GAGAL - TRANSACTION FAILED";
            }
        }
        
        if (currentTx.noResi) saveCurrentTransaction();

        if (ejData.length === 0) return Swal.fire('Data Kosong', 'Tidak ditemukan transaksi pada file EJ ini.', 'warning');
        
        // Menampilkan Preview EJ, BUKAN langsung kirim
        showPreviewModal(ejData, 'EJ');
    };
    reader.readAsText(file);
}

// ==========================================
// 3. ENGINE PREVIEW DATA (POPUP)
// ==========================================
function showPreviewModal(data, type) {
    pendingUploadData = data;
    pendingUploadType = type === 'GL' ? 'uploadGL' : 'uploadEJ';
    
    document.getElementById('previewType').innerText = type;
    document.getElementById('previewCount').innerText = data.length.toLocaleString('id-ID');

    const thead = document.getElementById('previewTableHeader');
    const tbody = document.getElementById('previewTableBody');
    const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka);

    if (type === 'GL') {
        thead.innerHTML = `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Jenis</th><th>Referensi</th></tr>`;
    } else {
        thead.innerHTML = `<tr><th>Tanggal</th><th>ATM</th><th>Resi</th><th>Nominal</th><th>Status Transaksi</th></tr>`;
    }

    const renderLimit = 100;
    const rowsHtml = data.slice(0, renderLimit).map(row => {
        if (type === 'GL') {
            return `<tr>
                <td class="text-secondary fw-medium">${row[0]}</td>
                <td><span class="badge bg-secondary shadow-sm">${row[1]}</span></td>
                <td class="fw-bold">${row[2]}</td>
                <td class="text-primary fw-bold">${formatRp(row[3])}</td>
                <td><span class="badge bg-info text-dark border">${row[4]}</span></td>
                <td class="text-muted"><small>${row[5]}</small></td>
            </tr>`;
        } else {
            let statusBadge = '';
            if (row[4].includes('SUKSES')) {
                statusBadge = `<span class="badge bg-success-subtle text-success border border-success px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i> ${row[4]}</span>`;
            } else if (row[4].includes('GAGAL')) {
                statusBadge = `<span class="badge bg-danger-subtle text-danger border border-danger px-2 py-1"><i class="bi bi-x-circle-fill me-1"></i> ${row[4]}</span>`;
            } else {
                statusBadge = `<span class="badge bg-light text-secondary border px-2 py-1">${row[4]}</span>`;
            }

            return `<tr>
                <td class="text-secondary fw-medium">${row[0]}</td>
                <td><span class="badge bg-secondary shadow-sm">${row[1]}</span></td>
                <td class="fw-bold">${row[2]}</td>
                <td class="text-primary fw-bold">${formatRp(row[3])}</td>
                <td>${statusBadge}</td>
            </tr>`;
        }
    }).join('');
    
    let extraMsg = data.length > renderLimit 
        ? `<tr><td colspan="6" class="text-center text-muted fst-italic py-3 bg-light"><i class="bi bi-three-dots"></i> Menampilkan ${renderLimit} baris pertama dari total ${data.length.toLocaleString('id-ID')} baris...</td></tr>` 
        : '';
        
    tbody.innerHTML = rowsHtml + extraMsg;

    const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
    previewModal.show();
}

// Konfirmasi Upload dari Modal
document.getElementById('btnConfirmUpload').addEventListener('click', () => {
    const modalEl = document.getElementById('previewModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
    
    sendToBackend(pendingUploadType, pendingUploadData);
});

// ==========================================
// 4. KOMUNIKASI API & RENDER UI
// ==========================================
async function sendToBackend(action, data) {
    Swal.fire({ title: 'Menyinkronkan Data...', html: 'Sistem sedang menyeleksi <b>data baru</b> dan melewati duplikat.', allowOutsideClick: false });
    Swal.showLoading();
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: action, data: data }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } 
        });
        const result = await response.json();
        if(result.success) {
            Swal.fire('Berhasil!', `Dimasukkan: <b>${result.data.added}</b> data baru.<br>Dilewati (Duplikat): <b>${data.length - result.data.added}</b> data.`, 'success');
        } else {
            Swal.fire('Error Backend', result.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error Koneksi', err.toString(), 'error');
    }
}

async function triggerAnalysis() {
    Swal.fire({ title: 'Menganalisa Pintar...', text: 'Mencocokkan tanpa merusak status selisih lama Anda.', allowOutsideClick: false });
    Swal.showLoading();
    
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'analyze' }) });
        const result = await response.json();
        if(result.success) {
            Swal.fire('Analisa Selesai', `Selisih Lebih: ${result.data.selisihLebih} | Selisih Kurang: ${result.data.selisihKurang}`, 'success');
            renderSelisihTables(result.data.tableData); 
        } else {
            Swal.fire('Gagal', result.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Gagal memproses analisa', 'error');
    }
}

async function fetchSelisihData() {
    document.getElementById('tableBodyLebih').innerHTML = `<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><br><span class="text-muted mt-2 d-block">Memuat Data Database...</span></td></tr>`;
    document.getElementById('tableBodyKurang').innerHTML = `<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><br><span class="text-muted mt-2 d-block">Memuat Data Database...</span></td></tr>`;
    
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getSelisih' })});
        const result = await response.json();
        if(result.success) {
            renderSelisihTables(result.data);
        }
    } catch (err) { 
        console.error("Gagal mengambil data awal:", err); 
    }
}

function renderSelisihTables(dataArray) {
    if (!dataArray || !Array.isArray(dataArray)) {
        console.error("Data tidak valid:", dataArray);
        return;
    }

    const lebihArr = dataArray.filter(row => row[4] === 'SELISIH LEBIH');
    const kurangArr = dataArray.filter(row => row[4] === 'SELISIH KURANG');
    
    document.getElementById('countLebih').innerText = lebihArr.length;
    document.getElementById('countKurang').innerText = kurangArr.length;

    const formatRp = (angka) => (angka ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka) : "Rp 0");
    
    const formatStatus = (status) => {
        if(!status) return '-';
        if(status.toLowerCase() === 'belum') {
            return `<span class="badge rounded-pill bg-danger-subtle text-danger border border-danger">Belum Selesai</span>`;
        }
        return `<span class="badge rounded-pill bg-success-subtle text-success border border-success">${status}</span>`;
    };

    const renderRows = (arr) => {
        if(arr.length === 0) {
            return `<tr><td colspan="6" class="text-center py-5 text-muted"><i class="bi bi-check-circle-fill fs-1 text-success d-block mb-2"></i> Hebat! Tidak ada data selisih di kategori ini.</td></tr>`;
        }
        return arr.map(row => `
            <tr>
                <td class="fw-medium text-secondary">${String(row[0] || '').substring(0,10)}</td>
                <td><span class="badge bg-secondary shadow-sm">${row[1] || '-'}</span></td>
                <td class="fw-bold fs-6">${row[2] || '-'}</td>
                <td class="text-primary fw-bold">${formatRp(row[3])}</td>
                <td><small class="text-muted d-block" style="max-width:250px; white-space: normal;">${row[6] || '-'}</small></td>
                <td>${formatStatus(row[5])}</td>
            </tr>
        `).join('');
    };

    document.getElementById('tableBodyLebih').innerHTML = renderRows(lebihArr);
    document.getElementById('tableBodyKurang').innerHTML = renderRows(kurangArr);
}
