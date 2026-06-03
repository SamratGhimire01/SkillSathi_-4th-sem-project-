// frontend/js/workers.js (COOKIE-COMPATIBLE VERSION)

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

    const fetchAPI = async (endpoint, options = {}) => {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
            credentials: 'include'
        });
        return res;
    };

    let allWorkers = [];

    const loadWorkers = async () => {
        const res = await fetchAPI('/workers/');
        if (res.ok) {
            allWorkers = await res.json();
            renderWorkers(allWorkers);
        }
    };

    const renderWorkers = (workers) => {
        const tbody = document.getElementById('workersTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = workers.map(w => `
            <tr>
                <td>${w.worker_id}</td>
                <td><strong>${w.name}</strong></td>
                <td>${w.email}</td>
                <td><span class="status-pill status-${w.status}">${w.status}</span></td>
                <td>
                    <div class="action-btn-group">
                        <button onclick="editWorker(${w.id})" class="icon-btn" title="Edit"><i data-feather="edit"></i></button>
                        <button onclick="deleteWorker(${w.id})" class="icon-btn btn-red" title="Delete"><i data-feather="trash-2"></i></button>
                    </div>
                 </td>
             </tr>
        `).join('');
        if (typeof feather !== 'undefined') feather.replace();
    };

    const searchInput = document.getElementById('workerSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allWorkers.filter(w =>
                w.name.toLowerCase().includes(term) ||
                w.worker_id.toLowerCase().includes(term) ||
                w.email.toLowerCase().includes(term)
            );
            renderWorkers(filtered);
        });
    }

    const toggleBtn = document.getElementById('toggleWorkerPass');
    const passInput = document.getElementById('workerPassword');

    if (toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passInput.setAttribute('type', type);
            toggleBtn.setAttribute('data-feather', type === 'password' ? 'eye' : 'eye-off');
            if (typeof feather !== 'undefined') feather.replace();
        });
    }

    window.editWorker = async (id) => {
        const res = await fetchAPI(`/workers/${id}`);
        if (res.ok) {
            const w = await res.json();
            document.getElementById('editWorkerId').value = w.id;
            document.getElementById('workerName').value = w.name;
            document.getElementById('workerEmail').value = w.email;

            const wIdInput = document.getElementById('workerId');
            if (wIdInput) {
                wIdInput.value = w.worker_id;
                wIdInput.readOnly = true;
                wIdInput.style.backgroundColor = "#f0f0f0";
            }

            if (passInput) {
                passInput.value = "";
                passInput.placeholder = "Leave blank to keep current";
            }

            document.getElementById('modalTitle').textContent = "Edit Worker";
            const modal = document.getElementById('addWorkerModal');
            if (modal) modal.style.display = 'flex';
        }
    };

    window.deleteWorker = async (id) => {
        if (confirm("Delete worker?")) {
            const res = await fetchAPI(`/workers/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadWorkers();
            } else {
                const err = await res.json();
                alert("Error: " + (err.detail || "Failed to delete worker"));
            }
        }
    };

    // Add Worker Button Handler
    const addWorkerBtn = document.getElementById('addWorkerBtn');
    if (addWorkerBtn) {
        addWorkerBtn.onclick = async () => {
            const form = document.getElementById('addWorkerForm');
            if (form) form.reset();
            document.getElementById('editWorkerId').value = "";
            if (passInput) passInput.placeholder = "Set Password";

            try {
                const idRes = await fetchAPI('/workers/next-id');
                if (!idRes.ok) throw new Error("Failed to fetch next ID");
                const idData = await idRes.json();

                const wIdInput = document.getElementById('workerId');
                if (wIdInput) {
                    wIdInput.value = idData.next_worker_id;
                    wIdInput.readOnly = true;
                    wIdInput.style.backgroundColor = "#f0f0f0";
                }
            } catch (err) {
                alert("Could not fetch next worker ID. Try again.");
                return;
            }

            document.getElementById('modalTitle').textContent = "Add New Worker";
            const modal = document.getElementById('addWorkerModal');
            if (modal) modal.style.display = 'flex';
        };
    }

    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.onclick = () => {
            const modal = document.getElementById('addWorkerModal');
            if (modal) modal.style.display = 'none';
        };
    }

    // Close modal when clicking outside
    window.onclick = (event) => {
        const modal = document.getElementById('addWorkerModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    const addWorkerForm = document.getElementById('addWorkerForm');
    if (addWorkerForm) {
        addWorkerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editWorkerId').value;
            const data = {
                name: document.getElementById('workerName').value,
                email: document.getElementById('workerEmail').value,
                role: 'member',
                password: passInput ? passInput.value : ''
            };
            
            // Only include password if it's provided
            if (!data.password) {
                delete data.password;
            }
            
            const method = id ? 'PUT' : 'POST';
            const url = id ? `/workers/${id}` : '/workers/';

            const res = await fetchAPI(url, { method, body: JSON.stringify(data) });
            if (res.ok) {
                const modal = document.getElementById('addWorkerModal');
                if (modal) modal.style.display = 'none';
                loadWorkers();
            } else {
                const err = await res.json();
                alert("Error: " + (err.detail || "Operation failed"));
            }
        });
    }

    // User Profile Info with Cookie Auth
    fetch(`${API_BASE_URL}/companies/me`, { 
        credentials: 'include'
    })
        .then(r => r.json())
        .then(u => {
            const userName = document.getElementById('userName');
            const userInitial = document.getElementById('userInitial');
            if (userName) userName.textContent = u.name;
            if (userInitial) userInitial.textContent = u.name ? u.name.charAt(0).toUpperCase() : 'U';
        })
        .catch(err => console.error('Failed to load company info:', err));

    // Logout Button (clear session flag only)
    const logBtn = document.getElementById('logoutButton');
    if (logBtn) {
        logBtn.onclick = () => { 
            localStorage.removeItem('is_logged_in');
            sessionStorage.removeItem('is_logged_in');
            window.location.href = 'login.html'; 
        };
    }

    loadWorkers();
});