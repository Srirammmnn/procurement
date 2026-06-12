from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.all_models import User, Vendor, VendorEvaluation, VendorStatus, UserRole
from app.schemas.schemas import VendorCreate, VendorOut, VendorUpdate, VendorEvaluationCreate
from app.utils.helpers import generate_vendor_code, log_audit

router = APIRouter(prefix="/vendors", tags=["Vendor Management"])


@router.post("/", response_model=VendorOut, status_code=201)
def register_vendor(
    data: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER, UserRole.ADMINISTRATOR)),
):
    if db.query(Vendor).filter(Vendor.email == data.email).first():
        raise HTTPException(400, "Vendor email already registered")
    vendor = Vendor(
        vendor_code=generate_vendor_code(db),
        **data.model_dump(),
        status=VendorStatus.PENDING,
    )
    db.add(vendor)
    log_audit(db, current_user.id, "CREATE_VENDOR", "Vendor")
    db.commit()
    db.refresh(vendor)
    return vendor


@router.get("/", response_model=List[VendorOut])
def list_vendors(
    status: Optional[VendorStatus] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Vendor)
    if status:
        q = q.filter(Vendor.status == status)
    if category:
        q = q.filter(Vendor.category == category)
    return q.all()


@router.get("/{vendor_id}", response_model=VendorOut)
def get_vendor(vendor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    return v


@router.patch("/{vendor_id}", response_model=VendorOut)
def update_vendor(
    vendor_id: int,
    data: VendorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_OFFICER, UserRole.PROCUREMENT_MANAGER, UserRole.ADMINISTRATOR)),
):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    old = {"status": v.status}
    for k, val in data.model_dump(exclude_none=True).items():
        setattr(v, k, val)
    log_audit(db, current_user.id, "UPDATE_VENDOR", "Vendor", vendor_id, old)
    db.commit()
    db.refresh(v)
    return v


@router.post("/{vendor_id}/approve", response_model=VendorOut)
def approve_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_MANAGER, UserRole.ADMINISTRATOR)),
):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    v.status = VendorStatus.ACTIVE
    log_audit(db, current_user.id, "APPROVE_VENDOR", "Vendor", vendor_id)
    db.commit()
    db.refresh(v)
    return v


@router.post("/{vendor_id}/blacklist", response_model=VendorOut)
def blacklist_vendor(
    vendor_id: int,
    reason: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.PROCUREMENT_MANAGER, UserRole.ADMINISTRATOR)),
):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    v.status = VendorStatus.BLACKLISTED
    v.blacklist_reason = reason
    log_audit(db, current_user.id, "BLACKLIST_VENDOR", "Vendor", vendor_id)
    db.commit()
    db.refresh(v)
    return v


@router.delete("/{vendor_id}", status_code=204)
def delete_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.PROCUREMENT_MANAGER)),
):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    
    # Check if vendor has related entities (POs, Quotes, etc)
    # SQLAlchemy will raise IntegrityError if there are restrictions, or cascade delete
    try:
        db.delete(v)
        log_audit(db, current_user.id, "DELETE_VENDOR", "Vendor", vendor_id)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, f"Cannot delete vendor. They might have active POs or quotations. Error: {str(e)}")
    return None


@router.post("/{vendor_id}/evaluate")
def evaluate_vendor(
    vendor_id: int,
    data: VendorEvaluationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    overall = (float(data.delivery_score) + float(data.quality_score) + float(data.communication_score)) / 3
    eval_ = VendorEvaluation(
        vendor_id=vendor_id,
        po_id=data.po_id,
        evaluated_by=current_user.id,
        delivery_score=data.delivery_score,
        quality_score=data.quality_score,
        communication_score=data.communication_score,
        overall_score=overall,
        comments=data.comments,
    )
    db.add(eval_)
    db.flush()
    # Update vendor performance score (simple rolling average)
    all_evals = db.query(VendorEvaluation).filter(VendorEvaluation.vendor_id == vendor_id).all()
    if all_evals:
        v.performance_score = sum(float(e.overall_score or 0) for e in all_evals) / len(all_evals)
    db.commit()
    return {"message": "Evaluation submitted", "overall_score": overall}
