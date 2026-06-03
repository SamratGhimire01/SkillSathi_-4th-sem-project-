#!/bin/bash
# =============================================================
# SkillSathi — Phase 2 Setup Script
# Revocation Registry + Issuer Verification Table + Rate Limiting
#
# Run from your project ROOT directory:
#   cd ~/your-project-folder
#   bash skillsathi_phase2_setup.sh
# =============================================================

set -e
echo "🚀 SkillSathi Phase 2 — Starting setup..."

# ─────────────────────────────────────────
# STEP 1: Install new dependencies
# ─────────────────────────────────────────
echo ""
echo "📦 Installing dependencies..."
cd backend
pip install slowapi --break-system-packages 2>/dev/null || pip install slowapi
grep -qxF 'slowapi' requirements.txt || echo 'slowapi' >> requirements.txt
cd ..
echo "✅ Dependencies installed."


# ─────────────────────────────────────────
# STEP 2: Phase 2 DB migration SQL
# ─────────────────────────────────────────
echo ""
echo "📄 Creating database/phase2_migration.sql ..."
cat > database/phase2_migration.sql << 'SQLEOF'
-- database/phase2_migration.sql
-- Phase 2: Revocation Registry + Issuer Registry tables
-- Run: mysql -u skillsathi_user -p skillsathi < database/phase2_migration.sql

USE skillsathi;

DROP PROCEDURE IF EXISTS add_column_if_not_exists;

DELIMITER $$
CREATE PROCEDURE add_column_if_not_exists(
    IN p_table      VARCHAR(100),
    IN p_column     VARCHAR(100),
    IN p_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = p_table
          AND COLUMN_NAME  = p_column
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_column, ' ', p_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('✅ Added: ', p_table, '.', p_column) AS result;
    ELSE
        SELECT CONCAT('⏭  Skipped (exists): ', p_table, '.', p_column) AS result;
    END IF;
END$$
DELIMITER ;

-- ── 1. Revocation Registry ────────────────────────────────────
-- Separate from the status column — gives us a full auditable log
-- of every revocation with reason, timestamp, and who did it.
CREATE TABLE IF NOT EXISTS revocation_registry (
    id               INT PRIMARY KEY AUTO_INCREMENT,
    certificate_uid  VARCHAR(100) NOT NULL,
    company_id       INT NOT NULL,
    revoked_by       INT NOT NULL,               -- worker or company user id
    revoked_by_type  ENUM('company','staff') NOT NULL DEFAULT 'company',
    reason           TEXT,
    revoked_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (certificate_uid) REFERENCES certificates(certificate_uid) ON DELETE CASCADE,
    FOREIGN KEY (company_id)      REFERENCES companies(id) ON DELETE CASCADE
);
SELECT '✅ revocation_registry table ready.' AS result;

-- ── 2. Issuer Registry ────────────────────────────────────────
-- Stores public metadata about each verified issuer (company).
-- Public key is already in issuer_keys — this table adds DID,
-- domain, and verification level for the IEEE paper's trust model.
CREATE TABLE IF NOT EXISTS issuer_registry (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    company_id          INT NOT NULL UNIQUE,
    did                 VARCHAR(255) NOT NULL,     -- e.g. did:skillsathi:issuer:3
    domain              VARCHAR(255),              -- e.g. mycompany.com.np
    verification_level  ENUM('basic','verified','trusted') DEFAULT 'basic',
    registered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
SELECT '✅ issuer_registry table ready.' AS result;

-- ── 3. Add rate_limit_hits tracking to verifications ─────────
CALL add_column_if_not_exists('verifications', 'was_rate_limited', 'BOOLEAN DEFAULT FALSE');

DROP PROCEDURE IF EXISTS add_column_if_not_exists;

SELECT '✅ Phase 2 migration complete!' AS result;
SQLEOF
echo "✅ phase2_migration.sql created."


# ─────────────────────────────────────────
# STEP 3: Update backend/models.py
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/models.py ..."
cat > backend/models.py << 'PYEOF'
# backend/models.py
# Phase 2: RevocationRegistry + IssuerRegistry models added.

from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey, Date,
    LargeBinary, Enum, TIMESTAMP, TEXT, DECIMAL, text
)
from sqlalchemy.dialects.mysql import LONGBLOB
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class Company(Base):
    __tablename__ = "companies"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    name                  = Column(String(255), nullable=False)
    email                 = Column(String(255), unique=True, nullable=False)
    password_hash         = Column(String(255), nullable=False)
    business_reg_number   = Column(String(100))
    status                = Column(Enum('pending', 'verified', 'rejected'), default='pending')
    subscription_tier     = Column(Enum('free', 'basic', 'medium', 'pro'), default='free')
    certificates_used     = Column(Integer, default=0)
    business_address      = Column(String(255))
    phone_number          = Column(String(20))
    website_url           = Column(String(255))
    is_admin              = Column(Boolean, default=False)
    created_at            = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))
    primary_contact_name  = Column(String(255))
    citizenship_number    = Column(String(100))
    contact_photo         = Column(LONGBLOB)
    registration_document = Column(LONGBLOB)
    logo                  = Column(LargeBinary, nullable=True)
    signature_image       = Column(LargeBinary, nullable=True)
    notify_issued         = Column(Boolean, default=True)
    notify_summary        = Column(Boolean, default=False)
    notify_security       = Column(Boolean, default=True)


class Worker(Base):
    __tablename__ = "workers"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(255), nullable=False)
    email           = Column(String(255))
    worker_id       = Column(String(100), unique=True, nullable=False)
    password_hash   = Column(String(255))
    role            = Column(Enum('admin', 'manager', 'member'), default='member')
    status          = Column(Enum('active', 'pending', 'suspended'), default='active')
    profile_picture = Column(LargeBinary)
    phone_number    = Column(String(20))
    date_of_birth   = Column(Date)
    address         = Column(TEXT)
    created_at      = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))


