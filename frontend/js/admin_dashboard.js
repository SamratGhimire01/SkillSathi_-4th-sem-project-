


document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const token = localStorage.getItem('accessToken');

    if (!token) { window.location.href = 'login.html'; return; }

    let allCompanies = [];
    let allLogs = [];

    // --- 1. Fetch Helper ---
    const fetchAPI = async (endpoint, options = {}) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });
        if (response.status === 401) { window.location.href = 'login.html'; }
        return response;
    };

    // --- 2. Navigation Logic ---
    document.querySelectorAll('.sidebar-link[data-target]').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            link.classList.add('active');
            const targetId = link.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- 3. CHART RENDERING ---
    let barChartInstance = null;
    let pieChartInstance = null;

    const renderCharts = async () => {
        const res = await fetchAPI('/admin/charts/data');
        if(!res.ok) return console.error("Could not load chart data.");
        
        const data = await res.json();
        const monthlyData = data.monthly_issuance;
        const statusData = data.center_status;
        
        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // A. Bar Chart (Monthly Issuance)
        const barCtx = document.getElementById('issuanceBarChart');
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Certificates Issued',
                    data: monthlyData,
                    backgroundColor: 'rgba(58, 134, 255, 0.8)',
                    borderRadius: 5,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });

        // B. Pie Chart (Center Status)
        const pieCtx = document.getElementById('centerPieChart');
        if (pieChartInstance) pieChartInstance.destroy();
        
        const pieLabels = Object.keys(statusData).map(s => s.charAt(0).toUpperCase() + s.slice(1));
        const pieValues = Object.values(statusData);

        pieChartInstance = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieValues,
                    backgroundColor: [
                        '#10B981', // Verified (Green)
                        '#F59E0B', // Pending (Warning)
                        '#3A86FF', // Rejected (Blue)
                    ],
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    };

    // --- 4. Log Filtering & Rendering Logic ---
    const renderFullLogs = (logs) => {
    const fullLogsTable = document.getElementById('logsTableBodyFull');
    if (!fullLogsTable) return;
    
    fullLogsTable.innerHTML = logs.map(l => `
        <tr>
            <td>${new Date(l.timestamp).toLocaleString()}</td>
            <td>${l.event_type}</td>
            <td>${l.actor_display}</td> <!-- USE NEW FIELD -->
            <td>${l.details}</td>
        </tr>`).join('');
};

    const applyLogFilters = () => {
        const searchTerm = document.getElementById('logSearchInput').value.toLowerCase();
        const filterType = document.getElementById('logFilterType').value;

        const filtered = allLogs.filter(log => {
            const type = (log.event_type || "").toLowerCase();
            const details = (log.details || "").toLowerCase();
            const actor = (log.actor_type || "").toLowerCase();
            
            let typeMatch = (filterType === 'all') || type.includes(filterType);
            const textMatch = type.includes(searchTerm) || details.includes(searchTerm) || actor.includes(searchTerm);

            return typeMatch && textMatch;
        });

        renderFullLogs(filtered);
    };

    // --- 5. Load Stats & Logs ---
    const loadStatsAndLogs = async () => {
        try {
            const statsRes = await fetchAPI('/admin/stats');
            if(statsRes.ok) {
                const stats = await statsRes.json();
                document.getElementById('totalCenters').textContent = stats.total_centers || 0;
                document.getElementById('totalCerts').textContent = stats.total_certificates || 0;
                document.getElementById('pendingApprovals').textContent = stats.pending_reviews || 0;
                document.getElementById('totalWorkers').textContent = stats.total_workers || 0;
            }

            const logsRes = await fetchAPI('/admin/logs');
if(logsRes.ok) {
    allLogs = await logsRes.json();
    
    // Render Dashboard Overview Logs (top 5)
    const dashboardLogs = allLogs.slice(0, 5);
    document.getElementById('logsTableBody').innerHTML = dashboardLogs.map(l => `
        <tr>
            <td>${new Date(l.timestamp).toLocaleTimeString()}</td>
            <td>${l.event_type}</td>
            <td>${l.actor_display}</td> <!-- USE NEW FIELD -->
            <td>${l.details}</td>
        </tr>`).join('');
    
    // Initial render of the Full Logs page
    renderFullLogs(allLogs);
}
            renderCharts();
        } catch (err) { console.error("Stats/Logs error:", err); }
    };

    // --- 6. Load Companies List & Filtering ---
    const loadCompanies = async () => {
        try {
            const res = await fetchAPI('/admin/companies');
            if(!res.ok) throw new Error("Failed to load");
            allCompanies = await res.json();
            applyCompanyFilters();
        } catch (err) { document.getElementById('companiesTableBody').innerHTML = '<tr><td colspan="6" style="color:red;padding:20px;">Failed to load data</td></tr>'; }
    };

    const applyCompanyFilters = () => {
        const tbody = document.getElementById('companiesTableBody');
        const searchTerm = document.getElementById('companySearchInput').value.toLowerCase();
        const filterStatus = document.getElementById('companyFilterStatus').value;

        const filtered = allCompanies.filter(c => {
            const textMatch = c.name.toLowerCase().includes(searchTerm) || c.email.toLowerCase().includes(searchTerm);
            const statusMatch = filterStatus === 'all' || c.status === filterStatus;
            return textMatch && statusMatch;
        });

        tbody.innerHTML = filtered.map(c => `
        <tr>
            <td>#${c.id}</td>
            <td><strong>${c.name}</strong></td>
            <td>${c.email}</td>
            <td>
                <span class="status-pill status-${c.status}">
                    ${c.status.toUpperCase()}
                </span>
            </td>
            <td>${new Date(c.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn-primary" style="padding:8px 15px;" onclick="openDetailModal(${c.id})">Details</button>
            </td>
        </tr>`).join('');
    };

    // Listeners for company filters
    document.getElementById('companySearchInput').addEventListener('input', applyCompanyFilters);
    document.getElementById('companyFilterStatus').addEventListener('change', applyCompanyFilters);

    // --- 7. Load Support Tickets ---
    const loadTickets = async () => {
        const tbody = document.getElementById('supportTableBody');
        try {
            const res = await fetchAPI('/admin/tickets');
            if(!res.ok) return;
            const tickets = await res.json();
            
            tbody.innerHTML = tickets.map(t => `
                <tr>
                    <td>${new Date(t.created_at).toLocaleDateString()}</td>
                    <td><strong>${t.company_name}</strong></td>
                    <td>${t.subject}</td>
                    <td style="max-width:300px; font-size:0.9rem;">${t.message}</td>
                    <td><span class="status-pill status-${t.status === 'open' ? 'pending' : 'active'}">${t.status}</span></td>
                    <td>
                        ${t.status === 'open' ? 
                        `<button class="btn-primary" onclick="resolveTicket(${t.id})" style="padding:8px 15px;">Resolve</button>` : 
                        `<i data-feather="check" style="color:var(--brand-green);"></i>`}
                    </td>
                </tr>
            `).join('');
            feather.replace();
        } catch(e) { console.error(e); }
    };

    // --- 8. COMPANY DETAIL MODAL (Fully Restored Logic) ---
    window.openDetailModal = async (id) => {
        const modal = document.getElementById('companyDetailModal');
        modal.style.display = 'flex';

        try {
            // 1. Fetch Details + Stats
            const res = await fetchAPI(`/admin/companies/${id}/details`);
            if(!res.ok) throw new Error("Could not fetch details.");
            const data = await res.json();
            const c = data.company;
            const stats = data.stats;

            // 2. Populate Header & Basic Details 
            document.getElementById('detailCompanyName').textContent = c.name || "N/A";

            // Status
            document.getElementById('detailStatus').textContent = c.status;
            document.getElementById('detailStatus').className = `status-pill status-${c.status}`;

            // Contact Details
            document.getElementById('detailEmail').textContent = c.email || "N/A";
            document.getElementById('detailRegNo').textContent = c.business_reg_number || "N/A";
            document.getElementById('detailContactName').textContent = c.primary_contact_name || "N/A";
            document.getElementById('detailCitizen').textContent = c.citizenship_number || "N/A";
            
            // 3. Populate Stats
            document.getElementById('detailWorkers').textContent = stats.workers;
            document.getElementById('detailCertsTotal').textContent = stats.certificates;
            document.getElementById('detailCertsActive').textContent = stats.active_certs;

            // 4. Load Documents 
            const loadDoc = async (url, imgId, linkId) => {
                const docRes = await fetchAPI(url);
                const blob = await docRes.blob();
                const blobUrl = URL.createObjectURL(blob);
                document.getElementById(imgId).src = blobUrl;
                document.getElementById(linkId).href = blobUrl;
            };

            loadDoc(`/admin/companies/${id}/files/photo`, 'detailImgPhoto', 'detailDocLink');
            loadDoc(`/admin/companies/${id}/files/doc`, 'detailDocFrame', 'detailDocLink');
            
            // 5. Setup Buttons
            const btnApprove = document.getElementById('btnDetailApprove');
            const btnReject = document.getElementById('btnDetailReject');
            const btnDelete = document.getElementById('btnDetailDelete');
            
            btnApprove.style.display = c.status === 'pending' ? 'block' : 'none';
            btnReject.style.display = c.status !== 'rejected' ? 'block' : 'none';
            btnDelete.style.display = 'block';

            btnApprove.onclick = async () => { if(confirm('Approve?')) { await fetchAPI(`/admin/companies/${id}/approve`, { method: 'PUT' }); modal.style.display = 'none'; loadCompanies(); loadStatsAndLogs(); } };
            btnReject.onclick = async () => { if(confirm('Reject?')) { await fetchAPI(`/admin/companies/${id}/reject`, { method: 'PUT' }); modal.style.display = 'none'; loadCompanies(); loadStatsAndLogs(); } };
            btnDelete.onclick = async () => { if(confirm('Delete entire company?')) { await fetchAPI(`/admin/companies/${id}`, { method: 'DELETE' }); modal.style.display = 'none'; loadCompanies(); loadStatsAndLogs(); } };


        } catch(e) {
            console.error("Detail Modal Crash:", e);
            alert("Error loading application details. Check console.");
        }
    };
    
    // --- 9. Global Actions ---
    window.resolveTicket = async (id) => {
        if(!confirm("Mark resolved?")) return;
        await fetchAPI(`/admin/tickets/${id}/resolve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' } });
        loadTickets();
    };


    // --- Init ---
    document.getElementById('logoutButton').addEventListener('click', () => {
        localStorage.removeItem('accessToken');
        window.location.href = 'login.html';

    
        
    });
    
    loadStatsAndLogs();
    loadCompanies();
    loadTickets();

    // Add this function to the TOP of the JS file (Outside DOMContentLoaded)


    
    // Attach event listeners for the Audit Logs filtering
    document.getElementById('logSearchInput').addEventListener('input', applyLogFilters);
    document.getElementById('logFilterType').addEventListener('change', applyLogFilters);


});

