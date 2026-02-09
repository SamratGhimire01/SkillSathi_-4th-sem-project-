const API_BASE_URL = "http://127.0.0.1:8000";
const loginForm = document.getElementById('loginForm');
const alertBox = document.getElementById('alert-message');

function showMsg(msg, type='error') {
    alertBox.textContent = msg;
    alertBox.className = `alert-message alert-${type}`;
    alertBox.style.display = 'block';
}

if(loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = loginForm.querySelector('button');
        btn.disabled = true; btn.textContent = "Logging in...";
        
        const formData = new FormData(loginForm);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/login`, { method: 'POST', body: formData });
            const data = await res.json();
            
            if(!res.ok) throw new Error(data.detail);
            
            localStorage.setItem('accessToken', data.access_token);
            
            // Check Role
            if(data.is_admin) {
                window.location.href = 'admin_dashboard.html';
            } else {
                // Double check if Super Admin via /companies/me
                const meRes = await fetch(`${API_BASE_URL}/companies/me`, { headers: { 'Authorization': `Bearer ${data.access_token}` } });
                const me = await meRes.json();
                if(me.is_admin) window.location.href = 'admin_dashboard.html';
                else window.location.href = 'dashboard.html';
            }
        } catch(err) {
            showMsg(err.message);
            btn.disabled = false; btn.textContent = "Login";
        }
    });
}