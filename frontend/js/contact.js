// frontend/js/contact.js (FINAL DEBUGGED VERSION - COOKIE-COMPATIBLE)

document.addEventListener('DOMContentLoaded', () => {
    // Sticking to Localhost as requested for presentation stability
    const API_BASE_URL = "http://127.0.0.1:8000"; 
    const form = document.getElementById('contactForm');
    const alertBox = document.getElementById('contact-alert');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('sendContactBtn');
        const originalText = btn.textContent;
        
        btn.textContent = "Sending...";
        btn.disabled = true;
        alertBox.innerHTML = '';

        const data = {
            name: document.getElementById('contactName').value,
            email: document.getElementById('contactEmail').value,
            message: document.getElementById('contactMessage').value,
        };

        try {
            // Send request to the API with cookie support (consistent with auth architecture)
            const response = await fetch(`${API_BASE_URL}/public/contact`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data),
                credentials: 'include'  // Include cookies for consistent session handling
            });

            // If the server connection works, attempt to read result
            const result = await response.json();

            if (response.ok) {
                alertBox.innerHTML = '<div style="color:green;">✅ ' + (result.message || "Message sent successfully.") + '</div>';
                form.reset();
            } else {
                // If backend returns an error (e.g., 400 for bad input)
                throw new Error(result.detail || "Failed to submit form (Server Error).");
            }
        } catch (error) {
            // This catches network failures (DNS/connection) or exceptions thrown above
            alertBox.innerHTML = '<div style="color:red;">❌ Submission Failed: ' + error.message + '</div>';
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
});