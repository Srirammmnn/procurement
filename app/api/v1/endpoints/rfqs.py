from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.all_models import (
    User, RFQ, RFQVendor, Quotation, QuotationItem, Vendor,
    PurchaseRequisition, RFQStatus, RequisitionStatus, VendorStatus, UserRole
)
from app.schemas.schemas import RFQCreate, RFQOut, QuotationCreate, QuotationOut
from app.utils.helpers import generate_number, log_audit, send_rfq_email

router = APIRouter(prefix="/rfqs", tags=["RFQ Management"])


def _gen_rfq_number(db):
    return generate_number("RFQ", db, RFQ, "rfq_number")


def _gen_quote_number(db):
    return generate_number("QUO", db, Quotation, "quote_number")


@router.post("/", response_model=RFQOut, status_code=201)
def create_rfq(
    data: RFQCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER)),
):
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == data.requisition_id).first()
    if not pr:
        raise HTTPException(404, "Requisition not found")
    if pr.status != RequisitionStatus.APPROVED:
        raise HTTPException(400, "Requisition must be APPROVED before creating RFQ")

    rfq = RFQ(
        rfq_number=_gen_rfq_number(db),
        requisition_id=data.requisition_id,
        created_by=current_user.id,
        title=data.title,
        description=data.description,
        submission_deadline=data.submission_deadline,
        terms_conditions=data.terms_conditions,
        status=RFQStatus.DRAFT,
    )
    db.add(rfq)
    db.flush()

    for vid in data.vendor_ids:
        vendor = db.query(Vendor).filter(Vendor.id == vid, Vendor.status == VendorStatus.ACTIVE).first()
        if not vendor:
            raise HTTPException(400, f"Vendor {vid} not found or not active")
        db.add(RFQVendor(rfq_id=rfq.id, vendor_id=vid))

    log_audit(db, current_user.id, "CREATE_RFQ", "RFQ", rfq.id)
    db.commit()
    db.refresh(rfq)
    return rfq


@router.post("/{rfq_id}/publish", response_model=RFQOut)
def publish_rfq(
    rfq_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER)),
):
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    if rfq.status != RFQStatus.DRAFT:
        raise HTTPException(400, "Only DRAFT RFQs can be published")
    rfq.status = RFQStatus.PUBLISHED
    db.commit()
    db.refresh(rfq)

    # Notify invited vendors
    for rfq_vendor in rfq.vendors:
        vendor = rfq_vendor.vendor
        if vendor and vendor.email:
            send_rfq_email(
                rfq_number=rfq.rfq_number,
                rfq_title=rfq.title,
                vendor_email=vendor.email,
                deadline=rfq.submission_deadline.strftime("%Y-%m-%d"),
                description=rfq.description,
                sender_email=current_user.email,
                db=db
            )

    return rfq


@router.get("/", response_model=List[RFQOut])
def list_rfqs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.VENDOR:
        vendor = db.query(Vendor).filter(Vendor.email == current_user.email).first()
        if not vendor:
            return []
        return (
            db.query(RFQ)
            .join(RFQVendor)
            .filter(RFQVendor.vendor_id == vendor.id, RFQ.status != RFQStatus.DRAFT)
            .order_by(RFQ.created_at.desc())
            .all()
        )
    return db.query(RFQ).order_by(RFQ.created_at.desc()).all()


@router.get("/{rfq_id}", response_model=RFQOut)
def get_rfq(rfq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    return rfq


@router.get("/{rfq_id}/quotations", response_model=List[QuotationOut])
def list_quotations(rfq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Quotation).filter(Quotation.rfq_id == rfq_id).all()


@router.post("/{rfq_id}/quotations", response_model=QuotationOut, status_code=201)
def submit_quotation(
    rfq_id: int,
    data: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id, RFQ.status == RFQStatus.PUBLISHED).first()
    if not rfq:
        raise HTTPException(404, "RFQ not found or not published")

    v_id = data.vendor_id
    if current_user.role == UserRole.VENDOR:
        vendor = db.query(Vendor).filter(Vendor.email == current_user.email).first()
        if not vendor:
            raise HTTPException(403, "No active vendor profile found for this user")
        v_id = vendor.id

    q = Quotation(
        rfq_id=rfq_id,
        vendor_id=v_id,
        quote_number=_gen_quote_number(db),
        total_amount=data.total_amount,
        currency=data.currency,
        delivery_days=data.delivery_days,
        validity_date=data.validity_date,
        notes=data.notes,
    )
    db.add(q)
    db.flush()

    for item in data.items:
        db.add(QuotationItem(
            quotation_id=q.id,
            item_description=item.item_description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            total_price=float(item.quantity) * float(item.unit_price),
        ))

    # Mark vendor as responded
    inv = db.query(RFQVendor).filter(RFQVendor.rfq_id == rfq_id, RFQVendor.vendor_id == v_id).first()
    if inv:
        inv.responded = True

    db.commit()
    db.refresh(q)
    return q


@router.get("/{rfq_id}/comparison")
def quotation_comparison(rfq_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Quotation comparison matrix"""
    quotes = db.query(Quotation).filter(Quotation.rfq_id == rfq_id).all()
    if not quotes:
        raise HTTPException(404, "No quotations for this RFQ")
    result = []
    for q in quotes:
        vendor = db.query(Vendor).filter(Vendor.id == q.vendor_id).first()
        result.append({
            "quote_id": q.id,
            "quote_number": q.quote_number,
            "vendor_name": vendor.company_name if vendor else None,
            "vendor_score": float(vendor.performance_score or 0) if vendor else 0,
            "total_amount": float(q.total_amount),
            "currency": q.currency,
            "delivery_days": q.delivery_days,
            "is_recommended": q.is_recommended,
            "is_awarded": q.is_awarded,
        })
    result.sort(key=lambda x: x["total_amount"])
    return {"rfq_id": rfq_id, "comparison": result}


@router.post("/{rfq_id}/award/{quotation_id}")
def award_quotation(
    rfq_id: int,
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_MANAGER, UserRole.PROCUREMENT_OFFICER)),
):
    rfq = db.query(RFQ).filter(RFQ.id == rfq_id).first()
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    q = db.query(Quotation).filter(Quotation.id == quotation_id, Quotation.rfq_id == rfq_id).first()
    if not q:
        raise HTTPException(404, "Quotation not found")
    q.is_awarded = True
    rfq.status = RFQStatus.AWARDED
    log_audit(db, current_user.id, "AWARD_QUOTATION", "Quotation", quotation_id)
    db.commit()
    return {"message": "Quotation awarded", "quote_number": q.quote_number}
