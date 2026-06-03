// frontend/js/audit_logs.js

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        // Trigger backend session destruction
        fetch('http://127.0.0.1:8000/auth/logout', { method: 'POST', credentials: 'include' })
            .catch(err => console.error("Logout sweep failed:", err));

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

    let currentPage = 1;
    let totalPages = 1;
    const PER_PAGE = 15;

    // Event colors for visual styling
    const eventColors = {
        'delete_worker':       '#EF4444',
        'delete_certificate':  '#EF4444',
        'delete_company':      '#EF4444',
        'worker_deleted':      '#EF4444',
        'certificate_deleted': '#EF4444',
        'create_worker':       '#10B981',
        'issue_certificate':   '#10B981',
        'issued':              '#10B981',
        'approved':            '#10B981',
        'rejected':            '#EF4444',
        'revoked':             '#F59E0B',
        'verified':            '#3B82F6',
        'anchored':            '#8B5CF6',
        'login':               '#6B7280',
        'cert_submitted':      '#3B82F6',
        'cert_approved':       '#10B981',
        'cert_rejected':       '#EF4444',
        'cert_expiring':       '#F59E0B',
    };

    // ── Render Function with Date Grouping ───────────────────
    function renderLogs(logs) {
        const tbody = document.getElementById('auditLogTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:gray">No activity found.</td></tr>';
            return;
        }

        let lastGroupedDate = "";

        logs.forEach(log => {
            const ts = log.timestamp || log.created_at;
            if (!ts) return;
            
            const dateObj = new Date(ts);
            const friendlyDateStr = dateObj.toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
            });
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const eventType = log.event_type || '';
            const color = eventColors[eventType] || '#6B7280';
            let details = log.details || log.detail || '';
            let actor = log.actor_type || 'system';

            // Format actor display
            if (actor === 'company') {
                actor = '<span class="status-pill status-active" style="background:#E2F6ED; color:#03A65A; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:600;">Admin</span>';
            } else if (actor === 'staff' || actor === 'worker') {
                actor = `<span class="status-pill status-pending" style="background:#FFF5E6; color:#FF9900; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:600;">Staff</span>`;
            } else if (actor === 'system') {
                actor = `<span class="status-pill" style="background:#F3F4F6; color:#6B7280; padding:4px 10px; border-radius:12px; font-size:0.75rem; font-weight:600;">System</span>`;
            }

            // Highlight delete actions
            if (details.toLowerCase().includes('delete') || details.toLowerCase().includes('deleted')) {
                details = `<span style="color:#EF4444; font-weight:500;">${details}</span>`;
            }

            // Date header separator
            if (friendlyDateStr !== lastGroupedDate) {
                lastGroupedDate = friendlyDateStr;
                const headerRow = `
                    <tr style="background-color: #F4F7FE;">
                        <td colspan="4" style="padding: 12px 16px; font-weight: 700; color: #1B2559; font-size: 0.9rem;">
                            📅 ${friendlyDateStr}
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', headerRow);
            }

            const row = `
                <tr>
                    <td style="padding-left: 1.5rem;">
                        <div style="font-weight:600; color:#2B3674;">${dateStr}</div>
                        <div style="font-size:0.75rem; color:#A3AED0;">${timeStr}</div>
                    </td>
                    <td>
                        <span style="background:${color}20; color:${color}; padding:4px 12px; border-radius:20px; font-weight:600; font-size:0.75rem;">
                            ${eventType.replace(/_/g, ' ').toUpperCase()}
                        </span>
                    </td>
                    <td>${actor}</td>
                    <td style="font-size:0.85rem; color:#475569; max-width:400px;">${details}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    }

    // ── Pagination Controls ───────────────────────────────────
    function renderPagination() {
        const container = document.getElementById('paginationControls');
        if (!container) return;

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; justify-content:center; padding:20px 0;">
                <button id="prevPageBtn" 
                    ${currentPage === 1 ? 'disabled' : ''}
                    style="padding:8px 16px; border-radius:8px; border:1px solid #E5E7EB;
                           background:${currentPage === 1 ? '#F9FAFB' : 'white'};
                           color:${currentPage === 1 ? '#9CA3AF' : '#2B3674'};
                           cursor:${currentPage === 1 ? 'not-allowed' : 'pointer'}; font-weight:600;">
                    ← Previous
                </button>

                <span style="font-size:0.9rem; color:#6B7280;">
                    Page <strong style="color:#2B3674;">${currentPage}</strong> of <strong style="color:#2B3674;">${totalPages}</strong>
                </span>

                <button id="nextPageBtn"
                    ${currentPage === totalPages ? 'disabled' : ''}
                    style="padding:8px 16px; border-radius:8px; border:1px solid #E5E7EB;
                           background:${currentPage === totalPages ? '#F9FAFB' : '#2B3674'};
                           color:${currentPage === totalPages ? '#9CA3AF' : 'white'};
                           cursor:${currentPage === totalPages ? 'not-allowed' : 'pointer'}; font-weight:600;">
                    Next →
                </button>
            </div>
        `;

        // Attach event listeners
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        
        if (prevBtn && currentPage > 1) {
            prevBtn.onclick = () => {
                currentPage--;
                loadAuditLogs();
            };
        }
        
        if (nextBtn && currentPage < totalPages) {
            nextBtn.onclick = () => {
                currentPage++;
                loadAuditLogs();
            };
        }
    }

    // ── Load Data from Secure Dashboard Endpoint ──────────────
    async function loadAuditLogs() {
        const searchTerm = document.getElementById('logSearchInput')?.value.toLowerCase() || '';
        const eventType = document.getElementById('logFilterSelect')?.value || 'all';

        try {
            // FIX: Target the authorized company dashboard log route using HttpOnly cookie sessions
            const res = await fetch(`${API_BASE_URL}/dashboard/audit-logs`, { 
                method: 'GET',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
                if (res.status === 401) {
                    localStorage.removeItem('is_logged_in');
                    window.location.href = 'login.html';
                    return;
                }
                throw new Error("Failed to pull dashboard activity stream.");
            }

            let logs = await res.json();

            // Perform high-performance client side filtering to accommodate dashboard limitations
            if (eventType !== 'all') {
                logs = logs.filter(l => (l.event_type || '').toLowerCase() === eventType.toLowerCase());
            }

            if (searchTerm) {
                logs = logs.filter(l => 
                    (l.details || l.detail || '').toLowerCase().includes(searchTerm) ||
                    (l.event_type || '').toLowerCase().includes(searchTerm)
                );
            }

            // Calculate pagination window limits metrics dynamically
            totalPages = Math.ceil(logs.length / PER_PAGE) || 1;
            
            // Boundary enforcement for page mutations
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            const startIndex = (currentPage - 1) * PER_PAGE;
            const paginatedLogs = logs.slice(startIndex, startIndex + PER_PAGE);
            
            renderLogs(paginatedLogs);
            renderPagination();

        } catch (err) {
            console.error('Failed to load audit logs:', err);
            const tbody = document.getElementById('auditLogTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:red">Error loading logs. Please try again.</td></tr>';
            }
        }
    }

    // ── Filter Event Listeners ────────────────────────────────
    const searchInput = document.getElementById('logSearchInput');
    const filterSelect = document.getElementById('logFilterSelect');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            loadAuditLogs();
        });
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            currentPage = 1;
            loadAuditLogs();
        });
    }

    // ── User Profile Info with Cookie Auth ────────────────────
    fetch(`${API_BASE_URL}/companies/me`, { 
        credentials: 'include'
    })
        .then(r => {
            if (!r.ok) throw new Error();
            return r.json();
        })
        .then(u => {
            const userName = document.getElementById('userName');
            const userInitial = document.getElementById('userInitial');
            if (userName) userName.textContent = u.name;
            if (userInitial) userInitial.textContent = u.name ? u.name.charAt(0).toUpperCase() : 'U';
        })
        .catch(err => console.error('Failed to load company info:', err));

    // ── Logout Button (clear session flag only) ───────────────
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            confirmLogout(e);
        };
    }

    // ── Initialize ────────────────────────────────────────────
    loadAuditLogs();
});