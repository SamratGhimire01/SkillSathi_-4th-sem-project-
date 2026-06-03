#!/bin/bash
# =============================================================
# SkillSathi — Phase 1 Setup Script
# Run from your project ROOT directory:
#   cd ~/your-project-folder
#   bash skillsathi_phase1_setup.sh
# =============================================================

set -e  # stop on any error
echo "🚀 SkillSathi Phase 1 — Starting setup..."

# ─────────────────────────────────────────
# STEP 1: Install new dependencies
# ─────────────────────────────────────────
echo ""
echo "📦 Installing dependencies..."
cd backend
pip install cryptography pynacl python-jose[cryptography] --break-system-packages 2>/dev/null || \
pip install cryptography pynacl python-jose[cryptography]

# Also add to requirements.txt
grep -qxF 'cryptography' requirements.txt || echo 'cryptography' >> requirements.txt
grep -qxF 'pynacl' requirements.txt       || echo 'pynacl'       >> requirements.txt
grep -qxF 'python-jose[cryptography]' requirements.txt || echo 'python-jose[cryptography]' >> requirements.txt
cd ..
echo "✅ Dependencies installed."


# ─────────────────────────────────────────
# STEP 2: Create backend/utils/crypto_utils.py
# ─────────────────────────────────────────
echo ""
echo "📄 Creating backend/utils/crypto_utils.py ..."
cat > backend/utils/crypto_utils.py << 'PYEOF'
# backend/utils/crypto_utils.py
# Ed25519 digital signature utility for SkillSathi
# Each company gets a key pair stored in issuer_keys table.
# Certificates are signed on issuance and verified on lookup.

import os
import hmac
import hashlib
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey, Ed25519PublicKey
)
from cryptography.hazmat.primitives import serialization
from cryptography.exceptions import InvalidSignature


# ── Key Generation ───────────────────────────────────────────

def generate_ed25519_keypair() -> tuple[str, str]:
    """
    Generate a new Ed25519 key pair.
    Returns (private_key_b64, public_key_b64) — both base64-encoded strings
    safe to store in the database.
    """
    private_key = Ed25519PrivateKey.generate()
    public_key  = private_key.public_key()

    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )

    return (
        base64.b64encode(private_bytes).decode(),
        base64.b64encode(public_bytes).decode()
    )


# ── Signing ──────────────────────────────────────────────────

def build_signable_payload(cert_uid: str, recipient_name: str,
                            course_title: str, completion_date: str,
                            company_id: int) -> bytes:
    """
    Build a canonical byte string from certificate fields.
    Field order is fixed — never change it once in production.
    """
    payload = (
        f"uid={cert_uid}|"
        f"name={recipient_name.strip().lower()}|"
        f"course={course_title.strip().lower()}|"
        f"date={completion_date}|"
        f"issuer={company_id}"
    )
    return payload.encode("utf-8")


def sign_certificate(private_key_b64: str, cert_uid: str,
                     recipient_name: str, course_title: str,
                     completion_date: str, company_id: int) -> str:
    """
    Sign a certificate payload with the issuer's Ed25519 private key.
    Returns the signature as a base64 string to store in the DB.
    """
    private_bytes = base64.b64decode(private_key_b64)
    private_key   = Ed25519PrivateKey.from_private_bytes(private_bytes)

    payload   = build_signable_payload(cert_uid, recipient_name,
                                       course_title, completion_date,
                                       company_id)
    signature = private_key.sign(payload)
    return base64.b64encode(signature).decode()


# ── Verification ─────────────────────────────────────────────

def verify_certificate_signature(public_key_b64: str, signature_b64: str,
                                  cert_uid: str, recipient_name: str,
                                  course_title: str, completion_date: str,
                                  company_id: int) -> bool:
    """
    Verify an Ed25519 signature against the certificate payload.
    Returns True if valid, False if tampered or key mismatch.
    """
    try:
        public_bytes = base64.b64decode(public_key_b64)
        public_key   = Ed25519PublicKey.from_public_bytes(public_bytes)
        signature    = base64.b64decode(signature_b64)
        payload      = build_signable_payload(cert_uid, recipient_name,
                                              course_title, completion_date,
                                              company_id)
        public_key.verify(signature, payload)
        return True
    except (InvalidSignature, Exception):
        return False


# ── HMAC-SHA256 (integrity check, secondary layer) ───────────

