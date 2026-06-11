from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import Optional
from datetime import datetime, timedelta
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.all_models import (
    User, PurchaseRequisition, PurchaseOrder, Vendor,
    Budget, Invoice, Payment, ApprovalStep,
    POStatus, RequisitionStatus, ApprovalStatus, PaymentStatus
)

router = APIRouter(prefix="/reports", tags=["Reports & Dashboard"])


@router.get("/dashboard")
def dashboard_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Total procurement spend (paid invoices)
    total_spend = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == PaymentStatus.PAID
    ).scalar()

    # Open POs
    open_pos = db.query(func.count(PurchaseOrder.id)).filter(
        PurchaseOrder.status.in_([POStatus.ISSUED, POStatus.PARTIALLY_DELIVERED])
    ).scalar()

    # Pending approvals
    pending_approvals = db.query(func.count(ApprovalStep.id)).filter(
        ApprovalStep.status == ApprovalStatus.PENDING
    ).scalar()

    # Budget utilization
    budgets = db.query(Budget).filter(Budget.is_active == True).all()
    total_budget = sum(float(b.total_budget) for b in budgets)
    total_consumed = sum(float(b.consumed) for b in budgets)
    budget_utilization = (total_consumed / total_budget * 100) if total_budget > 0 else 0

    # Avg vendor rating
    avg_vendor_score = db.query(func.avg(Vendor.performance_score)).scalar() or 0

    # Procurement by department
    dept_spend = (
        db.query(
            PurchaseRequisition.department,
            func.sum(PurchaseRequisition.total_estimated_value).label("total"),
        )
        .filter(PurchaseRequisition.status == RequisitionStatus.APPROVED)
        .group_by(PurchaseRequisition.department)
        .all()
    )

    return {
        "total_procurement_spend": float(total_spend),
        "open_purchase_orders": open_pos,
        "pending_approvals": pending_approvals,
        "budget_utilization_percent": round(budget_utilization, 2),
        "average_vendor_rating": round(float(avg_vendor_score), 2),
        "spend_by_department": [
            {"department": d, "total": float(t or 0)} for d, t in dept_spend
        ],
    }


@router.get("/purchase-requisitions")
def requisition_report(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    department: Optional[str] = None,
    status: Optional[RequisitionStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(PurchaseRequisition)
    if start_date:
        q = q.filter(PurchaseRequisition.created_at >= start_date)
    if end_date:
        q = q.filter(PurchaseRequisition.created_at <= end_date)
    if department:
        q = q.filter(PurchaseRequisition.department == department)
    if status:
        q = q.filter(PurchaseRequisition.status == status)

    prs = q.all()
    return {
        "total": len(prs),
        "total_value": sum(float(pr.total_estimated_value or 0) for pr in prs),
        "by_status": _group_by_enum([pr.status for pr in prs]),
        "items": [
            {
                "pr_number": pr.pr_number,
                "department": pr.department,
                "status": pr.status,
                "total_value": float(pr.total_estimated_value or 0),
                "created_at": pr.created_at,
            }
            for pr in prs
        ],
    }


@router.get("/purchase-orders")
def po_report(
    status: Optional[POStatus] = None,
    vendor_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(PurchaseOrder)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if vendor_id:
        q = q.filter(PurchaseOrder.vendor_id == vendor_id)
    pos = q.all()
    return {
        "total": len(pos),
        "total_value": sum(float(po.total_amount) for po in pos),
        "by_status": _group_by_enum([po.status for po in pos]),
        "items": [
            {
                "po_number": po.po_number,
                "vendor_id": po.vendor_id,
                "status": po.status,
                "total_amount": float(po.total_amount),
                "issued_at": po.po_issued_at,
            }
            for po in pos
        ],
    }


@router.get("/vendor-spend")
def vendor_spend_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = (
        db.query(
            Vendor.id,
            Vendor.company_name,
            Vendor.category,
            func.count(PurchaseOrder.id).label("po_count"),
            func.sum(PurchaseOrder.total_amount).label("total_spend"),
            Vendor.performance_score,
        )
        .join(PurchaseOrder, PurchaseOrder.vendor_id == Vendor.id, isouter=True)
        .group_by(Vendor.id)
        .all()
    )
    return [
        {
            "vendor_id": r.id,
            "vendor_name": r.company_name,
            "category": r.category,
            "po_count": r.po_count,
            "total_spend": float(r.total_spend or 0),
            "performance_score": float(r.performance_score or 0),
        }
        for r in results
    ]


@router.get("/budget-utilization")
def budget_utilization_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budgets = db.query(Budget).filter(Budget.is_active == True).all()
    return [
        {
            "budget_code": b.budget_code,
            "department": b.department,
            "fiscal_year": b.fiscal_year,
            "total_budget": float(b.total_budget),
            "consumed": float(b.consumed),
            "reserved": float(b.reserved),
            "available": b.available,
            "utilization_pct": round(float(b.consumed) / float(b.total_budget) * 100, 2) if float(b.total_budget) > 0 else 0,
        }
        for b in budgets
    ]


@router.get("/pending-approvals")
def pending_approvals_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    steps = db.query(ApprovalStep).filter(ApprovalStep.status == ApprovalStatus.PENDING).all()
    result = []
    for step in steps:
        pr = db.query(PurchaseRequisition).filter(
            PurchaseRequisition.id == step.requisition_id
        ).first()
        overdue = step.due_date and step.due_date < datetime.utcnow()
        result.append({
            "step_id": step.id,
            "pr_number": pr.pr_number if pr else None,
            "approver_role": step.approver_role,
            "step_order": step.step_order,
            "due_date": step.due_date,
            "overdue": overdue,
        })
    return {"total_pending": len(result), "items": result}


@router.get("/procurement-cycle-time")
def cycle_time_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prs = db.query(PurchaseRequisition).filter(
        PurchaseRequisition.approved_at != None,
        PurchaseRequisition.submitted_at != None,
    ).all()
    cycle_times = []
    for pr in prs:
        delta = (pr.approved_at - pr.submitted_at).total_seconds() / 3600  # hours
        cycle_times.append({"pr_number": pr.pr_number, "cycle_hours": round(delta, 1)})
    avg = sum(c["cycle_hours"] for c in cycle_times) / len(cycle_times) if cycle_times else 0
    return {
        "average_cycle_hours": round(avg, 2),
        "total_processed": len(cycle_times),
        "items": cycle_times,
    }


def _group_by_enum(values: list) -> dict:
    counts = {}
    for v in values:
        key = v.value if hasattr(v, "value") else str(v)
        counts[key] = counts.get(key, 0) + 1
    return counts
