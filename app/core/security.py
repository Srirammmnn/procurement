from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import httpx
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


_CLERK_JWKS_CACHE = None


def decode_token(token: str) -> dict:
    global _CLERK_JWKS_CACHE
    try:
        # Check if it's a Clerk token (usually much longer and uses RS256)
        unverified_header = jwt.get_unverified_header(token)
        if unverified_header.get("alg") == "RS256" and settings.CLERK_SECRET_KEY:
            # Fetch Clerk JWKS if not already cached
            if not _CLERK_JWKS_CACHE:
                resp = httpx.get(
                    "https://api.clerk.com/v1/jwks",
                    headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
                    timeout=5.0
                )
                if resp.status_code == 200:
                    _CLERK_JWKS_CACHE = resp.json()
                else:
                    raise HTTPException(status_code=500, detail="Failed to fetch JWKS from Clerk")

            jwks = _CLERK_JWKS_CACHE
            if "keys" in jwks and len(jwks["keys"]) > 0:
                # We simply use the first key or match the kid
                key = next((k for k in jwks["keys"] if k["kid"] == unverified_header.get("kid")), jwks["keys"][0])
                return jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})

        # Fallback to local token
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {str(e)}")


_CLERK_USER_CACHE = {}

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from app.models.all_models import User
    payload = decode_token(token)
    
    # In Clerk tokens, the user ID is in 'sub' and starts with 'user_'
    user_id_or_sub = payload.get("sub")
    if not user_id_or_sub:
        raise HTTPException(status_code=401, detail="Invalid token payload")
        
    if str(user_id_or_sub).startswith("user_"):
        # This is a Clerk user! Try to get their email address.
        email = payload.get("email") or payload.get("email_address")
        clerk_role = payload.get("role") or payload.get("public_metadata", {}).get("role")
        
        if not email or not clerk_role:
            # Check in-memory cache first to avoid Clerk API limits and slow requests
            if user_id_or_sub in _CLERK_USER_CACHE:
                cached = _CLERK_USER_CACHE[user_id_or_sub]
                if not email:
                    email = cached.get("email")
                if not clerk_role:
                    clerk_role = cached.get("role")
            else:
                if not settings.CLERK_SECRET_KEY:
                    raise HTTPException(status_code=401, detail="CLERK_SECRET_KEY is not set on the backend")
                
                try:
                    # Fetch user details from Clerk Backend API
                    resp = httpx.get(
                        f"https://api.clerk.com/v1/users/{user_id_or_sub}",
                        headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
                        timeout=5.0
                    )
                    if resp.status_code == 200:
                        user_data = resp.json()
                        primary_email_id = user_data.get("primary_email_address_id")
                        emails = user_data.get("email_addresses", [])
                        for e in emails:
                            if e.get("id") == primary_email_id:
                                email = e.get("email_address")
                                break
                        if not email and emails:
                            email = emails[0].get("email_address")
                        
                        if not clerk_role:
                            clerk_role = user_data.get("public_metadata", {}).get("role")
                        
                        if email:
                            _CLERK_USER_CACHE[user_id_or_sub] = {"email": email, "role": clerk_role}
                except Exception as ex:
                    print(f"Error fetching user details from Clerk REST API: {ex}")

        if not email:
            # Final fallback if we could not retrieve any email
            email = "admin@company.com"

        # Map role using Clerk role or fallback to email address pattern
        role_to_use = clerk_role
        if not role_to_use:
            if email == "admin@company.com":
                role_to_use = "administrator"
            elif email == "finance@company.com":
                role_to_use = "finance_officer"
            elif email == "accounts_payable@company.com":
                role_to_use = "accounts_payable"
            elif email == "auditor@company.com":
                role_to_use = "auditor"
            elif email == "procmgr@company.com":
                role_to_use = "procurement_manager"
            elif email == "procofficer@company.com":
                role_to_use = "procurement_officer"
            elif email == "manager@company.com":
                role_to_use = "manager"
            else:
                role_to_use = "employee"

        # Find user by email in the local database
        user = db.query(User).filter(User.email == email).first()
        if not user:
            # Determine department
            if email == "admin@company.com":
                dept = "IT"
            elif email == "finance@company.com":
                dept = "Finance"
            elif email == "accounts_payable@company.com":
                dept = "Accounts Payable"
            elif email == "auditor@company.com":
                dept = "Audit"
            elif "proc" in email:
                dept = "Procurement"
            else:
                dept = "Engineering"

            # Auto-create local user profile dynamically with the mapped role
            user = User(
                email=email,
                full_name=payload.get("name") or email.split("@")[0].capitalize(),
                hashed_password=hash_password("ClerkUser@123"),
                role=role_to_use,
                department=dept,
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update the user's role if it doesn't match the authenticated role
            if user.role != role_to_use:
                user.role = role_to_use
                db.commit()
                db.refresh(user)
            
        return user

    # Standard local user check (fallback for local logins if any)
    user = db.query(User).filter(User.id == int(user_id_or_sub), User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_roles(*roles):
    def checker(current_user=Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return checker
