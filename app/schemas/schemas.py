from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field
from app.models.all_models import (
    UserRole, RequisitionStatus, ApprovalStatus, VendorStatus,
    RFQStatus, POStatus, GRNStatus, InvoiceStatus, PaymentStatus
)


# ─────────────── AUTH ───────────────

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


# ─────────────── USER ───────────────

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)
    role: UserRole = UserRole.EMPLOYEE
    department: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    department: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────── BUDGET ───────────────

class BudgetCreate(BaseModel):
    department: str
    budget_code: str
    fiscal_year: int
    total_budget: Decimal


class BudgetOut(BaseModel):
    id: int
    department: str
    budget_code: str
    fiscal_year: int
    total_budget: Decimal
    consumed: Decimal
    reserved: Decimal
    available: float
    is_active: bool

    class Config:
        from_attributes = True


# ─────────────── REQUISITION ───────────────

class RequisitionItemCreate(BaseModel):
    item_description: str
    quantity: Decimal
    unit: Optional[str] = None
    estimated_unit_price: Optional[Decimal] = None
    specification: Optional[str] = None


class RequisitionItemOut(RequisitionItemCreate):
    id: int
    total_price: Optional[Decimal]

    class Config:
        from_attributes = True


class RequisitionCreate(BaseModel):
    department: str
    budget_code: Optional[str] = None
    justification: Optional[str] = None
    required_date: Optional[datetime] = None
    items: List[RequisitionItemCreate]


class RequisitionUpdate(BaseModel):
    justification: Optional[str] = None
    required_date: Optional[datetime] = None
    budget_code: Optional[str] = None


class RequisitionOut(BaseModel):
    id: int
    pr_number: str
    requestor_id: int
    department: str
    budget_code: Optional[str]
    status: RequisitionStatus
    justification: Optional[str]
    required_date: Optional[datetime]
    total_estimated_value: Optional[Decimal]
    created_at: datetime
    items: List[RequisitionItemOut] = []

    class Config:
        from_attributes = True


# ─────────────── APPROVAL ───────────────

class ApprovalActionCreate(BaseModel):
    action: ApprovalStatus
    remarks: Optional[str] = None


class ApprovalStepOut(BaseModel):
    id: int
    step_order: int
    approver_role: UserRole
    status: ApprovalStatus
    due_date: Optional[datetime]

    class Config:
        from_attributes = True


# ─────────────── VENDOR ───────────────

class VendorCreate(BaseModel):
    company_name: str
    contact_person: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    category: Optional[str] = None
    trade_license: Optional[str] = None
    tax_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_iban: Optional[str] = None


class VendorUpdate(BaseModel):
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    category: Optional[str] = None
    status: Optional[VendorStatus] = None
    blacklist_reason: Optional[str] = None


class VendorOut(BaseModel):
    id: int
    vendor_code: str
    company_name: str
    contact_person: Optional[str]
    email: str
    phone: Optional[str]
    country: Optional[str]
    category: Optional[str]
    status: VendorStatus
    performance_score: Optional[Decimal]
    created_at: datetime

    class Config:
        from_attributes = True


class VendorEvaluationCreate(BaseModel):
    po_id: Optional[int] = None
    delivery_score: Decimal = Field(ge=0, le=5)
    quality_score: Decimal = Field(ge=0, le=5)
    communication_score: Decimal = Field(ge=0, le=5)
    comments: Optional[str] = None


# ─────────────── RFQ ───────────────

class RFQCreate(BaseModel):
    requisition_id: int
    title: str
    description: Optional[str] = None
    submission_deadline: datetime
    terms_conditions: Optional[str] = None
    vendor_ids: List[int]


class RFQOut(BaseModel):
    id: int
    rfq_number: str
    requisition_id: int
    title: str
    status: RFQStatus
    submission_deadline: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────── QUOTATION ───────────────

class QuotationItemCreate(BaseModel):
    item_description: str
    quantity: Decimal
    unit_price: Decimal


class QuotationCreate(BaseModel):
    rfq_id: int
    vendor_id: int
    total_amount: Decimal
    currency: str = "USD"
    delivery_days: Optional[int] = None
    validity_date: Optional[datetime] = None
    notes: Optional[str] = None
    items: List[QuotationItemCreate]


class QuotationOut(BaseModel):
    id: int
    quote_number: str
    rfq_id: int
    vendor_id: int
    total_amount: Decimal
    currency: str
    delivery_days: Optional[int]
    is_recommended: bool
    is_awarded: bool
    submitted_at: datetime

    class Config:
        from_attributes = True


