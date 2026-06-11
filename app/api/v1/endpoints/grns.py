from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.all_models import (
    User, GoodsReceiptNote, GRNItem, PurchaseOrder,
    POItem, POStatus, GRNStatus, UserRole
)
from app.schemas.schemas import GRNCreate, GRNOut
from app.utils.helpers import generate_number, log_audit

router = APIRouter(prefix="/grns", tags=["Goods Receipt"])


def _gen_grn_number(db):
    return generate_number("GRN", db, GoodsReceiptNote, "grn_number")


@router.post("/", response_model=GRNOut, status_code=201)
def create_grn(
    data: GRNCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == data.po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status not in [POStatus.ISSUED, POStatus.PARTIALLY_DELIVERED]:
        raise HTTPException(400, "PO must be ISSUED or PARTIALLY_DELIVERED")

    grn = GoodsReceiptNote(
        grn_number=_gen_grn_number(db),
        po_id=data.po_id,
        received_by=current_user.id,
        delivery_date=data.delivery_date,
        inspection_notes=data.inspection_notes,
        status=GRNStatus.PENDING_INSPECTION,
    )
    db.add(grn)
    db.flush()

    total_received = 0
    total_rejected = 0
    for item in data.items:
        db.add(GRNItem(
            grn_id=grn.id,
            po_item_id=item.po_item_id,
            item_description=item.item_description,
            quantity_received=item.quantity_received,
            quantity_accepted=item.quantity_accepted,
            quantity_rejected=item.quantity_rejected,
            rejection_reason=item.rejection_reason,
        ))
        # Update received qty on PO item
        if item.po_item_id:
            po_item = db.query(POItem).filter(POItem.id == item.po_item_id).first()
            if po_item:
                po_item.received_quantity = float(po_item.received_quantity) + float(item.quantity_accepted)
        total_received += float(item.quantity_accepted)
        total_rejected += float(item.quantity_rejected)

    # Determine GRN status
    if total_received == 0:
        grn.status = GRNStatus.REJECTED
    elif total_rejected > 0:
        grn.status = GRNStatus.PARTIALLY_ACCEPTED
    else:
        grn.status = GRNStatus.ACCEPTED

    # Update PO delivery status
    _update_po_delivery_status(db, po)
    log_audit(db, current_user.id, "CREATE_GRN", "GoodsReceiptNote", grn.id)
    db.commit()
    db.refresh(grn)
    return grn


def _update_po_delivery_status(db: Session, po: PurchaseOrder):
    po_items = db.query(POItem).filter(POItem.po_id == po.id).all()
    fully_delivered = all(
        float(i.received_quantity) >= float(i.quantity) for i in po_items
    )
    partially = any(float(i.received_quantity) > 0 for i in po_items)

    if fully_delivered:
        po.status = POStatus.FULLY_DELIVERED
    elif partially:
        po.status = POStatus.PARTIALLY_DELIVERED


@router.get("/", response_model=List[GRNOut])
def list_grns(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(GoodsReceiptNote).order_by(GoodsReceiptNote.created_at.desc()).all()


@router.get("/{grn_id}", response_model=GRNOut)
def get_grn(grn_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    grn = db.query(GoodsReceiptNote).filter(GoodsReceiptNote.id == grn_id).first()
    if not grn:
        raise HTTPException(404, "GRN not found")
    return grn
