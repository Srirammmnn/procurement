from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.all_models import (
    User, PurchaseOrder, POItem, POAmendment,
    POStatus, UserRole, PurchaseRequisition, RequisitionStatus
)
from app.schemas.schemas import POCreate, POOut, POAmendmentCreate
from app.utils.helpers import generate_number, log_audit, send_po_email

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


def _gen_po_number(db):
    return generate_number("PO", db, PurchaseOrder, "po_number")


@router.post("/", response_model=POOut, status_code=201)
def create_po(
    data: POCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER)),
):
    po = PurchaseOrder(
        po_number=_gen_po_number(db),
        requisition_id=data.requisition_id,
        vendor_id=data.vendor_id,
        quotation_id=data.quotation_id,
        created_by=current_user.id,
        total_amount=data.total_amount,
        currency=data.currency,
        delivery_address=data.delivery_address,
        expected_delivery_date=data.expected_delivery_date,
        payment_terms=data.payment_terms,
        terms_conditions=data.terms_conditions,
        status=POStatus.DRAFT,
    )
    db.add(po)
    db.flush()

    for item in data.items:
        db.add(POItem(
            po_id=po.id,
            item_description=item.item_description,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=float(item.quantity) * float(item.unit_price),
        ))

    # Mark requisition as converted
    if data.requisition_id:
        pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == data.requisition_id).first()
        if pr:
            if pr.status != RequisitionStatus.APPROVED:
                raise HTTPException(status_code=400, detail="Requisition must be APPROVED before converting to PO")
            pr.status = RequisitionStatus.CONVERTED_TO_PO

    log_audit(db, current_user.id, "CREATE_PO", "PurchaseOrder", po.id)
    db.commit()
    db.refresh(po)
    return po


@router.get("/", response_model=List[POOut])
def list_pos(
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
    return q.order_by(PurchaseOrder.created_at.desc()).all()


@router.get("/{po_id}", response_model=POOut)
def get_po(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    return po


@router.post("/{po_id}/submit")
def submit_po(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER)),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po or po.status != POStatus.DRAFT:
        raise HTTPException(400, "PO not found or not in DRAFT")
    po.status = POStatus.PENDING_APPROVAL
    db.commit()
    return {"message": "PO submitted for approval"}


@router.post("/{po_id}/approve")
def approve_po(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_MANAGER, UserRole.FINANCE_OFFICER, UserRole.ADMINISTRATOR)),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po or po.status != POStatus.PENDING_APPROVAL:
        raise HTTPException(400, "PO not in PENDING_APPROVAL")
    po.status = POStatus.APPROVED
    log_audit(db, current_user.id, "APPROVE_PO", "PurchaseOrder", po_id)
    db.commit()
    return {"message": "PO approved"}


@router.post("/{po_id}/issue")
def issue_po(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER)),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po or po.status != POStatus.APPROVED:
        raise HTTPException(400, "PO must be APPROVED before issuing")
    po.status = POStatus.ISSUED
    po.po_issued_at = datetime.utcnow()
    
    # Send actual email to vendor
    vendor = po.vendor
    items_list = []
    for item in po.items:
        items_list.append(f"- {item.item_description}: {item.quantity} {item.unit or 'pcs'} @ {item.unit_price} each")
    items_info = "\n".join(items_list)
    
    email_success = False
    if vendor and vendor.email:
        email_success = send_po_email(
            po_number=po.po_number,
            vendor_email=vendor.email,
            total_amount=float(po.total_amount),
            currency=po.currency or "USD",
            items_info=items_info
        )
    po.vendor_email_sent = email_success
    
    log_audit(db, current_user.id, "ISSUE_PO", "PurchaseOrder", po_id)
    db.commit()
    return {
        "message": "PO issued to vendor",
        "po_number": po.po_number,
        "email_sent": email_success
    }


@router.post("/{po_id}/cancel")
def cancel_po(
    po_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_MANAGER, UserRole.ADMINISTRATOR)),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status in [POStatus.FULLY_DELIVERED, POStatus.CLOSED]:
        raise HTTPException(400, "Cannot cancel delivered/closed PO")
    po.status = POStatus.CANCELLED
    log_audit(db, current_user.id, "CANCEL_PO", "PurchaseOrder", po_id)
    db.commit()
    return {"message": "PO cancelled"}


@router.post("/{po_id}/amend")
def amend_po(
    po_id: int,
    data: POAmendmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER, UserRole.ADMINISTRATOR)),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status not in [POStatus.APPROVED, POStatus.ISSUED]:
        raise HTTPException(400, "Only APPROVED or ISSUED POs can be amended")
    
    snapshot = {}

    if data.expected_delivery_date is not None:
        snapshot["expected_delivery_date"] = {
            "old": po.expected_delivery_date.isoformat() if po.expected_delivery_date else None,
            "new": data.expected_delivery_date.isoformat()
        }
        po.expected_delivery_date = data.expected_delivery_date

    if data.delivery_address is not None:
        snapshot["delivery_address"] = {
            "old": po.delivery_address,
            "new": data.delivery_address
        }
        po.delivery_address = data.delivery_address

    if data.payment_terms is not None:
        snapshot["payment_terms"] = {
            "old": po.payment_terms,
            "new": data.payment_terms
        }
        po.payment_terms = data.payment_terms

    if data.terms_conditions is not None:
        snapshot["terms_conditions"] = {
            "old": po.terms_conditions,
            "new": data.terms_conditions
        }
        po.terms_conditions = data.terms_conditions

    if data.items is not None:
        old_items = []
        for it in po.items:
            old_items.append({
                "item_description": it.item_description,
                "quantity": float(it.quantity),
                "unit": it.unit,
                "unit_price": float(it.unit_price),
                "total_price": float(it.total_price),
            })
        
        # Delete old items
        for it in po.items:
            db.delete(it)
        
        # Add new items
        new_items = []
        calculated_total = 0.0
        for item in data.items:
            item_total = float(item.quantity) * float(item.unit_price)
            calculated_total += item_total
            db.add(POItem(
                po_id=po.id,
                item_description=item.item_description,
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                total_price=item_total,
            ))
            new_items.append({
                "item_description": item.item_description,
                "quantity": float(item.quantity),
                "unit": item.unit,
                "unit_price": float(item.unit_price),
                "total_price": item_total,
            })
        
        snapshot["items"] = {
            "old": old_items,
            "new": new_items
        }
        
        # Update total amount
        new_total = float(data.total_amount) if data.total_amount is not None else calculated_total
        snapshot["total_amount"] = {
            "old": float(po.total_amount),
            "new": new_total
        }
        po.total_amount = new_total
    elif data.total_amount is not None:
        snapshot["total_amount"] = {
            "old": float(po.total_amount),
            "new": float(data.total_amount)
        }
        po.total_amount = data.total_amount

    po.amendment_count += 1
    amendment = POAmendment(
        po_id=po.id,
        amendment_number=po.amendment_count,
        reason=data.reason,
        changed_by=current_user.id,
        changes_snapshot=snapshot
    )
    db.add(amendment)
    log_audit(db, current_user.id, "AMEND_PO", "PurchaseOrder", po_id)
    db.commit()
    db.refresh(po)
    return {"message": "Amendment recorded", "amendment_number": po.amendment_count}

