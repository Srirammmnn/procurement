import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base, get_db

SQLALCHEMY_TEST_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_register_and_login():
    resp = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "full_name": "Test User",
        "password": "Test@1234",
        "role": "employee",
    })
    assert resp.status_code == 201

    resp = client.post("/api/v1/auth/login", data={
        "username": "test@example.com",
        "password": "Test@1234",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_create_requisition():
    # Login first
    login = client.post("/api/v1/auth/login", data={
        "username": "test@example.com",
        "password": "Test@1234",
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "Need new laptops",
        "items": [
            {"item_description": "Laptop Dell XPS", "quantity": "2", "estimated_unit_price": "1200"}
        ]
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["pr_number"].startswith("PR-")
    assert data["status"] == "draft"


def test_requisition_workflow_bypass():
    # 1. Register and Login Employee, Manager, and Procurement Officer
    # Employee
    client.post("/api/v1/auth/register", json={
        "email": "workflow_emp@example.com",
        "full_name": "Workflow Employee",
        "password": "Password@123",
        "role": "employee",
    })
    emp_login = client.post("/api/v1/auth/login", data={"username": "workflow_emp@example.com", "password": "Password@123"})
    emp_token = emp_login.json()["access_token"]

    # Manager
    client.post("/api/v1/auth/register", json={
        "email": "workflow_mgr@example.com",
        "full_name": "Workflow Manager",
        "password": "Password@123",
        "role": "manager",
    })
    mgr_login = client.post("/api/v1/auth/login", data={"username": "workflow_mgr@example.com", "password": "Password@123"})
    mgr_token = mgr_login.json()["access_token"]

    # Procurement Officer
    client.post("/api/v1/auth/register", json={
        "email": "workflow_po@example.com",
        "full_name": "Workflow Procurement Officer",
        "password": "Password@123",
        "role": "procurement_officer",
    })
    po_login = client.post("/api/v1/auth/login", data={"username": "workflow_po@example.com", "password": "Password@123"})
    po_token = po_login.json()["access_token"]

    # Register a Vendor (needed for PO creation)
    client.post("/api/v1/vendors/", json={
        "name": "Test Vendor",
        "email": "vendor@test.com",
        "phone": "123456",
        "address": "123 St",
    }, headers={"Authorization": f"Bearer {po_token}"})

    # 2. Create Requisition (Starts as DRAFT)
    pr_resp = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "Need laptop",
        "items": [{"item_description": "Laptop", "quantity": 1, "estimated_unit_price": 1500}]
    }, headers={"Authorization": f"Bearer {emp_token}"})
    assert pr_resp.status_code == 201
    pr_id = pr_resp.json()["id"]
    assert pr_resp.json()["status"] == "draft"

    # 3. Try to convert DRAFT to PO (Should fail with 400)
    po_payload = {
        "requisition_id": pr_id,
        "vendor_id": 1,
        "total_amount": 1500,
        "currency": "USD",
        "delivery_address": "Office",
        "expected_delivery_date": "2026-12-31T00:00:00",
        "payment_terms": "Net 30",
        "terms_conditions": "Standard terms",
        "items": [{"item_description": "Laptop", "quantity": 1, "unit_price": 1500}]
    }
    fail_po_resp = client.post("/api/v1/purchase-orders/", json=po_payload, headers={"Authorization": f"Bearer {po_token}"})
    assert fail_po_resp.status_code == 400
    assert "must be APPROVED" in fail_po_resp.json()["detail"]

    # 4. Submit Requisition (Status becomes PENDING_APPROVAL)
    submit_resp = client.post(f"/api/v1/requisitions/{pr_id}/submit", headers={"Authorization": f"Bearer {emp_token}"})
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "pending_approval"

    # 5. Try to convert PENDING_APPROVAL to PO (Should fail with 400)
    fail_po_resp = client.post("/api/v1/purchase-orders/", json=po_payload, headers={"Authorization": f"Bearer {po_token}"})
    assert fail_po_resp.status_code == 400
    assert "must be APPROVED" in fail_po_resp.json()["detail"]

    # 6. Action Approval (Status becomes APPROVED)
    # Get pending approvals for manager
    pending_resp = client.get("/api/v1/approvals/pending", headers={"Authorization": f"Bearer {mgr_token}"})
    assert pending_resp.status_code == 200
    pending_steps = pending_resp.json()
    assert len(pending_steps) > 0
    step_id = pending_steps[0]["step_id"]

    # Approve
    approve_resp = client.post(f"/api/v1/approvals/{step_id}/action", json={"action": "approved", "remarks": "Looks good"}, headers={"Authorization": f"Bearer {mgr_token}"})
    assert approve_resp.status_code == 200
    assert approve_resp.json()["pr_status"] == "approved"

    # 7. Convert APPROVED to PO (Should succeed)
    success_po_resp = client.post("/api/v1/purchase-orders/", json=po_payload, headers={"Authorization": f"Bearer {po_token}"})
    assert success_po_resp.status_code == 201
    
    # Check that requisition status is now CONVERTED_TO_PO
    check_pr_resp = client.get(f"/api/v1/requisitions/{pr_id}", headers={"Authorization": f"Bearer {emp_token}"})
    assert check_pr_resp.json()["status"] == "converted_to_po"


def test_budget_control_lifecycle():
    # 1. Register and Login users
    # Employee
    client.post("/api/v1/auth/register", json={
        "email": "b_emp@example.com",
        "full_name": "Budget Employee",
        "password": "Password@123",
        "role": "employee",
    })
    emp_token = client.post("/api/v1/auth/login", data={"username": "b_emp@example.com", "password": "Password@123"}).json()["access_token"]

    # Manager
    client.post("/api/v1/auth/register", json={
        "email": "b_mgr@example.com",
        "full_name": "Budget Manager",
        "password": "Password@123",
        "role": "manager",
    })
    mgr_token = client.post("/api/v1/auth/login", data={"username": "b_mgr@example.com", "password": "Password@123"}).json()["access_token"]

    # Procurement Officer
    client.post("/api/v1/auth/register", json={
        "email": "b_po@example.com",
        "full_name": "Budget PO",
        "password": "Password@123",
        "role": "procurement_officer",
    })
    po_token = client.post("/api/v1/auth/login", data={"username": "b_po@example.com", "password": "Password@123"}).json()["access_token"]

    # Procurement Manager
    client.post("/api/v1/auth/register", json={
        "email": "b_pm@example.com",
        "full_name": "Budget PM",
        "password": "Password@123",
        "role": "procurement_manager",
    })
    pm_token = client.post("/api/v1/auth/login", data={"username": "b_pm@example.com", "password": "Password@123"}).json()["access_token"]

    # Accounts Payable
    client.post("/api/v1/auth/register", json={
        "email": "b_ap@example.com",
        "full_name": "Budget AP",
        "password": "Password@123",
        "role": "accounts_payable",
    })
    ap_token = client.post("/api/v1/auth/login", data={"username": "b_ap@example.com", "password": "Password@123"}).json()["access_token"]

    # Finance Officer
    client.post("/api/v1/auth/register", json={
        "email": "b_fo@example.com",
        "full_name": "Budget FO",
        "password": "Password@123",
        "role": "finance_officer",
    })
    fo_token = client.post("/api/v1/auth/login", data={"username": "b_fo@example.com", "password": "Password@123"}).json()["access_token"]

    # 2. Create a Budget
    budget_resp = client.post("/api/v1/budgets/", json={
        "department": "Engineering",
        "budget_code": "BUDGET-2026-ENG",
        "fiscal_year": 2026,
        "total_budget": 10000.0,
    }, headers={"Authorization": f"Bearer {fo_token}"})
    assert budget_resp.status_code == 201
    budget_id = budget_resp.json()["id"]

    # Register Vendor
    client.post("/api/v1/vendors/", json={
        "name": "Budget Vendor",
        "email": "b_vendor@test.com",
        "phone": "987654",
        "address": "456 St",
    }, headers={"Authorization": f"Bearer {po_token}"})

    # 3. Create Requisition
    pr_resp = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "budget_code": "BUDGET-2026-ENG",
        "justification": "Laptops",
        "items": [{"item_description": "Laptops", "quantity": 2, "estimated_unit_price": 1500.0}]
    }, headers={"Authorization": f"Bearer {emp_token}"})
    assert pr_resp.status_code == 201
    pr_id = pr_resp.json()["id"]

    # Verify budget: reserved=0, consumed=0
    b_check = client.get(f"/api/v1/budgets/{budget_id}", headers={"Authorization": f"Bearer {fo_token}"}).json()
    assert float(b_check["reserved"]) == 0
    assert float(b_check["consumed"]) == 0

    # 4. Submit Requisition
    submit_resp = client.post(f"/api/v1/requisitions/{pr_id}/submit", headers={"Authorization": f"Bearer {emp_token}"})
    assert submit_resp.status_code == 200

    # Verify budget: reserved=0 (still not reserved until approved)
    b_check = client.get(f"/api/v1/budgets/{budget_id}", headers={"Authorization": f"Bearer {fo_token}"}).json()
    assert float(b_check["reserved"]) == 0

    # 5. Approve Requisition
    pending_resp = client.get("/api/v1/approvals/pending", headers={"Authorization": f"Bearer {mgr_token}"})
    step_id = pending_resp.json()[0]["step_id"]
    approve_resp = client.post(f"/api/v1/approvals/{step_id}/action", json={"action": "approved", "remarks": "Approved"}, headers={"Authorization": f"Bearer {mgr_token}"})
    assert approve_resp.status_code == 200

    # Verify budget: reserved=3000, consumed=0
    b_check = client.get(f"/api/v1/budgets/{budget_id}", headers={"Authorization": f"Bearer {fo_token}"}).json()
    assert float(b_check["reserved"]) == 3000.0
    assert float(b_check["consumed"]) == 0.0

    # 6. Convert to PO
    po_payload = {
        "requisition_id": pr_id,
        "vendor_id": 1,
        "total_amount": 3000,
        "currency": "USD",
        "delivery_address": "Office",
        "expected_delivery_date": "2026-12-31T00:00:00",
        "payment_terms": "Net 30",
        "terms_conditions": "Terms",
        "items": [{"item_description": "Laptops", "quantity": 2, "unit_price": 1500.0}]
    }
    po_resp = client.post("/api/v1/purchase-orders/", json=po_payload, headers={"Authorization": f"Bearer {po_token}"})
    assert po_resp.status_code == 201
    po_id = po_resp.json()["id"]

    # Submit & Approve PO
    client.post(f"/api/v1/purchase-orders/{po_id}/submit", headers={"Authorization": f"Bearer {po_token}"})
    client.post(f"/api/v1/purchase-orders/{po_id}/approve", headers={"Authorization": f"Bearer {pm_token}"})
    client.post(f"/api/v1/purchase-orders/{po_id}/issue", headers={"Authorization": f"Bearer {po_token}"})

    # 7. Create GRN
    from app.models.all_models import POItem
    db = TestingSessionLocal()
    po_item = db.query(POItem).filter(POItem.po_id == po_id).first()
    po_item_id = po_item.id
    db.close()

    grn_resp = client.post("/api/v1/grns/", json={
        "po_id": po_id,
        "delivery_date": "2026-12-31T00:00:00",
        "inspection_notes": "OK",
        "items": [{
            "po_item_id": po_item_id,
            "item_description": "Laptops",
            "quantity_received": 2,
            "quantity_accepted": 2,
            "quantity_rejected": 0,
            "rejection_reason": ""
        }]
    }, headers={"Authorization": f"Bearer {emp_token}"})
    assert grn_resp.status_code == 201
    grn_id = grn_resp.json()["id"]

    # 8. Create Invoice
    inv_resp = client.post("/api/v1/invoices/", json={
        "invoice_number": "INV-TEST-99",
        "po_id": po_id,
        "grn_id": grn_id,
        "vendor_id": 1,
        "invoice_amount": 3000,
        "currency": "USD",
        "invoice_date": "2026-12-31T00:00:00",
        "due_date": "2026-12-31T00:00:00"
      }, headers={"Authorization": f"Bearer {ap_token}"})
    assert inv_resp.status_code == 201
    inv_id = inv_resp.json()["id"]
    assert inv_resp.json()["status"] == "matched"

    # Approve & Forward Invoice
    client.post(f"/api/v1/invoices/{inv_id}/approve", headers={"Authorization": f"Bearer {fo_token}"})
    client.post(f"/api/v1/invoices/{inv_id}/forward-payment", headers={"Authorization": f"Bearer {fo_token}"})

    # 9. Create Payment
    pay_resp = client.post("/api/v1/payments/", json={
        "invoice_id": inv_id,
        "amount": 3000,
        "currency": "USD",
        "payment_method": "bank_transfer",
        "bank_reference": "REF-99",
        "remarks": "Paid"
    }, headers={"Authorization": f"Bearer {ap_token}"})
    assert pay_resp.status_code == 201
    pay_id = pay_resp.json()["id"]

    # 10. Update Payment to PAID
    pay_update = client.patch(f"/api/v1/payments/{pay_id}", json={"status": "paid"}, headers={"Authorization": f"Bearer {fo_token}"})
    assert pay_update.status_code == 200

    # Verify budget: reserved=0, consumed=3000
    b_check = client.get(f"/api/v1/budgets/{budget_id}", headers={"Authorization": f"Bearer {fo_token}"}).json()
    assert float(b_check["reserved"]) == 0
    assert float(b_check["consumed"]) == 3000.0


