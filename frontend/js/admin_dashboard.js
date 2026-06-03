// frontend/js/admin_dashboard.js

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('is_logged_in');
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";

    if (localStorage.getItem('is_logged_in') !== 'true') { 
        window.location.href = 'login.html'; 
        return; 
    }

    let allCompanies = [];
    let allLogs = [];
    let allImmutableLogs = [];

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

    // Helper function to format date properly
    function formatDate(dateValue) {
        if (!dateValue) return 'N/A';
        try {
            const date = new Date(dateValue);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch(e) {
            return 'N/A';
        }
    }

    // Toast notification function
    function showToast(message, type = 'success') {
        const existing = document.getElementById('admin-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.id = 'admin-toast';
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
            toast.remove();
        }, 3000);
    }

    // --- 1. Fetch Helper ---
    const fetchAPI = async (endpoint, options = {}) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
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
                            legend: { 
                                display: true,
                                position: 'top',
                                labels: { font: { size: 12 } }
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
                                ticks: { precision: 0 },
                                title: { display: true, text: 'Number of Certificates' }
                            },
                            x: {
                                title: { display: true, text: 'Month' }
                            }
                        }
                    }
                });
            }

            // B. Pie Chart (Center Status)
            const pieCtx = document.getElementById('centerPieChart');
            if (pieCtx) {
                if (pieChartInstance) pieChartInstance.destroy();
                
                const pieLabels = Object.keys(statusData).map(s => s.charAt(0).toUpperCase() + s.slice(1));
                const pieValues = Object.values(statusData);
                const pieColors = {
                    'verified': '#10B981',
                    'pending': '#F59E0B', 
                    'rejected': '#EF4444'
                };

                pieChartInstance = new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: pieLabels,
                        datasets: [{
                            data: pieValues,
                            backgroundColor: pieValues.map((_, i) => {
                                const key = Object.keys(statusData)[i];
                                return pieColors[key] || '#3A86FF';
                            }),
                            borderWidth: 0,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { 
                            legend: { 
                                position: 'bottom',
                                labels: { padding: 15, font: { size: 11 } }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const label = context.label || '';
                                        const value = context.parsed || 0;
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                        return `${label}: ${value} (${percent}%)`;
                                    }
                                }
                            }
                        },
                        cutout: '60%'
                    }
                });
            }
        } catch (err) { 
            console.error("Chart rendering error:", err); 
        }
    };

    // --- 4. Log Filtering & Rendering Logic ---
    let currentLogPage = 1;
    let totalLogPages = 1;
    const LOGS_PER_PAGE = 15;

    const renderFullLogs = (logs) => {
        const fullLogsTable = document.getElementById('logsTableBodyFull');
        if (!fullLogsTable) return;
        
        if (!logs || logs.length === 0) {
            fullLogsTable.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:gray">No logs found.可能</td></table>';
            return;
        }
        
        fullLogsTable.innerHTML = logs.map(l => `
            <tr>
                <td style="white-space:nowrap;">${new Date(l.timestamp || l.created_at).toLocaleString()}</td>
                <td><span class="status-pill" style="background:#EFF6FF; color:#3B82F6;">${l.event_type || 'N/A'}</span></td>
                <td>${l.actor_display || l.actor_type || 'System'}</td>
                <td style="max-width:400px; word-break:break-word;">${l.details || l.detail || ''}</td>
            </tr>
        `).join('');
    };

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
                    Page <strong style="color:#2B3674;">${currentLogPage}</strong> of <strong style="color:#2B3674;">${totalLogPages}</strong>
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
                loadAuditLogs();
            };
        }
        
        if (nextBtn && currentLogPage < totalLogPages) {
            nextBtn.onclick = () => {
                currentLogPage++;
                loadAuditLogs();
            };
        }
    };

    const loadAuditLogs = async () => {
        const searchTerm = document.getElementById('logSearchInput')?.value || '';
        const filterType = document.getElementById('logFilterType')?.value || 'all';

        try {
            const params = new URLSearchParams({
                page: currentLogPage,
                per_page: LOGS_PER_PAGE,
                event_type: filterType,
                search: searchTerm
            });

            const res = await fetchAPI(`/admin/logs?${params}`);
            if (res.ok) {
                const data = await res.json();
                const logs = data.logs || [];
                totalLogPages = data.total_pages || 1;
                renderFullLogs(logs);
                renderLogPagination();
            } else {
                console.error('Failed to load audit logs');
            }
        } catch (err) { 
            console.error("Audit logs error:", err); 
        }
    };

    const applyLogFilters = () => {
        currentLogPage = 1;
        loadAuditLogs();
    };

    // --- 5. Load Stats ---
    const loadStats = async () => {
        try {
            const statsRes = await fetchAPI('/admin/stats');
            if(statsRes.ok) {
                const stats = await statsRes.json();
                document.getElementById('totalCenters').textContent = stats.total_centers || 0;
                document.getElementById('totalCerts').textContent = stats.total_certificates || 0;
                document.getElementById('pendingApprovals').textContent = stats.pending_reviews || 0;
                document.getElementById('totalWorkers').textContent = stats.total_workers || 0;
                document.getElementById('totalRevocations').textContent = stats.total_revocations || 0;
            }
        } catch (err) { console.error("Stats error:", err); }
    };

    // --- 6. Load Recent Activity for Dashboard ---
    const loadRecentActivity = async () => {
        try {
            const res = await fetchAPI('/admin/logs?page=1&per_page=5');
            if(res.ok) {
                const data = await res.json();
                const recentLogs = data.logs || [];
                const logsTableBody = document.getElementById('logsTableBody');
                if (logsTableBody) {
                    logsTableBody.innerHTML = recentLogs.map(l => `
                        <tr>
                            <td style="white-space:nowrap;">${new Date(l.timestamp).toLocaleTimeString()}</td>
                            <td><span class="status-pill" style="background:#EFF6FF; color:#3B82F6;">${l.event_type || 'N/A'}</span></td>
                            <td>${l.actor_display || l.actor_type || 'System'}</td>
                            <td>${l.details || ''}</td>
                        </tr>
                    `).join('');
                }
            }
        } catch (err) { console.error("Recent activity error:", err); }
    };

    // --- 7. Load Companies List & Filtering ---
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

        tbody.innerHTML = filtered.map(c => {
            // Format the joined date properly
            let joinedDate = 'N/A';
            const dateField = c.created_at || c.createdAt || c.registration_date || c.joined_date;
            
            if (dateField) {
                try {
                    const date = new Date(dateField);
                    if (!isNaN(date.getTime())) {
                        joinedDate = date.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        });
                    }
                } catch(e) {
                    console.error('Date parsing error:', e);
                    joinedDate = 'Invalid Date';
                }
            }
            
            return `
                <tr>
                    <td>#${c.id}</td>
                    <td><strong>${c.name || 'N/A'}</strong></td>
                    <td>${c.email || 'N/A'}</td>
                    <td>
                        <span class="status-pill status-${c.status || 'pending'}">
                            ${(c.status || 'PENDING').toUpperCase()}
                        </span>
                    </td>
                    <td>${joinedDate}</td>
                    <td>
                        <button class="btn-primary" style="padding:8px 15px;" onclick="window.openDetailModal(${c.id})">Details</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // --- 8. Load Support Tickets ---
    const loadTickets = async () => {
        const tbody = document.getElementById('supportTableBody');
        if (!tbody) return;
        
        try {
            const res = await fetchAPI('/admin/tickets');
            if(!res.ok) return;
            const tickets = await res.json();
            
            if (!tickets || tickets.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:gray;">No support tickets found.</td></tr>';
                return;
            }
            
            tbody.innerHTML = tickets.map(t => `
                <tr>
                    <td style="white-space:nowrap;">${formatDate(t.created_at)}</td>
                    <td><strong>${escapeHtml(t.company_name || 'N/A')}</strong></td>
                    <td>${escapeHtml(t.subject || 'N/A')}</td>
                    <td style="max-width:300px;">${escapeHtml(t.message || 'N/A')}</td>
                    <td><span class="status-pill status-${t.status === 'open' ? 'pending' : 'active'}">${t.status || 'open'}</span></td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            ${t.status === 'open' ? 
                                `<button class="btn-primary" onclick="window.showRespondModal(${t.id}, '${escapeHtml(t.company_name)}')" style="padding:8px 15px; background:#3B82F6;">
                                    <i data-feather="message-circle"></i> Respond
                                </button>
                                <button class="btn-primary" onclick="window.resolveTicket(${t.id})" style="padding:8px 15px; background:#10B981;">
                                    <i data-feather="check"></i> Resolve
                                </button>` : 
                                `<i data-feather="check-circle" style="color:var(--brand-green);"></i> Resolved`
                            }
                        </div>
                    </td>
                </tr>
            `).join('');
            
            if (typeof feather !== 'undefined') feather.replace();
        } catch(e) { 
            console.error('Error loading tickets:', e);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:red;">Error loading tickets</td></tr>';
        }
    };

    // --- 9. COMPANY DETAIL MODAL ---
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
            
            // Show joined date in modal if element exists
            const joinedDateElem = document.getElementById('detailJoinedDate');
            if (joinedDateElem) {
                const joinedDate = c.created_at || c.createdAt || c.registration_date;
                joinedDateElem.textContent = formatDate(joinedDate);
            }

            const loadDoc = async (url, imgId, frameId) => {
                try {
                    const docRes = await fetchAPI(url);
                    const blob = await docRes.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    if (imgId && document.getElementById(imgId)) {
                        document.getElementById(imgId).src = blobUrl;
                    }
                    if (frameId && document.getElementById(frameId)) {
                        document.getElementById(frameId).src = blobUrl;
                    }
                } catch(e) {
                    console.error("Failed to load document:", e);
                }
            };

            loadDoc(`/admin/companies/${id}/files/photo`, 'detailImgPhoto', null);
            loadDoc(`/admin/companies/${id}/files/doc`, null, 'detailDocFrame');
            
            const btnApprove = document.getElementById('btnDetailApprove');
            const btnReject = document.getElementById('btnDetailReject');
            const btnDelete = document.getElementById('btnDetailDelete');
            
            if (btnApprove) btnApprove.style.display = c.status === 'pending' ? 'inline-block' : 'none';
            if (btnReject) btnReject.style.display = c.status !== 'rejected' ? 'inline-block' : 'none';
            if (btnDelete) btnDelete.style.display = 'inline-block';

            if (btnApprove) {
                btnApprove.onclick = async () => { 
                    if(confirm('Approve this company?')) { 
                        await fetchAPI(`/admin/companies/${id}/approve`, { method: 'PUT' }); 
                        modal.style.display = 'none'; 
                        loadCompanies(); 
                        loadStats(); 
                    } 
                };
            }
            
            if (btnReject) {
                btnReject.onclick = async () => { 
                    if(confirm('Reject this company?')) { 
                        await fetchAPI(`/admin/companies/${id}/reject`, { method: 'PUT' }); 
                        modal.style.display = 'none'; 
                        loadCompanies(); 
                        loadStats(); 
                    } 
                };
            }
            
            if (btnDelete) {
                btnDelete.onclick = async () => { 
                    if(confirm('Delete entire company? This action cannot be undone!')) { 
                        await fetchAPI(`/admin/companies/${id}`, { method: 'DELETE' }); 
                        modal.style.display = 'none'; 
                        loadCompanies(); 
                        loadStats(); 
                    } 
                };
            }

        } catch(e) {
            console.error("Detail Modal Error:", e);
            alert("Error loading company details.");
        }
    };
    
    // --- 10. Ticket Management Functions ---
    window.resolveTicket = async (id) => {
        if(!confirm("Mark this ticket as resolved?")) return;
        const res = await fetchAPI(`/admin/tickets/${id}/resolve`, { method: 'PUT' });
        if (res && res.ok) {
            showToast('Ticket marked as resolved', 'success');
            loadTickets();
        }
    };

    window.respondToTicket = async (ticketId, response) => {
        if (!response || response.trim() === '') {
            showToast('Please enter a response message', 'error');
            return;
        }
        
        try {
            const res = await fetchAPI(`/admin/tickets/${ticketId}/respond`, {
                method: 'POST',
                body: JSON.stringify({ response: response })
            });
            
            if (res && res.ok) {
                const data = await res.json();
                showToast('Response sent to user successfully!', 'success');
                loadTickets();
            } else {
                const error = await res?.json().catch(() => ({}));
                showToast('Error: ' + (error.detail || 'Failed to send response'), 'error');
            }
        } catch (err) {
            console.error('Response error:', err);
            showToast('Network error. Please try again.', 'error');
        }
    };

    window.showRespondModal = (ticketId, companyName) => {
        const response = prompt(`Enter your response for ${companyName}:`);
        if (response && response.trim()) {
            window.respondToTicket(ticketId, response);
        }
    };

    window.closeDetailModal = () => {
        const modal = document.getElementById('companyDetailModal');
        if (modal) modal.style.display = 'none';
    };

    // --- 11. Event Listeners ---
    const companySearch = document.getElementById('companySearchInput');
    const companyFilter = document.getElementById('companyFilterStatus');
    const logSearch = document.getElementById('logSearchInput');
    const logFilter = document.getElementById('logFilterType');
    
    if (companySearch) companySearch.addEventListener('input', applyCompanyFilters);
    if (companyFilter) companyFilter.addEventListener('change', applyCompanyFilters);
    if (logSearch) logSearch.addEventListener('input', applyLogFilters);
    if (logFilter) logFilter.addEventListener('change', applyLogFilters);

    // Logout
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('is_logged_in');
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

    // Add animation styles
    if (!document.querySelector('#admin-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'admin-toast-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    // --- Initialize Everything ---
    loadStats();
    loadRecentActivity();
    loadCompanies();
    loadTickets();
    loadAuditLogs();
    renderCharts();
});