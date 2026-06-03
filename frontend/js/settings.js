// frontend/js/settings.js (COOKIE-COMPATIBLE VERSION)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('is_logged_in');
        sessionStorage.removeItem('is_logged_in');
        window.location.href = 'login.html';
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.setting-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    document.querySelector(`[onclick="switchTab('${tab}')"]`)?.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    // Cookie-compatible session check
    if (localStorage.getItem('is_logged_in') !== 'true') { 
        window.location.href = 'login.html'; 
        return; 
    }

    const fetchAPI = async (endpoint, options = {}) => {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
            credentials: 'include'
        });
        return res;
    };

    // ── 1. Load Profile ───────────────────────────────────────
    async function loadSettings() {
        try {
            const res = await fetchAPI('/companies/me');
            if (res.ok) {
                const u = await res.json();
                document.getElementById('profileName').value    = u.name || '';
                document.getElementById('profileEmail').value   = u.email || '';
                document.getElementById('profilePhone').value   = u.phone_number || '';
                document.getElementById('profileAddress').value = u.business_address || '';
                document.getElementById('profileWebsite').value = u.website_url || '';
                document.getElementById('profileRegNum').value  = u.business_reg_number || '';
                document.getElementById('profileContact').value = u.primary_contact_name || '';
                document.getElementById('profileCitizen').value = u.citizenship_number || '';

                document.getElementById('userName').textContent    = u.name;
                document.getElementById('userInitial').textContent = u.name.charAt(0).toUpperCase();

                // ── Documents status ──────────────────────────
                updateDocStatus('contactPhotoStatus', u.has_contact_photo, 'Contact Photo');
                updateDocStatus('regDocStatus', u.has_registration_doc, 'Registration Document');
            }
        } catch (e) { console.error(e); }

        // ── Notifications ─────────────────────────────────────
        try {
            const res = await fetchAPI('/companies/me/notifications');
            if (res.ok) {
                const data = await res.json();
                document.getElementById('notifyIssued').checked   = data.notify_issued;
                document.getElementById('notifySummary').checked  = data.notify_summary;
                document.getElementById('notifySecurity').checked = data.notify_security;
            }
        } catch (e) {}

        // ── Branding images ───────────────────────────────────
        loadImagePreview('logo', 'logoPreview', 'logoBox');
        loadImagePreview('signature', 'sigPreview', 'sigBox');

        // ── Contact photo preview ─────────────────────────────
        try {
            const res = await fetch(`${API_BASE_URL}/companies/me/documents/contact-photo`, {
                credentials: 'include'
            });
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 0) {
                    document.getElementById('contactPhotoPreview').src = URL.createObjectURL(blob);
                    document.getElementById('contactPhotoPreview').style.display = 'block';
                }
            }
        } catch (e) {}
    }

    function updateDocStatus(elId, hasDoc, label) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (hasDoc) {
            el.innerHTML = `<span style="color:#059669;">✅ ${label} uploaded</span>`;
        } else {
            el.innerHTML = `<span style="color:#EF4444;">❌ ${label} not uploaded</span>`;
        }
    }

    async function loadImagePreview(type, imgId, boxId) {
        try {
            const res = await fetch(`${API_BASE_URL}/companies/me/branding/${type}`, {
                credentials: 'include'
            });
            if (res.ok) {
                const blob = await res.blob();
                if (blob.size > 0) {
                    document.getElementById(imgId).src = URL.createObjectURL(blob);
                    document.getElementById(imgId).style.display = 'block';
                }
            }
        } catch (e) {}
    }

    // ── 2. Save Profile ───────────────────────────────────────
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const res = await fetchAPI('/companies/me/profile', {
            method: 'PUT',
            body: JSON.stringify({
                name:             document.getElementById('profileName').value,
                email:            document.getElementById('profileEmail').value,
                phone_number:     document.getElementById('profilePhone').value,
                business_address: document.getElementById('profileAddress').value,
                website_url:      document.getElementById('profileWebsite').value,
            })
        });

        btn.textContent = 'Save Changes';
        btn.disabled = false;

        if (res.ok) {
            showToast('Profile updated successfully!', 'success');
        } else {
            const d = await res.json();
            showToast('Error: ' + (d.detail || 'Update failed'), 'error');
        }
    });

    // ── 3. Update Contact Photo ───────────────────────────────
    document.getElementById('contactPhotoForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = document.getElementById('contactPhotoInput').files[0];
        if (!file) return;

        const fd = new FormData();
        fd.append('photo', file);

        const res = await fetch(`${API_BASE_URL}/companies/me/documents/contact-photo`, {
            method: 'POST',
            credentials: 'include',
            body: fd
        });

        if (res.ok) {
            showToast('Contact photo updated!', 'success');
            const url = URL.createObjectURL(file);
            document.getElementById('contactPhotoPreview').src = url;
            document.getElementById('contactPhotoPreview').style.display = 'block';
        } else {
            showToast('Failed to update photo.', 'error');
        }
    });

    // ── 4. View Registration Document ────────────────────────
    document.getElementById('viewRegDocBtn')?.addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/companies/me/documents/registration`, {
                credentials: 'include'
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } else {
                alert('Could not load document. Please try again.');
            }
        } catch (e) {
            alert('Network error.');
        }
    });

    // ── 5. Branding ───────────────────────────────────────────
    document.getElementById('brandingForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData();
        const logo = document.getElementById('logoInput').files[0];
        const sig  = document.getElementById('sigInput').files[0];
        if (logo) fd.append('logo', logo);
        if (sig)  fd.append('signature', sig);

        const res = await fetch(`${API_BASE_URL}/companies/me/branding`, {
            method: 'POST',
            credentials: 'include',
            body: fd
        });

        if (res.ok) {
            showToast('Branding updated!', 'success');
            if (logo) loadImagePreview('logo', 'logoPreview', 'logoBox');
            if (sig)  loadImagePreview('signature', 'sigPreview', 'sigBox');
        } else {
            showToast('Failed to update branding.', 'error');
        }
    });

    // ── 6. Notifications ──────────────────────────────────────
    document.getElementById('notificationsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await fetchAPI('/companies/me/notifications', {
            method: 'PUT',
            body: JSON.stringify({
                notify_issued:   document.getElementById('notifyIssued').checked,
                notify_summary:  document.getElementById('notifySummary').checked,
                notify_security: document.getElementById('notifySecurity').checked,
            })
        });
        if (res.ok) showToast('Notification preferences saved!', 'success');
    });

    // ── 7. Password Change ────────────────────────────────────
    document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const current = document.getElementById('currentPassword').value;
        const newPwd  = document.getElementById('newPassword').value;
        const confirm = document.getElementById('confirmPassword').value;

        if (newPwd !== confirm) {
            showToast('New passwords do not match.', 'error');
            return;
        }

        const res = await fetchAPI('/companies/me/password', {
            method: 'PUT',
            body: JSON.stringify({ current_password: current, new_password: newPwd })
        });

        if (res.ok) {
            showToast('Password changed successfully!', 'success');
            e.target.reset();
        } else {
            const d = await res.json();
            showToast('Error: ' + (d.detail || 'Failed'), 'error');
        }
    });

    // ── Toast ─────────────────────────────────────────────────
    function showToast(message, type = 'success') {
        const existing = document.getElementById('toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position:fixed; bottom:30px; right:30px; z-index:9999;
            padding:14px 24px; border-radius:10px; font-weight:600;
            font-size:0.9rem; color:white; box-shadow:0 4px 20px rgba(0,0,0,0.15);
            background:${type === 'success' ? '#059669' : '#EF4444'};
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ── Logout (Cookie-compatible) ────────────────────────────
    document.getElementById('logoutButton')?.addEventListener('click', () => {
        localStorage.removeItem('is_logged_in');
        sessionStorage.removeItem('is_logged_in');
        window.location.href = 'login.html';
    });

    loadSettings();
});