# ─────────────── PURCHASE ORDER ───────────────

class POItemCreate(BaseModel):
    item_description: str
    quantity: Decimal
    unit: Optional[str] = None
    unit_price: Decimal


class POCreate(BaseModel):
    requisition_id: Optional[int] = None
    vendor_id: int
    quotation_id: Optional[int] = None
    total_amount: Decimal
    currency: str = "USD"
    delivery_address: Optional[str] = None
    expected_delivery_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    terms_conditions: Optional[str] = None
    items: List[POItemCreate]


class POItemOut(BaseModel):
    id: int
    po_id: int
    item_description: str
    quantity: Decimal
    unit: Optional[str] = None
    unit_price: Decimal
    total_price: Decimal
    received_quantity: Decimal

    class Config:
        from_attributes = True


class POAmendmentOut(BaseModel):
    id: int
    po_id: int
    amendment_number: int
    reason: str
    changed_by: int
    changes_snapshot: Optional[Any] = None
    created_at: datetime

    class Config:
        from_attributes = True


class POOut(BaseModel):
    id: int
    po_number: str
    vendor_id: int
    status: POStatus
    total_amount: Decimal
    currency: str
    delivery_address: Optional[str] = None
    expected_delivery_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    terms_conditions: Optional[str] = None
    po_issued_at: Optional[datetime]
    vendor_email_sent: Optional[bool] = False
    amendment_count: int
    created_at: datetime
    items: List[POItemOut] = []
    amendments: List[POAmendmentOut] = []

    class Config:
        from_attributes = True



class POAmendmentCreate(BaseModel):
    reason: str
    expected_delivery_date: Optional[datetime] = None
    delivery_address: Optional[str] = None
    payment_terms: Optional[str] = None
    terms_conditions: Optional[str] = None
    total_amount: Optional[Decimal] = None
    items: Optional[List[POItemCreate]] = None
    expected_delivery_date: Optional[datetime] = None
    delivery_address: Optional[str] = None
    payment_terms: Optional[str] = None
    terms_conditions: Optional[str] = None
    total_amount: Optional[Decimal] = None
    items: Optional[List[POItemCreate]] = None


# ─────────────── GRN ───────────────

class GRNItemCreate(BaseModel):
    po_item_id: Optional[int] = None
    item_description: str
    quantity_received: Decimal
    quantity_accepted: Decimal
    quantity_rejected: Decimal = Decimal("0")
    rejection_reason: Optional[str] = None


class GRNCreate(BaseModel):
    po_id: int
    delivery_date: datetime
    inspection_notes: Optional[str] = None
    items: List[GRNItemCreate]


class GRNOut(BaseModel):
    id: int
    grn_number: str
    po_id: int
    status: GRNStatus
    delivery_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────── INVOICE ───────────────

class InvoiceCreate(BaseModel):
    po_id: int
    grn_id: Optional[int] = None
    vendor_id: int
    invoice_number: str
    invoice_amount: Decimal
    currency: str = "USD"
    invoice_date: datetime
    due_date: Optional[datetime] = None


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    po_id: int
    grn_id: Optional[int] = None
    vendor_id: Optional[int] = None
    invoice_amount: Decimal
    currency: str = "USD"
    status: InvoiceStatus
    invoice_date: datetime
    due_date: Optional[datetime] = None
    matching_result: Optional[Any] = None
    mismatch_details: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────── PAYMENT ───────────────

class PaymentCreate(BaseModel):
    invoice_id: int
    amount: Decimal
    currency: str = "USD"
    payment_method: Optional[str] = None
    bank_reference: Optional[str] = None
    remarks: Optional[str] = None


class PaymentUpdate(BaseModel):
    status: PaymentStatus
    payment_date: Optional[datetime] = None
    bank_reference: Optional[str] = None
    remarks: Optional[str] = None


class PaymentOut(BaseModel):
    id: int
    payment_reference: str
    invoice_id: int
    amount: Decimal
    currency: str = "USD"
    status: PaymentStatus
    payment_method: Optional[str] = None
    payment_date: Optional[datetime] = None
    bank_reference: Optional[str] = None
    processed_by: Optional[int] = None
    remarks: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────── PAGINATION ───────────────

class PaginatedResponse(BaseModel):
    total: int
    page: int
    size: int
    items: List[Any]