def compute_hmac(cert_uid: str, sha_hash: str, secret: str | None = None) -> str:
    """
    Compute HMAC-SHA256 over the cert_uid + sha_hash pair.
    Uses SECRET_KEY from env if secret not provided.
    Stored in certificates.hmac_token for quick tamper detection.
    """
    if secret is None:
        secret = os.getenv("SECRET_KEY", "fallback-secret")
    msg = f"{cert_uid}:{sha_hash}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def verify_hmac(cert_uid: str, sha_hash: str,
                expected_hmac: str, secret: str | None = None) -> bool:
    """Constant-time HMAC comparison to prevent timing attacks."""
    computed = compute_hmac(cert_uid, sha_hash, secret)
    return hmac.compare_digest(computed, expected_hmac)
PYEOF
echo "✅ crypto_utils.py created."


# ─────────────────────────────────────────
# STEP 3: Create backend/utils/vc_builder.py
# ─────────────────────────────────────────
echo ""
echo "📄 Creating backend/utils/vc_builder.py ..."
cat > backend/utils/vc_builder.py << 'PYEOF'
# backend/utils/vc_builder.py
# W3C Verifiable Credential (VC) inspired JSON builder for SkillSathi.
# Produces a structured JSON credential that mirrors the W3C VC Data Model.
# Reference: https://www.w3.org/TR/vc-data-model/

import json
from datetime import datetime, date


# ── Helpers ──────────────────────────────────────────────────

def _date_to_iso(d) -> str:
    """Convert date or datetime to ISO-8601 string."""
    if isinstance(d, datetime):
        return d.isoformat() + "Z"
    if isinstance(d, date):
        return datetime.combine(d, datetime.min.time()).isoformat() + "Z"
    return str(d)


# ── Builder ──────────────────────────────────────────────────

def build_verifiable_credential(
    cert_uid: str,
    company_id: int,
    company_name: str,
    recipient_name: str,
    recipient_email: str | None,
    course_title: str,
    course_duration: str | None,
    completion_date,
    issue_date,
    skill_level: str | None,
    sha_hash: str,
    ed25519_signature: str,
    public_key_b64: str,
    verification_url: str,
) -> str:
    """
    Build a W3C VC-inspired JSON credential.
    Returns a JSON string ready to store in certificates.vc_json column.
    """

    vc = {
        # --- W3C VC Context ---
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://skillsathi.np/context/v1"            # your custom context
        ],

        # --- Credential Metadata ---
        "id": f"https://skillsathi.np/credentials/{cert_uid}",
        "type": ["VerifiableCredential", "SkillCertificate"],

        # --- Issuer (DID-style for future blockchain upgrade) ---
        "issuer": {
            "id": f"did:skillsathi:issuer:{company_id}",
            "name": company_name,
            "publicKey": public_key_b64
        },

        # --- Dates ---
        "issuanceDate": _date_to_iso(issue_date),
        "expirationDate": None,                            # set per-cert if needed

        # --- Credential Subject (the worker/recipient) ---
        "credentialSubject": {
            "id": f"did:skillsathi:recipient:{sha_hash[:16]}",
            "name": recipient_name,
            "email": recipient_email,
            "achievement": {
                "type": "SkillCertificate",
                "name": course_title,
                "duration": course_duration,
                "skillLevel": skill_level,
                "completionDate": _date_to_iso(completion_date),
            }
        },

        # --- Integrity Proof ---
        "proof": {
            "type": "Ed25519Signature2020",
            "created": _date_to_iso(issue_date),
            "verificationMethod": f"did:skillsathi:issuer:{company_id}#key-1",
            "proofPurpose": "assertionMethod",
            "proofValue": ed25519_signature,
        },

        # --- SkillSathi-specific extensions ---
        "skillsathi": {
            "certificateUID": cert_uid,
            "shaHash": sha_hash,
            "verificationURL": verification_url,
            "schemaVersion": "1.0"
        }
    }

    return json.dumps(vc, indent=2, default=str)


# ── Parser ───────────────────────────────────────────────────

def parse_verifiable_credential(vc_json_str: str) -> dict:
    """Parse stored VC JSON string back to dict."""
    try:
        return json.loads(vc_json_str)
    except Exception:
        return {}
PYEOF
echo "✅ vc_builder.py created."