class Certificate(Base):
    __tablename__ = "certificates"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    certificate_uid      = Column(String(100), unique=True, nullable=False)
    company_id           = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    worker_id            = Column(Integer, ForeignKey("workers.id", ondelete="CASCADE"), nullable=False)
    recipient_name       = Column(String(255), nullable=False)
    recipient_email      = Column(String(255))
    recipient_photo      = Column(LargeBinary)
    course_title         = Column(String(255), nullable=False)
    course_category      = Column(String(100))
    course_duration      = Column(String(100), nullable=True)
    completion_date      = Column(Date, nullable=False)
    issue_date           = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))
    sha_hash             = Column(String(64), unique=True, nullable=False)
    # Phase 1
    ed25519_signature    = Column(TEXT, nullable=True)
    hmac_token           = Column(String(64), nullable=True)
    vc_json              = Column(LONGBLOB, nullable=True)
    signed_qr_url        = Column(TEXT, nullable=True)
    status               = Column(Enum('active', 'revoked', 'expired', 'pending_approval'), default='pending_approval')
    qr_code              = Column(LargeBinary)
    download_count       = Column(Integer, default=0)
    verification_count   = Column(Integer, default=0)
    pdf_data             = Column(LargeBinary)
    created_at           = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))


class IssuerKey(Base):
    __tablename__ = "issuer_keys"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), unique=True, nullable=False)
    public_key_b64  = Column(TEXT, nullable=False)
    private_key_b64 = Column(TEXT, nullable=False)
    created_at      = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))
    company         = relationship("Company")


# ── Phase 2: Revocation Registry ─────────────────────────────
class RevocationRegistry(Base):
    """
    Every revocation is logged here with reason + actor.
    Separate from certificates.status so revocations are auditable
    even if the certificate row is modified later.
    """
    __tablename__ = "revocation_registry"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    certificate_uid = Column(String(100), ForeignKey("certificates.certificate_uid", ondelete="CASCADE"), nullable=False)
    company_id      = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    revoked_by      = Column(Integer, nullable=False)
    revoked_by_type = Column(Enum('company', 'staff'), nullable=False, default='company')
    reason          = Column(TEXT, nullable=True)
    revoked_at      = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))


# ── Phase 2: Issuer Registry ──────────────────────────────────
class IssuerRegistry(Base):
    """
    Public-facing issuer metadata — DID, domain, trust level.
    Used during verification to resolve issuer identity without
    exposing private keys.
    """
    __tablename__ = "issuer_registry"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    company_id         = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), unique=True, nullable=False)
    did                = Column(String(255), nullable=False)
    domain             = Column(String(255), nullable=True)
    verification_level = Column(Enum('basic', 'verified', 'trusted'), default='basic')
    registered_at      = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))
    company            = relationship("Company")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"))
    user_id    = Column(Integer, ForeignKey("workers.id", ondelete="SET NULL"))
    actor_type = Column(Enum('company', 'staff', 'public', 'system'), nullable=False)
    actor_id   = Column(Integer)
    cert_id    = Column(Integer, ForeignKey("certificates.id", ondelete="SET NULL"))
    event_type = Column(String(100))
    details    = Column(TEXT)
    timestamp  = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))


class SharedCertificate(Base):
    __tablename__ = "shared_certificates"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    cert_id    = Column(Integer, ForeignKey("certificates.id", ondelete="CASCADE"), nullable=False)
    token      = Column(String(100), unique=True, nullable=False)
    created_at = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))
    expires_at = Column(TIMESTAMP, nullable=True)
    is_active  = Column(Boolean, default=True)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    subject    = Column(String(255), nullable=False)
    message    = Column(TEXT, nullable=False)
    status     = Column(Enum('open', 'resolved'), default='open')
    created_at = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))
    company    = relationship("Company")
PYEOF
echo "✅ models.py updated."


# ─────────────────────────────────────────
# STEP 4: Update backend/schemas.py
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/schemas.py ..."
cat > backend/schemas.py << 'PYEOF'
# backend/schemas.py
# Phase 2: RevocationRegistry + IssuerRegistry schemas added.

from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, date
from typing import Optional


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    id: str | None = None
    type: str | None = None
    company_id: str | None = None


class CompanyOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    is_admin: bool
    status: str
    business_reg_number: Optional[str] = None
    phone_number: Optional[str] = None
    primary_contact_name: Optional[str] = None
    citizenship_number: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: str
    email: EmailStr
    phone_number: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class WorkerCreate(BaseModel):
    name: str
    email: EmailStr
    worker_id: str
    role: str = 'member'
    password: str


class WorkerUpdate(BaseModel):
    name: str
    email: EmailStr
    worker_id: str
    role: str


class WorkerOut(BaseModel):
    id: int
    name: str
    email: EmailStr | None
    worker_id: str
    role: str
    status: str

    class Config:
        from_attributes = True


# ── Certificate ───────────────────────────────────────────────

class CertificateOut(BaseModel):
    id: int
    certificate_uid: str
    company_id: int
    worker_id: int
    recipient_name: str
    recipient_email: Optional[str] = None
    course_title: str
    course_duration: Optional[str] = None
    completion_date: date
    issue_date: datetime
    status: str
    sha_hash: str
    verification_count: int | None = 0
    ed25519_signature: Optional[str] = None
    signed_qr_url: Optional[str] = None

    class Config:
        from_attributes = True


