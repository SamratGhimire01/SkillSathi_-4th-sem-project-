// Add this function to the TOP of the JS file (Outside DOMContentLoaded)

function confirmLogout(e) {
    e.preventDefault();
    if (confirm("Are you sure you want to log out?")) {
        localStorage.removeItem('accessToken');
        sessionStorage.removeItem('accessToken'); // Clear both
        window.location.href = 'login.html';
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    const token = localStorage.getItem('accessToken');
    if (!token) { window.location.href = 'login.html'; return; }

    const fetchAPI = async (endpoint, options = {}) => {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers }
        });
        return res;
    };

    let allWorkers = [];

    // --- RENDER ---
    const loadWorkers = async () => {
        const res = await fetchAPI('/workers/');
        const tbody = document.getElementById('workersTableBody');
        if (res.ok) {
            allWorkers = await res.json();
            renderWorkers(allWorkers);
        }
    };

    const renderWorkers = (workers) => {
        const tbody = document.getElementById('workersTableBody');
        tbody.innerHTML = workers.map(w => `
            <tr>
                <td>${w.worker_id}</td>
                <td><strong>${w.name}</strong></td>
                <td>${w.email}</td>
                <td>${w.role}</td>
                <td><span class="status-pill status-${w.status}">${w.status}</span></td>
                <td>
                    <div class="action-btn-group">
                        <button onclick="editWorker(${w.id})" class="icon-btn" title="Edit"><i data-feather="edit"></i></button>
                        <button onclick="deleteWorker(${w.id})" class="icon-btn btn-red" title="Delete"><i data-feather="trash-2"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        feather.replace();
    };

    // --- SEARCH ---
    document.getElementById('workerSearchInput').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allWorkers.filter(w => 
            w.name.toLowerCase().includes(term) || 
            w.worker_id.toLowerCase().includes(term) ||
            w.email.toLowerCase().includes(term)
        );
        renderWorkers(filtered);
    });

    // --- PASSWORD TOGGLE LOGIC (NEW) ---
    const toggleBtn = document.getElementById('toggleWorkerPass');
    const passInput = document.getElementById('workerPassword');
    
    toggleBtn.addEventListener('click', () => {
        // Switch Type
        const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passInput.setAttribute('type', type);
        
        // Switch Icon (Eye -> Eye Off)
        const iconName = type === 'password' ? 'eye' : 'eye-off';
        toggleBtn.setAttribute('data-feather', iconName);
        feather.replace(); // Re-render icon
    });

    // --- MODAL ACTIONS ---
    window.editWorker = async (id) => {
        const res = await fetchAPI(`/workers/${id}`);
        if(res.ok) {
            const w = await res.json();
            document.getElementById('editWorkerId').value = w.id;
            document.getElementById('workerName').value = w.name;
            document.getElementById('workerEmail').value = w.email;
            document.getElementById('workerId').value = w.worker_id;
            document.getElementById('workerRole').value = w.role;
            
            // Reset password field styling
            passInput.value = "";
            passInput.placeholder = "Leave blank to keep current";
            
            document.getElementById('modalTitle').textContent = "Edit Worker";
            document.getElementById('addWorkerModal').style.display = 'flex';
        }
    };

    window.deleteWorker = async (id) => {
        if(confirm("Delete worker?")) {
            await fetchAPI(`/workers/${id}`, { method: 'DELETE' });
            loadWorkers();
        }
    };

    document.getElementById('addWorkerBtn').onclick = () => {
        document.getElementById('addWorkerForm').reset();
        document.getElementById('editWorkerId').value = "";
        
        passInput.placeholder = "Set Password";
        
        // Auto ID Generation
        const rnd = Math.floor(Math.random() * 900) + 100;
        document.getElementById('workerId').value = `EMP${rnd}`;

        document.getElementById('modalTitle').textContent = "Add New Worker";
        document.getElementById('addWorkerModal').style.display = 'flex';
    };

    document.getElementById('closeModalBtn').onclick = () => document.getElementById('addWorkerModal').style.display = 'none';

    document.getElementById('addWorkerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editWorkerId').value;
        const data = {
            name: document.getElementById('workerName').value,
            email: document.getElementById('workerEmail').value,
            worker_id: document.getElementById('workerId').value,
            role: document.getElementById('workerRole').value,
            password: passInput.value
        };
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/workers/${id}` : '/workers/';
        
        await fetchAPI(url, { method: method, body: JSON.stringify(data) });
        document.getElementById('addWorkerModal').style.display = 'none';
        loadWorkers();
    });

    // User Info
    fetch(`${API_BASE_URL}/companies/me`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(u => {
            document.getElementById('userName').textContent = u.name;
            document.getElementById('userInitial').textContent = u.name[0];
        });

    document.getElementById('logoutButton').onclick = () => { localStorage.clear(); window.location.href = 'login.html'; };

    loadWorkers();
});