def test_procurement_compliance_policies():
    # Login employee
    emp_login = client.post("/api/v1/auth/login", data={"username": "test@example.com", "password": "Test@1234"})
    emp_token = emp_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {emp_token}"}

    # Test case 1: $4,000 (1 step: manager)
    pr1 = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "Under 5k",
        "items": [{"item_description": "Item", "quantity": 1, "estimated_unit_price": 4000}]
    }, headers=headers).json()
    client.post(f"/api/v1/requisitions/{pr1['id']}/submit", headers=headers)
    
    # Test case 2: $10,000 (2 steps: manager, procurement_manager)
    pr2 = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "10k",
        "items": [{"item_description": "Item", "quantity": 1, "estimated_unit_price": 10000}]
    }, headers=headers).json()
    client.post(f"/api/v1/requisitions/{pr2['id']}/submit", headers=headers)

    # Test case 3: $50,000 (3 steps: manager, procurement_manager, finance_officer)
    pr3 = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "50k",
        "items": [{"item_description": "Item", "quantity": 1, "estimated_unit_price": 50000}]
    }, headers=headers).json()
    client.post(f"/api/v1/requisitions/{pr3['id']}/submit", headers=headers)

    # Test case 4: $100,000 (4 steps: manager, procurement_manager, finance_officer, administrator)
    pr4 = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "100k",
        "items": [{"item_description": "Item", "quantity": 1, "estimated_unit_price": 100000}]
    }, headers=headers).json()
    client.post(f"/api/v1/requisitions/{pr4['id']}/submit", headers=headers)

    # Verify steps in DB
    from app.models.all_models import ApprovalStep
    db = TestingSessionLocal()
    
    steps1 = db.query(ApprovalStep).filter(ApprovalStep.requisition_id == pr1["id"]).order_by(ApprovalStep.step_order).all()
    assert len(steps1) == 1
    assert steps1[0].approver_role == "manager"

    steps2 = db.query(ApprovalStep).filter(ApprovalStep.requisition_id == pr2["id"]).order_by(ApprovalStep.step_order).all()
    assert len(steps2) == 2
    assert [s.approver_role for s in steps2] == ["manager", "procurement_manager"]

    steps3 = db.query(ApprovalStep).filter(ApprovalStep.requisition_id == pr3["id"]).order_by(ApprovalStep.step_order).all()
    assert len(steps3) == 3
    assert [s.approver_role for s in steps3] == ["manager", "procurement_manager", "finance_officer"]

    steps4 = db.query(ApprovalStep).filter(ApprovalStep.requisition_id == pr4["id"]).order_by(ApprovalStep.step_order).all()
    assert len(steps4) == 4
    assert [s.approver_role for s in steps4] == ["manager", "procurement_manager", "finance_officer", "administrator"]

    db.close()