# ── Verification ──────────────────────────────────────────────

class VerificationResult(BaseModel):
    is_valid: bool
    signature_verified: bool
    certificate_uid: str
    recipient_name: str
    course_title: str
    course_duration: Optional[str] = None
    completion_date: date
    issue_date: datetime
    status: str
    issuer_name: str
    issuer_public_key: Optional[str] = None
    issuer_did: Optional[str] = None
    issuer_verification_level: Optional[str] = None
    vc_json: Optional[dict] = None
    verification_count: int
    # Phase 2: revocation info
    revocation_reason: Optional[str] = None
    revoked_at: Optional[datetime] = None


# ── Phase 2: Revocation ───────────────────────────────────────

class RevokeRequest(BaseModel):
    reason: Optional[str] = "No reason provided."


class RevocationOut(BaseModel):
    id: int
    certificate_uid: str
    company_id: int
    revoked_by_type: str
    reason: Optional[str]
    revoked_at: datetime

    class Config:
        from_attributes = True


# ── Phase 2: Issuer Registry ──────────────────────────────────

class IssuerRegistryOut(BaseModel):
    company_id: int
    did: str
    domain: Optional[str]
    verification_level: str
    registered_at: datetime

    class Config:
        from_attributes = True


class IssuerKeyOut(BaseModel):
    company_id: int
    public_key_b64: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Password Reset ────────────────────────────────────────────

class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)


class NotificationSettings(BaseModel):
    notify_issued: bool
    notify_summary: bool
    notify_security: bool
PYEOF
echo "✅ schemas.py updated."


# ─────────────────────────────────────────
# STEP 5: Update backend/main.py
# (Add SlowAPI rate limiting middleware)
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/main.py ..."
cat > backend/main.py << 'PYEOF'
# backend/main.py
# Phase 2: SlowAPI rate limiting middleware added.

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from database import engine
import models
from routers import (
    auth, companies, workers, certificates,
    verification, admin, dashboard, support, public
)

# ── Rate Limiter setup ────────────────────────────────────────
# Uses client IP address as the key.
# Limits are set per-endpoint in the router decorators.
limiter = Limiter(key_func=get_remote_address)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SkillSathi API")

# Attach limiter to app state so routers can access it
app.state.limiter = limiter

