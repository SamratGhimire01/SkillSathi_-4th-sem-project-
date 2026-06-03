// frontend/js/dashboard.js (COOKIE-COMPATIBLE VERSION)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('is_logged_in');
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    if (localStorage.getItem('is_logged_in') !== 'true') { 
        window.location.href = 'login.html'; 
        return; 
    }

    let issuanceChart = null; // Store chart instance
    let refreshInterval = null; // For auto-refresh

    const fetchAPI = async (endpoint, options = {}) => {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                credentials: 'include', // Forces browser to send HttpOnly session cookie
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            if (res.status === 401) { 
                localStorage.removeItem('is_logged_in'); 
                window.location.href = 'login.html'; 
                return null;
            }
            return res;
        } catch (err) { 
            console.error('API Error:', err); 
            return null; 
        }
    };

    // ── Load User Info ────────────────────────────────────────
    async function loadUserInfo() {
        const res = await fetchAPI('/companies/me');
        if (res && res.ok) {
            const user = await res.json();
            const welcomeMsg = document.getElementById('welcomeMessage');
            const userName = document.getElementById('userName');
            const userInitial = document.getElementById('userInitial');
            
            if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${user.name}!`;
            if (userName) userName.textContent = user.name;
            if (userInitial) userInitial.textContent = user.name.charAt(0).toUpperCase();
        } else {
            // Fallback to localStorage name if available (but no JWT parsing)
            const welcomeMsg = document.getElementById('welcomeMessage');
            const userName = document.getElementById('userName');
            const storedName = localStorage.getItem('user_name');
            
            if (welcomeMsg && storedName) welcomeMsg.textContent = `Welcome, ${storedName}!`;
            if (userName && storedName) userName.textContent = storedName;
        }
    }

    // ── Update Chart ──────────────────────────────────────────
    function updateChart(monthlyData) {
        const ctx = document.getElementById('issuanceChart');
        if (!ctx) {
            console.warn('Chart canvas not found');
            return;
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Ensure we have 12 months of data
        const chartData = monthlyData && monthlyData.length === 12 ? monthlyData : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        
        // Destroy existing chart if it exists
        if (issuanceChart) {
            issuanceChart.destroy();
            issuanceChart = null;
        }

        issuanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Certificates Issued',
                    data: chartData,
                    backgroundColor: 'rgba(58, 134, 255, 0.2)',
                    borderColor: '#3A86FF',
                    borderWidth: 2,
                    borderRadius: 8,
                    hoverBackgroundColor: 'rgba(58, 134, 255, 0.3)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { font: { size: 12, weight: '500' } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Issued: ${context.raw} certificates`;
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { 
                            stepSize: 1,
                            precision: 0
                        },
                        title: {
                            display: true,
                            text: 'Number of Certificates',
                            font: { size: 11 }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Month',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }

    // ── Load Stats ────────────────────────────────────────────
    async function loadDashboardData() {
        try {
            const res = await fetchAPI('/dashboard/stats');
            if (res && res.ok) {
                const data = await res.json();
                
                // Update stats cards
                const totalWorkersEl = document.getElementById('totalWorkers');
                const certsIssuedEl = document.getElementById('certsIssued');
                const pendingActionsEl = document.getElementById('pendingActions');
                
                if (totalWorkersEl) totalWorkersEl.textContent = data.total_workers || 0;
                if (certsIssuedEl) certsIssuedEl.textContent = data.total_certs || 0;
                if (pendingActionsEl) pendingActionsEl.textContent = data.pending_count || 0;

                // Update chart with monthly data
                if (data.monthly_counts && data.monthly_counts.length === 12) {
                    updateChart(data.monthly_counts);
                } else {
                    // If no monthly data, try to fetch from chart endpoint
                    const chartRes = await fetchAPI('/dashboard/chart');
                    if (chartRes && chartRes.ok) {
                        const chartData = await chartRes.json();
                        updateChart(chartData.data || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
                    } else {
                        updateChart([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
                    }
                }

                // Update activity feed
                const feed = document.getElementById('activityFeed');
                if (feed) {
                    feed.innerHTML = '';
                    if (!data.recent_logs || data.recent_logs.length === 0) {
                        feed.innerHTML = '<li style="color:gray; padding:10px; list-style:none;">No recent activity.</li>';
                    } else {
                        data.recent_logs.forEach(log => {
                            const date = new Date(log.timestamp);
                            const d = date.toLocaleDateString();
                            const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            feed.innerHTML += `
                                <li style="padding:10px 0; border-bottom:1px dashed #eee; display:flex; gap:10px; list-style:none;">
                                    <div style="color:#3A86FF;"><i data-feather="activity" style="width:16px;height:16px;"></i></div>
                                    <div style="flex:1;">
                                        <p style="margin:0; font-size:0.9rem; color:#2B3674;">${log.details || log.event_type || 'Activity'}</p>
                                        <span style="font-size:0.75rem; color:#A3AED0;">${d} at ${time}</span>
                                    </div>
                                </li>`;
                        });
                        if (typeof feather !== 'undefined') feather.replace();
                    }
                }
            } else {
                console.error('Failed to load dashboard stats');
                // Set default chart
                updateChart([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            updateChart([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        }
    }

    // ── Load Pending Certificates ─────────────────────────────
    // ── Load Pending Certificates ─────────────────────────────
    async function loadPendingCerts() {
        const tbody = document.getElementById('pendingApprovalsTable');
        
        // DROP SKELETON ANIMATION HERE: Displays shimmer rows immediately when loading starts
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
            const res = await fetchAPI('/certificates/');
            if (!res || !res.ok) return;
            const certs = await res.json();
            const pending = certs.filter(c => c.status === 'pending_approval');

            if (!tbody) return;
            tbody.innerHTML = ''; // This wipes the skeletons once data arrives successfully

            if (pending.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#A3AED0; padding:20px;">No pending certificates.</td></tr>';
                return;
            }
            
            // Rest of your existing pending.forEach code remains completely untouched...

            pending.forEach(c => {
                const submittedBy = c.submitted_by_worker_name
                    ? `<span style="color:#7C3AED; font-size:0.85rem;">👤 ${escapeHtml(c.submitted_by_worker_name)}</span>`
                    : '<span style="color:#A3AED0; font-size:0.85rem;">Direct</span>';

                tbody.innerHTML += `
                    <tr>
                        <td><strong>${escapeHtml(c.recipient_name)}</strong><br><small style="color:#A3AED0;">${c.certificate_uid}</small></td>
                        <td>${escapeHtml(c.course_title)}</td>
                        <td>${submittedBy}</td>
                        <td><span class="status-pill status-pending">Pending</span></td>
                        <td>
                            <div class="action-btn-group">
                                <button onclick="window.previewCert(${c.id})" class="icon-btn" title="Preview" style="color:#3B82F6;">
                                    <i data-feather="eye"></i>
                                </button>
                                <button onclick="window.approveCert(${c.id})" class="icon-btn" title="Approve" style="color:#10B981;">
                                    <i data-feather="check-circle"></i>
                                </button>
                                <button onclick="window.rejectCert(${c.id})" class="icon-btn btn-red" title="Reject">
                                    <i data-feather="x-circle"></i>
                                </button>
                            </div>
                         </td>
                     </tr>
                `;
            });
            if (typeof feather !== 'undefined') feather.replace();
        } catch (error) {
            console.error('Error loading pending certs:', error);
        }
    }

    // Helper function to escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // ── Actions (Cookie-compatible) ───────────────────────────
    window.previewCert = async (id) => {
        try {
            const res = await fetch(`${API_BASE_URL}/certificates/${id}/preview`, {
                credentials: 'include'
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } else {
                const error = await res.json().catch(() => ({}));
                alert(error.detail || 'Could not load certificate preview.');
            }
        } catch (e) {
            console.error('Preview error:', e);
            alert('Network error. Please try again.');
        }
    };

    window.approveCert = async (id) => {
        if (!confirm("Approve this certificate?")) return;
        const res = await fetchAPI('/certificates/approve', {
            method: 'POST',
            body: JSON.stringify([id])
        });
        if (res && res.ok) {
            showToast('Certificate approved!', 'success');
            await loadPendingCerts();
            await loadDashboardData();
        } else {
            const d = await res?.json().catch(() => ({}));
            showToast('Error: ' + (d.detail || 'Failed to approve'), 'error');
        }
    };

    window.rejectCert = async (id) => {
        const reason = prompt("Enter rejection reason for the worker:");
        if (reason === null) return;

        const res = await fetchAPI(`/certificates/${id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason || "No reason provided." })
        });
        if (res && res.ok) {
            showToast('Certificate rejected. Worker notified.', 'success');
            await loadPendingCerts();
            await loadDashboardData();
        } else {
            const d = await res?.json().catch(() => ({}));
            showToast('Error: ' + (d?.detail || 'Failed to reject'), 'error');
        }
    };

    // ── Toast Notification ────────────────────────────────────
    function showToast(message, type = 'success') {
        const existing = document.getElementById('toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 9999;
            padding: 14px 24px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 0.9rem;
            color: white;
            background: ${type === 'success' ? '#10B981' : '#EF4444'};
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Add animations to document if not present
    if (!document.querySelector('#toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // ── Auto Refresh ──────────────────────────────────────────
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        // Refresh every 60 seconds
        refreshInterval = setInterval(() => {
            console.log('Auto-refreshing dashboard...');
            loadDashboardData();
            loadPendingCerts();
        }, 60000);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // ── Logout ────────────────────────────────────────────────
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            stopAutoRefresh();
            localStorage.removeItem('is_logged_in');
            window.location.href = 'login.html';
        });
    }

    // ── Initialize Dashboard ─────────────────────────────────
    try {
        await loadUserInfo();
        await loadDashboardData();
        await loadPendingCerts();
        startAutoRefresh();
    } catch (error) {
        console.error('Initialization error:', error);
    }
});