def test_vendor_performance_evaluation():
    # Login Procurement Officer
    po_login = client.post("/api/v1/auth/login", data={"username": "workflow_po@example.com", "password": "Password@123"})
    po_token = po_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {po_token}"}

    # Register Vendor
    vendor_resp = client.post("/api/v1/vendors/", json={
        "company_name": "Eval Vendor",
        "email": "eval_vendor_unique_perf@test.com",
        "phone": "555-555",
        "address": "123 Eval St",
    }, headers=headers)
    assert vendor_resp.status_code == 201, vendor_resp.json()
    vendor_id = vendor_resp.json()["id"]

    # Submit first evaluation
    eval1 = client.post(f"/api/v1/vendors/{vendor_id}/evaluate", json={
        "po_id": 1,
        "delivery_score": 5,
        "quality_score": 4,
        "communication_score": 3,
        "comments": "Good overall"
    }, headers=headers)
    assert eval1.status_code == 200
    assert eval1.json()["overall_score"] == 4.0

    # Fetch vendor and verify performance score is 4.0
    v1 = client.get(f"/api/v1/vendors/{vendor_id}", headers=headers).json()
    assert float(v1["performance_score"]) == 4.0

    # Submit second evaluation
    eval2 = client.post(f"/api/v1/vendors/{vendor_id}/evaluate", json={
        "po_id": 1,
        "delivery_score": 5,
        "quality_score": 5,
        "communication_score": 5,
        "comments": "Perfect"
    }, headers=headers)
    assert eval2.status_code == 200
    assert eval2.json()["overall_score"] == 5.0

    # Fetch vendor and verify performance score is 4.5 (average of 4.0 and 5.0)
    v2 = client.get(f"/api/v1/vendors/{vendor_id}", headers=headers).json()
    assert float(v2["performance_score"]) == 4.5


