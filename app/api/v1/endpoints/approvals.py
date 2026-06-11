from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.all_models import (
    User, PurchaseRequisition, ApprovalStep, ApprovalAction,
    RequisitionStatus, ApprovalStatus, UserRole, Budget
)
from app.schemas.schemas import ApprovalActionCreate, ApprovalStepOut
from app.utils.helpers import log_audit

router = APIRouter(prefix="/approvals", tags=["Approval Workflow"])


@router.get("/pending", response_model=List[dict])
def get_pending_approvals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all approval steps pending for the current user's role"""
    steps = (
        db.query(ApprovalStep)
        .filter(
            ApprovalStep.approver_role == current_user.role,
            ApprovalStep.status == ApprovalStatus.PENDING,
        )
        .all()
    )
    result = []
    for step in steps:
        # Ensure previous steps are done
        prev_pending = db.query(ApprovalStep).filter(
            ApprovalStep.requisition_id == step.requisition_id,
            ApprovalStep.step_order < step.step_order,
            ApprovalStep.status == ApprovalStatus.PENDING,
        ).first()
        if not prev_pending:
            pr = db.query(PurchaseRequisition).filter(
                PurchaseRequisition.id == step.requisition_id
            ).first()
            result.append({
                "step_id": step.id,
                "pr_number": pr.pr_number if pr else None,
                "pr_id": step.requisition_id,
                "step_order": step.step_order,
                "approver_role": step.approver_role,
                "due_date": step.due_date,
                "total_value": float(pr.total_estimated_value) if pr else 0,
            })
    return result


@router.post("/{step_id}/action")
def take_approval_action(
    step_id: int,
    data: ApprovalActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    step = db.query(ApprovalStep).filter(ApprovalStep.id == step_id).first()
    if not step:
        raise HTTPException(404, "Approval step not found")
    if step.approver_role != current_user.role:
        raise HTTPException(403, "Not authorized to action this step")
    if step.status != ApprovalStatus.PENDING:
        raise HTTPException(400, "Step already actioned")

    pr = db.query(PurchaseRequisition).filter(
        PurchaseRequisition.id == step.requisition_id
    ).first()
    if not pr:
        raise HTTPException(404, "Requisition not found")
    if pr.status != RequisitionStatus.PENDING_APPROVAL:
        raise HTTPException(400, f"Requisition status must be PENDING_APPROVAL, current: {pr.status}")

    # Record action
    action = ApprovalAction(
        step_id=step.id,
        approver_id=current_user.id,
        action=data.action,
        remarks=data.remarks,
    )
    db.add(action)
    step.status = data.action
    step.approver_id = current_user.id

    if data.action == ApprovalStatus.REJECTED:
        pr.status = RequisitionStatus.REJECTED
    elif data.action == ApprovalStatus.APPROVED:
        # Check if there are more steps
        next_step = db.query(ApprovalStep).filter(
            ApprovalStep.requisition_id == step.requisition_id,
            ApprovalStep.step_order == step.step_order + 1,
        ).first()
        if not next_step:
            # All steps approved
            pr.status = RequisitionStatus.APPROVED
            pr.approved_at = datetime.utcnow()
            
            # Move money into reserved state upon approval
            if pr.budget_code:
                budget = db.query(Budget).filter(Budget.budget_code == pr.budget_code).first()
                if budget:
                    budget.reserved = float(budget.reserved) + float(pr.total_estimated_value)

    log_audit(db, current_user.id, f"APPROVAL_{data.action.upper()}", "ApprovalStep", step_id)
    db.commit()
    return {"message": f"Action '{data.action}' recorded", "pr_status": pr.status}
