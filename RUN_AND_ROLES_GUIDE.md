# Procurement Management System (PMS) - Run & Roles Guide

This document provides setup instructions, system requirements, environment variables, and details on all pre-seeded user roles, credentials, and capabilities.

---

## 📋 System Requirements & Configuration

### Prerequisites
* **Python**: 3.10 or higher (with `pip` and virtual environment support)
* **Node.js**: 18.x or higher (for Vite/React frontend)
* **PostgreSQL**: 14+ (local or hosted instance)
* **Redis**: For task queuing with Celery (optional for basic operation)

### Environment Variables
Create a `.env` file in the `pms/` folder by copying the example. You must define the following variables:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:12345@localhost:5433/pms_project` |
| `SECRET_KEY` | JWT signing key | `some-secure-random-key-string` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Publishable Key (for SSO) | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk API Secret Key | `sk_test_...` |
| `MAIL_SERVER` | SMTP Mail Server Host | `smtp.gmail.com` |
| `MAIL_PORT` | SMTP Port | `587` (TLS) or `465` (SSL) |
| `MAIL_USERNAME` | SMTP Email Username | `username@gmail.com` |
| `MAIL_PASSWORD` | SMTP App Password | `abcd-efgh-ijkl-mnop` |
| `MAIL_FROM` | Default sender email address | `noreply@company.com` |

---

## 🚀 How to Run the Project Locally

### Step 1: Set Up and Run the Backend API

1. Open a terminal in the `pms/` folder.
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the database migrations (Alembic) to create all tables:
   ```bash
   alembic upgrade head
   ```
5. Seed the database with the pre-defined users, budgets, and vendors:
   ```bash
   python seed.py
   ```
6. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload
   ```
   * The API docs will be accessible at: http://localhost:8000/docs
   * The Health Check endpoint is at: http://localhost:8000/health

### Step 2: Set Up and Run the Frontend (Vite/React)

1. Open a new terminal in the `pms/frontend/` folder.
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file `pms/frontend/.env.local`:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_cnVsaW5nLXBlZ2FzdXMtNDYuY2xlcmsuYWNjb3VudHMuZGV2JA
   VITE_API_URL=http://localhost:8000
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to http://localhost:5173 to interact with the dashboard.

---

## 🔐 Pre-Seeded Users & Login Credentials

When you run `python seed.py`, the following users are created in the database (and provisioned/synced to Clerk if keys are configured):

| Full Name | Email Address | Password | Assigned Role | Department |
| :--- | :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@company.com` | `PmsAdmin2026!` | `administrator` | IT |
| **Finance Officer** | `finance@company.com` | `PmsFinance2026!` | `finance_officer` | Finance |
| **Accounts Payable** | `accounts_payable@company.com` | `PmsAP2026!` | `accounts_payable` | Accounts Payable |
| **Internal Auditor** | `auditor@company.com` | `PmsAuditor2026!` | `auditor` | Audit |
| **Procurement Manager** | `procmgr@company.com` | `PmsProcmgr2026!` | `procurement_manager` | Procurement |
| **Procurement Officer** | `procofficer@company.com` | `PmsProcofficer2026!` | `procurement_officer` | Procurement |
| **Jane Manager** | `manager@company.com` | `PmsManager2026!` | `manager` | Engineering |
| **John Employee** | `employee@company.com` | `PmsEmployee2026!` | `employee` | Engineering |
| **Sriram Supplies (Vendor)** | `sriramdhoni74@gmail.com` | `PmsVendor2026!` | `vendor` | Vendor Portal |

---

## 🛡️ Role-Based Access Control (RBAC) Permission Matrix

The application enforces strict checks based on the assigned user role. Here is a breakdown of what each role can do:

```mermaid
graph TD
    subgraph Users
        E[Employee]
        M[Manager]
        PM[Procurement Manager]
        PO[Procurement Officer]
        FO[Finance Officer]
        AP[Accounts Payable]
        V[Vendor]
    end
    
    subgraph Actions
        E -->|Create/Submit Requisition & GRN| PR[Purchase Requisition]
        M -->|Approve Level 1 Requisition| PR
        PM -->|Approve Level 2 Requisition & Award RFQ & Approve PO| PO_W[Procurement Workflows]
        PO -->|Publish RFQ, Match Quotes & Issue PO| PO_W
        FO -->|Approve Level 3/4 Requisition & Approve Invoice| INV[Invoice Workflows]
        AP -->|Generate Invoice & Settle Payments| PMT[Payments]
        V -->|Submit Quotes| QUOTE[Quotations]
    end
```

### Roles Breakdown & Capabilities

#### 1. Employee (`employee`)
* **Department Mappings:** Mapped to their respective departments (e.g., Engineering).
* **Capabilities:**
  * Create, edit, and cancel Purchase Requisitions (PRs).
  * Submit PRs (automatically triggers budget checking).
  * View their own submitted requisitions.
  * Create and submit Goods Receipt Notes (GRN) to record the delivery and inspection of goods.

#### 2. Manager (`manager`)
* **Capabilities:**
  * Review and action Level 1 Requisition approvals (requisitions under $5,000).

#### 3. Procurement Officer (`procurement_officer`)
* **Capabilities:**
  * Create, edit, and publish Requests for Quotations (RFQs).
  * Compare quotes received from vendors.
  * Create draft Purchase Orders (POs) from awarded vendor quotes.
  * Submit POs for approval.
  * Issue approved POs to vendors (triggers email notification dispatch).

#### 4. Procurement Manager (`procurement_manager`)
* **Capabilities:**
  * Review and action Level 2 Requisition approvals (requisitions between $5,000 and $20,000).
  * Approve and authorize Purchase Orders (POs) submitted by Procurement Officers.
  * Award RFQs to winning vendor quotations.
  * Create and manage Vendor profiles, review and evaluate vendor performances.

#### 5. Finance Officer (`finance_officer`)
* **Capabilities:**
  * Review and action Level 3/4 Requisition approvals (requisitions above $20,000).
  * Manage department Budgets (add allocations, view consumption).
  * Approve vendor invoices after matching.
  * Forward matched invoices for payment.

#### 6. Accounts Payable (`accounts_payable`)
* **Capabilities:**
  * Capture and register vendor invoices in the system.
  * Run the 3-Way Match validation (Purchase Order ↔ Goods Receipt Note ↔ Vendor Invoice).
  * Create Payment transaction vouchers.
  * Authorize, process, and settle payment vouchers (transitions status to `PAID` and registers transaction).

#### 7. Internal Auditor (`auditor`)
* **Capabilities:**
  * Read-only access to all modules.
  * Query, filter, and inspect System Audit Logs.
  * Access all 7 financial and operational reports (Spend by Department, PO cycle times, etc.).

#### 8. System Administrator (`administrator`)
* **Capabilities:**
  * Full CRUD permission across all system endpoints.
  * Read, modify, and manage system global settings (`system_settings`).
  * Add and edit system user accounts, manually adjust user roles.

#### 9. Vendor (`vendor`)
* **Capabilities:**
  * Access the restricted Vendor Portal page.
  * View active and published Requests for Quotation (RFQs) open to bidding.
  * Submit bids/quotations in response to RFQs.
  * View Purchase Orders (POs) issued to them.
