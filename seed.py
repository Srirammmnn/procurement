"""
Seed script: creates admin user, budgets, and sample vendor.
Run: python seed.py
"""
import sys
sys.path.append(".")

import urllib.request
import urllib.error
import json
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.all_models import User, Budget, Vendor, UserRole, VendorStatus
from app.core.config import settings


def provision_clerk(users_to_seed):
    clerk_secret = settings.CLERK_SECRET_KEY
    if not clerk_secret:
        print("\n[WARN] CLERK_SECRET_KEY not set in settings. Skipping Clerk user provisioning.")
        return

    print("\n[INFO] Provisioning/Syncing Clerk SSO Users...")
    clerk_base = "https://api.clerk.com/v1"

    def clerk_req(method, path, body=None):
        url = f"{clerk_base}{path}"
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {clerk_secret}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode('utf-8'))
            except Exception:
                return e.code, {}
        except Exception as e:
            return 500, {"error": str(e)}

    for u in users_to_seed:
        # Split names
        names = u["full_name"].split(" ", 1)
        first_name = names[0]
        last_name = names[1] if len(names) > 1 else ""

        payload = {
            "email_address": [u["email"]],
            "password": u["password"],
            "first_name": first_name,
            "last_name": last_name,
            "skip_password_checks": True,
            "skip_password_requirement": False,
            "public_metadata": {"role": u["role"].value},
        }

        status, resp = clerk_req("POST", "/users", payload)
        if status == 200:
            print(f"  [OK]  Created Clerk user: {u['email']} (role: {u['role'].value})")
        elif status == 422:
            errors = resp.get("errors", [])
            if any(err.get("code") == "form_identifier_exists" for err in errors):
                # Fetch user to get ID and update password & metadata
                status_list, users_found = clerk_req("GET", f"/users?email_address={u['email']}")
                if status_list == 200 and users_found:
                    uid = users_found[0]["id"]
                    # Reset password and public metadata for the existing user
                    p_status, p_resp = clerk_req("PATCH", f"/users/{uid}", {
                        "password": u["password"],
                        "public_metadata": {"role": u["role"].value}
                    })
                    if p_status == 200:
                        print(f"  [OK]  Updated Clerk password/role metadata for: {u['email']} (role: {u['role'].value})")
                    else:
                        print(f"  [WARN] Failed to update Clerk user info for: {u['email']} - {p_resp}")
                else:
                    print(f"  [WARN] Already exists in Clerk: {u['email']} (could not retrieve ID)")
            else:
                print(f"  [ERROR] Clerk API error ({status}) for {u['email']}: {resp}")
        else:
            print(f"  [ERROR] Clerk API error ({status}) for {u['email']}: {resp}")


def seed():
    db = SessionLocal()
    try:
        # Define all 8 users/roles with non-breached secure passwords
        users_to_seed = [
            {
                "email": "admin@company.com",
                "full_name": "System Administrator",
                "password": "PmsAdmin2026!",
                "role": UserRole.ADMINISTRATOR,
                "department": "IT",
            },
            {
                "email": "finance@company.com",
                "full_name": "Finance Officer",
                "password": "PmsFinance2026!",
                "role": UserRole.FINANCE_OFFICER,
                "department": "Finance",
            },
            {
                "email": "accounts_payable@company.com",
                "full_name": "Accounts Payable",
                "password": "PmsAP2026!",
                "role": UserRole.ACCOUNTS_PAYABLE,
                "department": "Accounts Payable",
            },
            {
                "email": "auditor@company.com",
                "full_name": "Internal Auditor",
                "password": "PmsAuditor2026!",
                "role": UserRole.AUDITOR,
                "department": "Audit",
            },
            {
                "email": "procmgr@company.com",
                "full_name": "Procurement Manager",
                "password": "PmsProcmgr2026!",
                "role": UserRole.PROCUREMENT_MANAGER,
                "department": "Procurement",
            },
            {
                "email": "procofficer@company.com",
                "full_name": "Procurement Officer",
                "password": "PmsProcofficer2026!",
                "role": UserRole.PROCUREMENT_OFFICER,
                "department": "Procurement",
            },
            {
                "email": "manager@company.com",
                "full_name": "Jane Manager",
                "password": "PmsManager2026!",
                "role": UserRole.MANAGER,
                "department": "Engineering",
            },
            {
                "email": "employee@company.com",
                "full_name": "John Employee",
                "password": "PmsEmployee2026!",
                "role": UserRole.EMPLOYEE,
                "department": "Engineering",
            },
        ]

        # Add or update local DB users
        for u_data in users_to_seed:
            user = db.query(User).filter(User.email == u_data["email"]).first()
            if not user:
                db.add(User(
                    email=u_data["email"],
                    full_name=u_data["full_name"],
                    hashed_password=hash_password(u_data["password"]),
                    role=u_data["role"],
                    department=u_data["department"],
                ))
            else:
                user.hashed_password = hash_password(u_data["password"])
                user.role = u_data["role"]
                user.department = u_data["department"]

        # Budgets
        budgets = [
            {"department": "Engineering", "budget_code": "ENG-2026", "fiscal_year": 2026, "total_budget": 500000},
            {"department": "Marketing", "budget_code": "MKT-2026", "fiscal_year": 2026, "total_budget": 200000},
            {"department": "Operations", "budget_code": "OPS-2026", "fiscal_year": 2026, "total_budget": 350000},
        ]
        for b in budgets:
            if not db.query(Budget).filter(Budget.budget_code == b["budget_code"]).first():
                db.add(Budget(**b))

        # Sample vendor
        if not db.query(Vendor).filter(Vendor.email == "vendor@techsupplies.com").first():
            db.add(Vendor(
                vendor_code="VND-2026-00001",
                company_name="Tech Supplies Ltd",
                contact_person="Bob Vendor",
                email="vendor@techsupplies.com",
                phone="+1-555-0100",
                country="USA",
                category="IT Equipment",
                status=VendorStatus.ACTIVE,
            ))

        db.commit()
        print("[OK] Database seed data inserted successfully")

        # Provision Clerk SSO users
        provision_clerk(users_to_seed)

        print("\n--- Login Credentials ---")
        for u in users_to_seed:
            print(f"{u['full_name'] + ':':<20} {u['email']} / {u['password']} ({u['role'].value})")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