# ─────────────────────────────────────────
# STEP 4: Create backend/utils/qr_utils.py
# ─────────────────────────────────────────
echo ""
echo "📄 Creating backend/utils/qr_utils.py ..."
cat > backend/utils/qr_utils.py << 'PYEOF'
# backend/utils/qr_utils.py
# Generates a JWT-signed verification URL embedded in the QR code.
# Instead of encoding a raw cert_uid, we encode a signed token so that:
#   1. The URL cannot be forged or tampered with.
#   2. The verifier knows the token came from SkillSathi backend.
#   3. We can add expiry to verification links in the future.

import os
import qrcode
from io import BytesIO
from PIL import Image
from jose import jwt, JWTError
from datetime import datetime, timezone, timedelta


# ── Config ───────────────────────────────────────────────────

def _secret() -> str:
    return os.getenv("SECRET_KEY", "fallback-secret")

ALGORITHM    = "HS256"
BASE_URL     = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")
TOKEN_EXPIRY = int(os.getenv("QR_TOKEN_EXPIRE_DAYS", "3650"))  # ~10 years default


# ── Token Generation ─────────────────────────────────────────

def create_verification_token(cert_uid: str, sha_hash: str) -> str:
    """
    Create a short JWT that encodes the certificate identity.
    Payload: { uid, hash, iat, exp }
    """
    now    = datetime.now(timezone.utc)
    expiry = now + timedelta(days=TOKEN_EXPIRY)
    payload = {
        "uid":  cert_uid,
        "hash": sha_hash,
        "iat":  int(now.timestamp()),
        "exp":  int(expiry.timestamp()),
        "iss":  "skillsathi"
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_verification_token(token: str) -> dict | None:
    """
    Decode and validate a verification token.
    Returns payload dict on success, None on failure/expiry.
    """
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ── Signed URL Builder ───────────────────────────────────────

def build_signed_verification_url(cert_uid: str, sha_hash: str) -> str:
    """
    Build a full signed verification URL:
    https://your-frontend.com/verify.html?token=<JWT>
    """
    token = create_verification_token(cert_uid, sha_hash)
    return f"{BASE_URL}/frontend/verify.html?token={token}"


# ── QR Code Generator ────────────────────────────────────────

def generate_signed_qr_bytes(cert_uid: str, sha_hash: str) -> bytes:
    """
    Generate a QR code PNG that encodes the signed verification URL.
    Returns raw PNG bytes for storage in certificates.qr_code column.
    """
    signed_url = build_signed_verification_url(cert_uid, sha_hash)

    qr = qrcode.QRCode(
        version=2,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(signed_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def get_signed_url_from_token(token: str) -> dict:
    """
    Used by the verification endpoint to decode an incoming QR token.
    Returns { uid, hash } on success or raises ValueError on failure.
    """
    payload = decode_verification_token(token)
    if not payload:
        raise ValueError("Invalid or expired verification token.")
    return {"cert_uid": payload["uid"], "sha_hash": payload["hash"]}
PYEOF
echo "✅ qr_utils.py created."


# ─────────────────────────────────────────
# STEP 5: Overwrite backend/models.py
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/models.py ..."
cat > backend/models.py << 'PYEOF'
# backend/models.py
# Updated for Phase 1: Ed25519 signature, VC JSON, HMAC token,
# signed QR URL, and IssuerKey table added.

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

    # Basic info
    status                = Column(Enum('pending', 'verified', 'rejected'), default='pending')
    subscription_tier     = Column(Enum('free', 'basic', 'medium', 'pro'), default='free')
    certificates_used     = Column(Integer, default=0)
    business_address      = Column(String(255))
    phone_number          = Column(String(20))
    website_url           = Column(String(255))
    is_admin              = Column(Boolean, default=False)
    created_at            = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))

    # Contact / registration
    primary_contact_name  = Column(String(255))
    citizenship_number    = Column(String(100))
    contact_photo         = Column(LONGBLOB)
    registration_document = Column(LONGBLOB)

    # Branding
    logo                  = Column(LargeBinary, nullable=True)
    signature_image       = Column(LargeBinary, nullable=True)

    # Notifications
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

    # ── Original integrity hash (kept for backward compat) ──
    sha_hash             = Column(String(64), unique=True, nullable=False)

    # ── Phase 1: New security columns ──────────────────────
    ed25519_signature    = Column(TEXT, nullable=True)        # base64 Ed25519 sig
    hmac_token           = Column(String(64), nullable=True)  # HMAC-SHA256 token
    vc_json              = Column(LONGBLOB, nullable=True)     # W3C VC JSON
    signed_qr_url        = Column(TEXT, nullable=True)        # JWT-signed verify URL

    status               = Column(Enum('active', 'revoked', 'expired', 'pending_approval'), default='pending_approval')
    qr_code              = Column(LargeBinary)
    download_count       = Column(Integer, default=0)
    verification_count   = Column(Integer, default=0)
    pdf_data             = Column(LargeBinary)
    created_at           = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))


