// frontend/js/admin_dashboard.js (COOKIE-COMPATIBLE VERSION)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('is_logged_in');
        sessionStorage.removeItem('is_logged_in');
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";

    // Cookie-compatible session check
    if (localStorage.getItem('is_logged_in') !== 'true') { 
        window.location.href = 'login.html'; 
        return; 
    }

    let allCompanies = [];
    
    // ── Logs Pagination Variables ──
    let currentLogPage = 1;
    let totalLogPages = 1;
    const LOGS_PER_PAGE = 15;

    // --- 1. Fetch Helper with Cookie Auth ---
    const fetchAPI = async (endpoint, options = {}) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            credentials: 'include',
        });
        if (response.status === 401) { 
            localStorage.removeItem('is_logged_in');
            window.location.href = 'login.html'; 
        }
        return response;
    };

    // --- 2. Navigation Logic ---
    document.querySelectorAll('.sidebar-link[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            link.classList.add('active');
            const targetId = link.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });

    // --- 3. CHART RENDERING ---
    let barChartInstance = null;
    let pieChartInstance = null;

    const renderCharts = async () => {
        try {
            const res = await fetchAPI('/admin/charts/data');
            if(!res.ok) {
                console.error("Failed to load chart data:", res.status);
                return;
            }
            
            const data = await res.json();
            const monthlyData = data.monthly_issuance || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            const statusData = data.center_status || { verified: 0, pending: 0, rejected: 0 };
            
            const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // A. Bar Chart (Monthly Issuance)
            const barCtx = document.getElementById('issuanceBarChart');
            if (barCtx) {
                if (barChartInstance) barChartInstance.destroy();
                barChartInstance = new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Certificates Issued',
                            data: monthlyData,
                            backgroundColor: 'rgba(58, 134, 255, 0.8)',
                            borderColor: '#3A86FF',
                            borderWidth: 1,
                            borderRadius: 8,
                        }]
                    },
                    options: {
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { 
                            legend: { display: true, position: 'top' },
                            tooltip: { callbacks: { label: (ctx) => `Issued: ${ctx.raw} certificates` } }
                        },
                        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                    }
                });
            }

            // B. Pie Chart (Center Status)
            const pieCtx = document.getElementById('centerPieChart');
            if (pieCtx) {
                if (pieChartInstance) pieChartInstance.destroy();
                
                const pieLabels = Object.keys(statusData).map(s => s.charAt(0).toUpperCase() + s.slice(1));
                const pieValues = Object.values(statusData);
                const pieColors = { 'verified': '#10B981', 'pending': '#F59E0B', 'rejected': '#EF4444' };

                pieChartInstance = new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: pieLabels,
                        datasets: [{
                            data: pieValues,
                            backgroundColor: pieValues.map((_, i) => pieColors[Object.keys(statusData)[i]] || '#3A86FF'),
                            borderWidth: 0,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { 
                            legend: { position: 'bottom' },
                            tooltip: { callbacks: { label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
                                const percent = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return `${ctx.label}: ${ctx.parsed} (${percent}%)`;
                            } } }
                        },
                        cutout: '60%'
                    }
                });
            }
        } catch (err) { console.error("Chart rendering error:", err); }
    };

    // --- 4. Load Stats ---
    const loadStats = async () => {
        try {
            const statsRes = await fetchAPI('/admin/stats');
            if(statsRes.ok) {
                const stats = await statsRes.json();
                document.getElementById('totalCenters').textContent = stats.total_centers || 0;
                document.getElementById('totalCerts').textContent = stats.total_certificates || 0;
                document.getElementById('pendingApprovals').textContent = stats.pending_reviews || 0;
                document.getElementById('totalWorkers').textContent = stats.total_workers || 0;
            }
        } catch (err) { console.error("Stats error:", err); }
    };

    // --- 5. Load Recent Activity for Dashboard Overview (Top 5) ---
    const loadRecentActivity = async () => {
        try {
            const res = await fetchAPI('/admin/logs?page=1&per_page=5');
            if(res.ok) {
                const data = await res.json();
                const recentLogs = data.logs || [];
                const logsTableBody = document.getElementById('logsTableBody');
                if (logsTableBody) {
                    if (recentLogs.length === 0) {
                        logsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No recent activity</td></tr>';
                    } else {
                        logsTableBody.innerHTML = recentLogs.map(l => `
                            <tr>
                                <td style="white-space:nowrap;">${new Date(l.timestamp).toLocaleTimeString()}</td>
                                <td><span class="status-pill" style="background:#EFF6FF; color:#3B82F6;">${l.event_type || 'N/A'}</span></td>
                                <td>${l.actor_display || l.actor_type || 'System'}</td>
                                <td style="max-width:300px; word-break:break-word;">${l.details || ''}</td>
                            </tr>
                        `).join('');
                    }
                }
            }
        } catch (err) { console.error("Recent activity error:", err); }
    };

    // --- 6. Load Full System Logs (with Pagination & Filters) ---
    const loadFullSystemLogs = async () => {
        const searchTerm = document.getElementById('logSearchInput')?.value || '';
        let filterValue = document.getElementById('logFilterType')?.value || 'all';

        try {
            const params = new URLSearchParams({
                page: currentLogPage,
                per_page: LOGS_PER_PAGE,
                event_type: filterValue,
                search: searchTerm
            });

            const res = await fetchAPI(`/admin/logs?${params}`);
            if (res.ok) {
                const data = await res.json();
                const logs = data.logs || [];
                totalLogPages = data.total_pages || 1;
                
                const logsTableBodyFull = document.getElementById('logsTableBodyFull');
                if (logsTableBodyFull) {
                    if (logs.length === 0) {
                        logsTableBodyFull.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;">No logs found</td></tr>';
                    } else {
                        logsTableBodyFull.innerHTML = logs.map(l => `
                            <tr>
                                <td style="white-space:nowrap;">${new Date(l.timestamp).toLocaleString()}</td>
                                <td><span class="status-pill" style="background:#EFF6FF; color:#3B82F6;">${l.event_type || 'N/A'}</span></td>
                                <td>${l.actor_display || l.actor_type || 'System'}</td>
                                <td style="max-width:400px; word-break:break-word;">${l.details || ''}</td>
                            </tr>
                        `).join('');
                    }
                }
                
                // Render pagination for logs
                renderLogPagination();
            }
        } catch (err) { 
            console.error("Full system logs error:", err); 
        }
    };

    // --- 7. Render Pagination for Logs ---
    const renderLogPagination = () => {
        const paginationContainer = document.getElementById('logPagination');
        if (!paginationContainer) return;
        
        paginationContainer.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; justify-content:center; padding:20px 0;">
                <button id="prevLogPageBtn" 
                    ${currentLogPage === 1 ? 'disabled' : ''}
                    style="padding:8px 16px; border-radius:8px; border:1px solid #E5E7EB;
                           background:${currentLogPage === 1 ? '#F9FAFB' : 'white'};
                           color:${currentLogPage === 1 ? '#9CA3AF' : '#2B3674'};
                           cursor:${currentLogPage === 1 ? 'not-allowed' : 'pointer'}; font-weight:600;">
                    ← Previous
                </button>
                <span style="font-size:0.9rem; color:#6B7280;">
                    Page <strong>${currentLogPage}</strong> of <strong>${totalLogPages}</strong>
                </span>
                <button id="nextLogPageBtn"
                    ${currentLogPage === totalLogPages ? 'disabled' : ''}
                    style="padding:8px 16px; border-radius:8px; border:1px solid #E5E7EB;
                           background:${currentLogPage === totalLogPages ? '#F9FAFB' : '#2B3674'};
                           color:${currentLogPage === totalLogPages ? '#9CA3AF' : 'white'};
                           cursor:${currentLogPage === totalLogPages ? 'not-allowed' : 'pointer'}; font-weight:600;">
                    Next →
                </button>
            </div>
        `;
        
        const prevBtn = document.getElementById('prevLogPageBtn');
        const nextBtn = document.getElementById('nextLogPageBtn');
        
        if (prevBtn && currentLogPage > 1) {
            prevBtn.onclick = () => {
                currentLogPage--;
                loadFullSystemLogs();
            };
        }
        
        if (nextBtn && currentLogPage < totalLogPages) {
            nextBtn.onclick = () => {
                currentLogPage++;
                loadFullSystemLogs();
            };
        }
    };

    // --- 8. Apply Log Filters ---
    const applyLogFilters = () => {
        currentLogPage = 1;
        loadFullSystemLogs();
    };

    // --- 9. Load Companies List ---
    const loadCompanies = async () => {
        try {
            const res = await fetchAPI('/admin/companies');
            if(!res.ok) throw new Error("Failed to load");
            allCompanies = await res.json();
            applyCompanyFilters();
        } catch (err) { 
            const tbody = document.getElementById('companiesTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" style="color:red;padding:20px;">Failed to load data</td></tr>';
            }
        }
    };

    const applyCompanyFilters = () => {
        const tbody = document.getElementById('companiesTableBody');
        if (!tbody) return;
        
        const searchTerm = document.getElementById('companySearchInput')?.value.toLowerCase() || '';
        const filterStatus = document.getElementById('companyFilterStatus')?.value || 'all';

        const filtered = allCompanies.filter(c => {
            const textMatch = (c.name || '').toLowerCase().includes(searchTerm) || 
                            (c.email || '').toLowerCase().includes(searchTerm);
            const statusMatch = filterStatus === 'all' || c.status === filterStatus;
            return textMatch && statusMatch;
        });

        tbody.innerHTML = filtered.map(c => `
            <tr>
                <td>#${c.id}</td>
                <td><strong>${c.name || 'N/A'}</strong></td>
                <td>${c.email || 'N/A'}</td>
                <td><span class="status-pill status-${c.status || 'pending'}">${(c.status || 'PENDING').toUpperCase()}</span></td>
                <td>${c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}</td>
                <td><button class="btn-primary" style="padding:8px 15px;" onclick="openDetailModal(${c.id})">Details</button></td>
            </tr>
        `).join('');
    };

    // --- 10. Load Support Tickets ---
    const loadTickets = async () => {
        const tbody = document.getElementById('supportTableBody');
        if (!tbody) return;
        
        try {
            const res = await fetchAPI('/admin/tickets');
            if(!res.ok) return;
            const tickets = await res.json();
            
            tbody.innerHTML = tickets.map(t => `
                <tr>
                    <td style="white-space:nowrap;">${new Date(t.created_at).toLocaleDateString()}</td>
                    <td><strong>${t.company_name || 'N/A'}</strong></td>
                    <td>${t.subject || 'N/A'}</td>
                    <td style="max-width:300px;">${t.message || 'N/A'}</td>
                    <td><span class="status-pill status-${t.status === 'open' ? 'pending' : 'active'}">${t.status || 'open'}</span></td>
                    <td>${t.status === 'open' ? `<button class="btn-primary" onclick="resolveTicket(${t.id})">Resolve</button>` : '<i data-feather="check" style="color:var(--brand-green);"></i>'}</td>
                </tr>
            `).join('');
            if (typeof feather !== 'undefined') feather.replace();
        } catch(e) { console.error(e); }
    };

    // --- 11. Global Functions ---
    window.openDetailModal = async (id) => {
        const modal = document.getElementById('companyDetailModal');
        if (!modal) return;
        modal.style.display = 'flex';

        try {
            const res = await fetchAPI(`/admin/companies/${id}/details`);
            if(!res.ok) throw new Error("Could not fetch details.");
            const data = await res.json();
            const c = data.company;
            const stats = data.stats;

            document.getElementById('detailCompanyName').textContent = c.name || "N/A";
            
            const statusSpan = document.getElementById('detailStatus');
            if (statusSpan) {
                statusSpan.textContent = c.status || 'PENDING';
                statusSpan.className = `status-pill status-${c.status || 'pending'}`;
            }

            document.getElementById('detailEmail').textContent = c.email || "N/A";
            document.getElementById('detailRegNo').textContent = c.business_reg_number || "N/A";
            document.getElementById('detailContactName').textContent = c.primary_contact_name || "N/A";
            document.getElementById('detailCitizen').textContent = c.citizenship_number || "N/A";
            
            document.getElementById('detailWorkers').textContent = stats?.workers || 0;
            document.getElementById('detailCertsTotal').textContent = stats?.certificates || 0;
            document.getElementById('detailCertsActive').textContent = stats?.active_certs || 0;

            // Load documents
            try {
                const photoRes = await fetchAPI(`/admin/companies/${id}/files/photo`);
                if (photoRes.ok) {
                    const blob = await photoRes.blob();
                    document.getElementById('detailImgPhoto').src = URL.createObjectURL(blob);
                }
            } catch(e) { console.error("Failed to load photo"); }

            try {
                const docRes = await fetchAPI(`/admin/companies/${id}/files/doc`);
                if (docRes.ok) {
                    const blob = await docRes.blob();
                    const url = URL.createObjectURL(blob);
                    document.getElementById('detailDocFrame').src = url;
                    document.getElementById('detailDocLink').href = url;
                }
            } catch(e) { console.error("Failed to load document"); }
            
            const btnApprove = document.getElementById('btnDetailApprove');
            const btnReject = document.getElementById('btnDetailReject');
            const btnDelete = document.getElementById('btnDetailDelete');
            
            if (btnApprove) btnApprove.style.display = c.status === 'pending' ? 'inline-block' : 'none';
            if (btnReject) btnReject.style.display = c.status !== 'rejected' ? 'inline-block' : 'none';
            if (btnDelete) btnDelete.style.display = 'inline-block';

            btnApprove.onclick = async () => { 
                if(confirm('Approve this company?')) { 
                    await fetchAPI(`/admin/companies/${id}/approve`, { method: 'PUT' }); 
                    modal.style.display = 'none'; 
                    loadCompanies(); 
                    loadStats(); 
                } 
            };
            
            btnReject.onclick = async () => { 
                if(confirm('Reject this company?')) { 
                    await fetchAPI(`/admin/companies/${id}/reject`, { method: 'PUT' }); 
                    modal.style.display = 'none'; 
                    loadCompanies(); 
                    loadStats(); 
                } 
            };
            
            btnDelete.onclick = async () => { 
                if(confirm('Delete entire company? This cannot be undone!')) { 
                    await fetchAPI(`/admin/companies/${id}`, { method: 'DELETE' }); 
                    modal.style.display = 'none'; 
                    loadCompanies(); 
                    loadStats(); 
                } 
            };

        } catch(e) {
            console.error("Detail Modal Error:", e);
            alert("Error loading company details.");
        }
    };

    window.resolveTicket = async (id) => {
        if(!confirm("Mark this ticket as resolved?")) return;
        await fetchAPI(`/admin/tickets/${id}/resolve`, { method: 'PUT' });
        loadTickets();
    };

    window.closeDetailModal = () => {
        const modal = document.getElementById('companyDetailModal');
        if (modal) modal.style.display = 'none';
    };

    // --- 12. Event Listeners ---
    const companySearch = document.getElementById('companySearchInput');
    const companyFilter = document.getElementById('companyFilterStatus');
    const logSearch = document.getElementById('logSearchInput');
    const logFilter = document.getElementById('logFilterType');
    
    if (companySearch) companySearch.addEventListener('input', applyCompanyFilters);
    if (companyFilter) companyFilter.addEventListener('change', applyCompanyFilters);
    if (logSearch) logSearch.addEventListener('input', applyLogFilters);
    if (logFilter) logFilter.addEventListener('change', applyLogFilters);

    // Logout with session flag cleanup
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('is_logged_in');
            sessionStorage.removeItem('is_logged_in');
            window.location.href = 'login.html';
        });
    }

    // Close modal when clicking X or outside
    const closeModalBtn = document.getElementById('closeDetailModal');
    if (closeModalBtn) {
        closeModalBtn.onclick = () => {
            const modal = document.getElementById('companyDetailModal');
            if (modal) modal.style.display = 'none';
        };
    }
    
    window.onclick = (event) => {
        const modal = document.getElementById('companyDetailModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    // --- 13. Add Pagination Container to HTML (if not exists) ---
    const logsSection = document.getElementById('section-logs');
    if (logsSection && !document.getElementById('logPagination')) {
        const paginationDiv = document.createElement('div');
        paginationDiv.id = 'logPagination';
        logsSection.appendChild(paginationDiv);
    }

    // --- 14. User Profile Info with Cookie Auth ---
    fetch(`${API_BASE_URL}/companies/me`, { 
        credentials: 'include'
    })
        .then(r => r.json())
        .then(u => {
            const userName = document.getElementById('userName');
            const userInitial = document.getElementById('userInitial');
            if (userName) userName.textContent = u.name;
            if (userInitial) userInitial.textContent = u.name ? u.name.charAt(0).toUpperCase() : 'A';
        })
        .catch(err => console.error('Failed to load company info:', err));

    // --- Initialize Everything ---
    loadStats();
    loadRecentActivity();
    loadCompanies();
    loadTickets();
    loadFullSystemLogs();
    renderCharts();
});