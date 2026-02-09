// Add this function to the TOP of the JS file (Outside DOMContentLoaded)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('accessToken');
        sessionStorage.removeItem('accessToken');
        window.location.href = 'staff_login.html'; // Redirect to staff login
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');

    if (!token) {
        window.location.href = 'staff_login.html';
        return;
    }

    // --- 1. User Info from Token ---
    function parseJwt(token) {
        try { return JSON.parse(atob(token.split('.')[1])); } catch (e) { return {}; }
    }
    const user = parseJwt(token);
    document.getElementById('activeIssuerName').textContent = user.name || "Staff";
    document.getElementById('userInitial').textContent = (user.name || "S").charAt(0).toUpperCase();

    // --- 2. Fetch Stats & Pending List ---
    async function loadMyData() {
    try {
        // Backend now filters by worker_id, so this returns only this worker's certificates
        const res = await fetch(`${API_BASE_URL}/certificates/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if(!res.ok) throw new Error("Failed to fetch data");
        
        const myCerts = await res.json(); 
        
        const pending = myCerts.filter(c => c.status === 'pending_approval');
        const active = myCerts.filter(c => c.status === 'active');

        // Update Stats
        document.getElementById('myTotalIssued').textContent = active.length;
        document.getElementById('myTotalPending').textContent = pending.length;

        // Update Table
        const tbody = document.getElementById('myPendingTable');
        tbody.innerHTML = '';
        
        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="color:var(--text-gray); text-align:center; padding:1rem;">No pending certificates found.</td></tr>';
        } else {
            pending.forEach(c => {
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${c.recipient_name}</strong></td>
                        <td>${c.course_title}</td>
                        <td><span class="status-pill status-pending">Pending</span></td>
                    </tr>
                `;
            });
        }

    } catch (err) {
        console.error("Load Data Error:", err);
    }
}
// --- 3. Load Worker's Activity Feed (NEW) ---
async function loadMyActivity() {
    const feed = document.getElementById('workerActivityFeed');
    feed.innerHTML = '<li style="color:var(--text-gray); padding:10px;">Loading activity...</li>';

    try {
        const res = await fetch(`${API_BASE_URL}/workers/me/logs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Failed to fetch activity");
        
        const logs = await res.json();
        
        if (logs.length === 0) {
            feed.innerHTML = '<li style="color:var(--text-gray); padding:10px;">No recent actions logged.</li>';
            return;
        }

        feed.innerHTML = logs.map(log => {
            let icon = 'clock';
            let color = '#3A86FF';
            let details = log.details.replace('Staff Login:', 'Logged in.');
            if (log.event_type.includes('issue')) { icon = 'file-plus'; color = '#10B981'; details = details.replace('Issued by Staff', 'Issued Cert'); }
            if (log.event_type.includes('delete')) { icon = 'trash-2'; color = '#EF4444'; }
            if (log.event_type.includes('bulk_import')) { icon = 'upload-cloud'; color = '#F59E0B'; }
            
            return `
                <li style="display:flex; gap:15px; padding:8px 0; border-bottom:1px dashed #eee;">
                    <div style="color:${color};"><i data-feather="${icon}" style="width:18px; height:18px;"></i></div>
                    <div>
                        <p style="font-size:0.9rem; color:var(--text-dark); margin:0;">${details}</p>
                        <span style="font-size:0.75rem; color:var(--text-gray);">${log.timestamp}</span>
                    </div>
                </li>
            `;
        }).join('');
        
        feather.replace();

    } catch(err) {
        feed.innerHTML = '<li style="color:red; padding:10px;">Error loading activity.</li>';
    }
}

    // --- 3. Handle Bulk Import ---
    const bulkForm = document.getElementById('bulkImportForm');
    if(bulkForm) {
        bulkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('csvFile');
            const file = fileInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("file", file);

            const btn = e.target.querySelector('button');
            const oldHtml = btn.innerHTML;
            btn.innerHTML = `<i data-feather="loader" class="feather-spin"></i> Processing...`; 
            btn.disabled = true;
            feather.replace();

            try {
                const res = await fetch(`${API_BASE_URL}/certificates/bulk-import`, {
                    method: 'POST', 
                    headers: { 'Authorization': `Bearer ${token}` }, 
                    body: formData
                });
                
                const data = await res.json();
                
                if (res.ok) { 
                    alert(data.message); 
                    fileInput.value = ""; 
                    document.getElementById('fileNameDisplay').textContent = 'Click to Choose File (CSV)';
                    document.getElementById('fileNameDisplay').style.color = 'var(--text-dark)';
                    loadMyData(); 
                } else { 
                    alert("Error: " + (data.detail || "Upload failed")); 
                }
            } catch (err) { 
                console.error(err);
                alert("Network error during upload"); 
            } finally { 
                btn.innerHTML = oldHtml; 
                btn.disabled = false; 
                feather.replace();
            }
        });
    }

    // --- 4. Handle Single Issue ---
    const modal = document.getElementById('issueCertModal');
    
    if(document.getElementById('navIssueBtn')) {
        document.getElementById('navIssueBtn').addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = 'flex';
        });
    }
    
    if(document.getElementById('closeModalBtn')) {
        document.getElementById('closeModalBtn').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    const issueForm = document.getElementById('issueCertForm');
    if(issueForm) {
        issueForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const oldText = btn.textContent;
            btn.textContent = "Submitting..."; btn.disabled = true;

            const formData = new FormData();
            formData.append('recipient_name', document.getElementById('recipientName').value);
            formData.append('recipient_email', document.getElementById('recipientEmail').value);
            formData.append('course_title', document.getElementById('courseTitle').value);
            formData.append('completion_date', document.getElementById('completionDate').value);
            
            const photo = document.getElementById('recipientPhoto').files[0];
            if (photo) formData.append('recipient_photo', photo);

            try {
                const res = await fetch(`${API_BASE_URL}/certificates/`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
                });
                
                if (res.ok) {
                    alert("Certificate created! Pending approval.");
                    modal.style.display = 'none';
                    e.target.reset();
                    loadMyData(); 
                } else {
                    const d = await res.json();
                    alert("Error: " + (d.detail || "Failed"));
                }
            } catch (err) {
                alert("Error submitting form.");
            } finally {
                btn.textContent = oldText; 
                btn.disabled = false;
            }
        });
    }

    // --- 5. Helpers (Download Template) ---
    window.downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Recipient Name,Recipient Email,Course Title,Course Duration\nJohn Doe,john@example.com,Python Basics,4 Weeks";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "certificate_template.csv");
        document.body.appendChild(link);
        link.click();
    };

    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.removeItem('accessToken');
        window.location.href = 'staff_login.html';
    });

    // Init
    loadMyData();
    loadMyActivity(); 
});