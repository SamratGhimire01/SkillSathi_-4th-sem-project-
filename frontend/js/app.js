// app.js
// Append to the top level framework context of frontend/js/app.js

// Ensure the container target element exists dynamically globally
if (!document.getElementById('global-toast-container')) {
    const container = document.createElement('div');
    container.id = 'global-toast-container';
    document.body.appendChild(container);
}

window.showNotification = function(title, description, type = 'success') {
    const container = document.getElementById('global-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `enterprise-toast toast-${type}`;
    
    // Choose icon graphic based on transaction context properties
    let iconClass = 'fas fa-info-circle';
    if (type === 'success') iconClass = 'fas fa-check-circle';
    if (type === 'error') iconClass = 'fas fa-exclamation-triangle';
    if (type === 'warning') iconClass = 'fas fa-exclamation-circle';

    toast.innerHTML = `
        <div class="enterprise-toast-icon"><i class="${iconClass}"></i></div>
        <div class="enterprise-toast-content">
            <h4 class="enterprise-toast-title">${title}</h4>
            <p class="enterprise-toast-desc">${description}</p>
        </div>
    `;

    container.appendChild(toast);

    // Dynamic frame trigger layout reflow delays
    setTimeout(() => toast.classList.add('active'), 50);

    // Automated resource management cleanup loops
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
};

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

// ============================================================
// ── Notifications ─────────────────────────────────────────────
// ============================================================

const API_BASE_URL = "http://127.0.0.1:8000";
// Token variable removed to support native session cookie passing mapping
async function loadNotifications() {
    if (localStorage.getItem('is_logged_in') !== 'true') return;
    try {
        const res = await fetch(`${API_BASE_URL}/notifications/`, {
            credentials: 'include'
        });
        if (!res.ok) return;
        const notifs = await res.json();

        const badge = document.getElementById('notifBadge');
        const list  = document.getElementById('notifList');
        if (!badge || !list) return;

        const unread = notifs.filter(n => !n.is_read).length;
        if (unread > 0) {
            badge.textContent = unread > 9 ? '9+' : unread;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }

        if (notifs.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:#9CA3AF; padding:20px;">No notifications yet.</p>';
            return;
        }

        const typeColors = {
            'cert_submitted': '#3B82F6',
            'cert_approved':  '#10B981',
            'cert_rejected':  '#EF4444',
            'cert_expiring':  '#F59E0B',
            'issue_reported': '#8B5CF6',
            'issue_resolved': '#10B981',
            'worker_created': '#3B82F6',
        };

        list.innerHTML = notifs.map(n => `
            <div onclick="readNotif(${n.id}, '${n.link || ''}')"
                 style="padding:12px 20px; cursor:pointer; border-bottom:1px solid #F9FAFB;
                        background:${n.is_read ? 'white' : '#EFF6FF'};
                        transition:background 0.2s;">
                <div style="display:flex; gap:12px; align-items:flex-start;">
                    <div style="width:8px; height:8px; border-radius:50%; margin-top:6px; flex-shrink:0;
                                background:${typeColors[n.type] || '#6B7280'};"></div>
                    <div>
                        <p style="font-weight:600; font-size:0.9rem; color:#1F2937; margin:0;">${n.title}</p>
                        <p style="font-size:0.82rem; color:#6B7280; margin:4px 0 0;">${n.message}</p>
                        <span style="font-size:0.75rem; color:#9CA3AF;">${new Date(n.created_at).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (e) { console.error(e); }
}

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) loadNotifications();
}

async function markAllRead() {
    await fetch(`${API_BASE_URL}/notifications/mark-all-read`, {
        method: 'PUT',
        credentials: 'include'
    });
    loadNotifications();
}

async function readNotif(id, link) {
    await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'PUT',
        credentials: 'include'
    });
    if (link) window.location.href = link;
    else loadNotifications();
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const bell  = document.getElementById('notifBell');
    if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
    }
});

// Load unread count on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNotifications);
} else {
    loadNotifications();
}

// Poll every 60 seconds
setInterval(loadNotifications, 60000);