def test_procurement_lifecycle_audit_logging():
    # Login Employee
    emp_login = client.post("/api/v1/auth/login", data={"username": "test@example.com", "password": "Test@1234"}, headers={"User-Agent": "Mozilla/AuditTest"})
    assert emp_login.status_code == 200
    emp_token = emp_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {emp_token}", "User-Agent": "Mozilla/AuditTest"}

    # Create Requisition (this will trigger CREATE_REQUISITION audit log)
    pr_resp = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "Audit Log Test Requisition",
        "items": [{"item_description": "Server", "quantity": 1, "estimated_unit_price": 500}]
    }, headers=headers)
    assert pr_resp.status_code == 201
    pr_id = pr_resp.json()["id"]

    # Verify Audit Logs in Database
    from app.models.all_models import AuditLog
    db = TestingSessionLocal()
    
    # Query logs for this requisition entity
    logs = db.query(AuditLog).filter(AuditLog.entity_type == "PurchaseRequisition", AuditLog.entity_id == pr_id).all()
    assert len(logs) > 0
    
    # Check that IP address and User Agent were automatically populated
    log = logs[0]
    assert log.action == "CREATE_REQUISITION"
    assert log.ip_address == "testclient"
    assert log.user_agent == "Mozilla/AuditTest"
    assert log.timestamp is not None
    
    db.close()