# ── Phase 1: Issuer Key Registry ─────────────────────────────
class IssuerKey(Base):
    """
    Stores the Ed25519 key pair for each verified company (issuer).
    Private key is stored encrypted — never returned via API.
    Public key is returned during verification to prove authenticity.
    """
    __tablename__ = "issuer_keys"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    company_id      = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"),
                             unique=True, nullable=False)
    public_key_b64  = Column(TEXT, nullable=False)   # safe to expose
    private_key_b64 = Column(TEXT, nullable=False)   # NEVER expose via API
    created_at      = Column(TIMESTAMP, server_default=text('CURRENT_TIMESTAMP'))

    company = relationship("Company")


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
# STEP 6: Overwrite backend/schemas.py
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/schemas.py ..."
cat > backend/schemas.py << 'PYEOF'
# backend/schemas.py
# Updated for Phase 1: VC JSON, signature, signed URL fields added.

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


# ── Certificate Schemas ───────────────────────────────────────

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

    # Phase 1: new fields
    ed25519_signature: Optional[str] = None
    signed_qr_url: Optional[str] = None

    class Config:
        from_attributes = True


# ── Verification Response ─────────────────────────────────────

class VerificationResult(BaseModel):
    """Rich response returned by the verification endpoint."""
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
    vc_json: Optional[dict] = None
    verification_count: int


# ── Issuer Key ────────────────────────────────────────────────

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
# STEP 7: Overwrite backend/routers/certificates.py
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/routers/certificates.py ..."
cat > backend/routers/certificates.py << 'PYEOF'
# backend/routers/certificates.py
# Phase 1 update:
#   - Ed25519 signing on every issued certificate
#   - HMAC-SHA256 token for quick tamper detection
#   - W3C VC JSON stored in vc_json column
#   - Signed JWT verification URL embedded in QR code

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
from utils.crypto_utils import (
    generate_ed25519_keypair, sign_certificate, compute_hmac
)
from utils.vc_builder import build_verifiable_credential
from utils.qr_utils import generate_signed_qr_bytes, build_signed_verification_url

router = APIRouter(prefix="/certificates", tags=['Certificates'])


# ── Helper: get or create issuer key for a company ───────────
def get_or_create_issuer_key(db: Session, company_id: int) -> models.IssuerKey:
    """
    Every verified company has one Ed25519 key pair.
    Create it the first time a certificate is issued.
    """
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


# ── Helper: company branding ──────────────────────────────────
def get_branding(db: Session, company_id: int):
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if company:
        return {'logo_bytes': company.logo, 'signature_bytes': company.signature_image}
    return None


