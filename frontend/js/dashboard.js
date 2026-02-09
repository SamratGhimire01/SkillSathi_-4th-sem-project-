// Add this function to the TOP of the JS file (Outside DOMContentLoaded)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('accessToken');
        sessionStorage.removeItem('accessToken');
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // --- 0. Helper: JWT Parser ---
    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) { return {}; }
    }

    // --- 1. Fetch Helper ---
    const fetchAPI = async (endpoint, options = {}) => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            if (res.status === 401) {
                localStorage.removeItem('accessToken');
                window.location.href = 'login.html';
            }
            return res;
        } catch (err) {
            console.error(err);
            return null;
        }
    };

    // --- 2. Load User Info (Fixes "Loading..." Name) ---
    async function loadUserInfo() {
        const res = await fetchAPI('/companies/me');
        if (res && res.ok) {
            const user = await res.json();
            const welcomeEl = document.getElementById('welcomeMessage');
            const nameEl = document.getElementById('userName');
            const initialEl = document.getElementById('userInitial');
            const issuerEl = document.getElementById('activeIssuerName'); // Sidebar

            if(welcomeEl) welcomeEl.textContent = `Welcome, ${user.name}!`;
            if(nameEl) nameEl.textContent = user.name;
            if(issuerEl) issuerEl.textContent = user.name;
            if(initialEl) initialEl.textContent = user.name.charAt(0).toUpperCase();
        } else {
            // Fallback to token data if API fails
            const jwt = parseJwt(token);
            if(document.getElementById('userName')) document.getElementById('userName').textContent = jwt.name || "User";
        }
    }

    // --- 3. Load Stats & Recent Activity (Fixes UI) ---
    async function loadDashboardData() {
        const res = await fetchAPI('/dashboard/stats');
        if (res && res.ok) {
            const data = await res.json();

            // Counters
            if(document.getElementById('totalWorkers')) document.getElementById('totalWorkers').textContent = data.total_workers || 0;
            if(document.getElementById('certsIssued')) document.getElementById('certsIssued').textContent = data.total_certs || 0;
            if(document.getElementById('pendingActions')) document.getElementById('pendingActions').textContent = data.pending_count || 0;

            // Recent Activity Feed
            const feed = document.getElementById('activityFeed');
            if (feed) {
                feed.innerHTML = '';
                if (!data.recent_logs || data.recent_logs.length === 0) {
                    feed.innerHTML = '<li style="color:gray; padding:10px;">No recent activity.</li>';
                } else {
                    data.recent_logs.forEach(log => {
                        const date = new Date(log.timestamp).toLocaleDateString();
                        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        
                        // Icons based on event type
                        let icon = 'activity';
                        let color = '#6B7280';
                        if(log.event_type.includes('issue')) { icon = 'plus-circle'; color = '#10B981'; } // Green
                        if(log.event_type.includes('delete')) { icon = 'trash-2'; color = '#EF4444'; } // Red
                        if(log.event_type.includes('login')) { icon = 'log-in'; color = '#3A86FF'; } // Blue
                        if(log.event_type.includes('approve')) { icon = 'check-circle'; color = '#F59E0B'; } // Orange

                        // Clean up text
                        let details = log.details
                            .replace("Staff Login:", "<strong>Logged in:</strong>")
                            .replace("Issued by", "<strong>Issued:</strong>")
                            .replace("Created worker", "<strong>Added Staff:</strong>")
                            .replace("Deleted certificate", "<strong>Deleted Cert:</strong>");

                        const itemHTML = `
                            <li style="display:flex; gap:15px; padding:12px 0; border-bottom:1px solid #f3f4f6;">
                                <div style="color:${color}; margin-top:2px;"><i data-feather="${icon}" style="width:18px; height:18px;"></i></div>
                                <div>
                                    <p style="font-size:0.95rem; color:#374151; margin-bottom:2px;">${details}</p>
                                    <span style="font-size:0.8rem; color:#9CA3AF;">${date} • ${time}</span>
                                </div>
                            </li>
                        `;
                        feed.insertAdjacentHTML('beforeend', itemHTML);
                    });
                    feather.replace(); // Refresh icons
                }
            }
        }
    }

    // --- 4. Chart (Existing Logic) ---
    async function loadChart() {
        const ctx = document.getElementById('issuanceChart');
        if (!ctx) return;
        
        const res = await fetchAPI('/dashboard/chart');
        if (res && res.ok) {
            const cData = await res.json();
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    datasets: [{
                        label: 'Certificates Issued',
                        data: cData.data,
                        backgroundColor: '#3A86FF',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    // --- 5. Pending Approvals & Select All Logic (Fixes Checkboxes) ---
    async function loadApprovals() {
        const tbody = document.getElementById('approvalTableBody');
        if (!tbody) return;

        const res = await fetchAPI('/certificates/');
        if (res && res.ok) {
            const certs = await res.json();
            const pending = certs.filter(c => c.status === 'pending_approval');

            tbody.innerHTML = '';
            if (pending.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1rem; color:gray;">No pending approvals</td></tr>';
            } else {
                pending.forEach(c => {
                    tbody.innerHTML += `
                        <tr>
                            <td><input type="checkbox" class="cert-checkbox" value="${c.id}"></td>
                            <td><strong>${c.recipient_name}</strong></td>
                            <td>${c.course_title}</td>
                            <td>Worker ID: ${c.worker_id}</td>
                            <td>
                                <button onclick="previewCert(${c.id})" class="btn-sm btn-outline">Preview</button>
                            </td>
                        </tr>
                    `;
                });
            }
        }
    }

    // --- 6. Event Listeners ---

    // A. Select All Checkbox Logic
    const selectAllBox = document.getElementById('selectAll');
    if (selectAllBox) {
        selectAllBox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.cert-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
    }

    // B. Approve Button Logic
    const approveBtn = document.getElementById('approveSelectedBtn');
    if (approveBtn) {
        approveBtn.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('.cert-checkbox:checked');
            const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));

            if (ids.length === 0) {
                alert("Please select items to approve.");
                return;
            }

            if (!confirm(`Approve ${ids.length} certificates?`)) return;

            approveBtn.textContent = "Processing...";
            approveBtn.disabled = true;

            const res = await fetchAPI('/certificates/approve', {
                method: 'POST',
                body: JSON.stringify(ids)
            });

            if (res && res.ok) {
                alert("Approved!");
                loadApprovals();
                loadDashboardData();
            } else {
                alert("Failed to approve.");
            }
            approveBtn.textContent = "Approve Selected";
            approveBtn.disabled = false;
        });
    }

    // C. Logout Logic
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Stop default anchor behavior
            if (confirm("Are you sure you want to logout?")) {
                localStorage.removeItem('accessToken');
                sessionStorage.removeItem('accessToken');
                window.location.href = 'login.html';
            }
        });
    }

    // D. Refresh Button
    const refreshBtn = document.getElementById('refreshApprovals');
    if(refreshBtn) refreshBtn.addEventListener('click', loadApprovals);

    // --- 7. Global Helper for Preview ---
    window.previewCert = async (id) => {
        const res = await fetchAPI(`/certificates/${id}/preview`);
        if (res && res.ok) {
            const blob = await res.blob();
            window.open(URL.createObjectURL(blob), '_blank');
        } else {
            alert("Preview failed.");
        }
    };

    // --- INIT ---
    loadUserInfo();
    loadDashboardData();
    loadChart();
    loadApprovals();
});