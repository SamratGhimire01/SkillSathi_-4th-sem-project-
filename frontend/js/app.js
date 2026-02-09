document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    console.log("App.js loaded");

    // --- 1. Public Stats Logic ---
    async function loadPublicStats() {
        const certEl = document.getElementById('pubCertCount');
        if (!certEl) return;
        try {
            const res = await fetch(`${API_BASE_URL}/verification/public-stats`);
            const data = await res.json();
            animateValue(certEl, 0, data.certificates, 2000);
            document.getElementById('pubCenterCount').innerHTML = data.centers + "+";
            document.getElementById('pubWorkerCount').innerHTML = data.workers + "+";
        } catch (err) { console.error("Stats error:", err); }
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) window.requestAnimationFrame(step);
            else obj.innerHTML = end + "+";
        };
        window.requestAnimationFrame(step);
    }
    loadPublicStats();

    // --- 2. Manual Search Logic ---
    const verifyForm = document.getElementById('verificationForm');
    if (verifyForm) {
        verifyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('certIdInput').value.trim();
            if(id) window.location.href = `verify.html?id=${id}`;
            else alert("Please enter a Certificate ID");
        });
    }

    // ============================================================
    // 📷 QR SCANNER LOGIC (Robust Version)
    // ============================================================
    
    const scanBtn = document.getElementById('scanQrBtn');
    const scanModal = document.getElementById('qrScanModal');
    const closeScanBtn = document.getElementById('closeScanModal');
    
    const selectionView = document.getElementById('scanSelectionView');
    const cameraView = document.getElementById('cameraView');
    
    const startCameraBtn = document.getElementById('startCameraBtn');
    const stopCameraBtn = document.getElementById('stopCameraBtn');
    const fileInput = document.getElementById('qrInputFile');
    const statusText = document.getElementById('scanStatus');
    
    let html5QrCode = null;

    // Helper: Redirect on Success
    const onScanSuccess = (decodedText) => {
        console.log("Scan success:", decodedText);
        stopCameraAndReset().then(() => {
            let certId = decodedText;
            try {
                const url = new URL(decodedText);
                const idParam = url.searchParams.get("id");
                if (idParam) certId = idParam;
            } catch (e) {}
            
            window.location.href = `verify.html?id=${certId}`;
        });
    };

    // Helper: Reset Modal
    const resetModal = () => {
        selectionView.style.display = 'block';
        cameraView.style.display = 'none';
        if (fileInput) fileInput.value = '';
        statusText.textContent = "Ready";
    };

    // Helper: Stop Camera
    const stopCameraAndReset = async () => {
        if (html5QrCode && html5QrCode.isScanning) {
            try {
                await html5QrCode.stop();
                html5QrCode.clear();
            } catch (err) { console.warn("Camera stop warning:", err); }
        }
        resetModal();
    };

    // 1. OPEN MODAL
    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            console.log("Open QR Modal clicked");
            resetModal();
            scanModal.style.display = 'flex';
        });
    } else {
        console.error("Scan Button (scanQrBtn) not found in HTML!");
    }

    // 2. START CAMERA
    if (startCameraBtn) {
        startCameraBtn.addEventListener('click', () => {
            // Check if library loaded
            if (typeof Html5Qrcode === 'undefined') {
                alert("QR Library not loaded. Please refresh the page.");
                return;
            }

            selectionView.style.display = 'none';
            cameraView.style.display = 'block';
            statusText.textContent = "Requesting camera...";

            html5QrCode = new Html5Qrcode("reader");
            
            html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 10, qrbox: { width: 250, height: 250 } },
                onScanSuccess
            ).catch(err => {
                console.error(err);
                statusText.textContent = "Camera Error: " + err;
                alert("Could not start camera. Please check permissions or use 'Upload Image'.");
                stopCameraAndReset();
            });
        });
    }

    // 3. STOP CAMERA
    if (stopCameraBtn) {
        stopCameraBtn.addEventListener('click', () => {
            stopCameraAndReset();
        });
    }

    // 4. UPLOAD IMAGE
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length === 0) return;
            const imageFile = e.target.files[0];

            if (typeof Html5Qrcode === 'undefined') {
                alert("QR Library not loaded.");
                return;
            }

            // We create a fresh instance just for file scanning
            const fileScanner = new Html5Qrcode("reader");

            try {
                const decodedText = await fileScanner.scanFile(imageFile, true);
                onScanSuccess(decodedText);
            } catch (err) {
                console.error("File scan error:", err);
                alert("Could not read QR code. Please try a clearer image.");
                fileInput.value = ''; 
            }
        });
    }

    // 5. CLOSE MODAL (X Button)
    if (closeScanBtn) {
        closeScanBtn.addEventListener('click', () => {
            stopCameraAndReset();
            scanModal.style.display = 'none';
        });
    }
});