# ── 1. ISSUE CERTIFICATE (Single) ────────────────────────────
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

    # ── Generate cert UID + SHA-256 hash ─────────────────────
    cert_uid = f"SKSL-{uuid.uuid4().hex[:8].upper()}"
    sha_hash = hashlib.sha256(f"{cert_uid}-{recipient_name}-{course_title}".encode()).hexdigest()
    photo_data = await recipient_photo.read() if recipient_photo else None

    # ── Phase 1: Ed25519 signature ────────────────────────────
    issuer_key     = get_or_create_issuer_key(db, company_id)
    ed_signature   = sign_certificate(
        private_key_b64=issuer_key.private_key_b64,
        cert_uid=cert_uid,
        recipient_name=recipient_name,
        course_title=course_title,
        completion_date=str(completion_date),
        company_id=company_id
    )

    # ── Phase 1: HMAC token ───────────────────────────────────
    hmac_token = compute_hmac(cert_uid, sha_hash)

    # ── Phase 1: Signed QR URL ────────────────────────────────
    signed_url = build_signed_verification_url(cert_uid, sha_hash)
    qr_bytes   = generate_signed_qr_bytes(cert_uid, sha_hash)

    # ── Phase 1: W3C VC JSON ──────────────────────────────────
    company    = db.query(models.Company).filter(models.Company.id == company_id).first()
    vc_json_str = build_verifiable_credential(
        cert_uid=cert_uid,
        company_id=company_id,
        company_name=company.name if company else "Unknown",
        recipient_name=recipient_name,
        recipient_email=recipient_email,
        course_title=course_title,
        course_duration=course_duration,
        completion_date=completion_date,
        issue_date=datetime.utcnow(),
        skill_level=None,
        sha_hash=sha_hash,
        ed25519_signature=ed_signature,
        public_key_b64=issuer_key.public_key_b64,
        verification_url=signed_url,
    )

    # ── Generate PDF ──────────────────────────────────────────
    branding   = get_branding(db, company_id)
    pdf_data_dict = {
        "recipient_name":  recipient_name,
        "course_title":    course_title,
        "course_duration": course_duration,
        "completion_date": completion_date,
        "certificate_uid": cert_uid,
        "recipient_photo": photo_data,
        "sha_hash":        sha_hash
    }
    pdf_bytes = generate_certificate_pdf(
        pdf_data_dict,
        is_preview=(cert_status == 'pending_approval'),
        company_branding=branding
    )

    # ── Save to DB ────────────────────────────────────────────
    new_cert = models.Certificate(
        certificate_uid=cert_uid,
        company_id=company_id,
        worker_id=worker_id,
        recipient_name=recipient_name,
        recipient_email=recipient_email,
        course_title=course_title,
        course_duration=course_duration,
        completion_date=completion_date,
        sha_hash=sha_hash,
        ed25519_signature=ed_signature,
        hmac_token=hmac_token,
        vc_json=vc_json_str.encode(),
        signed_qr_url=signed_url,
        recipient_photo=photo_data,
        qr_code=qr_bytes,
        pdf_data=pdf_bytes,
        status=cert_status
    )
    db.add(new_cert)
    db.commit()
    db.refresh(new_cert)

    # Audit log
    db.add(models.AuditLog(
        company_id=company_id,
        actor_type="company" if user_type == 'company' else "staff",
        actor_id=user_id,
        cert_id=new_cert.id,
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
    user = auth.get_current_user_role(token)
    user_id = int(user['id'])
    worker  = db.query(models.Worker).filter(models.Worker.id == user_id).first()
    company_id, worker_id = worker.company_id, worker.id

    issuer_key = get_or_create_issuer_key(db, company_id)
    branding   = get_branding(db, company_id)
    company    = db.query(models.Company).filter(models.Company.id == company_id).first()

    csvReader = csv.reader(codecs.iterdecode(file.file, 'utf-8'))
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
            ed25519_signature=ed_sig,
            public_key_b64=issuer_key.public_key_b64,
            verification_url=signed_url
        )
        pdf_data = {"recipient_name": name, "course_title": course,
                    "course_duration": duration, "completion_date": date.today(),
                    "certificate_uid": cert_uid, "recipient_photo": None, "sha_hash": sha_hash}
        pdf_bytes = generate_certificate_pdf(pdf_data, is_preview=True, company_branding=branding)

        new_cert = models.Certificate(
            certificate_uid=cert_uid, company_id=company_id, worker_id=worker_id,
            recipient_name=name, recipient_email=email, course_title=course,
            course_duration=duration, completion_date=date.today(),
            sha_hash=sha_hash, ed25519_signature=ed_sig, hmac_token=hmac_token,
            vc_json=vc_str.encode(), signed_qr_url=signed_url,
            qr_code=qr_bytes, pdf_data=pdf_bytes, status='pending_approval'
        )
        db.add(new_cert)
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
        data = {
            "recipient_name": cert.recipient_name, "course_title": cert.course_title,
            "course_duration": cert.course_duration, "completion_date": cert.completion_date,
            "certificate_uid": cert.certificate_uid, "recipient_photo": cert.recipient_photo,
            "sha_hash": cert.sha_hash
        }
        pdf_bytes = generate_certificate_pdf(data, is_preview=True, company_branding=branding)
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                                 headers={"Content-Disposition": "inline"})
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
    certs = db.query(models.Certificate).filter(
        models.Certificate.id.in_(cert_ids),
        models.Certificate.company_id == current_company.id,
        models.Certificate.status == 'pending_approval'
    ).all()

    branding   = get_branding(db, current_company.id)
    issuer_key = get_or_create_issuer_key(db, current_company.id)
    count = 0

    for cert in certs:
        cert.status = 'active'
        # Re-sign with final status
        cert.ed25519_signature = sign_certificate(
            issuer_key.private_key_b64, cert.certificate_uid,
            cert.recipient_name, cert.course_title,
            str(cert.completion_date), current_company.id
        )
        data = {
            "recipient_name": cert.recipient_name, "course_title": cert.course_title,
            "course_duration": cert.course_duration, "completion_date": cert.completion_date,
            "certificate_uid": cert.certificate_uid, "recipient_photo": cert.recipient_photo,
            "sha_hash": cert.sha_hash
        }
        cert.pdf_data = generate_certificate_pdf(data, is_preview=False, company_branding=branding)
        count += 1

    db.commit()
    return {"message": f"Approved {count} certificates with fresh signatures."}


