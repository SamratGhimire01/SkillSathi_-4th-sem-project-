// Add this function to the TOP of the JS file (Outside DOMContentLoaded)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('accessToken');
        sessionStorage.removeItem('accessToken'); // Clear both
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const token = localStorage.getItem('accessToken');
    if (!token) { window.location.href = 'login.html'; return; }

    const fetchAPI = async (endpoint, options = {}) => {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: { 'Authorization': `Bearer ${token}`, ...options.headers }
        });
        return res;
    };

    // --- 1. Load Settings (Profile + Notifications + Images) ---
    async function loadSettings() {
        // A. Load Profile
        try {
            const res = await fetchAPI('/companies/me');
            if(res.ok) {
                const u = await res.json();
                if(document.getElementById('profileName')) document.getElementById('profileName').value = u.name;
                if(document.getElementById('profileEmail')) document.getElementById('profileEmail').value = u.email;
                if(document.getElementById('profilePhone')) document.getElementById('profilePhone').value = u.phone_number || "";
                
                // Sidebar
                if(document.getElementById('userName')) document.getElementById('userName').textContent = u.name;
                if(document.getElementById('userInitial')) document.getElementById('userInitial').textContent = u.name.charAt(0).toUpperCase();
            }
        } catch(e) {}

        // B. Load Notifications
        if(document.getElementById('notifyIssued')) {
            try {
                const res = await fetchAPI('/companies/me/notifications');
                if(res.ok) {
                    const data = await res.json();
                    document.getElementById('notifyIssued').checked = data.notify_issued;
                    document.getElementById('notifySummary').checked = data.notify_summary;
                    document.getElementById('notifySecurity').checked = data.notify_security;
                }
            } catch(e) {}
        }

        // C. Load Branding Images (Preview)
        loadImagePreview('logo', 'logoPreview', 'logoBox');
        loadImagePreview('signature', 'sigPreview', 'sigBox');
    }

    // Helper to load image from backend
    async function loadImagePreview(type, imgId, boxId) {
        try {
            const res = await fetch(`${API_BASE_URL}/companies/me/branding/${type}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if(res.ok) {
                const blob = await res.blob();
                if (blob.size > 0) {
                    const url = URL.createObjectURL(blob);
                    document.getElementById(imgId).src = url;
                    document.getElementById(boxId).classList.add('has-image');
                }
            }
        } catch(e) { console.error("Image load err", e); }
    }

    // --- 2. Save Notifications ---
    const saveNotifyBtn = document.getElementById('saveNotifyBtn');
    if(saveNotifyBtn) {
        saveNotifyBtn.addEventListener('click', async () => {
            const data = {
                notify_issued: document.getElementById('notifyIssued').checked,
                notify_summary: document.getElementById('notifySummary').checked,
                notify_security: document.getElementById('notifySecurity').checked
            };
            await fetchAPI('/companies/me/notifications', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            alert("Preferences Saved!");
        });
    }

    // --- 3. Save Branding ---
    const brandingForm = document.getElementById('brandingForm');
    if(brandingForm) {
        brandingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            const logo = document.getElementById('companyLogo').files[0];
            const sig = document.getElementById('companySignature').files[0];

            if (logo) formData.append('logo', logo);
            if (sig) formData.append('signature', sig);

            if(!logo && !sig) return alert("Select a new file to update.");

            const btn = brandingForm.querySelector('button');
            btn.textContent = "Uploading..."; btn.disabled = true;

            const res = await fetch(`${API_BASE_URL}/companies/me/branding`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            
            if(res.ok) alert("Branding Updated! Future certificates will use these.");
            else alert("Upload failed");
            
            btn.textContent = "Save Branding Assets"; btn.disabled = false;
        });
    }

    // --- 4. Update Profile ---
    const profileForm = document.getElementById('profileForm');
    if(profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('profileName').value,
                email: document.getElementById('profileEmail').value,
                phone_number: document.getElementById('profilePhone').value
            };
            const res = await fetchAPI('/companies/me/profile', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if(res.ok) alert("Profile Updated!");
        });
    }

    // --- GLOBAL: Instant File Preview ---
    window.previewFile = (input, imgId, boxId) => {
        const file = input.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById(imgId).src = e.target.result;
                document.getElementById(boxId).classList.add('has-image');
            };
            reader.readAsDataURL(file);
        }
    };

    window.switchTab = (tabName) => {
        document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.setting-tab').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
        // Simple active state loop
        const btns = document.querySelectorAll('.setting-tab');
        btns.forEach(b => { if(b.getAttribute('onclick').includes(tabName)) b.classList.add('active'); });
    };

    const logout = document.getElementById('logoutButton');
    if(logout) logout.onclick = () => { localStorage.clear(); window.location.href='login.html'; };

    loadSettings();
});