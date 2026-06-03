// frontend/js/certificates.js (FIXED VERSION - WITH BULK SELECT, DELETE & REVOKE)

// ============================================
// GLOBAL FUNCTIONS
// ============================================

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('is_logged_in');
        sessionStorage.removeItem('is_logged_in');
        window.location.href = 'login.html';
    }
}

// ============================================
// MAIN APPLICATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // ---------- CONSTANTS ----------
    const API_BASE_URL = "http://127.0.0.1:8000";
    const ITEMS_PER_PAGE = 10;
    
    // ---------- STATE VARIABLES ----------
    let allCertificates = [];
    let filteredCertificates = [];
    let currentPage = 1;
    let selectedCertificates = new Set(); // Store selected certificate IDs
    
    // ---------- AUTHENTICATION CHECK ----------
    // Cookie-compatible session check
    if (localStorage.getItem('is_logged_in') !== 'true') {
        window.location.href = 'login.html';
        return;
    }
    
    // ============================================
    // BULK ACTION FUNCTIONS
    // ============================================
    
    const updateBulkActionsBar = () => {
        const bar = document.getElementById('bulkActionsBar');
        const countSpan = document.getElementById('selectedCount');
        const count = selectedCertificates.size;
        
        if (bar) {
            if (count > 0) {
                bar.classList.add('show');
                if (countSpan) countSpan.textContent = count;
            } else {
                bar.classList.remove('show');
            }
        }
    };
    
    const clearSelection = () => {
        selectedCertificates.clear();
        updateBulkActionsBar();
        renderCertificates(); // Re-render to uncheck all checkboxes
    };
    
    const bulkRevoke = async () => {
        const selectedIds = Array.from(selectedCertificates);
        if (selectedIds.length === 0) {
            alert("No certificates selected.");
            return;
        }
        
        // Show bulk revoke modal
        const bulkRevokeCount = document.getElementById('bulkRevokeCount');
        const bulkRevokeModal = document.getElementById('bulkRevokeModal');
        const bulkRevokeReason = document.getElementById('bulkRevokeReason');
        
        if (bulkRevokeCount) bulkRevokeCount.textContent = selectedIds.length;
        if (bulkRevokeReason) bulkRevokeReason.value = '';
        if (bulkRevokeModal) bulkRevokeModal.style.display = 'flex';
        
        // Store selected IDs for use in confirmation
        window.pendingBulkRevokeIds = selectedIds;
    };
    
    const confirmBulkRevoke = async () => {
        const selectedIds = window.pendingBulkRevokeIds || [];
        const reasonInput = document.getElementById('bulkRevokeReason');
        const reason = reasonInput ? (reasonInput.value || "Bulk revocation from dashboard") : "Bulk revocation from dashboard";
        
        if (selectedIds.length === 0) return;
        
        let successCount = 0;
        let failCount = 0;
        
        for (const id of selectedIds) {
            try {
                const response = await fetch(`${API_BASE_URL}/certificates/${id}/revoke`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ reason: reason }),
                    credentials: 'include'
                });
                
                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                failCount++;
                console.error(`Failed to revoke certificate ${id}:`, err);
            }
        }
        
        alert(`Revoked ${successCount} certificate(s). Failed: ${failCount}`);
        
        // Close modal and reset
        const bulkRevokeModal = document.getElementById('bulkRevokeModal');
        if (bulkRevokeModal) bulkRevokeModal.style.display = 'none';
        clearSelection();
        await loadCertificates();
    };
    
    const bulkDelete = async () => {
        const selectedIds = Array.from(selectedCertificates);
        if (selectedIds.length === 0) {
            alert("No certificates selected.");
            return;
        }
        
        // Show bulk delete modal
        const bulkDeleteCount = document.getElementById('bulkDeleteCount');
        const bulkDeleteModal = document.getElementById('bulkDeleteModal');
        const bulkDeleteConfirm = document.getElementById('bulkDeleteConfirm');
        const confirmBulkDeleteBtn = document.getElementById('confirmBulkDeleteBtn');
        
        if (bulkDeleteCount) bulkDeleteCount.textContent = selectedIds.length;
        if (bulkDeleteConfirm) bulkDeleteConfirm.value = '';
        if (confirmBulkDeleteBtn) confirmBulkDeleteBtn.disabled = true;
        if (bulkDeleteModal) bulkDeleteModal.style.display = 'flex';
        
        // Store selected IDs for use in confirmation
        window.pendingBulkDeleteIds = selectedIds;
    };
    
    const confirmBulkDelete = async () => {
        const selectedIds = window.pendingBulkDeleteIds || [];
        
        if (selectedIds.length === 0) return;
        
        let successCount = 0;
        let failCount = 0;
        
        for (const id of selectedIds) {
            try {
                const response = await fetch(`${API_BASE_URL}/certificates/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
                
                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                failCount++;
                console.error(`Failed to delete certificate ${id}:`, err);
            }
        }
        
        alert(`Deleted ${successCount} certificate(s). Failed: ${failCount}`);
        
        // Close modal and reset
        const bulkDeleteModal = document.getElementById('bulkDeleteModal');
        if (bulkDeleteModal) bulkDeleteModal.style.display = 'none';
        clearSelection();
        await loadCertificates();
    };
    
    const selectAllCertificates = () => {
        // Get current page certificates (visible)
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const pageItems = filteredCertificates.slice(startIndex, endIndex);
        
        if (pageItems.length === 0) return;
        
        // Check if all page items are already selected
        const allSelected = pageItems.every(cert => selectedCertificates.has(cert.id));
        
        if (allSelected) {
            // Deselect all on current page
            pageItems.forEach(cert => selectedCertificates.delete(cert.id));
        } else {
            // Select all on current page
            pageItems.forEach(cert => selectedCertificates.add(cert.id));
        }
        
        updateBulkActionsBar();
        renderCertificates();
    };
    
    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    
const renderCertificates = () => {
    const listContainer = document.getElementById('certificateList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (filteredCertificates.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding:2rem; color:gray;">No matching certificates.</p>';
        renderPaginationControls(0);
        return;
    }
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = filteredCertificates.slice(startIndex, endIndex);
    
    // Add select all checkbox in a header row
    const allSelectedOnPage = pageItems.length > 0 && pageItems.every(cert => selectedCertificates.has(cert.id));
    const selectAllHTML = `
        <div style="display: flex; align-items: center; padding: 8px 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 12px;">
            <input type="checkbox" id="selectAllCheckbox" class="select-all-checkbox" ${allSelectedOnPage ? 'checked' : ''}>
            <label for="selectAllCheckbox" style="cursor: pointer; font-size: 0.85rem; color: #475569; margin-left: 8px;">Select All on this page (${pageItems.length} items)</label>
        </div>
    `;
    listContainer.insertAdjacentHTML('beforeend', selectAllHTML);
    
    let lastGroupedDate = "";
    
    pageItems.forEach(cert => {
        const dateTarget = cert.issue_date || cert.created_at;
        const dateObj = new Date(dateTarget);
        const friendlyDateStr = dateObj.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        const displayDateStr = dateObj.toLocaleDateString();
        
        // Date header separator
        if (friendlyDateStr !== lastGroupedDate) {
            lastGroupedDate = friendlyDateStr;
            const dateHeaderHTML = `
                <div class="cert-date-group-header" style="width:100%; margin:1.5rem 0 0.75rem; padding:8px 12px; background:#F4F7FE; border-radius:8px; font-weight:700; color:#1B2559; font-size:0.95rem; display:flex; align-items:center;">
                    📅 ${friendlyDateStr}
                </div>
            `;
            listContainer.insertAdjacentHTML('beforeend', dateHeaderHTML);
        }
        
        // Status badge
        let statusText = cert.status.replace('_', ' ');
        let statusClass = 'status-pending';
        
        if (cert.status === 'active') {
            statusClass = 'status-active';
        } else if (cert.status === 'revoked' || cert.status === 'expired') {
            statusClass = 'status-revoked';
        }
        
        const statusBadge = `<span class="status-pill ${statusClass}">${statusText.toUpperCase()}</span>`;
        
        const isPending = cert.status === 'pending_approval';
        const isRevoked = cert.status === 'revoked';
        const isChecked = selectedCertificates.has(cert.id);
        
        // Action buttons - MODIFIED SECTION WITH APPROVE/REJECT BUTTONS
        const actionBtns = isPending ? `
            <button onclick="window.approveCertificate(${cert.id})" class="icon-btn" style="color:#10B981;" title="Approve">
                <i data-feather="check-circle"></i>
            </button>
            <button onclick="window.rejectCertificate(${cert.id})" class="icon-btn btn-red" title="Reject">
                <i data-feather="x-circle"></i>
            </button>
            <button onclick="window.openDeleteModal(${cert.id}, '${cert.recipient_name.replace(/'/g, "\\'")}')" class="icon-btn btn-red" title="Delete">
                <i data-feather="trash-2"></i>
            </button>
        ` : `
            <button onclick="window.openPreview(${cert.id})" class="icon-btn" title="Preview">
                <i data-feather="eye"></i>
            </button>
            <button onclick="window.sendEmail(${cert.id}, '${cert.recipient_email}', '${cert.recipient_name.replace(/'/g, "\\'")}')" class="icon-btn" title="Email" ${isRevoked ? 'disabled style="opacity:0.5"' : ''}>
                <i data-feather="mail"></i>
            </button>
            <button onclick="window.showQr('${cert.certificate_uid}')" class="icon-btn" title="QR" ${isRevoked ? 'disabled style="opacity:0.5"' : ''}>
                <i data-feather="grid"></i>
            </button>
            <button onclick="window.revokeCert(${cert.id})" class="icon-btn btn-red" title="Revoke" ${isRevoked ? 'disabled style="opacity:0.5"' : ''}>
                <i data-feather="slash"></i>
            </button>
            <button onclick="window.openDeleteModal(${cert.id}, '${cert.recipient_name.replace(/'/g, "\\'")}')" class="icon-btn btn-red" title="Delete">
                <i data-feather="trash-2"></i>
            </button>
        `;
        
        const itemHTML = `
            <div class="cert-list-item" style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 12px;">
                <div class="cert-checkbox-wrapper">
                    <input type="checkbox" class="cert-checkbox" data-id="${cert.id}" ${isChecked ? 'checked' : ''}>
                </div>
                <div class="cert-info" style="flex: 1; display: flex; gap: 12px;">
                    <div class="cert-icon"><i data-feather="file-text"></i></div>
                    <div class="cert-details">
                        <h4>${cert.course_title}</h4>
                        <p>To: <strong>${cert.recipient_name}</strong> • ${displayDateStr}</p>
                        <p><small style="font-family:monospace; color:#A3AED0;">${cert.certificate_uid}</small> • ${statusBadge}</p>
                    </div>
                </div>
                <div class="action-btn-group">${actionBtns}</div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', itemHTML);
    });
    
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
    
    renderPaginationControls(filteredCertificates.length);
    
    // Attach checkbox event listeners
    document.querySelectorAll('.cert-checkbox').forEach(checkbox => {
        checkbox.removeEventListener('change', handleCheckboxChange);
        checkbox.addEventListener('change', handleCheckboxChange);
    });
    
    // Attach select all checkbox event
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.removeEventListener('change', selectAllCertificates);
        selectAllCheckbox.addEventListener('change', selectAllCertificates);
    }
};
    
    const handleCheckboxChange = (e) => {
        const certId = parseInt(e.target.dataset.id);
        if (e.target.checked) {
            selectedCertificates.add(certId);
        } else {
            selectedCertificates.delete(certId);
        }
        updateBulkActionsBar();
        
        // Update select all checkbox state
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const pageItems = filteredCertificates.slice(startIndex, endIndex);
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (selectAllCheckbox && pageItems.length > 0) {
            const allSelected = pageItems.every(cert => selectedCertificates.has(cert.id));
            selectAllCheckbox.checked = allSelected;
        }
    };
    
    const renderPaginationControls = (totalItems) => {
        let controlsContainer = document.getElementById('certPaginationControls');
        
        if (!controlsContainer) {
            const listContainer = document.getElementById('certificateList');
            if (!listContainer) return;
            controlsContainer = document.createElement('div');
            controlsContainer.id = 'certPaginationControls';
            controlsContainer.style = 'display:flex; justify-content:center; align-items:center; gap:15px; margin-top:2rem; padding:10px;';
            listContainer.parentNode.insertBefore(controlsContainer, listContainer.nextSibling);
        }
        
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
        
        controlsContainer.innerHTML = `
            <button id="prevCertPageBtn" style="padding:6px 14px; background:#fff; border:1px solid #CBD5E1; border-radius:8px; font-weight:600; color:#475569; cursor:pointer;" ${currentPage === 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>Previous</button>
            <span style="font-size:0.9rem; color:#475569; font-weight:600;">Page ${currentPage} of ${totalPages}</span>
            <button id="nextCertPageBtn" style="padding:6px 14px; background:#fff; border:1px solid #CBD5E1; border-radius:8px; font-weight:600; color:#475569; cursor:pointer;" ${currentPage === totalPages ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>Next</button>
        `;
        
        const prevBtn = document.getElementById('prevCertPageBtn');
        const nextBtn = document.getElementById('nextCertPageBtn');
        
        if (prevBtn) {
            prevBtn.onclick = () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderCertificates();
                }
            };
        }
        
        if (nextBtn) {
            nextBtn.onclick = () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderCertificates();
                }
            };
        }
    };
    
    // ============================================
    // FILTER FUNCTIONS
    // ============================================
    
    const applyFilters = () => {
        const textInput = document.getElementById('certSearchInput');
        const statusFilter = document.getElementById('statusFilter');
        const courseFilter = document.getElementById('courseFilter');
        const certDateFilter = document.getElementById('certDateFilter');
        
        const text = textInput ? textInput.value.toLowerCase() : '';
        const status = statusFilter ? statusFilter.value : 'all';
        const course = courseFilter ? courseFilter.value : 'all';
        const selectedDate = certDateFilter ? certDateFilter.value : '';
        
        const dateBtnText = document.getElementById('calendarBtnText');
        const clearBtn = document.getElementById('clearDateBtn');
        
        if (dateBtnText && clearBtn) {
            if (selectedDate) {
                dateBtnText.textContent = new Date(selectedDate).toLocaleDateString();
                clearBtn.style.display = 'inline-block';
            } else {
                dateBtnText.textContent = 'Filter by Date';
                clearBtn.style.display = 'none';
            }
        }
        
        filteredCertificates = allCertificates.filter(c => {
            const textMatch = c.recipient_name.toLowerCase().includes(text) || 
                              c.certificate_uid.toLowerCase().includes(text);
            
            let statusMatch = true;
            if (status === 'active') statusMatch = c.status === 'active';
            if (status === 'pending') statusMatch = c.status === 'pending_approval';
            if (status === 'revoked') statusMatch = c.status === 'revoked' || c.status === 'expired';
            
            const courseMatch = course === 'all' || c.course_title === course;
            
            let dateMatch = true;
            if (selectedDate) {
                const certDateStr = new Date(c.issue_date || c.created_at).toISOString().split('T')[0];
                dateMatch = (certDateStr === selectedDate);
            }
            
            return textMatch && statusMatch && courseMatch && dateMatch;
        });
        
        currentPage = 1;
        clearSelection();
        renderCertificates();
    };
    
    const populateCourses = (certs) => {
        const courseSet = new Set(certs.map(c => c.course_title));
        const select = document.getElementById('courseFilter');
        if (!select) return;
        
        select.innerHTML = '<option value="all">All Courses</option>';
        
        courseSet.forEach(course => {
            const opt = document.createElement('option');
            opt.value = course;
            opt.textContent = course;
            select.appendChild(opt);
        });
    };
    
    // ============================================
    // DATA LOADING
    // ============================================
    
    const loadCertificates = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/certificates/`, {
                credentials: 'include'
            });
            
            if (res.ok) {
                allCertificates = await res.json();
                allCertificates.sort((a, b) => new Date(b.issue_date || b.created_at) - new Date(a.issue_date || a.created_at));
                filteredCertificates = [...allCertificates];
                populateCourses(allCertificates);
                clearSelection();
                renderCertificates();
            } else if (res.status === 401) {
                localStorage.removeItem('is_logged_in');
                window.location.href = 'login.html';
            }
        } catch (e) {
            console.error(e);
            const listContainer = document.getElementById('certificateList');
            if (listContainer) {
                listContainer.innerHTML = '<p style="text-align:center; padding:2rem; color:red;">Error loading certificates. Please check if the server is running.</p>';
            }
        }
    };
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    
    const searchInput = document.getElementById('certSearchInput');
    const statusFilter = document.getElementById('statusFilter');
    const courseFilter = document.getElementById('courseFilter');
    const certDateFilter = document.getElementById('certDateFilter');
    const clearDateBtn = document.getElementById('clearDateBtn');
    const bulkRevokeBtn = document.getElementById('bulkRevokeBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (courseFilter) courseFilter.addEventListener('change', applyFilters);
    if (certDateFilter) certDateFilter.addEventListener('change', applyFilters);
    if (clearDateBtn) {
        clearDateBtn.addEventListener('click', () => {
            if (certDateFilter) certDateFilter.value = '';
            applyFilters();
        });
    }
    
    // Bulk action buttons
    if (bulkRevokeBtn) bulkRevokeBtn.addEventListener('click', bulkRevoke);
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDelete);
    if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearSelection);
    
    // Bulk revoke modal
    const confirmBulkRevokeBtn = document.getElementById('confirmBulkRevokeBtn');
    const closeBulkRevokeBtn = document.getElementById('closeBulkRevokeBtn');
    const cancelBulkRevokeBtn = document.getElementById('cancelBulkRevokeBtn');
    
    if (confirmBulkRevokeBtn) confirmBulkRevokeBtn.addEventListener('click', confirmBulkRevoke);
    if (closeBulkRevokeBtn) {
        closeBulkRevokeBtn.addEventListener('click', () => {
            const modal = document.getElementById('bulkRevokeModal');
            if (modal) modal.style.display = 'none';
        });
    }
    if (cancelBulkRevokeBtn) {
        cancelBulkRevokeBtn.addEventListener('click', () => {
            const modal = document.getElementById('bulkRevokeModal');
            if (modal) modal.style.display = 'none';
        });
    }
    
    // Bulk delete modal
    const confirmBulkDeleteBtn = document.getElementById('confirmBulkDeleteBtn');
    const closeBulkDeleteBtn = document.getElementById('closeBulkDeleteBtn');
    const cancelBulkDeleteBtn = document.getElementById('cancelBulkDeleteBtn');
    const bulkDeleteConfirmInput = document.getElementById('bulkDeleteConfirm');
    
    if (confirmBulkDeleteBtn) confirmBulkDeleteBtn.addEventListener('click', confirmBulkDelete);
    if (closeBulkDeleteBtn) {
        closeBulkDeleteBtn.addEventListener('click', () => {
            const modal = document.getElementById('bulkDeleteModal');
            if (modal) modal.style.display = 'none';
        });
    }
    if (cancelBulkDeleteBtn) {
        cancelBulkDeleteBtn.addEventListener('click', () => {
            const modal = document.getElementById('bulkDeleteModal');
            if (modal) modal.style.display = 'none';
        });
    }
    
    // Enable confirm delete button only when "CONFIRM" is typed
    if (bulkDeleteConfirmInput) {
        bulkDeleteConfirmInput.addEventListener('input', (e) => {
            if (confirmBulkDeleteBtn) {
                confirmBulkDeleteBtn.disabled = e.target.value !== 'CONFIRM';
            }
        });
    }
    
    // Modal actions
    const issueCertBtn = document.getElementById('issueCertBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const issueCertForm = document.getElementById('issueCertForm');
    const issueCertModal = document.getElementById('issueCertModal');
    
    if (issueCertBtn) {
        issueCertBtn.onclick = () => {
            if (issueCertModal) issueCertModal.style.display = 'flex';
        };
    }
    
    if (closeModalBtn) {
        closeModalBtn.onclick = () => {
            if (issueCertModal) issueCertModal.style.display = 'none';
        };
    }
    
    if (issueCertForm) {
        issueCertForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fd = new FormData();
            const recipientName = document.getElementById('recipientName');
            const recipientEmail = document.getElementById('recipientEmail');
            const courseTitle = document.getElementById('courseTitle');
            const courseDuration = document.getElementById('courseDuration');
            const completionDate = document.getElementById('completionDate');
            const recipientPhoto = document.getElementById('recipientPhoto');
            const expiryDate = document.getElementById('expiryDate');
            
            if (recipientName) fd.append('recipient_name', recipientName.value);
            if (recipientEmail) fd.append('recipient_email', recipientEmail.value);
            if (courseTitle) fd.append('course_title', courseTitle.value);
            if (courseDuration) fd.append('course_duration', courseDuration.value);
            if (completionDate) fd.append('completion_date', completionDate.value);
            if (recipientPhoto && recipientPhoto.files[0]) fd.append('recipient_photo', recipientPhoto.files[0]);
            if (expiryDate && expiryDate.value) fd.append('expiry_date', expiryDate.value);
            
            try {
                const res = await fetch(`${API_BASE_URL}/certificates/`, {
                    method: 'POST',
                    credentials: 'include',
                    body: fd
                });
                
                if (res.ok) {
                    alert("Certificate issued successfully!");
                    if (issueCertModal) issueCertModal.style.display = 'none';
                    if (issueCertForm) issueCertForm.reset();
                    await loadCertificates();
                } else {
                    const d = await res.json();
                    alert(d.detail || "Failed to issue certificate");
                }
            } catch (err) {
                alert("Network error: " + err.message);
            }
        });
    }
    
    // Header profile info with cookie auth
    try {
        fetch(`${API_BASE_URL}/companies/me`, {
            credentials: 'include'
        }).then(r => r.json()).then(u => {
            const userName = document.getElementById('userName');
            const userInitial = document.getElementById('userInitial');
            if (userName) userName.textContent = u.name;
            if (userInitial) userInitial.textContent = u.name ? u.name[0] : 'U';
        }).catch(err => console.error('Failed to load company info:', err));
    } catch (e) {
        console.error(e);
    }
    
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.onclick = () => {
            localStorage.removeItem('is_logged_in');
            sessionStorage.removeItem('is_logged_in');
            window.location.href = 'login.html';
        };
    }
    
    // Initialize
    loadCertificates();
});

// ============================================
// GLOBAL HELPER FUNCTIONS
// ============================================

window.openPreview = async (id) => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    try {
        const res = await fetch(`${API_BASE_URL}/certificates/${id}/preview`, {
            credentials: 'include'
        });
        
        if (res.ok) {
            const blob = await res.blob();
            window.open(URL.createObjectURL(blob), '_blank');
        } else {
            alert("Preview not available");
        }
    } catch (e) {
        console.error(e);
        alert("Failed to load preview");
    }
};

window.sendEmail = async (certId, email, name) => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    if (!email) return alert("Error: Recipient email is missing for this certificate.");
    if (!confirm(`Send certificate to ${name} at ${email}?`)) return;
    
    try {
        const res = await fetch(`${API_BASE_URL}/certificates/${certId}/send-email`, {
            method: 'POST',
            credentials: 'include'
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

window.showQr = async (uid) => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    try {
        const res = await fetch(`${API_BASE_URL}/certificates/${uid}/qr`, {
            credentials: 'include'
        });
        
        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const img = document.createElement('img');
            img.src = url;
            img.style.maxWidth = '300px';
            
            const modal = document.createElement('div');
            modal.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:2rem;box-shadow:0 10px 25px rgba(0,0,0,0.1);border-radius:12px;z-index:9999;text-align:center;";
            modal.innerHTML = `<h3>Certificate QR Code</h3><p style="color:gray;margin-bottom:1rem;">Scan to verify validity</p>`;
            modal.appendChild(img);
            
            const closeBtn = document.createElement('button');
            closeBtn.innerText = "Close";
            closeBtn.style.cssText = "display:block;margin:1rem auto 0;padding:0.5rem 1.5rem;background:#4F46E5;color:white;border:none;border-radius:6px;cursor:pointer;";
            closeBtn.onclick = () => document.body.removeChild(modal);
            modal.appendChild(closeBtn);
            
            document.body.appendChild(modal);
        } else {
            alert("QR Code generation failed");
        }
    } catch (e) {
        console.error(e);
        alert("Failed to load QR code");
    }
};

window.revokeCert = async (id) => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const reason = prompt("Please enter the reason for revoking this certificate:");
    
    if (reason === null) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/certificates/${id}/revoke`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason || "No reason provided from dashboard." }),
            credentials: 'include'
        });
        
        if (response.ok) {
            alert("Certificate successfully revoked!");
            location.reload();
        } else {
            const errorData = await response.json();
            alert("Error: " + (errorData.detail || "Failed to revoke certificate."));
        }
    } catch (err) {
        console.error("Revocation process failed:", err);
        alert("Network error. Could not reach server.");
    }
};

