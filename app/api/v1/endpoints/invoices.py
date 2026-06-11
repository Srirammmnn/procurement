from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.all_models import (
    User, Invoice, Payment, PurchaseOrder, GoodsReceiptNote,
    InvoiceStatus, PaymentStatus, UserRole, Budget, PurchaseRequisition
)
from app.schemas.schemas import InvoiceCreate, InvoiceOut, PaymentCreate, PaymentUpdate, PaymentOut
from app.utils.helpers import generate_number, log_audit

router = APIRouter(prefix="/invoices", tags=["Invoice & Payment"])
payment_router = APIRouter(prefix="/payments", tags=["Payments"])


def _gen_payment_ref(db):
    return generate_number("PAY", db, Payment, "payment_reference")


# ─────────────── INVOICES ───────────────

@router.post("/", response_model=InvoiceOut, status_code=201)
def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ACCOUNTS_PAYABLE, UserRole.FINANCE_OFFICER, UserRole.ADMINISTRATOR)),
):
    if db.query(Invoice).filter(Invoice.invoice_number == data.invoice_number).first():
        raise HTTPException(400, "Invoice number already exists")

    invoice = Invoice(
        invoice_number=data.invoice_number,
        po_id=data.po_id,
        grn_id=data.grn_id,
        vendor_id=data.vendor_id,
        invoice_amount=data.invoice_amount,
        currency=data.currency,
        invoice_date=data.invoice_date,
        due_date=data.due_date,
        status=InvoiceStatus.PENDING,
    )
    db.add(invoice)
    db.flush()

    # Three-way matching
    match_result = _three_way_match(db, invoice)
    invoice.matching_result = match_result
    invoice.status = InvoiceStatus.MATCHED if match_result["matched"] else InvoiceStatus.MISMATCH
    if not match_result["matched"]:
        invoice.mismatch_details = "; ".join(match_result["discrepancies"])

    log_audit(db, current_user.id, "CREATE_INVOICE", "Invoice", invoice.id)
    db.commit()
    db.refresh(invoice)
    return invoice


def _three_way_match(db: Session, invoice: Invoice) -> dict:
    discrepancies = []
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == invoice.po_id).first()
    if not po:
        return {"matched": False, "discrepancies": ["PO not found"]}

    # Check 1: Invoice amount vs PO amount (tolerance 1%)
    po_amount = float(po.total_amount)
    inv_amount = float(invoice.invoice_amount)
    tolerance = po_amount * 0.01
    if abs(inv_amount - po_amount) > tolerance:
        discrepancies.append(
            f"Amount mismatch: Invoice={inv_amount}, PO={po_amount}"
        )

    # Check 2: Goods Receipt exists
    if invoice.grn_id:
        grn = db.query(GoodsReceiptNote).filter(GoodsReceiptNote.id == invoice.grn_id).first()
        if not grn:
            discrepancies.append("GRN not found")
        elif grn.po_id != invoice.po_id:
            discrepancies.append("GRN does not belong to this PO")
    else:
        discrepancies.append("No GRN linked — goods receipt unconfirmed")

    return {
        "matched": len(discrepancies) == 0,
        "po_amount": po_amount,
        "invoice_amount": inv_amount,
        "discrepancies": discrepancies,
    }


@router.get("/", response_model=List[InvoiceOut])
def list_invoices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Invoice).order_by(Invoice.created_at.desc()).all()


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.post("/{invoice_id}/approve", response_model=InvoiceOut)
def approve_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_OFFICER, UserRole.ADMINISTRATOR)),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status != InvoiceStatus.MATCHED:
        raise HTTPException(400, "Only MATCHED invoices can be approved")
    inv.status = InvoiceStatus.APPROVED
    inv.approved_by = current_user.id
    inv.approved_at = datetime.utcnow()
    log_audit(db, current_user.id, "APPROVE_INVOICE", "Invoice", invoice_id)
    db.commit()
    db.refresh(inv)
    return inv


@router.post("/{invoice_id}/forward-payment", response_model=InvoiceOut)
def forward_for_payment(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_OFFICER, UserRole.ADMINISTRATOR)),
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv or inv.status != InvoiceStatus.APPROVED:
        raise HTTPException(400, "Invoice must be APPROVED to forward for payment")
    inv.status = InvoiceStatus.FORWARDED_PAYMENT
    db.commit()
    db.refresh(inv)
    return inv


# ─────────────── PAYMENTS ───────────────

@payment_router.post("/", response_model=PaymentOut, status_code=201)
def create_payment(
    data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ACCOUNTS_PAYABLE, UserRole.ADMINISTRATOR)),
):
    inv = db.query(Invoice).filter(Invoice.id == data.invoice_id).first()
    if not inv or inv.status != InvoiceStatus.FORWARDED_PAYMENT:
        raise HTTPException(400, "Invoice not ready for payment")

    payment = Payment(
        payment_reference=_gen_payment_ref(db),
        invoice_id=data.invoice_id,
        amount=data.amount,
        currency=data.currency,
        payment_method=data.payment_method,
        bank_reference=data.bank_reference,
        remarks=data.remarks,
        status=PaymentStatus.PENDING,
        processed_by=current_user.id,
    )
    db.add(payment)
    log_audit(db, current_user.id, "CREATE_PAYMENT", "Payment")
    db.commit()
    db.refresh(payment)
    return payment


@payment_router.get("/", response_model=List[PaymentOut])
def list_payments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Payment).order_by(Payment.created_at.desc()).all()


@payment_router.patch("/{payment_id}", response_model=PaymentOut)
def update_payment(
    payment_id: int,
    data: PaymentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ACCOUNTS_PAYABLE, UserRole.FINANCE_OFFICER, UserRole.ADMINISTRATOR)),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    old_status = payment.status
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(payment, k, v)
    
    # If the payment becomes PAID (final PO payment), move reserved budget to consumed
    if old_status != PaymentStatus.PAID and payment.status == PaymentStatus.PAID:
        inv = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
        if inv and inv.po_id:
            po = db.query(PurchaseOrder).filter(PurchaseOrder.id == inv.po_id).first()
            if po and po.requisition_id:
                pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == po.requisition_id).first()
                if pr and pr.budget_code:
                    budget = db.query(Budget).filter(Budget.budget_code == pr.budget_code).first()
                    if budget:
                        budget.reserved = max(0, float(budget.reserved) - float(pr.total_estimated_value))
                        budget.consumed = float(budget.consumed) + float(pr.total_estimated_value)

    log_audit(db, current_user.id, "UPDATE_PAYMENT", "Payment", payment_id, {"status": old_status})
    db.commit()
    db.refresh(payment)
    return payment