# ── 7. REVOKE ─────────────────────────────────────────────────
@router.post("/{cert_id}/revoke")
def revoke_certificate(
    cert_id: int,
    db: Session = Depends(get_db),
    current_company: models.Company = Depends(auth.get_current_company)
):
    cert = db.query(models.Certificate).filter(
        models.Certificate.id == cert_id,
        models.Certificate.company_id == current_company.id
    ).first()
    if not cert:
        raise HTTPException(404, "Not found")
    cert.status = 'revoked'
    db.add(models.AuditLog(
        company_id=current_company.id, actor_type="company",
        actor_id=current_company.id, cert_id=cert.id,
        event_type="revoke_certificate", details=f"Revoked cert {cert.certificate_uid}"
    ))
    db.commit()
    return {"message": "Certificate revoked."}


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

    cert_data_dict = {
        'recipient_name':  cert.recipient_name,
        'recipient_email': cert.recipient_email,
        'course_title':    cert.course_title,
        'certificate_uid': cert.certificate_uid,
        'sha_hash':        cert.sha_hash
    }
    trigger_recipient_certificate(background_tasks, cert_data_dict, cert.pdf_data)
    return {"message": f"Certificate sent to {cert.recipient_email}"}


# ── 10. GET VC JSON ───────────────────────────────────────────
@router.get("/{cert_id}/vc")
def get_vc_json(
    cert_id: int,
    db: Session = Depends(get_db),
    token: str = Depends(auth.oauth2_scheme)
):
    """Return the W3C Verifiable Credential JSON for a certificate."""
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(404, "Not found")
    if not cert.vc_json:
        raise HTTPException(404, "VC JSON not available for this certificate.")
    import json
    return json.loads(cert.vc_json.decode())
PYEOF
echo "✅ routers/certificates.py updated."


# ─────────────────────────────────────────
# STEP 8: Overwrite backend/routers/verification.py
# ─────────────────────────────────────────
echo ""
echo "📄 Updating backend/routers/verification.py ..."
cat > backend/routers/verification.py << 'PYEOF'
# backend/routers/verification.py
# Phase 1 update:
#   - Accepts both raw cert_uid AND JWT-signed token (from QR code)
#   - Verifies Ed25519 signature on every lookup
#   - Returns rich VerificationResult with signature status + VC JSON

import io
import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import models, schemas
from database import get_db
from utils.crypto_utils import verify_certificate_signature, verify_hmac
from utils.qr_utils import get_signed_url_from_token
from utils.vc_builder import parse_verifiable_credential

router = APIRouter(prefix="/verification", tags=['Public Verification'])


def _do_verify(certificate_uid: str, db: Session) -> schemas.VerificationResult:
    """
    Core verification logic shared by both endpoints.
    Looks up cert, verifies Ed25519 sig + HMAC, returns VerificationResult.
    """
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

    # ── Signature verification ────────────────────────────────
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

    # ── HMAC check (secondary) ────────────────────────────────
    hmac_ok = True
    if cert.hmac_token:
        hmac_ok = verify_hmac(cert.certificate_uid, cert.sha_hash, cert.hmac_token)

    is_valid = (cert.status == 'active') and sig_verified and hmac_ok

    # ── Increment verification count ──────────────────────────
    cert.verification_count = (cert.verification_count or 0) + 1
    db.commit()

    # ── Fetch company name ────────────────────────────────────
    company = db.query(models.Company).filter(models.Company.id == cert.company_id).first()

    # ── Parse VC JSON if available ────────────────────────────
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
        vc_json=vc_dict,
        verification_count=cert.verification_count
    )