window.openDeleteModal = (id, name) => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    if (confirm(`Are you sure you want to completely delete the certificate for ${name}?`)) {
        fetch(`${API_BASE_URL}/certificates/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        }).then(async res => {
            if (res.ok) {
                alert("Certificate deleted successfully!");
                location.reload();
            } else {
                const errData = await res.json().catch(() => ({ detail: "Unknown server error" }));
                alert(`Failed to delete: ${errData.detail || res.statusText} (Status: ${res.status})`);
            }
        }).catch(err => {
            console.error("Network connection error:", err);
            alert("Network error. Please check if your backend server is running.");
        });
    }
};

// ============================================
// APPROVE AND REJECT FUNCTIONS
// ============================================

window.approveCertificate = async (id) => {
    if (!confirm("Approve this certificate?")) return;
    
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    try {
        const res = await fetch(`${API_BASE_URL}/certificates/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([id]),
            credentials: 'include'
        });
        
        if (res.ok) {
            alert('Certificate approved!');
            location.reload();
        } else {
            const d = await res.json();
            alert('Error: ' + (d.detail || 'Failed to approve certificate'));
        }
    } catch (err) {
        console.error("Approval failed:", err);
        alert("Network error. Could not reach server.");
    }
};

window.rejectCertificate = async (id) => {
    const reason = prompt("Enter rejection reason:");
    if (reason === null) return;
    
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    try {
        const res = await fetch(`${API_BASE_URL}/certificates/${id}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason || "No reason provided." }),
            credentials: 'include'
        });
        
        if (res.ok) {
            alert('Certificate rejected. Worker notified.');
            location.reload();
        } else {
            const d = await res.json();
            alert('Error: ' + (d.detail || 'Failed to reject certificate'));
        }
    } catch (err) {
        console.error("Rejection failed:", err);
        alert("Network error. Could not reach server.");
    }
};