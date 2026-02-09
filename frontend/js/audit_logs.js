

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const token = localStorage.getItem('accessToken');

    if (!token) { window.location.href = 'login.html'; return; }

    let allLogs = [];

    // --- 1. Render Function ---
    const renderLogs = (logs) => {
        const tbody = document.getElementById('auditLogTableBody');
        tbody.innerHTML = '';

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:gray">No matching activity found.</td></tr>';
            return;
        }

        logs.forEach(log => {
            const dateObj = new Date(log.timestamp);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            let actorDisplay = log.actor_type === 'company' 
                ? '<span class="status-pill status-active">Admin</span>' 
                : `<span class="status-pill status-pending">Staff ${log.actor_id}</span>`;

            // Highlight keywords
            let details = log.details || "";
            if (details.includes("Deleted")) details = `<span style="color:#EF4444; font-weight:bold;">${details}</span>`;

            const row = `
                <tr>
                    <td>
                        <div style="font-weight:600; color:#2B3674;">${dateStr}</div>
                        <div style="font-size:0.8rem; color:#A3AED0;">${timeStr}</div>
                    </td>
                    <td style="text-transform:capitalize; font-weight:600;">${log.event_type.replace(/_/g, ' ')}</td>
                    <td>${actorDisplay}</td>
                    <td>${details}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    };

    // --- 2. Filter Logic (Unified) ---
    const applyFilters = () => {
        const searchTerm = document.getElementById('logSearchInput').value.toLowerCase();
        const filterType = document.getElementById('logFilterSelect').value;

        const filtered = allLogs.filter(log => {
            const type = (log.event_type || "").toLowerCase();
            const details = (log.details || "").toLowerCase();
            
            // Check Dropdown
            let typeMatch = true;
            if (filterType !== 'all') {
                typeMatch = type.includes(filterType);
            }

            // Check Search Box
            const textMatch = type.includes(searchTerm) || details.includes(searchTerm);

            return typeMatch && textMatch;
        });

        renderLogs(filtered);
    };

    // --- 3. Fetch Data ---
    async function loadAuditLogs() {
        try {
            const res = await fetch(`${API_BASE_URL}/dashboard/audit-logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed");
            allLogs = await res.json(); 
            renderLogs(allLogs);
        } catch (err) {
            console.error(err);
        }
    }

    // --- Listeners ---
    document.getElementById('logSearchInput').addEventListener('input', applyFilters);
    document.getElementById('logFilterSelect').addEventListener('change', applyFilters);

    // Header Info
    fetch(`${API_BASE_URL}/companies/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(u => {
            document.getElementById('userName').textContent = u.name;
            document.getElementById('userInitial').textContent = u.name[0];
        });

    document.getElementById('logoutButton').onclick = () => {
        localStorage.clear(); window.location.href = 'login.html';
    };

    loadAuditLogs();
});