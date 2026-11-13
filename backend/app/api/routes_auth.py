"""
app/api/routes_auth.py
───────────────────────
User authentication and session management for Aegis Bridge Crypto (ABC).
Supports the 3 core personas:
  • Sis Thandi (Spaza Shop Merchant - 'shop')
  • Kagiso Ndlovu (IoT / Vending Fleet Lead - 'machines')
  • Dr. Arthur Vance (CFO & Treasury Auditor - 'pro')
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import sqlite3
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.core.config import settings

logger = logging.getLogger("abc.auth")
router = APIRouter()

DB_FILE = settings.DB_FILE
SECRET_KEY = getattr(settings, "AUTH_SECRET_KEY", "abc_hackathon_secure_jwt_secret_key_2026")


# ── Password & Token Helpers ──────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """PBKDF2-HMAC-SHA256 hash with 16-byte random hex salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}:{key.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, key_hex = hashed.split(":", 1)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str) -> str:
    """Generates an HMAC-SHA256 signed session token (7-day validity)."""
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + 86400 * 7,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    sig = hmac.new(SECRET_KEY.encode("utf-8"), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"


def verify_token(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        b64_payload, sig = parts
        expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        padded = b64_payload + "=" * (-len(b64_payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        if data.get("exp", 0) < int(time.time()):
            return None
        return data
    except Exception:
        return None


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserPublic(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    organization: Optional[str] = None
    wallet_address: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "shop"
    organization: Optional[str] = None
    wallet_address: Optional[str] = None


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


# ── Dependency ────────────────────────────────────────────────────────────────

def get_current_user(authorization: Optional[str] = Header(None)) -> UserPublic:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.split(" ", 1)[1]
    claims = verify_token(token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token expired or invalid",
        )

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, email, full_name, role, organization, wallet_address FROM auth_users WHERE id = ?",
        (claims["sub"],),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists",
        )

    return UserPublic(
        id=row[0],
        email=row[1],
        full_name=row[2],
        role=row[3],
        organization=row[4],
        wallet_address=row[5],
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest):
    """
    Authenticates a merchant or auditor and returns a signed access token.
    Pre-seeded demo accounts (password: 'password123'):
      • thandi@aegis.bridge (Sis Thandi - Shop POS)
      • operator@aegis.bridge (Kagiso Ndlovu - IoT Machines)
      • cfo@aegis.bridge (Dr. Arthur Vance - CFO Pro Audit)
    """
    email_clean = req.email.strip().lower()
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, email, password_hash, full_name, role, organization, wallet_address FROM auth_users WHERE LOWER(email) = ?",
        (email_clean,),
    )
    row = cursor.fetchone()
    conn.close()

    if not row or not verify_password(req.password, row[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user = UserPublic(
        id=row[0],
        email=row[1],
        full_name=row[3],
        role=row[4],
        organization=row[5],
        wallet_address=row[6],
    )
    token = create_token(user.id, user.email, user.role)
    logger.info("[Auth] User logged in: %s (%s)", user.email, user.role)
    return AuthResponse(token=token, user=user)


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest):
    """Registers a new merchant or operator account."""
    email_clean = req.email.strip().lower()
    if len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long",
        )

    allowed_roles = {"shop", "machines", "pro"}
    if req.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role must be one of {allowed_roles}",
        )

    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    pwd_hash = hash_password(req.password)

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO auth_users (id, email, password_hash, full_name, role, organization, wallet_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                email_clean,
                pwd_hash,
                req.full_name.strip(),
                req.role,
                req.organization.strip() if req.organization else None,
                req.wallet_address.strip() if req.wallet_address else None,
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists",
        )
    finally:
        conn.close()

    user = UserPublic(
        id=user_id,
        email=email_clean,
        full_name=req.full_name.strip(),
        role=req.role,
        organization=req.organization,
        wallet_address=req.wallet_address,
    )
    token = create_token(user.id, user.email, user.role)
    logger.info("[Auth] New user registered: %s (%s)", user.email, user.role)
    return AuthResponse(token=token, user=user)


@router.get("/me", response_model=UserPublic)
def get_me(current_user: UserPublic = Depends(get_current_user)):
    """Returns profile of the currently signed-in user."""
    return current_user


@router.post("/logout")
def logout():
    """Client simply drops token; endpoint confirms clearance."""
    return {"message": "Logged out successfully"}
