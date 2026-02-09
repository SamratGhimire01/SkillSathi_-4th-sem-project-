// frontend/js/certificates.js (FINALIZED EMAIL INTEGRATION)

// Add this function to the TOP of the JS file (Outside DOMContentLoaded)
function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('accessToken');
        sessionStorage.removeItem('accessToken'); 
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const token = localStorage.getItem('accessToken');
    if (!token) { window.location.href = 'login.html'; return; }

    let allCertificates = [];

    // --- 1. Render Function ---
    const renderCertificates = (certs) => {
        const listContainer = document.getElementById('certificateList');
        listContainer.innerHTML = '';

        if (certs.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; padding:2rem; color:gray;">No matching certificates.</p>';
            return;
        }

        certs.forEach(cert => {
            const issueDate = new Date(cert.issue_date).toLocaleDateString();
            
            // --- STATUS BADGE LOGIC (COLOR CODED) ---
            let statusText = cert.status.replace('_', ' ');
            let statusClass = 'status-pending'; 
            
            if (cert.status === 'active') {
                statusClass = 'status-active';
            } else if (cert.status === 'revoked' || cert.status === 'expired') {
                statusClass = 'status-revoked'; 
            }
            
            const statusBadge = `<span class="status-pill ${statusClass}">${statusText.toUpperCase()}</span>`;
            // --- END STATUS LOGIC ---
            
            const isPending = cert.status === 'pending_approval';
            const isRevoked = cert.status === 'revoked';

            let buttons = '';
            if (isPending) {
                buttons = `
                    <button class="icon-btn" title="Preview" onclick="openPreview(${cert.id})"><i data-feather="eye"></i></button>
                    <button class="icon-btn btn-red" title="Delete" onclick="openDeleteModal(${cert.id}, '${cert.recipient_name}')"><i data-feather="trash-2"></i></button>
                `;
            } else {
                buttons = `
                    <button class="icon-btn" title="Preview" onclick="openPreview(${cert.id})"><i data-feather="eye"></i></button>
                    
                    <!-- CRITICAL FIX: Pass the ID, Email, and Name to the sendEmail function -->
                    <button class="icon-btn" title="Email" ${isRevoked ? 'disabled style="opacity:0.5"' : ''} 
                        onclick="sendEmail(${cert.id}, '${cert.recipient_email}', '${cert.recipient_name}')">
                        <i data-feather="mail"></i>
                    </button>
                    
                    <button class="icon-btn" title="QR" ${isRevoked ? 'disabled style="opacity:0.5"' : ''} onclick="showQr('${cert.certificate_uid}')"><i data-feather="grid"></i></button>
                    <button class="icon-btn btn-red" title="Revoke" ${isRevoked ? 'disabled style="opacity:0.5"' : ''} onclick="revokeCert(${cert.id})"><i data-feather="slash"></i></button>
                    <button class="icon-btn btn-red" title="Delete" onclick="openDeleteModal(${cert.id}, '${cert.recipient_name}')"><i data-feather="trash-2"></i></button>
                `;
            }

            const itemHTML = `
                <div class="cert-list-item">
                    <div class="cert-info">
                        <div class="cert-icon"><i data-feather="file-text"></i></div>
                        <div class="cert-details">
                            <h4>${cert.course_title}</h4>
                            <p>To: <strong>${cert.recipient_name}</strong> • ${issueDate}</p>
                            <p><small style="font-family:monospace; color:#A3AED0;">${cert.certificate_uid}</small> • ${statusBadge}</p>
                        </div>
                    </div>
                    <div class="action-btn-group">${buttons}</div>
                </div>
            `;
            listContainer.insertAdjacentHTML('beforeend', itemHTML);
        });
        feather.replace();
    };

    // --- 2. Filter Logic (Remains the same) ---
    const applyFilters = () => {
        // ... (logic remains the same) ...
        const text = document.getElementById('certSearchInput').value.toLowerCase();
        const status = document.getElementById('statusFilter').value;
        const course = document.getElementById('courseFilter').value;

        const filtered = allCertificates.filter(c => {
            const textMatch = c.recipient_name.toLowerCase().includes(text) || 
                              c.certificate_uid.toLowerCase().includes(text);
            
            let statusMatch = true;
            if (status === 'active') statusMatch = c.status === 'active';
            if (status === 'pending') statusMatch = c.status === 'pending_approval';
            if (status === 'revoked') statusMatch = c.status === 'revoked' || c.status === 'expired';

            const courseMatch = course === 'all' || c.course_title === course;

            return textMatch && statusMatch && courseMatch;
        });

        renderCertificates(filtered);
    };

    // --- 3. Populate Course Dropdown (Remains the same) ---
    const populateCourses = (certs) => {
        // ... (logic remains the same) ...
        const courseSet = new Set(certs.map(c => c.course_title));
        const select = document.getElementById('courseFilter');
        select.innerHTML = '<option value="all">All Courses</option>';
        
        courseSet.forEach(course => {
            const opt = document.createElement('option');
            opt.value = course;
            opt.textContent = course;
            select.appendChild(opt);
        });
    };

    // --- 4. Load Data (Remains the same) ---
    const loadCertificates = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/certificates/`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                allCertificates = await res.json();
                populateCourses(allCertificates); 
                renderCertificates(allCertificates);
            }
        } catch(e) { console.error(e); }
    };

    // --- Listeners ---
    document.getElementById('certSearchInput').addEventListener('input', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('courseFilter').addEventListener('change', applyFilters);

    // --- Global Helpers (Modal Logic) ---
    window.openPreview = async (id) => {
        try {
            const res = await fetch(`${API_BASE_URL}/certificates/${id}/preview`, { headers: { 'Authorization': `Bearer ${token}` } });
            if(res.ok) window.open(URL.createObjectURL(await res.blob()), '_blank');
            else alert("Preview not available");
        } catch(e) {}
    };

    // --- NEW/UPDATED: Send Email (Calls the new backend endpoint) ---
    window.sendEmail = async (certId, email, name) => {
        if(!email) return alert("Error: Recipient email is missing for this certificate.");
        if(!confirm(`Send certificate to ${name} at ${email}?`)) {
            return;
        }
        
        try {
            const res = await fetch(`${API_BASE_URL}/certificates/${certId}/send-email`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` } // No Content-Type needed for empty POST body
            });

            const data = await res.json();
            
            if (res.ok) {
                alert(data.message || `✅ Email successfully triggered for ${email}`);
            } else {
                throw new Error(data.detail || "Email failed to send.");
            }
        } catch (e) {
            alert("⚠️ Error: " + e.message);
        }
    };
    // ------------------------------------------------------------------

    window.showQr = (uid) => {
        document.getElementById('qrImageDisplay').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`http://127.0.0.1:5500/verify.html?id=${uid}`)}`;
        document.getElementById('qrLinkInput').value = `http://127.0.0.1:5500/verify.html?id=${uid}`;
        document.getElementById('qrModal').style.display = 'flex';
    };
    
    document.getElementById('closeQrModal').onclick = () => document.getElementById('qrModal').style.display = 'none';

    window.revokeCert = async (id) => {
        if(confirm("Revoke?")) {
            await fetch(`${API_BASE_URL}/certificates/${id}/revoke`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            loadCertificates();
        }
    };

    // Delete Modal
    const delModal = document.getElementById('deleteCertModal');
    window.openDeleteModal = (id, name) => {
        document.getElementById('deleteTargetId').value = id;
        document.getElementById('deleteTargetName').textContent = name;
        document.getElementById('confirmDeleteName').value = '';
        delModal.style.display = 'flex';
    };
    document.getElementById('closeDeleteModal').onclick = () => delModal.style.display = 'none';
    document.getElementById('confirmDeleteBtn').onclick = async () => {
        const id = document.getElementById('deleteTargetId').value;
        const name = document.getElementById('deleteTargetName').textContent;
        const input = document.getElementById('confirmDeleteName').value;
        
        if(name.toLowerCase().trim() !== input.toLowerCase().trim()) return alert("Name mismatch");
        
        const fd = new FormData(); fd.append('confirm_name', input);
        await fetch(`${API_BASE_URL}/certificates/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        delModal.style.display = 'none';
        loadCertificates();
    };

    // Issue Modal
    document.getElementById('issueCertBtn').onclick = () => document.getElementById('issueCertModal').style.display = 'flex';
    document.getElementById('closeModalBtn').onclick = () => document.getElementById('issueCertModal').style.display = 'none';
    
    document.getElementById('issueCertForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('recipient_name', document.getElementById('recipientName').value);
        fd.append('recipient_email', document.getElementById('recipientEmail').value);
        fd.append('course_title', document.getElementById('courseTitle').value);
        fd.append('course_duration', document.getElementById('courseDuration').value); 
        fd.append('completion_date', document.getElementById('completionDate').value);
        const file = document.getElementById('recipientPhoto').files[0];
        if(file) fd.append('recipient_photo', file);

        const res = await fetch(`${API_BASE_URL}/certificates/`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        if(res.ok) { alert("Issued!"); document.getElementById('issueCertModal').style.display = 'none'; loadCertificates(); }
        else { const d = await res.json(); alert(d.detail); }
    });

    // User Info
    fetch(`${API_BASE_URL}/companies/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(u => {
            document.getElementById('userName').textContent = u.name;
            document.getElementById('userInitial').textContent = u.name[0];
        });

    document.getElementById('logoutButton').onclick = () => { localStorage.clear(); window.location.href = 'login.html'; };

    loadCertificates();
});