# Procurement Management System (PMS)

FastAPI · PostgreSQL · SQLAlchemy · Alembic · Redis · Celery

---

## Project Structure

```
pms/
├── app/
│   ├── main.py                     # FastAPI app + middleware
│   ├── core/
│   │   ├── config.py               # Settings (pydantic-settings)
│   │   ├── database.py             # SQLAlchemy engine + session
│   │   └── security.py             # JWT, password hashing, RBAC
│   ├── models/
│   │   └── all_models.py           # All SQLAlchemy ORM models
│   ├── schemas/
│   │   └── schemas.py              # All Pydantic request/response schemas
│   ├── api/v1/endpoints/
│   │   ├── auth.py                 # Register, login, refresh, /me
│   │   ├── users.py                # User CRUD
│   │   ├── budgets.py              # Budget management
│   │   ├── requisitions.py         # PR create/submit/cancel/list
│   │   ├── approvals.py            # Multi-level approval workflow
│   │   ├── vendors.py              # Vendor registration + evaluation
│   │   ├── rfqs.py                 # RFQ + quotation + comparison + award
│   │   ├── purchase_orders.py      # PO lifecycle (draft→issued→delivered)
│   │   ├── grns.py                 # Goods Receipt Notes
│   │   ├── invoices.py             # Invoice + 3-way match + payments
│   │   ├── reports.py              # Dashboard KPIs + 7 report types
│   │   └── audit.py                # Audit log query
│   └── utils/
│       └── helpers.py              # Number generators, audit logger, approval levels
├── alembic/                        # DB migrations
├── tests/
│   └── test_api.py                 # Pytest tests
├── seed.py                         # Dev seed data
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## Quick Start

### 1. Clone & setup env

```bash
cp .env.example .env
# Edit .env with your DB credentials and SECRET_KEY
```

### 2. Start with Docker

```bash
docker-compose up --build
```

### 3. Or run locally

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Make sure PostgreSQL is running, then:
alembic upgrade head               # Run migrations
python seed.py                     # Seed dev data
uvicorn app.main:app --reload      # Start API
```

### 4. Access

| URL | Description |
|-----|-------------|
| http://localhost:8000/docs | Swagger UI |
| http://localhost:8000/redoc | ReDoc |
| http://localhost:8000/health | Health check |

---

## Procurement Workflow (Step-by-Step)

```
1. EMPLOYEE  → POST /api/v1/requisitions/           (create PR, status=DRAFT)
2. EMPLOYEE  → POST /api/v1/requisitions/{id}/submit (submit → budget check → PENDING_APPROVAL)
3. MANAGER   → GET  /api/v1/approvals/pending        (see pending steps)
4. MANAGER   → POST /api/v1/approvals/{step_id}/action {action:"approved"}
5. PROC_MGR  → POST /api/v1/approvals/{step_id}/action {action:"approved"}
   (PR → APPROVED if all steps done)

6. PROC_OFF  → POST /api/v1/rfqs/                   (create RFQ from approved PR)
7. PROC_OFF  → POST /api/v1/rfqs/{id}/publish
8. VENDOR    → POST /api/v1/rfqs/{id}/quotations     (submit quote)
9. PROC_OFF  → GET  /api/v1/rfqs/{id}/comparison     (compare quotes)
10. PROC_MGR → POST /api/v1/rfqs/{id}/award/{quote_id}

11. PROC_OFF → POST /api/v1/purchase-orders/         (create PO from awarded quote)
12. PROC_OFF → POST /api/v1/purchase-orders/{id}/submit
13. PROC_MGR → POST /api/v1/purchase-orders/{id}/approve
14. PROC_OFF → POST /api/v1/purchase-orders/{id}/issue  (email sent to vendor)

15. EMPLOYEE → POST /api/v1/grns/                    (record delivery + inspection)
    (PO status auto-updated: PARTIALLY_DELIVERED or FULLY_DELIVERED)

16. AP_TEAM  → POST /api/v1/invoices/                (capture vendor invoice)
    (3-way match auto-runs: PO ↔ GRN ↔ Invoice)
17. FINANCE  → POST /api/v1/invoices/{id}/approve    (if MATCHED)
18. FINANCE  → POST /api/v1/invoices/{id}/forward-payment

19. AP_TEAM  → POST /api/v1/payments/                (create payment record)
20. AP_TEAM  → PATCH /api/v1/payments/{id}           {status:"paid", payment_date:...}
```

---

## Approval Matrix

| PR Value | Approval Chain |
|----------|---------------|
| < $5,000 | Manager |
| $5K – $20K | Manager → Procurement Manager |
| $20K – $100K | Manager → Procurement Manager → Finance Officer |
| > $100K | Manager → Proc. Manager → Finance Officer → Administrator |

---

## Key Roles & Permissions

| Role | Key Capabilities |
|------|-----------------|
| employee | Create/submit requisitions, record GRN |
| manager | Approve requisitions (level 1) |
| procurement_officer | Manage RFQs, create POs |
| procurement_manager | Approve PRs/POs, award RFQs, manage vendors |
| finance_officer | Manage budgets, approve invoices |
| accounts_payable | Process payments |
| administrator | Full access |

---

## API Endpoints Summary

| Module | Endpoints |
|--------|-----------|
| Auth | POST /auth/register, /auth/login, /auth/refresh, GET /auth/me |
| Users | GET/PATCH/DELETE /users/, /users/{id} |
| Budgets | POST/GET /budgets/, /budgets/{id} |
| Requisitions | POST/GET /requisitions/, /{id}/submit, /{id}/cancel |
| Approvals | GET /approvals/pending, POST /approvals/{step_id}/action |
| Vendors | CRUD /vendors/, approve, blacklist, evaluate |
| RFQs | CRUD /rfqs/, publish, quotations, comparison, award |
| Purchase Orders | CRUD /purchase-orders/, submit, approve, issue, cancel, amend |
| GRNs | POST/GET /grns/ |
| Invoices | POST/GET /invoices/, approve, forward-payment |
| Payments | POST/GET/PATCH /payments/ |
| Reports | GET /reports/dashboard, requisitions, purchase-orders, vendor-spend, budget-utilization, pending-approvals, procurement-cycle-time |
| Audit | GET /audit-logs/ |

---

## Running Tests

```bash
pytest tests/ -v
```