# Register the rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(workers.router)
app.include_router(certificates.router)
app.include_router(verification.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(support.router)
app.include_router(public.router)


@app.get("/", tags=["Root"])
def read_root():
    return {"message": "SkillSathi Backend is Running 🚀"}
PYEOF
echo "✅ main.py updated."


# ─────────────────────────────────────────
# STEP 6: Update backend/routers/verification.py
# (Rate limiting + revocation registry check + issuer DID)
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/routers/verification.py ..."
cat > backend/routers/verification.py << 'PYEOF'
# backend/routers/verification.py
# Phase 2 update:
#   - Rate limiting: 30 requests/minute per IP
#   - Checks revocation_registry BEFORE returning valid result
#   - Returns issuer DID + verification level from issuer_registry
#   - QR token endpoint also rate limited

import io
import json
from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

import models, schemas
from database import get_db
from utils.crypto_utils import verify_certificate_signature, verify_hmac
from utils.qr_utils import get_signed_url_from_token

router  = APIRouter(prefix="/verification", tags=['Public Verification'])
limiter = Limiter(key_func=get_remote_address)

# Rate limit: 30 lookups per minute per IP address.
# Prevents scraping and brute-force enumeration of certificate IDs.
RATE_LIMIT = "30/minute"


def _do_verify(certificate_uid: str, db: Session) -> schemas.VerificationResult:
    """
    Core verification logic — shared by both endpoints.
    Order of checks:
      1. Certificate exists?
      2. Is it pending? → block
      3. Is it in revocation_registry? → mark invalid + return reason
      4. Ed25519 signature valid?
      5. HMAC token valid?
      6. Resolve issuer DID from issuer_registry
    """

    # ── 1. Find certificate ───────────────────────────────────
    cert = db.query(models.Certificate).filter(
        (models.Certificate.certificate_uid == certificate_uid) |
        (models.Certificate.sha_hash == certificate_uid)
    ).first()

    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Certificate not found.")

    if cert.status == 'pending_approval':
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Certificate is not yet active.")

    # ── 2. Check revocation registry (Phase 2) ────────────────
    revocation = db.query(models.RevocationRegistry).filter(
        models.RevocationRegistry.certificate_uid == cert.certificate_uid
    ).order_by(models.RevocationRegistry.revoked_at.desc()).first()

    revocation_reason = None
    revoked_at        = None

    if revocation:
        revocation_reason = revocation.reason
        revoked_at        = revocation.revoked_at

    # ── 3. Ed25519 signature check ────────────────────────────
    sig_verified = False
    issuer_key   = db.query(models.IssuerKey).filter(
        models.IssuerKey.company_id == cert.company_id
    ).first()

    if issuer_key and cert.ed25519_signature:
        sig_verified = verify_certificate_signature(
            public_key_b64=issuer_key.public_key_b64,
            signature_b64=cert.ed25519_signature,
            cert_uid=cert.certificate_uid,
            recipient_name=cert.recipient_name,
            course_title=cert.course_title,
            completion_date=str(cert.completion_date),
            company_id=cert.company_id
        )

    # ── 4. HMAC check ─────────────────────────────────────────
    hmac_ok = True
    if cert.hmac_token:
        hmac_ok = verify_hmac(cert.certificate_uid, cert.sha_hash, cert.hmac_token)

    # is_valid = active + signature good + not revoked
    is_valid = (
        cert.status == 'active' and
        sig_verified and
        hmac_ok and
        revocation is None
    )

    # ── 5. Increment verification count ──────────────────────
    cert.verification_count = (cert.verification_count or 0) + 1
    db.commit()

    # ── 6. Resolve issuer info ────────────────────────────────
    company         = db.query(models.Company).filter(models.Company.id == cert.company_id).first()
    issuer_reg      = db.query(models.IssuerRegistry).filter(
        models.IssuerRegistry.company_id == cert.company_id
    ).first()

    # ── 7. Parse VC JSON ──────────────────────────────────────
    vc_dict = None
    if cert.vc_json:
        try:
            vc_dict = json.loads(cert.vc_json.decode())
        except Exception:
            vc_dict = None

    return schemas.VerificationResult(
        is_valid=is_valid,
        signature_verified=sig_verified,
        certificate_uid=cert.certificate_uid,
        recipient_name=cert.recipient_name,
        course_title=cert.course_title,
        course_duration=cert.course_duration,
        completion_date=cert.completion_date,
        issue_date=cert.issue_date,
        status=cert.status,
        issuer_name=company.name if company else "Unknown",
        issuer_public_key=issuer_key.public_key_b64 if issuer_key else None,
        issuer_did=issuer_reg.did if issuer_reg else f"did:skillsathi:issuer:{cert.company_id}",
        issuer_verification_level=issuer_reg.verification_level if issuer_reg else "basic",
        vc_json=vc_dict,
        verification_count=cert.verification_count,
        revocation_reason=revocation_reason,
        revoked_at=revoked_at
    )


# ── Endpoint 1: verify by raw cert UID ───────────────────────
@router.get("/{certificate_uid}", response_model=schemas.VerificationResult)
@limiter.limit(RATE_LIMIT)
def verify_by_uid(
    request: Request,
    certificate_uid: str,
    db: Session = Depends(get_db)
):
    return _do_verify(certificate_uid, db)


# ── Endpoint 2: verify by QR JWT token ───────────────────────
@router.get("/qr/scan", response_model=schemas.VerificationResult)
@limiter.limit(RATE_LIMIT)
def verify_by_qr_token(
    request: Request,
    token: str = Query(..., description="JWT token from QR code URL"),
    db: Session = Depends(get_db)
):
    try:
        decoded = get_signed_url_from_token(token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _do_verify(decoded["cert_uid"], db)


# ── Download public PDF ───────────────────────────────────────
@router.get("/{certificate_uid}/download")
@limiter.limit("10/minute")
def download_public_pdf(
    request: Request,
    certificate_uid: str,
    db: Session = Depends(get_db)
):
    cert = db.query(models.Certificate).filter(
        models.Certificate.certificate_uid == certificate_uid
    ).first()
    if not cert or not cert.pdf_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not found.")
    if cert.status == 'revoked':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Certificate is revoked.")
    return StreamingResponse(
        io.BytesIO(cert.pdf_data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{cert.certificate_uid}.pdf"'}
    )
PYEOF
echo "✅ routers/verification.py updated."


# ─────────────────────────────────────────
# STEP 7: Update backend/routers/certificates.py
# (Revoke now writes to revocation_registry)
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/routers/certificates.py (revoke endpoint) ..."
cat > backend/routers/certificates.py << 'PYEOF'
# backend/routers/certificates.py
# Phase 2 update:
#   - Revoke endpoint now writes to revocation_registry
#   - Revoke accepts a reason body

from fastapi import APIRouter, Depends, status, HTTPException, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import date, datetime
import uuid, hashlib, io, csv, codecs

import models, schemas
from database import get_db
from . import auth
from utils.pdf_generator import generate_certificate_pdf
from utils.notifications import trigger_certificate_email, trigger_recipient_certificate
from utils.crypto_utils import generate_ed25519_keypair, sign_certificate, compute_hmac
from utils.vc_builder import build_verifiable_credential
from utils.qr_utils import generate_signed_qr_bytes, build_signed_verification_url

router = APIRouter(prefix="/certificates", tags=['Certificates'])


# ── Helpers ───────────────────────────────────────────────────

def get_or_create_issuer_key(db: Session, company_id: int) -> models.IssuerKey:
    key_record = db.query(models.IssuerKey).filter(
        models.IssuerKey.company_id == company_id
    ).first()
    if not key_record:
        private_b64, public_b64 = generate_ed25519_keypair()
        key_record = models.IssuerKey(
            company_id=company_id,
            private_key_b64=private_b64,
            public_key_b64=public_b64
        )
        db.add(key_record)
        db.commit()
        db.refresh(key_record)
    return key_record


def get_or_create_issuer_registry(db: Session, company_id: int) -> models.IssuerRegistry:
    """Auto-create an issuer registry entry when first certificate is issued."""
    reg = db.query(models.IssuerRegistry).filter(
        models.IssuerRegistry.company_id == company_id
    ).first()
    if not reg:
        company = db.query(models.Company).filter(models.Company.id == company_id).first()
        reg = models.IssuerRegistry(
            company_id=company_id,
            did=f"did:skillsathi:issuer:{company_id}",
            domain=company.website_url if company and company.website_url else None,
            verification_level='basic' if company and company.status != 'verified' else 'verified'
        )
        db.add(reg)
        db.commit()
        db.refresh(reg)
    return reg


def get_branding(db: Session, company_id: int):
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if company:
        return {'logo_bytes': company.logo, 'signature_bytes': company.signature_image}
    return None


# ── 1. ISSUE CERTIFICATE ─────────────────────────────────────
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.CertificateOut)
async def issue_certificate(
    background_tasks: BackgroundTasks,
    recipient_name: str      = Form(...),
    recipient_email: str     = Form(...),
    course_title: str        = Form(...),
    completion_date: date    = Form(...),
    course_duration: str     = Form("4 Weeks"),
    recipient_photo: UploadFile = File(None),
    db: Session              = Depends(get_db),
    token: str               = Depends(auth.oauth2_scheme)
):
    user = auth.get_current_user_role(token)
    user_id, user_type = int(user['id']), user['type']

    company_id, worker_id = None, None
    cert_status = 'pending_approval'

    if user_type == 'company':
        company_id  = user_id
        cert_status = 'active'
        worker      = db.query(models.Worker).filter(models.Worker.company_id == company_id).first()
        worker_id   = worker.id if worker else 0
        actor_desc  = "Company Admin"
    elif user_type == 'worker':
        worker      = db.query(models.Worker).filter(models.Worker.id == user_id).first()
        company_id, worker_id = worker.company_id, worker.id
        cert_status = 'pending_approval'
        actor_desc  = f"Staff {worker.name}"

    cert_uid   = f"SKSL-{uuid.uuid4().hex[:8].upper()}"
    sha_hash   = hashlib.sha256(f"{cert_uid}-{recipient_name}-{course_title}".encode()).hexdigest()
    photo_data = await recipient_photo.read() if recipient_photo else None

    issuer_key   = get_or_create_issuer_key(db, company_id)
    issuer_reg   = get_or_create_issuer_registry(db, company_id)
    ed_signature = sign_certificate(
        issuer_key.private_key_b64, cert_uid, recipient_name,
        course_title, str(completion_date), company_id
    )
    hmac_token   = compute_hmac(cert_uid, sha_hash)
    signed_url   = build_signed_verification_url(cert_uid, sha_hash)
    qr_bytes     = generate_signed_qr_bytes(cert_uid, sha_hash)

    company      = db.query(models.Company).filter(models.Company.id == company_id).first()
    vc_json_str  = build_verifiable_credential(
        cert_uid=cert_uid, company_id=company_id,
        company_name=company.name if company else "Unknown",
        recipient_name=recipient_name, recipient_email=recipient_email,
        course_title=course_title, course_duration=course_duration,
        completion_date=completion_date, issue_date=datetime.utcnow(),
        skill_level=None, sha_hash=sha_hash,
        ed25519_signature=ed_signature,
        public_key_b64=issuer_key.public_key_b64,
        verification_url=signed_url,
    )

    branding  = get_branding(db, company_id)
    pdf_bytes = generate_certificate_pdf(
        {"recipient_name": recipient_name, "course_title": course_title,
         "course_duration": course_duration, "completion_date": completion_date,
         "certificate_uid": cert_uid, "recipient_photo": photo_data, "sha_hash": sha_hash},
        is_preview=(cert_status == 'pending_approval'),
        company_branding=branding
    )

    new_cert = models.Certificate(
        certificate_uid=cert_uid, company_id=company_id, worker_id=worker_id,
        recipient_name=recipient_name, recipient_email=recipient_email,
        course_title=course_title, course_duration=course_duration,
        completion_date=completion_date, sha_hash=sha_hash,
        ed25519_signature=ed_signature, hmac_token=hmac_token,
        vc_json=vc_json_str.encode(), signed_qr_url=signed_url,
        recipient_photo=photo_data, qr_code=qr_bytes,
        pdf_data=pdf_bytes, status=cert_status
    )
    db.add(new_cert)
    db.commit()
    db.refresh(new_cert)

    db.add(models.AuditLog(
        company_id=company_id,
        actor_type="company" if user_type == 'company' else "staff",
        actor_id=user_id, cert_id=new_cert.id,
        event_type="issue_certificate",
        details=f"Issued by {actor_desc} to {recipient_name} | signed=True"
    ))
    db.commit()

    if company and company.notify_issued:
        trigger_certificate_email(background_tasks, company.email, recipient_name, True)

    return new_cert


# ── 2. BULK IMPORT ────────────────────────────────────────────
@router.post("/bulk-import")
async def bulk_import_certificates(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    token: str = Depends(auth.oauth2_scheme)
):
    user       = auth.get_current_user_role(token)
    user_id    = int(user['id'])
    worker     = db.query(models.Worker).filter(models.Worker.id == user_id).first()
    company_id, worker_id = worker.company_id, worker.id

    issuer_key = get_or_create_issuer_key(db, company_id)
    get_or_create_issuer_registry(db, company_id)
    branding   = get_branding(db, company_id)
    company    = db.query(models.Company).filter(models.Company.id == company_id).first()

    csvReader  = csv.reader(codecs.iterdecode(file.file, 'utf-8'))
    next(csvReader)
    count = 0

    for row in csvReader:
        if len(row) < 4:
            continue
        name, email, course, duration = row[0], row[1], row[2], row[3]
        cert_uid   = f"SKSL-{uuid.uuid4().hex[:8].upper()}"
        sha_hash   = hashlib.sha256(f"{cert_uid}-{name}-{course}".encode()).hexdigest()
        ed_sig     = sign_certificate(issuer_key.private_key_b64, cert_uid, name, course, str(date.today()), company_id)
        hmac_token = compute_hmac(cert_uid, sha_hash)
        signed_url = build_signed_verification_url(cert_uid, sha_hash)
        qr_bytes   = generate_signed_qr_bytes(cert_uid, sha_hash)
        vc_str     = build_verifiable_credential(
            cert_uid=cert_uid, company_id=company_id,
            company_name=company.name if company else "",
            recipient_name=name, recipient_email=email,
            course_title=course, course_duration=duration,
            completion_date=date.today(), issue_date=datetime.utcnow(),
            skill_level=None, sha_hash=sha_hash,
            ed25519_signature=ed_sig, public_key_b64=issuer_key.public_key_b64,
            verification_url=signed_url
        )
        pdf_bytes = generate_certificate_pdf(
            {"recipient_name": name, "course_title": course, "course_duration": duration,
             "completion_date": date.today(), "certificate_uid": cert_uid,
             "recipient_photo": None, "sha_hash": sha_hash},
            is_preview=True, company_branding=branding
        )
        db.add(models.Certificate(
            certificate_uid=cert_uid, company_id=company_id, worker_id=worker_id,
            recipient_name=name, recipient_email=email, course_title=course,
            course_duration=duration, completion_date=date.today(),
            sha_hash=sha_hash, ed25519_signature=ed_sig, hmac_token=hmac_token,
            vc_json=vc_str.encode(), signed_qr_url=signed_url,
            qr_code=qr_bytes, pdf_data=pdf_bytes, status='pending_approval'
        ))
        count += 1

    db.commit()
    return {"message": f"Processed {count} certificates with Ed25519 signatures."}


# ── 3. GET ALL CERTIFICATES ───────────────────────────────────
@router.get("/", response_model=List[schemas.CertificateOut])
def get_certificates(db: Session = Depends(get_db), token: str = Depends(auth.oauth2_scheme)):
    user = auth.get_current_user_role(token)
    uid, utype = int(user['id']), user['type']
    query = db.query(models.Certificate)
    if utype == 'worker':
        query = query.filter(models.Certificate.worker_id == uid)
    else:
        cid = int(user.get('company_id') or uid)
        query = query.filter(models.Certificate.company_id == cid)
    return query.order_by(models.Certificate.issue_date.desc()).all()


# ── 4. PREVIEW PDF ────────────────────────────────────────────
@router.get("/{cert_id}/preview")
def preview_certificate(cert_id: int, db: Session = Depends(get_db), token: str = Depends(auth.oauth2_scheme)):
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Not found")
    if cert.status == 'pending_approval':
        branding = get_branding(db, cert.company_id)
        data = {"recipient_name": cert.recipient_name, "course_title": cert.course_title,
                "course_duration": cert.course_duration, "completion_date": cert.completion_date,
                "certificate_uid": cert.certificate_uid, "recipient_photo": cert.recipient_photo,
                "sha_hash": cert.sha_hash}
        return StreamingResponse(io.BytesIO(generate_certificate_pdf(data, is_preview=True, company_branding=branding)),
                                 media_type="application/pdf", headers={"Content-Disposition": "inline"})
    if not cert.pdf_data:
        raise HTTPException(404, "PDF data missing")
    return StreamingResponse(io.BytesIO(cert.pdf_data), media_type="application/pdf",
                             headers={"Content-Disposition": "inline"})


# ── 5. DOWNLOAD PDF ───────────────────────────────────────────
@router.get("/{cert_id}/pdf")
def download_pdf(cert_id: int, db: Session = Depends(get_db)):
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert or not cert.pdf_data:
        raise HTTPException(status_code=404, detail="PDF not found")
    return StreamingResponse(io.BytesIO(cert.pdf_data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{cert.certificate_uid}.pdf"'})


# ── 6. APPROVE ────────────────────────────────────────────────
@router.post("/approve")
def approve_certificates(
    cert_ids: List[int],
    db: Session = Depends(get_db),
    current_company: models.Company = Depends(auth.get_current_company)
):
    certs      = db.query(models.Certificate).filter(
        models.Certificate.id.in_(cert_ids),
        models.Certificate.company_id == current_company.id,
        models.Certificate.status == 'pending_approval'
    ).all()
    branding   = get_branding(db, current_company.id)
    issuer_key = get_or_create_issuer_key(db, current_company.id)
    count      = 0
    for cert in certs:
        cert.status = 'active'
        cert.ed25519_signature = sign_certificate(
            issuer_key.private_key_b64, cert.certificate_uid,
            cert.recipient_name, cert.course_title,
            str(cert.completion_date), current_company.id
        )
        data = {"recipient_name": cert.recipient_name, "course_title": cert.course_title,
                "course_duration": cert.course_duration, "completion_date": cert.completion_date,
                "certificate_uid": cert.certificate_uid, "recipient_photo": cert.recipient_photo,
                "sha_hash": cert.sha_hash}
        cert.pdf_data = generate_certificate_pdf(data, is_preview=False, company_branding=branding)
        count += 1
    db.commit()
    return {"message": f"Approved {count} certificates."}


# ── 7. REVOKE (Phase 2: writes to revocation_registry) ───────
@router.post("/{cert_id}/revoke")
def revoke_certificate(
    cert_id: int,
    body: schemas.RevokeRequest,
    db: Session = Depends(get_db),
    current_company: models.Company = Depends(auth.get_current_company)
):
    cert = db.query(models.Certificate).filter(
        models.Certificate.id == cert_id,
        models.Certificate.company_id == current_company.id
    ).first()
    if not cert:
        raise HTTPException(404, "Certificate not found.")
    if cert.status == 'revoked':
        raise HTTPException(400, "Certificate is already revoked.")

    # Update status on the certificate
    cert.status = 'revoked'

    # Write to revocation_registry (Phase 2)
    revocation = models.RevocationRegistry(
        certificate_uid=cert.certificate_uid,
        company_id=current_company.id,
        revoked_by=current_company.id,
        revoked_by_type='company',
        reason=body.reason
    )
    db.add(revocation)

    # Audit log
    db.add(models.AuditLog(
        company_id=current_company.id, actor_type="company",
        actor_id=current_company.id, cert_id=cert.id,
        event_type="revoke_certificate",
        details=f"Revoked {cert.certificate_uid} | reason: {body.reason}"
    ))
    db.commit()
    return {"message": "Certificate revoked and logged to revocation registry."}


# ── 8. DELETE ─────────────────────────────────────────────────
@router.delete("/{cert_id}")
def delete_certificate(
    cert_id: int,
    confirm_name: str = Form(...),
    db: Session = Depends(get_db),
    token: str = Depends(auth.oauth2_scheme)
):
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(404, "Not found")
    if cert.recipient_name.lower().strip() != confirm_name.lower().strip():
        raise HTTPException(400, "Name mismatch")
    db.delete(cert)
    db.commit()
    return {"message": "Deleted"}


# ── 9. SEND EMAIL ─────────────────────────────────────────────
@router.post("/{cert_id}/send-email")
def send_certificate_email(
    cert_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_company: models.Company = Depends(auth.get_current_company)
):
    cert = db.query(models.Certificate).filter(
        models.Certificate.id == cert_id,
        models.Certificate.company_id == current_company.id,
        models.Certificate.status == 'active'
    ).first()
    if not cert or not cert.pdf_data:
        raise HTTPException(status_code=404, detail="Certificate not found or not active.")
    if not cert.recipient_email:
        raise HTTPException(status_code=400, detail="Recipient email missing.")
    trigger_recipient_certificate(background_tasks, {
        'recipient_name': cert.recipient_name, 'recipient_email': cert.recipient_email,
        'course_title': cert.course_title, 'certificate_uid': cert.certificate_uid,
        'sha_hash': cert.sha_hash
    }, cert.pdf_data)
    return {"message": f"Certificate sent to {cert.recipient_email}"}


# ── 10. GET VC JSON ───────────────────────────────────────────
@router.get("/{cert_id}/vc")
def get_vc_json(cert_id: int, db: Session = Depends(get_db), token: str = Depends(auth.oauth2_scheme)):
    import json
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(404, "Not found")
    if not cert.vc_json:
        raise HTTPException(404, "VC JSON not available.")
    return json.loads(cert.vc_json.decode())
PYEOF
echo "✅ routers/certificates.py updated."


# ─────────────────────────────────────────
# STEP 8: Update backend/routers/admin.py
# (Add revocation registry + issuer registry endpoints)
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/routers/admin.py ..."
cat > backend/routers/admin.py << 'PYEOF'
# backend/routers/admin.py
# Phase 2: Revocation registry view + Issuer registry management added.

from fastapi import APIRouter, Depends, HTTPException, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List
import io

import models, schemas
from database import get_db
from . import auth
from utils.notifications import (
    trigger_company_approval_email,
    trigger_company_deletion_email,
    trigger_company_rejection_email
)

router = APIRouter(prefix="/admin", tags=['Super Admin'])


def get_super_admin(current_company: models.Company = Depends(auth.get_current_company)):
    if not current_company.is_admin:
        raise HTTPException(status_code=403, detail="Super Admin Access Only")
    return current_company


# ── 1. Stats ──────────────────────────────────────────────────
@router.get("/stats")
def get_stats(db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    return {
        "total_centers":    db.query(models.Company).count(),
        "total_certificates": db.query(models.Certificate).count(),
        "total_workers":    db.query(models.Worker).count(),
        "pending_reviews":  db.query(models.Company).filter(models.Company.status == 'pending').count(),
        "total_revocations": db.query(models.RevocationRegistry).count(),
    }


# ── 2. Chart data ─────────────────────────────────────────────
@router.get("/charts/data")
def get_admin_chart_data(db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    monthly_counts = [0] * 12
    current_year   = datetime.utcnow().year
    for c in db.query(models.Certificate).filter(
        func.extract('year', models.Certificate.issue_date) == current_year
    ).all():
        if c.issue_date:
            monthly_counts[c.issue_date.month - 1] += 1

    status_counts = db.query(models.Company.status, func.count(models.Company.id)
                             ).group_by(models.Company.status).all()
    return {
        "monthly_issuance": monthly_counts,
        "center_status": {s: c for s, c in status_counts}
    }


# ── 3. Logs ───────────────────────────────────────────────────
@router.get("/logs")
def get_logs(db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    logs       = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(50).all()
    worker_ids = [l.actor_id for l in logs if l.actor_type == 'staff' and l.actor_id]
    worker_map = {w.id: w.name for w in db.query(models.Worker).filter(models.Worker.id.in_(worker_ids)).all()}
    result     = []
    for log in logs:
        actor = log.actor_type
        if log.actor_type == 'staff' and log.actor_id in worker_map:
            actor = f"Staff: {worker_map[log.actor_id]}"
        elif log.actor_type == 'company':
            actor = f"Admin: Company {log.company_id}"
        result.append({
            "timestamp":    log.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "event_type":   log.event_type,
            "actor_id":     log.actor_id,
            "details":      log.details,
            "actor_display": actor
        })
    return result


# ── 4. Companies ──────────────────────────────────────────────
@router.get("/companies", response_model=List[schemas.CompanyOut])
def list_companies(db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    return db.query(models.Company).all()


@router.get("/companies/{company_id}/details")
def get_company_details(company_id: int, db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return {
        "company": schemas.CompanyOut.from_orm(company).dict(),
        "stats": {
            "workers":      db.query(models.Worker).filter(models.Worker.company_id == company_id).count(),
            "certificates": db.query(models.Certificate).filter(models.Certificate.company_id == company_id).count(),
            "active_certs": db.query(models.Certificate).filter(
                models.Certificate.company_id == company_id,
                models.Certificate.status == 'active'
            ).count(),
        }
    }


@router.get("/companies/{company_id}/files/{file_type}")
def get_company_file(company_id: int, file_type: str, db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    company   = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    file_data = company.contact_photo if file_type == 'photo' else company.registration_document
    if not file_data:
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "application/pdf" if file_data.startswith(b'%PDF') else "image/jpeg"
    return StreamingResponse(io.BytesIO(file_data), media_type=media_type)


@router.put("/companies/{company_id}/approve")
def approve_company(company_id: int, background_tasks: BackgroundTasks,
                    db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Not found")
    company.status = 'verified'
    # Upgrade issuer registry level when admin approves
    reg = db.query(models.IssuerRegistry).filter(models.IssuerRegistry.company_id == company_id).first()
    if reg:
        reg.verification_level = 'verified'
    db.commit()
    trigger_company_approval_email(background_tasks, company.email, company.name)
    return {"message": f"Company {company.name} verified."}


@router.put("/companies/{company_id}/reject")
def reject_company(company_id: int, background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Not found")
    company.status = 'rejected'
    db.commit()
    trigger_company_rejection_email(background_tasks, company.email, company.name)
    return {"message": "Company rejected."}


@router.delete("/companies/{company_id}")
def delete_company(company_id: int, background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Not found")
    if company.id == 1:
        raise HTTPException(status_code=403, detail="Cannot delete the main HQ account.")
    trigger_company_deletion_email(background_tasks, company.email, company.name)
    db.delete(company)
    db.commit()
    return {"message": "Company deleted."}


# ── 5. Tickets ────────────────────────────────────────────────
@router.get("/tickets")
def get_all_tickets(db: Session = Depends(get_db), current_company: models.Company = Depends(auth.get_current_company)):
    if not current_company.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    tickets = db.query(models.SupportTicket).order_by(models.SupportTicket.created_at.desc()).all()
    return [{
        "id": t.id, "subject": t.subject, "message": t.message,
        "status": t.status, "created_at": t.created_at,
        "company_name": db.query(models.Company).filter(models.Company.id == t.company_id).first().name
    } for t in tickets]


@router.put("/tickets/{ticket_id}/resolve")
def resolve_ticket(ticket_id: int, db: Session = Depends(get_db),
                   current_company: models.Company = Depends(auth.get_current_company)):
    if not current_company.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    ticket = db.query(models.SupportTicket).filter(models.SupportTicket.id == ticket_id).first()
    if ticket:
        ticket.status = 'resolved'
        db.commit()
    return {"message": "Marked as resolved"}


# ── Phase 2: Revocation Registry endpoints ────────────────────

@router.get("/revocations", response_model=List[schemas.RevocationOut])
def get_all_revocations(db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    """View all revocations platform-wide — for IEEE paper results section."""
    return db.query(models.RevocationRegistry).order_by(
        models.RevocationRegistry.revoked_at.desc()
    ).all()


@router.get("/revocations/{certificate_uid}")
def get_revocation_detail(certificate_uid: str, db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    """Get revocation history for a specific certificate."""
    revocations = db.query(models.RevocationRegistry).filter(
        models.RevocationRegistry.certificate_uid == certificate_uid
    ).all()
    if not revocations:
        raise HTTPException(404, "No revocation record found for this certificate.")
    return revocations


# ── Phase 2: Issuer Registry endpoints ───────────────────────

@router.get("/issuers", response_model=List[schemas.IssuerRegistryOut])
def get_all_issuers(db: Session = Depends(get_db), admin=Depends(get_super_admin)):
    """List all registered issuers with their DID and trust level."""
    return db.query(models.IssuerRegistry).all()


@router.put("/issuers/{company_id}/trust-level")
def set_issuer_trust_level(
    company_id: int,
    level: str,
    db: Session = Depends(get_db),
    admin=Depends(get_super_admin)
):
    """Upgrade an issuer to 'trusted' level manually."""
    if level not in ('basic', 'verified', 'trusted'):
        raise HTTPException(400, "Level must be: basic, verified, or trusted")
    reg = db.query(models.IssuerRegistry).filter(models.IssuerRegistry.company_id == company_id).first()
    if not reg:
        raise HTTPException(404, "Issuer not registered yet.")
    reg.verification_level = level
    db.commit()
    return {"message": f"Issuer {company_id} set to '{level}'."}
PYEOF
echo "✅ routers/admin.py updated."


# ─────────────────────────────────────────
# FINAL: Summary
# ─────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
echo "✅  Phase 2 setup complete!"
echo "══════════════════════════════════════════════"
echo ""
echo "Files created / updated:"
echo "  ✦ database/phase2_migration.sql   (NEW)"
echo "  ✦ backend/models.py               (UPDATED - 2 new models)"
echo "  ✦ backend/schemas.py              (UPDATED - 3 new schemas)"
echo "  ✦ backend/main.py                 (UPDATED - SlowAPI added)"
echo "  ✦ backend/routers/verification.py (UPDATED - rate limiting)"
echo "  ✦ backend/routers/certificates.py (UPDATED - revoke improved)"
echo "  ✦ backend/routers/admin.py        (UPDATED - registry endpoints)"
echo ""
echo "Next step — run the DB migration:"
echo "  mysql -u skillsathi_user -p skillsathi < database/phase2_migration.sql"
echo ""
echo "Then restart your backend:"
echo "  cd backend && uvicorn main:app --reload"
echo ""
echo "Test endpoints:"
echo "  GET  http://127.0.0.1:8000/admin/revocations"
echo "  GET  http://127.0.0.1:8000/admin/issuers"
echo "  GET  http://127.0.0.1:8000/verification/SKSL-XXXXXXXX  (now rate limited)"
echo ""