def test_purchase_order_amendment_and_cancellation():
    # Register clean Procurement Officer and Procurement Manager
    client.post("/api/v1/auth/register", json={
        "email": "amend_po@example.com",
        "full_name": "Amendment Procurement Officer",
        "password": "Password@123",
        "role": "procurement_officer",
    })
    po_login = client.post("/api/v1/auth/login", data={"username": "amend_po@example.com", "password": "Password@123"})
    po_token = po_login.json()["access_token"]
    po_headers = {"Authorization": f"Bearer {po_token}"}

    client.post("/api/v1/auth/register", json={
        "email": "amend_pm@example.com",
        "full_name": "Amendment Procurement Manager",
        "password": "Password@123",
        "role": "procurement_manager",
    })
    pm_login = client.post("/api/v1/auth/login", data={"username": "amend_pm@example.com", "password": "Password@123"})
    pm_token = pm_login.json()["access_token"]
    pm_headers = {"Authorization": f"Bearer {pm_token}"}

    # Register an employee to create requisition and manager to approve requisition
    client.post("/api/v1/auth/register", json={
        "email": "amend_emp@example.com",
        "full_name": "Amendment Employee",
        "password": "Password@123",
        "role": "employee",
    })
    emp_token = client.post("/api/v1/auth/login", data={"username": "amend_emp@example.com", "password": "Password@123"}).json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    client.post("/api/v1/auth/register", json={
        "email": "amend_mgr@example.com",
        "full_name": "Amendment Manager",
        "password": "Password@123",
        "role": "manager",
    })
    mgr_token = client.post("/api/v1/auth/login", data={"username": "amend_mgr@example.com", "password": "Password@123"}).json()["access_token"]
    mgr_headers = {"Authorization": f"Bearer {mgr_token}"}

    # Register Vendor
    v_resp = client.post("/api/v1/vendors/", json={
        "company_name": "Amendment Vendor",
        "email": "amend_vendor_unique@test.com",
        "phone": "123456",
        "address": "123 St",
    }, headers=po_headers)
    vendor_id = v_resp.json()["id"]

    # 2. Create a Requisition and Approve it so we can convert it to PO
    pr_resp = client.post("/api/v1/requisitions/", json={
        "department": "Engineering",
        "justification": "Need items",
        "items": [{"item_description": "Initial Item", "quantity": 10, "estimated_unit_price": 50}]
    }, headers=emp_headers)
    pr_id = pr_resp.json()["id"]
    client.post(f"/api/v1/requisitions/{pr_id}/submit", headers=emp_headers)

    pending_resp = client.get("/api/v1/approvals/pending", headers=mgr_headers)
    step_id = None
    for step in pending_resp.json():
        if step["pr_id"] == pr_id:
            step_id = step["step_id"]
            break
    assert step_id is not None
    client.post(f"/api/v1/approvals/{step_id}/action", json={"action": "approved", "remarks": "Looks good"}, headers=mgr_headers)



    # 3. Create PO
    po_payload = {
        "requisition_id": pr_id,
        "vendor_id": vendor_id,
        "total_amount": 500,
        "currency": "USD",
        "delivery_address": "Original Office",
        "expected_delivery_date": "2026-12-31T00:00:00",
        "payment_terms": "Net 30",
        "terms_conditions": "Original terms",
        "items": [{"item_description": "Initial Item", "quantity": 10, "unit_price": 50}]
    }
    po_resp = client.post("/api/v1/purchase-orders/", json=po_payload, headers=po_headers)
    assert po_resp.status_code == 201
    po_id = po_resp.json()["id"]

    # 4. Submit, Approve and Issue PO
    client.post(f"/api/v1/purchase-orders/{po_id}/submit", headers=po_headers)
    client.post(f"/api/v1/purchase-orders/{po_id}/approve", headers=pm_headers)
    client.post(f"/api/v1/purchase-orders/{po_id}/issue", headers=po_headers)

    # 5. Amend PO
    amend_payload = {
        "reason": "Change expected date and items count",
        "expected_delivery_date": "2027-01-15T00:00:00",
        "delivery_address": "New Branch Office",
        "items": [{"item_description": "Initial Item", "quantity": 12, "unit_price": 50}]
    }
    amend_resp = client.post(f"/api/v1/purchase-orders/{po_id}/amend", json=amend_payload, headers=po_headers)
    assert amend_resp.status_code == 200
    assert amend_resp.json()["amendment_number"] == 1

    # Fetch PO and check updates
    po_check = client.get(f"/api/v1/purchase-orders/{po_id}", headers=po_headers).json()
    assert po_check["amendment_count"] == 1
    assert po_check["delivery_address"] == "New Branch Office"
    assert po_check["expected_delivery_date"] == "2027-01-15T00:00:00"
    assert float(po_check["total_amount"]) == 600.0
    assert len(po_check["items"]) == 1
    assert float(po_check["items"][0]["quantity"]) == 12.0
    assert len(po_check["amendments"]) == 1
    assert po_check["amendments"][0]["reason"] == "Change expected date and items count"
    assert po_check["amendments"][0]["changes_snapshot"]["delivery_address"]["old"] == "Original Office"
    assert po_check["amendments"][0]["changes_snapshot"]["delivery_address"]["new"] == "New Branch Office"

    # 6. Cancel PO
    cancel_resp = client.post(f"/api/v1/purchase-orders/{po_id}/cancel", headers=pm_headers)
    assert cancel_resp.status_code == 200
    
    # Verify status
    po_check_cancel = client.get(f"/api/v1/purchase-orders/{po_id}", headers=po_headers).json()
    assert po_check_cancel["status"] == "cancelled"


