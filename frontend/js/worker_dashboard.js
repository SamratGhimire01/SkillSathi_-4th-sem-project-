// frontend/js/worker_dashboard.js (COOKIE-COMPATIBLE VERSION)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('is_logged_in');
        localStorage.removeItem('worker_name');
        window.location.href = 'staff_login.html';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    // SECURITY REFACTOR: Guard page using safe UI logging status flags
    if (localStorage.getItem('is_logged_in') !== 'true') { 
        window.location.href = 'staff_login.html'; 
        return; 
    }

    // Pull non-sensitive profile context saved during the login sequence
    const savedWorkerName = localStorage.getItem('worker_name') || "Staff Member";
    
    document.getElementById('activeIssuerName') && (document.getElementById('activeIssuerName').textContent = savedWorkerName);
    document.getElementById('userInitial') && (document.getElementById('userInitial').textContent = savedWorkerName.charAt(0).toUpperCase());

    const fetchAPI = async (endpoint, options = {}) => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                credentials: 'include', // MANDATORY: Forces browser to route HttpOnly cookies
                headers: { 
                    'Content-Type': 'application/json', 
                    ...options.headers 
                }
            });
            if (res.status === 401) {
                localStorage.removeItem('is_logged_in');
                localStorage.removeItem('worker_name');
                window.location.href = 'staff_login.html';
                return null;
            }
            return res;
        } catch (err) {
            console.error("API Fetch Error:", err);
            return null;
        }
    };

    // ── Load All My Certificates ──────────────────────────────
    async function loadMyData() {
        const tbody = document.getElementById('myCertsTable');
        
        // DROP SKELETON ANIMATION HERE: Displays shimmer rows immediately when staff clicks refresh/loads page
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td><div class="skeleton-row skeleton-cell-medium"></div><br><div class="skeleton-row skeleton-cell-short" style="margin-top:4px;"></div></td>
                    <td><div class="skeleton-row skeleton-cell-medium"></div></td>
                    <td><div class="skeleton-row skeleton-cell-short"></div></td>
                    <td><div class="skeleton-row skeleton-cell-short"></div></td>
                    <td><div class="skeleton-row skeleton-cell-short"></div></td>
                </tr>
                <tr>
                    <td><div class="skeleton-row skeleton-cell-medium"></div><br><div class="skeleton-row skeleton-cell-short" style="margin-top:4px;"></div></td>
                    <td><div class="skeleton-row skeleton-cell-medium"></div></td>
                    <td><div class="skeleton-row skeleton-cell-short"></div></td>
                    <td><div class="skeleton-row skeleton-cell-short"></div></td>
                    <td><div class="skeleton-row skeleton-cell-short"></div></td>
                </tr>
            `;
        }
        try {
            // Refactored to pass cookies securely via credentials flag
            const res = await fetch(`${API_BASE_URL}/certificates/`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error("Failed");
            const certs = await res.json();

            const pending  = certs.filter(c => c.status === 'pending_approval');
            const active   = certs.filter(c => c.status === 'active');
            const rejected = certs.filter(c => c.status === 'rejected');
            const all      = certs.filter(c => c.status !== 'deleted');

            document.getElementById('myTotalIssued') && (document.getElementById('myTotalIssued').textContent = active.length);
            document.getElementById('myTotalPending') && (document.getElementById('myTotalPending').textContent = pending.length);
            document.getElementById('myTotalRejected') && (document.getElementById('myTotalRejected').textContent = rejected.length);

            renderCertTable(all);
        } catch (err) {
            console.error("Load error:", err);
        }
    }

    function renderCertTable(certs) {
        const tbody = document.getElementById('myCertsTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (certs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#A3AED0; padding:20px;">No certificates yet.</td></tr>';
            return;
        }

        // Group by date
        const grouped = {};
        certs.forEach(c => {
            const d = new Date(c.issue_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push(c);
        });

        Object.keys(grouped).forEach(date => {
            // Date header row
            tbody.innerHTML += `
                <tr>
                    <td colspan="5" style="background:#F8FAFF; color:#2B3674; font-weight:700; padding:10px 16px; font-size:0.85rem;">
                        📅 ${date} — ${grouped[date].length} certificate${grouped[date].length > 1 ? 's' : ''}
                    </td>
                </tr>`;

            grouped[date].forEach(c => {
                const statusMap = {
                    'active':           { label: 'Approved',         color: '#10B981', bg: '#ECFDF5' },
                    'pending_approval': { label: 'Pending Approval',  color: '#F59E0B', bg: '#FFFBEB' },
                    'rejected':         { label: 'Rejected',          color: '#EF4444', bg: '#FEF2F2' },
                    'revoked':          { label: 'Revoked',           color: '#6B7280', bg: '#F3F4F6' },
                };
                const s = statusMap[c.status] || { label: c.status, color: '#6B7280', bg: '#F3F4F6' };

                const rejectionNote = c.status === 'rejected' && c.rejection_reason
                    ? `<br><small style="color:#EF4444;">Reason: ${c.rejection_reason}</small>`
                    : '';

                // Actions
                let actions = '';
                if (c.status === 'active') {
                    actions = `
                        <button onclick="viewCert(${c.id})" class="icon-btn" title="View" style="color:#3B82F6;">
                            <i data-feather="eye"></i>
                        </button>`;
                } else if (c.status === 'rejected') {
                    actions = `
                        <button onclick="openEditModal(${c.id}, '${c.recipient_name}', '${c.course_title}', '${c.course_duration}', '${c.completion_date}')"
                            style="background:#EFF6FF; color:#3B82F6; border:1px solid #3B82F6; border-radius:6px; padding:4px 12px; cursor:pointer; font-size:0.8rem;">
                            Edit & Resubmit
                        </button>`;
                }

                tbody.innerHTML += `
                    <tr>
                        <td>
                            <strong>${c.recipient_name}</strong>
                            <br><small style="color:#A3AED0;">${c.certificate_uid}</small>
                        </td>
                        <td>${c.course_title}<br><small style="color:#A3AED0;">${c.course_duration || ''}</small></td>
                        <td><span style="background:${s.bg}; color:${s.color}; padding:3px 10px; border-radius:20px; font-weight:600; font-size:0.82rem;">${s.label}</span>${rejectionNote}</td>
                        <td>${new Date(c.completion_date).toLocaleDateString()}</td>
                        <td>${actions}</td>
                    </tr>`;
            });
        });
        feather.replace();
    }

    // ── Load Activity Feed ────────────────────────────────────
    async function loadMyActivity() {
        const feed = document.getElementById('workerActivityFeed');
        if (!feed) return;
        feed.innerHTML = '<li style="color:#A3AED0; padding:10px;">Loading...</li>';

        try {
            // Refactored to pass cookies securely via credentials flag
            const res = await fetch(`${API_BASE_URL}/workers/me/logs`, {
                credentials: 'include'
            });
            if (!res.ok) throw new Error("Failed");
            const logs = await res.json();
            if (logs.length === 0) {
                feed.innerHTML = '<li style="color:#A3AED0; padding:10px;">No recent activity.</li>';
                return;
            }

            const iconMap = {
                'worker_submitted': { icon: 'file-plus',  color: '#3B82F6' },
                'cert_approved':    { icon: 'check-circle', color: '#10B981' },
                'cert_rejected':    { icon: 'x-circle',   color: '#EF4444' },
                'edit_proposed':    { icon: 'edit',        color: '#F59E0B' },
                'verified':         { icon: 'shield',      color: '#8B5CF6' },
            };

            feed.innerHTML = logs.map(log => {
                const m = iconMap[log.event_type] || { icon: 'clock', color: '#6B7280' };
                const d = new Date(log.created_at).toLocaleString();
                return `
                    <li style="display:flex; gap:12px; padding:10px 0; border-bottom:1px dashed #F3F4F6;">
                        <div style="color:${m.color}; flex-shrink:0;"><i data-feather="${m.icon}" style="width:18px;height:18px;"></i></div>
                        <div>
                            <p style="font-size:0.88rem; color:#2B3674; margin:0; font-weight:500;">${log.detail || log.event_type}</p>
                            <span style="font-size:0.75rem; color:#A3AED0;">${d}</span>
                        </div>
                    </li>`;
            }).join('');
            feather.replace();
        } catch (err) {
            feed.innerHTML = '<li style="color:#EF4444; padding:10px;">Error loading activity.</li>';
        }
    }

    // ── Issue Certificate Modal ───────────────────────────────
    const modal = document.getElementById('issueCertModal');

    document.getElementById('navIssueBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('issueCertForm')?.reset();
        modal.style.display = 'flex';
    });

    document.getElementById('closeModalBtn')?.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('issueCertForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.textContent = "Submitting...";
        btn.disabled = true;

        const formData = new FormData();
        formData.append('recipient_name',  document.getElementById('recipientName').value);
        formData.append('recipient_email', document.getElementById('recipientEmail').value);
        formData.append('course_title',    document.getElementById('courseTitle').value);
        formData.append('course_duration', document.getElementById('courseDuration').value);
        formData.append('completion_date', document.getElementById('completionDate').value);

        const expiry = document.getElementById('expiryDate')?.value;
        if (expiry) formData.append('expiry_date', expiry);

        const photo = document.getElementById('recipientPhoto')?.files[0];
        if (photo) formData.append('photo', photo);

        try {
            const res = await fetch(`${API_BASE_URL}/certificates/worker/submit`, {
                method: 'POST',
                credentials: 'include', // Forces cookie processing over multipart data boundary form fields
                body: formData
            });

            if (res.ok) {
                alert("Certificate submitted for admin approval.");
                modal.style.display = 'none';
                e.target.reset();
                loadMyData();
                loadMyActivity();
            } else {
                const d = await res.json();
                alert("Error: " + (d.detail || "Submission failed"));
            }
        } catch (err) {
            alert("Network error.");
        } finally {
            btn.textContent = "Submit for Approval";
            btn.disabled = false;
        }
    });

    // ── Edit & Resubmit Modal ─────────────────────────────────
    const editModal = document.getElementById('editCertModal');

    window.openEditModal = (id, name, course, duration, completion) => {
        document.getElementById('editCertId').value        = id;
        document.getElementById('editRecipientName').value  = name;
        document.getElementById('editCourseTitle').value    = course;
        document.getElementById('editCourseDuration').value = duration;
        document.getElementById('editCompletionDate').value = completion?.split('T')[0] || completion;
        editModal.style.display = 'flex';
    };

    document.getElementById('closeEditModalBtn')?.addEventListener('click', () => {
        editModal.style.display = 'none';
    });

    document.getElementById('editCertForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id  = document.getElementById('editCertId').value;
        const btn = e.target.querySelector('button[type="submit"]');
        btn.textContent = "Resubmitting...";
        btn.disabled = true;

        const data = {
            recipient_name:  document.getElementById('editRecipientName').value,
            course_title:    document.getElementById('editCourseTitle').value,
            course_duration: document.getElementById('editCourseDuration').value,
            completion_date: document.getElementById('editCompletionDate').value,
        };

        try {
            // Swapped to utilize the hardened internal fetchAPI network utility engine
            const res = await fetchAPI(`/certificates/worker/${id}/resubmit`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            if (res && res.ok) {
                alert("Certificate resubmitted for approval.");
                editModal.style.display = 'none';
                loadMyData();
                loadMyActivity();
            } else {
                const d = await res?.json().catch(() => ({}));
                alert("Error: " + (d.detail || "Resubmit failed"));
            }
        } catch (err) {
            alert("Network error.");
        } finally {
            btn.textContent = "Resubmit for Approval";
            btn.disabled = false;
        }
    });

    // ── View approved cert ────────────────────────────────────
    window.viewCert = async (id) => {
        try {
            const res = await fetch(`${API_BASE_URL}/certificates/${id}/preview`, {
                credentials: 'include' // Attaches session criteria cleanly
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } else {
                alert('Could not load certificate. Please try again.');
            }
        } catch (e) {
            alert('Network error.');
        }
    };

    // ── Logout (Cookie-compatible) ────────────────────────────
    document.getElementById('logoutButton')?.addEventListener('click', () => {
        localStorage.removeItem('is_logged_in');
        localStorage.removeItem('worker_name');
        window.location.href = 'staff_login.html';
    });

    loadMyData();
    loadMyActivity();
});