from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.all_models import (
    User, PurchaseRequisition, RequisitionItem, ApprovalStep,
    Budget, RequisitionStatus, UserRole
)
from app.schemas.schemas import RequisitionCreate, RequisitionOut, RequisitionUpdate
from app.utils.helpers import generate_number, get_approval_levels, log_audit

router = APIRouter(prefix="/requisitions", tags=["Purchase Requisitions"])


def _generate_pr_number(db):
    return generate_number("PR", db, PurchaseRequisition, "pr_number")


@router.post("/", response_model=RequisitionOut, status_code=201)
def create_requisition(
    data: RequisitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = PurchaseRequisition(
        pr_number=_generate_pr_number(db),
        requestor_id=current_user.id,
        department=data.department,
        budget_code=data.budget_code,
        justification=data.justification,
        required_date=data.required_date,
        status=RequisitionStatus.DRAFT,
    )
    db.add(pr)
    db.flush()

    total = 0
    for item_data in data.items:
        total_price = (item_data.estimated_unit_price or 0) * item_data.quantity
        total += float(total_price)
        item = RequisitionItem(
            requisition_id=pr.id,
            item_description=item_data.item_description,
            quantity=item_data.quantity,
            unit=item_data.unit,
            estimated_unit_price=item_data.estimated_unit_price,
            total_price=total_price,
            specification=item_data.specification,
        )
        db.add(item)

    pr.total_estimated_value = total
    log_audit(db, current_user.id, "CREATE_REQUISITION", "PurchaseRequisition", pr.id)
    db.commit()
    db.refresh(pr)
    return pr


@router.get("/", response_model=List[RequisitionOut])
def list_requisitions(
    status: Optional[RequisitionStatus] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(PurchaseRequisition)
    # Non-admins see only their own requisitions unless manager/procurement
    if current_user.role == UserRole.EMPLOYEE:
        q = q.filter(PurchaseRequisition.requestor_id == current_user.id)
    if status:
        q = q.filter(PurchaseRequisition.status == status)
    if department:
        q = q.filter(PurchaseRequisition.department == department)
    return q.order_by(PurchaseRequisition.created_at.desc()).all()


@router.get("/{pr_id}", response_model=RequisitionOut)
def get_requisition(pr_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(404, "Requisition not found")
    return pr


@router.patch("/{pr_id}", response_model=RequisitionOut)
def update_requisition(
    pr_id: int,
    data: RequisitionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(404, "Requisition not found")
    if pr.requestor_id != current_user.id:
        raise HTTPException(403, "Not your requisition")
    if pr.status not in [RequisitionStatus.DRAFT]:
        raise HTTPException(400, "Only DRAFT requisitions can be updated")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(pr, k, v)
    db.commit()
    db.refresh(pr)
    return pr


@router.post("/{pr_id}/submit", response_model=RequisitionOut)
def submit_requisition(
    pr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(404, "Requisition not found")
    if pr.requestor_id != current_user.id:
        raise HTTPException(403, "Not your requisition")
    if pr.status != RequisitionStatus.DRAFT:
        raise HTTPException(400, "Only DRAFT can be submitted")
    if not pr.items:
        raise HTTPException(400, "Cannot submit empty requisition")

    # Budget validation
    if pr.budget_code:
        budget = db.query(Budget).filter(Budget.budget_code == pr.budget_code, Budget.is_active == True).first()
        if budget:
            if float(pr.total_estimated_value) > budget.available:
                pr.status = RequisitionStatus.BUDGET_VALIDATION
                db.commit()
                db.refresh(pr)
                return pr

    # Create approval steps based on amount
    roles = get_approval_levels(float(pr.total_estimated_value or 0))
    for i, role in enumerate(roles, start=1):
        step = ApprovalStep(
            requisition_id=pr.id,
            step_order=i,
            approver_role=role,
            due_date=datetime.utcnow() + timedelta(days=2),
        )
        db.add(step)

    pr.status = RequisitionStatus.PENDING_APPROVAL
    pr.submitted_at = datetime.utcnow()
    log_audit(db, current_user.id, "SUBMIT_REQUISITION", "PurchaseRequisition", pr.id)
    db.commit()
    db.refresh(pr)
    return pr


@router.post("/{pr_id}/cancel", response_model=RequisitionOut)
def cancel_requisition(
    pr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == pr_id).first()
    if not pr:
        raise HTTPException(404, "Requisition not found")
    if pr.status in [RequisitionStatus.CONVERTED_TO_PO]:
        raise HTTPException(400, "Cannot cancel a converted requisition")
        
    # If the requisition was approved, release the reserved budget
    if pr.status == RequisitionStatus.APPROVED and pr.budget_code:
        budget = db.query(Budget).filter(Budget.budget_code == pr.budget_code).first()
        if budget:
            budget.reserved = max(0, float(budget.reserved) - float(pr.total_estimated_value))

    pr.status = RequisitionStatus.CANCELLED
    log_audit(db, current_user.id, "CANCEL_REQUISITION", "PurchaseRequisition", pr.id)
    db.commit()
    db.refresh(pr)
    return pr
