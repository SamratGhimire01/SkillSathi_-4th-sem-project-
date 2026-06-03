# STRIDE Threat Model — SkillSathi Certificate Platform

## System Overview
SkillSathi is a blockchain-inspired certificate issuance and verification platform for Nepali vocational training centers. It uses Ed25519 digital signatures, W3C Verifiable Credentials, Merkle tree anchoring, and a revocation registry.

## Data Flow Diagram (DFD)
[Company Admin] → [Issue Certificate API] → [Database]
[Public Verifier] → [Verification API] → [Database]
[Super Admin]    → [Admin API]          → [Database]
[System Cron]    → [Anchor Trigger]     → [audit_anchors]

## STRIDE Analysis

### S — Spoofing
| Threat | Component | Mitigation |
|--------|-----------|------------|
| Attacker impersonates company admin | `/auth/login` | JWT tokens with expiry, bcrypt password hashing |
| Attacker forges certificate | Verification endpoint | Ed25519 signature bound to issuer private key |
| Attacker spoofs issuer DID | Issuer registry | DID resolved from DB, not user input |

### T — Tampering
| Threat | Component | Mitigation |
|--------|-----------|------------|
| Attacker modifies certificate fields after issuance | Database | Ed25519 signature invalidates on any field change |
| Attacker modifies DB record directly | MySQL | Merkle root anchoring detects batch-level tampering |
| Attacker replays old signed QR URL | QR verification | JWT signed URL with long expiry + hash binding |

### R — Repudiation
| Threat | Component | Mitigation |
|--------|-----------|------------|
| Company denies issuing a certificate | Certificate table | Ed25519 signature tied to company issuer key |
| Admin denies revoking a certificate | Revocation registry | Immutable audit log with timestamp + actor type |
| System denies anchoring | audit_anchors | Merkle root stored with date + cert count |

### I — Information Disclosure
| Threat | Component | Mitigation |
|--------|-----------|------------|
| Attacker reads private keys from DB | issuer_keys table | Keys stored as base64, DB access restricted |
| Attacker enumerates certificate UIDs | Public verification | Rate limiter (30 req/min) blocks enumeration |
| Attacker reads JWT token payload | Signed QR URL | JWT payload is non-sensitive (uid + hash only) |

### D — Denial of Service
| Threat | Component | Mitigation |
|--------|-----------|------------|
| Attacker floods verification endpoint | `/verification/{uid}` | SlowAPI rate limiter — 429 after 30 req/min |
| Attacker floods login endpoint | `/auth/login` | Rate limiter applied globally via middleware |
| Large PDF generation overloads server | Certificate issuance | PDF generated async, not blocking main thread |

### E — Elevation of Privilege
| Threat | Component | Mitigation |
|--------|-----------|------------|
| Worker tries to access admin endpoints | `/admin/*` | `get_super_admin()` dependency checks `is_admin` flag |
| Company accesses another company's certs | Certificate endpoints | `company_id` from JWT token, never from user input |
| Public user triggers anchor | `/admin/anchor/trigger` | Admin-only dependency guard |

## Residual Risks
- Private keys stored in DB (not HSM) — acceptable for research prototype
- No multi-factor authentication on company login
- Rate limiter is in-memory (resets on server restart) — Redis recommended for production

## Conclusion
SkillSathi addresses all six STRIDE threat categories through a layered defense: cryptographic signing, immutable audit logging, Merkle anchoring, JWT authentication, and API rate limiting.