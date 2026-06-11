"""
Creates all PMS seed users in Clerk using the Clerk Backend API.
Run: python create_clerk_users.py

Clerk docs: https://clerk.com/docs/reference/backend-api/tag/Users#operation/CreateUser
"""

import sys
import urllib.request
import urllib.error
import json

import os

# ── Clerk Secret Key ────────────────────────────────────────────────────────
# Load from .env if present, otherwise fall back to default
CLERK_SECRET_KEY = "sk_test_M5f4iqSoDxqC7fAIEwFEM0Ep0KsFA8ajR9mgRMgXhj"
if os.path.exists(".env"):
    with open(".env", "r") as f:
        for line in f:
            if line.startswith("CLERK_SECRET_KEY="):
                val = line.strip().split("=", 1)[1]
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                CLERK_SECRET_KEY = val
                break

CLERK_API_BASE   = "https://api.clerk.com/v1"

# ── Users to create (mirrors seed.py) ───────────────────────────────────────
USERS = [
    {
        "email":      "admin@company.com",
        "password":   "PmsAdmin2026!",
        "first_name": "System",
        "last_name":  "Administrator",
        "role":       "administrator",
    },
    {
        "email":      "finance@company.com",
        "password":   "PmsFinance2026!",
        "first_name": "Finance",
        "last_name":  "Officer",
        "role":       "finance_officer",
    },
    {
        "email":      "accounts_payable@company.com",
        "password":   "PmsAP2026!",
        "first_name": "Accounts",
        "last_name":  "Payable",
        "role":       "accounts_payable",
    },
    {
        "email":      "auditor@company.com",
        "password":   "PmsAuditor2026!",
        "first_name": "Internal",
        "last_name":  "Auditor",
        "role":       "auditor",
    },
    {
        "email":      "procmgr@company.com",
        "password":   "PmsProcmgr2026!",
        "first_name": "Procurement",
        "last_name":  "Manager",
        "role":       "procurement_manager",
    },
    {
        "email":      "procofficer@company.com",
        "password":   "PmsProcofficer2026!",
        "first_name": "Procurement",
        "last_name":  "Officer",
        "role":       "procurement_officer",
    },
    {
        "email":      "manager@company.com",
        "password":   "PmsManager2026!",
        "first_name": "Jane",
        "last_name":  "Manager",
        "role":       "manager",
    },
    {
        "email":      "employee@company.com",
        "password":   "PmsEmployee2026!",
        "first_name": "John",
        "last_name":  "Employee",
        "role":       "employee",
    },
]


def clerk_request(method: str, path: str, body: dict | None = None):
    url  = f"{CLERK_API_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {CLERK_SECRET_KEY}",
            "Content-Type":  "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode('utf-8')
            try:
                return resp.status, json.loads(content)
            except json.JSONDecodeError:
                return resp.status, {"raw_text": content}
    except urllib.error.HTTPError as e:
        content = e.read().decode('utf-8')
        try:
            return e.code, json.loads(content)
        except json.JSONDecodeError:
            return e.code, {"raw_text": content}
    except Exception as e:
        return 500, {"error": str(e)}


def create_user(user: dict):
    payload = {
        "email_address":    [user["email"]],
        "password":         user["password"],
        "first_name":       user["first_name"],
        "last_name":        user["last_name"],
        "skip_password_checks": True,       # allow non-Clerk-complexity passwords
        "skip_password_requirement": False,
        "public_metadata":  {"role": user["role"]},
    }

    status, resp = clerk_request("POST", "/users", payload)
    if status == 200:
        print(f"  [OK]  Created  {user['email']}  (id: {resp.get('id')})")
    elif status == 422:
        # Check if the error is "duplicate email"
        errors = resp.get("errors", [])
        if any(e.get("code") == "form_identifier_exists" for e in errors):
            print(f"  [WARN] Already exists: {user['email']} - skipping")
            # Update public_metadata to make sure role is set
            update_existing_user_role(user, errors, resp)
        else:
            print(f"  [ERROR] Failed ({status}) {user['email']}: {resp}")
    else:
        print(f"  [ERROR] Failed ({status}) {user['email']}: {resp}")


def update_existing_user_role(user: dict, errors, resp):
    """Find existing user by email and patch their password & public_metadata with role."""
    status, users = clerk_request("GET", f"/users?email_address={user['email']}")
    if status == 200 and users:
        uid = users[0]["id"]
        patch_status, patch_resp = clerk_request(
            "PATCH",
            f"/users/{uid}",
            {
                "password": user["password"],
                "public_metadata": {"role": user["role"]}
            },
        )
        if patch_status == 200:
            print(f"         -> Password and role metadata updated for {user['email']}")
        else:
            print(f"         -> Could not update metadata: {patch_resp}")


def main():
    print("\n[INFO] Clerk User Provisioning - PMS\n" + "-" * 45)
    for user in USERS:
        create_user(user)
    print("\n" + "-" * 45)
    print("Done! You can now log in at http://localhost:5173 with:\n")
    print(f"  {'Email':<30}  {'Password':<15}  Role")
    print(f"  {'-'*30}  {'-'*15}  {'-'*20}")
    for u in USERS:
        print(f"  {u['email']:<30}  {u['password']:<15}  {u['role']}")
    print()


if __name__ == "__main__":
    main()
