// frontend/js/verify.js (DEFINITIVE FIX - Using CSS Classes Safely)

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = "http://127.0.0.1:8000";
    
    const urlParams = new URLSearchParams(window.location.search);
    const certId = urlParams.get('id');

    const loadingState = document.getElementById('loadingState');
    const resultCard = document.getElementById('resultCard');
    const statusBanner = document.getElementById('statusBanner');
    const statusMessage = document.getElementById('statusMessage');

    // Helper to hide content (used in error path)
    function hideSuccessContent() {
        const content = resultCard.querySelectorAll(':scope > div:not(#statusBanner)');
        content.forEach(el => el.style.display = 'none');
    }

    // Helper to show error state
    function showError(msg, statusClass) {
        loadingState.style.display = 'none';
        resultCard.style.display = 'block';

        statusBanner.className = `status-banner ${statusClass}`;
        statusMessage.textContent = msg;
        
        // Hide all success content
        hideSuccessContent(); 
        
        statusBanner.style.display = 'flex'; 
        
        // Final icon setting - Use a simple replacement
        const iconElement = statusBanner.querySelector('i');
        if (iconElement) {
            iconElement.outerHTML = '<i data-feather="alert-triangle"></i>';
        }
        
        feather.replace();
    }

    // --- FINAL SUCCESS RENDERER ---
    function renderSuccess(data) {
        // 1. Restore visibility for all content blocks
        const content = resultCard.querySelectorAll(':scope > div:not(#statusBanner)');
        content.forEach(el => {
            if (el.classList.contains('cert-actions')) { el.style.display = 'flex'; } 
            else if (el.classList.contains('cert-sub-details')) { el.style.display = 'grid'; } 
            else { el.style.display = 'block'; }
        }); 

        // 2. Dynamic Status Logic
        const status = data.status.toLowerCase();
        let bannerClass = 'verified'; // Maps to status-active
        let bannerText = 'Verified Authentic';
        
        if (status === 'revoked') {
            bannerClass = 'revoked'; // Maps to status-revoked
            bannerText = 'Revoked: This certificate has been officially invalidated by the issuer.';
        } else if (status === 'expired') {
            bannerClass = 'expired'; // Maps to status-pending/warning color
            bannerText = 'Expired: This certificate is valid but the issue date has passed.';
        }

        // 3. Populate Details
        document.getElementById('vCourseTitle').textContent = data.course_title;
        document.getElementById('vRecipientName').textContent = data.recipient_name;
        document.getElementById('vCertID').textContent = data.certificate_uid;
        document.getElementById('vIssueDate').textContent = new Date(data.issue_date).toLocaleDateString();
        document.getElementById('vStatusText').textContent = data.status;
        document.getElementById('vHash').textContent = data.sha_hash;
        document.getElementById('vCount').textContent = data.verification_count || 0;

        // --- NEW LOGO DISPLAY (Re-run Logo Fetch from previous step) ---
        const logoPlaceholder = document.getElementById('companyLogoPlaceholder');
        const companyId = data.company_id; // <--- This reads the field we just added!
        
        if (logoPlaceholder && companyId) {
            const logoUrl = `${API_BASE_URL}/companies/public/logo/${companyId}`;
            
            // Inject Logo HTML
            logoPlaceholder.innerHTML = `<img src="${logoUrl}" alt="Company Logo" style="max-height:80px; max-width:200px; margin-bottom:10px;">`;
        }

        // 4. Update Status Banner CSS and Text
        statusBanner.className = `status-banner ${bannerClass}`;
        statusMessage.textContent = bannerText;
        
        // 5. Final Icon Replacement (CRITICAL FIX: Overwrite the <i> tag before final feather.replace)
        const iconElement = statusBanner.querySelector('i');
        if (iconElement) {
            const iconName = bannerClass === 'verified' ? 'check-circle' : 'alert-circle';
            // Overwrite the <i> tag, which is safer than manipulating a pre-rendered SVG
            iconElement.outerHTML = `<i data-feather="${iconName}"></i>`;
        }
        
        // 6. Final Display
        loadingState.style.display = 'none';
        resultCard.style.display = 'block';
        statusBanner.style.display = 'flex';
        feather.replace(); // Runs the replacement only once at the end
        
        // 7. Actions (Logic is correct)
        document.getElementById('downloadPdfBtn').onclick = () => {
            if (status === 'active' || status === 'expired') { 
                window.open(`${API_BASE_URL}/verification/${data.certificate_uid}/download`, '_blank');
            } else {
                alert("Download blocked: Certificate is revoked or pending.");
            }
        };

        document.getElementById('shareLinkedInBtn').onclick = () => {
            const certUrl = encodeURIComponent(window.location.href);
            const message = encodeURIComponent(`I successfully verified the ${data.course_title} certificate for ${data.recipient_name} using SkillSathi's transparent verification platform. Check authenticity here:`);
            window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${certUrl}&title=${message}`, '_blank');
        };
    }
    // --- END SUCCESS RENDERER ---


    if (!certId) {
        showError("Error: No Certificate ID provided.", "not-found");
        return;
    }
    
    // Initial loading state
    loadingState.style.display = 'block';


    try {
        const response = await fetch(`${API_BASE_URL}/verification/${certId}`);
        const data = await response.json();

        if (!response.ok) {
            const detail = data.detail || "Verification failed due to an invalid ID or hash.";
            throw new Error(detail); 
        }
        
        // Success: Call the dedicated renderer function after a slight delay 
        setTimeout(() => {
            renderSuccess(data);
        }, 50);

    } catch (error) {
        console.error("Verification Page Crash (Final Fallback):", error);
        const msg = (error.message && error.message.includes("Verification failed")) ? error.message : "The certificate ID is invalid or not yet active.";
        showError(msg, "not-found");
    }
});