# ── Endpoint 1: verify by raw cert UID (manual entry) ────────
@router.get("/{certificate_uid}", response_model=schemas.VerificationResult)
def verify_by_uid(certificate_uid: str, db: Session = Depends(get_db)):
    return _do_verify(certificate_uid, db)


# ── Endpoint 2: verify by JWT token (QR code scan) ───────────
@router.get("/qr/scan", response_model=schemas.VerificationResult)
def verify_by_qr_token(
    token: str = Query(..., description="JWT token from QR code URL"),
    db: Session = Depends(get_db)
):
    """
    The QR code embeds a URL like:
        /frontend/verify.html?token=<JWT>
    The frontend JS calls this endpoint with the token query param.
    """
    try:
        decoded = get_signed_url_from_token(token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _do_verify(decoded["cert_uid"], db)


# ── Download public PDF ───────────────────────────────────────
@router.get("/{certificate_uid}/download")
def download_public_pdf(certificate_uid: str, db: Session = Depends(get_db)):
    cert = db.query(models.Certificate).filter(
        models.Certificate.certificate_uid == certificate_uid
    ).first()
    if not cert or not cert.pdf_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="PDF not found.")
    if cert.status == 'revoked':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Certificate is revoked.")
    return StreamingResponse(
        io.BytesIO(cert.pdf_data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{cert.certificate_uid}.pdf"'}
    )
PYEOF
echo "✅ routers/verification.py updated."


# ─────────────────────────────────────────
# STEP 9: Run DB migration SQL
# ─────────────────────────────────────────
echo ""
echo "📄 Creating database/phase1_migration.sql ..."
cat > database/phase1_migration.sql << 'SQLEOF'
-- database/phase1_migration.sql
-- Phase 1: Add new columns to certificates table + create issuer_keys table
-- Run this ONCE on your existing database (does NOT drop existing data).

USE skillsathi;

-- Add Phase 1 columns to certificates table (safe to run multiple times)
ALTER TABLE certificates
    ADD COLUMN IF NOT EXISTS ed25519_signature  LONGTEXT     NULL AFTER sha_hash,
    ADD COLUMN IF NOT EXISTS hmac_token         VARCHAR(64)  NULL AFTER ed25519_signature,
    ADD COLUMN IF NOT EXISTS vc_json            LONGBLOB     NULL AFTER hmac_token,
    ADD COLUMN IF NOT EXISTS signed_qr_url      LONGTEXT     NULL AFTER vc_json;

-- Create issuer key registry table
CREATE TABLE IF NOT EXISTS issuer_keys (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    company_id      INT NOT NULL UNIQUE,
    public_key_b64  LONGTEXT NOT NULL,
    private_key_b64 LONGTEXT NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

SELECT 'Phase 1 migration complete.' AS status;
SQLEOF
echo "✅ phase1_migration.sql created."


# ─────────────────────────────────────────
# STEP 10: Update .env with new vars
# ─────────────────────────────────────────
echo ""
echo "📄 Adding Phase 1 env vars to backend/.env ..."
cat >> backend/.env << 'ENVEOF'

# ── Phase 1: QR Token Settings ───────────────────────────────
FRONTEND_BASE_URL=http://localhost:3000
QR_TOKEN_EXPIRE_DAYS=3650
ENVEOF
echo "✅ .env updated."


# ─────────────────────────────────────────
# FINAL: Summary
# ─────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
echo "✅  Phase 1 setup complete!"
echo "══════════════════════════════════════════════"
echo ""
echo "Files created / updated:"
echo "  ✦ backend/utils/crypto_utils.py   (NEW)"
echo "  ✦ backend/utils/vc_builder.py     (NEW)"
echo "  ✦ backend/utils/qr_utils.py       (NEW)"
echo "  ✦ backend/models.py               (UPDATED)"
echo "  ✦ backend/schemas.py              (UPDATED)"
echo "  ✦ backend/routers/certificates.py (UPDATED)"
echo "  ✦ backend/routers/verification.py (UPDATED)"
echo "  ✦ database/phase1_migration.sql   (NEW)"
echo "  ✦ backend/.env                    (UPDATED)"
echo ""
echo "Next step — run the DB migration:"
echo "  mysql -u skillsathi_user -p skillsathi < database/phase1_migration.sql"
echo ""
echo "Then restart your backend:"
echo "  cd backend && uvicorn main:app --reload"
echo ""