def test_goods_receipt_note_states_and_po_delivery_status():
    # 1. Register users and set headers
    client.post("/api/v1/auth/register", json={
        "email": "grn_po@example.com",
        "full_name": "GRN Procurement Officer",
        "password": "Password@123",
        "role": "procurement_officer",
    })
    po_token = client.post("/api/v1/auth/login", data={"username": "grn_po@example.com", "password": "Password@123"}).json()["access_token"]
    po_headers = {"Authorization": f"Bearer {po_token}"}

    client.post("/api/v1/auth/register", json={
        "email": "grn_pm@example.com",
        "full_name": "GRN Procurement Manager",
        "password": "Password@123",
        "role": "procurement_manager",
    })
    pm_token = client.post("/api/v1/auth/login", data={"username": "grn_pm@example.com", "password": "Password@123"}).json()["access_token"]
    pm_headers = {"Authorization": f"Bearer {pm_token}"}

    # Register Vendor
    v_resp = client.post("/api/v1/vendors/", json={
        "company_name": "GRN Vendor",
        "email": "grn_vendor_unique@test.com",
        "phone": "999999",
        "address": "456 St",
    }, headers=po_headers)
    vendor_id = v_resp.json()["id"]

    # 2. Create and Issue PO
    po_payload = {
        "vendor_id": vendor_id,
        "total_amount": 1000,
        "currency": "USD",
        "delivery_address": "Delivery Location",
        "expected_delivery_date": "2026-12-31T00:00:00",
        "payment_terms": "Net 30",
        "terms_conditions": "Standard",
        "items": [
            {"item_description": "Item A", "quantity": 10, "unit_price": 50},
            {"item_description": "Item B", "quantity": 10, "unit_price": 50}
        ]
    }
    po_resp = client.post("/api/v1/purchase-orders/", json=po_payload, headers=po_headers)
    assert po_resp.status_code == 201
    po_data = po_resp.json()
    po_id = po_data["id"]
    item_a_id = po_data["items"][0]["id"]
    item_b_id = po_data["items"][1]["id"]

    # Submit, Approve and Issue PO
    client.post(f"/api/v1/purchase-orders/{po_id}/submit", headers=po_headers)
    client.post(f"/api/v1/purchase-orders/{po_id}/approve", headers=pm_headers)
    client.post(f"/api/v1/purchase-orders/{po_id}/issue", headers=po_headers)

    # 3. Create GRN 1: All items rejected
    grn_payload_rejected = {
        "po_id": po_id,
        "delivery_date": "2026-06-10T12:00:00",
        "inspection_notes": "Damaged goods",
        "items": [
            {
                "po_item_id": item_a_id,
                "item_description": "Item A",
                "quantity_received": 10,
                "quantity_accepted": 0,
                "quantity_rejected": 10,
                "rejection_reason": "Broken packaging"
            },
            {
                "po_item_id": item_b_id,
                "item_description": "Item B",
                "quantity_received": 10,
                "quantity_accepted": 0,
                "quantity_rejected": 10,
                "rejection_reason": "Wet items"
            }
        ]
    }
    grn_resp_1 = client.post("/api/v1/grns/", json=grn_payload_rejected, headers=po_headers)
    assert grn_resp_1.status_code == 201
    assert grn_resp_1.json()["status"] == "rejected"

    # Verify PO status stays ISSUED
    po_check = client.get(f"/api/v1/purchase-orders/{po_id}", headers=po_headers).json()
    assert po_check["status"] == "issued"

    # 4. Create GRN 2: Some items accepted (5 of Item A, 0 of Item B)
    grn_payload_partial = {
        "po_id": po_id,
        "delivery_date": "2026-06-12T12:00:00",
        "inspection_notes": "Partial replacement delivery",
        "items": [
            {
                "po_item_id": item_a_id,
                "item_description": "Item A",
                "quantity_received": 5,
                "quantity_accepted": 5,
                "quantity_rejected": 0
            }
        ]
    }
    grn_resp_2 = client.post("/api/v1/grns/", json=grn_payload_partial, headers=po_headers)
    assert grn_resp_2.status_code == 201
    assert grn_resp_2.json()["status"] == "accepted"

    # Verify PO status becomes PARTIALLY_DELIVERED
    po_check = client.get(f"/api/v1/purchase-orders/{po_id}", headers=po_headers).json()
    assert po_check["status"] == "partially_delivered"

    # 5. Create GRN 3: Remaining items accepted (5 of Item A, 10 of Item B)
    grn_payload_full = {
        "po_id": po_id,
        "delivery_date": "2026-06-15T12:00:00",
        "inspection_notes": "Final delivery",
        "items": [
            {
                "po_item_id": item_a_id,
                "item_description": "Item A",
                "quantity_received": 5,
                "quantity_accepted": 5,
                "quantity_rejected": 0
            },
            {
                "po_item_id": item_b_id,
                "item_description": "Item B",
                "quantity_received": 10,
                "quantity_accepted": 10,
                "quantity_rejected": 0
            }
        ]
    }
    grn_resp_3 = client.post("/api/v1/grns/", json=grn_payload_full, headers=po_headers)
    assert grn_resp_3.status_code == 201

    # Verify PO status becomes FULLY_DELIVERED
    po_check = client.get(f"/api/v1/purchase-orders/{po_id}", headers=po_headers).json()
    assert po_check["status"] == "fully_delivered"




