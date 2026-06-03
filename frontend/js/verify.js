// frontend/js/verify.js (COOKIE-COMPATIBLE VERSION)

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = "http://127.0.0.1:8000";

    const urlParams = new URLSearchParams(window.location.search);
    const certId = urlParams.get('id');

    const loadingState = document.getElementById('loadingState');
    const resultCard   = document.getElementById('resultCard');
    const statusBanner = document.getElementById('statusBanner');
    const statusMessage = document.getElementById('statusMessage');

    function hideSuccessContent() {
        const content = resultCard.querySelectorAll(':scope > div:not(#statusBanner)');
        content.forEach(el => el.style.display = 'none');
    }

    function showError(msg, statusClass) {
        loadingState.style.display = 'none';
        resultCard.style.display = 'block';
        statusBanner.className = `status-banner ${statusClass}`;
        statusMessage.textContent = msg;
        hideSuccessContent();
        statusBanner.style.display = 'flex';
        const iconElement = statusBanner.querySelector('i');
        if (iconElement) iconElement.outerHTML = '<i data-feather="alert-triangle"></i>';
        feather.replace();
    }

    // ── Expiry helper ─────────────────────────────────────────
    function getExpiryDisplay(expiryDate) {
        if (!expiryDate) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(expiryDate);
        expiry.setHours(0, 0, 0, 0);

        const diffMs   = expiry - today;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const formatted = expiry.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        if (diffDays < 0) {
            return { text: formatted, badge: `Expired ${Math.abs(diffDays)} days ago`, color: '#DC2626', bg: '#FEF2F2' };
        } else if (diffDays === 0) {
            return { text: formatted, badge: 'Expires today', color: '#B45309', bg: '#FFFBEB' };
        } else if (diffDays <= 30) {
            return { text: formatted, badge: `Expires in ${diffDays} days`, color: '#B45309', bg: '#FFFBEB' };
        } else {
            return { text: formatted, badge: `${diffDays} days remaining`, color: '#059669', bg: '#ECFDF5' };
        }
    }

    function renderSuccess(data) {
        const content = resultCard.querySelectorAll(':scope > div:not(#statusBanner)');
        content.forEach(el => {
            if (el.classList.contains('cert-actions'))     { el.style.display = 'flex'; }
            else if (el.classList.contains('cert-sub-details')) { el.style.display = 'grid'; }
            else { el.style.display = 'block'; }
        });

        const status = data.status.toLowerCase();
        const isExpired = data.is_expired || status === 'expired';

        let bannerClass = 'verified';
        let bannerText  = 'Verified Authentic';

        if (status === 'revoked') {
            bannerClass = 'revoked';
            bannerText  = 'Revoked: This certificate has been officially invalidated by the issuer.';
        } else if (isExpired) {
            bannerClass = 'expired';
            bannerText  = 'Expired: This certificate has passed its expiry date.';
        }

        // Populate standard fields
        document.getElementById('vCourseTitle').textContent   = data.course_title;
        document.getElementById('vRecipientName').textContent = data.recipient_name;
        document.getElementById('vCertID').textContent        = data.certificate_uid;
        document.getElementById('vIssueDate').textContent     = new Date(data.issue_date).toLocaleDateString();
        document.getElementById('vStatusText').textContent    = data.status;
        document.getElementById('vHash').textContent          = data.sha_hash;
        document.getElementById('vCount').textContent         = data.verification_count || 0;

        // ── Expiry date display ───────────────────────────────
        const expiryInfo = getExpiryDisplay(data.expiry_date);
        let expiryEl = document.getElementById('vExpirySection');

        if (expiryInfo) {
            if (!expiryEl) {
                // Create the expiry section if it doesn't exist yet
                expiryEl = document.createElement('div');
                expiryEl.id = 'vExpirySection';
                expiryEl.className = 'detail-item';
                expiryEl.innerHTML = `
                    <label>Expiry Date</label>
                    <p id="vExpiryDate"></p>
                    <span id="vExpiryBadge" style="font-size:0.8rem; padding:3px 10px; border-radius:20px; font-weight:600;"></span>
                `;
                // Insert after issue date — find cert-sub-details and append
                const subDetails = resultCard.querySelector('.cert-sub-details');
                if (subDetails) subDetails.appendChild(expiryEl);
            }

            document.getElementById('vExpiryDate').textContent    = expiryInfo.text;
            const badge = document.getElementById('vExpiryBadge');
            badge.textContent        = expiryInfo.badge;
            badge.style.color        = expiryInfo.color;
            badge.style.background   = expiryInfo.bg;

        } else {
            // No expiry — show "No expiry date set"
            if (!expiryEl) {
                expiryEl = document.createElement('div');
                expiryEl.id = 'vExpirySection';
                expiryEl.className = 'detail-item';
                const subDetails = resultCard.querySelector('.cert-sub-details');
                if (subDetails) subDetails.appendChild(expiryEl);
            }
            expiryEl.innerHTML = `
                <label>Expiry Date</label>
                <p style="color:#9CA3AF;">No expiry date set</p>
            `;
        }

        // ── Submitted by worker ───────────────────────────────
        if (data.submitted_by_worker_name) {
            let workerEl = document.getElementById('vWorkerSection');
            if (!workerEl) {
                workerEl = document.createElement('div');
                workerEl.id = 'vWorkerSection';
                workerEl.className = 'detail-item';
                const subDetails = resultCard.querySelector('.cert-sub-details');
                if (subDetails) subDetails.appendChild(workerEl);
            }
            workerEl.innerHTML = `
                <label>Submitted By</label>
                <p style="color:#7C3AED;">👤 ${data.submitted_by_worker_name}</p>
            `;
        }

        // ── Company logo ──────────────────────────────────────
        const logoPlaceholder = document.getElementById('companyLogoPlaceholder');
        if (logoPlaceholder && data.company_id) {
            logoPlaceholder.innerHTML = `<img src="${API_BASE_URL}/companies/public/logo/${data.company_id}" alt="Company Logo" style="max-height:80px; max-width:200px; margin-bottom:10px;">`;
        }

        // ── Banner ────────────────────────────────────────────
        statusBanner.className    = `status-banner ${bannerClass}`;
        statusMessage.textContent = bannerText;
        const iconElement = statusBanner.querySelector('i');
        if (iconElement) {
            const iconName = bannerClass === 'verified' ? 'check-circle' : 'alert-circle';
            iconElement.outerHTML = `<i data-feather="${iconName}"></i>`;
        }

        loadingState.style.display = 'none';
        resultCard.style.display   = 'block';
        statusBanner.style.display = 'flex';
        feather.replace();

        // ── Actions (Cookie-compatible) ───────────────────────
        document.getElementById('downloadPdfBtn').onclick = () => {
            if (status === 'active' && !isExpired) {
                window.open(`${API_BASE_URL}/verification/${data.certificate_uid}/download`, '_blank');
            } else {
                alert("Download blocked: Certificate is revoked or expired.");
            }
        };

        document.getElementById('shareLinkedInBtn').onclick = () => {
            const certUrl = encodeURIComponent(window.location.href);
            const message = encodeURIComponent(`I verified the ${data.course_title} certificate for ${data.recipient_name} on SkillSathi.`);
            window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${certUrl}&title=${message}`, '_blank');
        };
    }

    if (!certId) {
        showError("Error: No Certificate ID provided.", "not-found");
        return;
    }

    loadingState.style.display = 'block';

    try {
        // Public verification endpoint - no authentication needed
        // Adding credentials: 'include' for consistency (optional but harmless)
        const response = await fetch(`${API_BASE_URL}/verification/${certId}`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Verification failed.");
        }

        setTimeout(() => renderSuccess(data), 50);

    } catch (error) {
        const msg = error.message || "The certificate ID is invalid or not yet active.";
        showError(msg, "not-found");
    }
});