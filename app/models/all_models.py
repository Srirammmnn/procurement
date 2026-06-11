import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean,
    ForeignKey, Numeric, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship
from app.core.database import Base


# ─────────────────────────── ENUMS ──────────────────────────────

class UserRole(str, enum.Enum):
    EMPLOYEE = "employee"
    MANAGER = "manager"
    PROCUREMENT_OFFICER = "procurement_officer"
    PROCUREMENT_MANAGER = "procurement_manager"
    FINANCE_OFFICER = "finance_officer"
    ACCOUNTS_PAYABLE = "accounts_payable"
    ADMINISTRATOR = "administrator"
    AUDITOR = "auditor"


class RequisitionStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    BUDGET_VALIDATION = "budget_validation"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    CONVERTED_TO_PO = "converted_to_po"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DELEGATED = "delegated"
    ESCALATED = "escalated"


class VendorStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BLACKLISTED = "blacklisted"
    INACTIVE = "inactive"


class RFQStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"
    AWARDED = "awarded"
    CANCELLED = "cancelled"


class POStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    ISSUED = "issued"
    PARTIALLY_DELIVERED = "partially_delivered"
    FULLY_DELIVERED = "fully_delivered"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class GRNStatus(str, enum.Enum):
    PENDING_INSPECTION = "pending_inspection"
    ACCEPTED = "accepted"
    PARTIALLY_ACCEPTED = "partially_accepted"
    REJECTED = "rejected"


class InvoiceStatus(str, enum.Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    MATCHED = "matched"
    MISMATCH = "mismatch"
    APPROVED = "approved"
    REJECTED = "rejected"
    FORWARDED_PAYMENT = "forwarded_payment"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    PAID = "paid"
    REJECTED = "rejected"


# ─────────────────────────── MODELS ──────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.EMPLOYEE, nullable=False)
    department = Column(String(100))
    is_active = Column(Boolean, default=True)
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(64))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    requisitions = relationship("PurchaseRequisition", back_populates="requestor")
    approvals = relationship("ApprovalAction", back_populates="approver")
    audit_logs = relationship("AuditLog", back_populates="user")


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    department = Column(String(100), nullable=False)
    budget_code = Column(String(50), unique=True, nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    total_budget = Column(Numeric(15, 2), nullable=False)
    consumed = Column(Numeric(15, 2), default=0)
    reserved = Column(Numeric(15, 2), default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def available(self):
        return float(self.total_budget) - float(self.consumed) - float(self.reserved)


class PurchaseRequisition(Base):
    __tablename__ = "purchase_requisitions"

    id = Column(Integer, primary_key=True, index=True)
    pr_number = Column(String(30), unique=True, nullable=False, index=True)
    requestor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    department = Column(String(100), nullable=False)
    budget_code = Column(String(50), ForeignKey("budgets.budget_code"))
    status = Column(SAEnum(RequisitionStatus), default=RequisitionStatus.DRAFT)
    justification = Column(Text)
    required_date = Column(DateTime)
    total_estimated_value = Column(Numeric(15, 2), default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = Column(DateTime)
    approved_at = Column(DateTime)

    requestor = relationship("User", back_populates="requisitions")
    items = relationship("RequisitionItem", back_populates="requisition", cascade="all, delete-orphan")
    approval_steps = relationship("ApprovalStep", back_populates="requisition", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="requisition", cascade="all, delete-orphan")
    rfqs = relationship("RFQ", back_populates="requisition")


class RequisitionItem(Base):
    __tablename__ = "requisition_items"

    id = Column(Integer, primary_key=True, index=True)
    requisition_id = Column(Integer, ForeignKey("purchase_requisitions.id"), nullable=False)
    item_description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2), nullable=False)
    unit = Column(String(50))
    estimated_unit_price = Column(Numeric(15, 2))
    total_price = Column(Numeric(15, 2))
    specification = Column(Text)

    requisition = relationship("PurchaseRequisition", back_populates="items")


class ApprovalStep(Base):
    __tablename__ = "approval_steps"

    id = Column(Integer, primary_key=True, index=True)
    requisition_id = Column(Integer, ForeignKey("purchase_requisitions.id"), nullable=False)
    step_order = Column(Integer, nullable=False)
    approver_role = Column(SAEnum(UserRole), nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"))
    status = Column(SAEnum(ApprovalStatus), default=ApprovalStatus.PENDING)
    due_date = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    requisition = relationship("PurchaseRequisition", back_populates="approval_steps")
    approver = relationship("User")
    actions = relationship("ApprovalAction", back_populates="step", cascade="all, delete-orphan")


class ApprovalAction(Base):
    __tablename__ = "approval_actions"

    id = Column(Integer, primary_key=True, index=True)
    step_id = Column(Integer, ForeignKey("approval_steps.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(SAEnum(ApprovalStatus), nullable=False)
    remarks = Column(Text)
    acted_at = Column(DateTime, default=datetime.utcnow)

    step = relationship("ApprovalStep", back_populates="actions")
    approver = relationship("User", back_populates="approvals")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    requisition_id = Column(Integer, ForeignKey("purchase_requisitions.id"))
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(100))
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    requisition = relationship("PurchaseRequisition", back_populates="documents")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    vendor_code = Column(String(30), unique=True, nullable=False, index=True)
    company_name = Column(String(255), nullable=False)
    contact_person = Column(String(255))
    email = Column(String(255), unique=True, nullable=False)
    phone = Column(String(50))
    address = Column(Text)
    country = Column(String(100))
    category = Column(String(100))
    trade_license = Column(String(100))
    tax_number = Column(String(100))
    bank_name = Column(String(255))
    bank_account = Column(String(100))
    bank_iban = Column(String(100))
    certifications = Column(JSON)
    status = Column(SAEnum(VendorStatus), default=VendorStatus.PENDING)
    performance_score = Column(Numeric(3, 2), default=0)
    blacklist_reason = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    rfq_invitations = relationship("RFQVendor", back_populates="vendor")
    quotations = relationship("Quotation", back_populates="vendor")
    purchase_orders = relationship("PurchaseOrder", back_populates="vendor")
    evaluations = relationship("VendorEvaluation", back_populates="vendor")


class VendorEvaluation(Base):
    __tablename__ = "vendor_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"))
    evaluated_by = Column(Integer, ForeignKey("users.id"))
    delivery_score = Column(Numeric(3, 2))
    quality_score = Column(Numeric(3, 2))
    communication_score = Column(Numeric(3, 2))
    overall_score = Column(Numeric(3, 2))
    comments = Column(Text)
    evaluated_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="evaluations")
    po = relationship("PurchaseOrder", back_populates="evaluations")


class RFQ(Base):
    __tablename__ = "rfqs"

    id = Column(Integer, primary_key=True, index=True)
    rfq_number = Column(String(30), unique=True, nullable=False, index=True)
    requisition_id = Column(Integer, ForeignKey("purchase_requisitions.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    submission_deadline = Column(DateTime, nullable=False)
    status = Column(SAEnum(RFQStatus), default=RFQStatus.DRAFT)
    terms_conditions = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    requisition = relationship("PurchaseRequisition", back_populates="rfqs")
    vendors = relationship("RFQVendor", back_populates="rfq", cascade="all, delete-orphan")
    quotations = relationship("Quotation", back_populates="rfq")


class RFQVendor(Base):
    __tablename__ = "rfq_vendors"

    id = Column(Integer, primary_key=True, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    invited_at = Column(DateTime, default=datetime.utcnow)
    responded = Column(Boolean, default=False)

    rfq = relationship("RFQ", back_populates="vendors")
    vendor = relationship("Vendor", back_populates="rfq_invitations")


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True)
    rfq_id = Column(Integer, ForeignKey("rfqs.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    quote_number = Column(String(30), unique=True, nullable=False)
    total_amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(10), default="USD")
    delivery_days = Column(Integer)
    validity_date = Column(DateTime)
    notes = Column(Text)
    is_recommended = Column(Boolean, default=False)
    is_awarded = Column(Boolean, default=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    rfq = relationship("RFQ", back_populates="quotations")
    vendor = relationship("Vendor", back_populates="quotations")
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan")


class QuotationItem(Base):
    __tablename__ = "quotation_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False)
    item_description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2))
    unit_price = Column(Numeric(15, 2))
    total_price = Column(Numeric(15, 2))

    quotation = relationship("Quotation", back_populates="items")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    po_number = Column(String(30), unique=True, nullable=False, index=True)
    requisition_id = Column(Integer, ForeignKey("purchase_requisitions.id"))
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    quotation_id = Column(Integer, ForeignKey("quotations.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    status = Column(SAEnum(POStatus), default=POStatus.DRAFT)
    total_amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(10), default="USD")
    delivery_address = Column(Text)
    expected_delivery_date = Column(DateTime)
    payment_terms = Column(String(255))
    terms_conditions = Column(Text)
    po_issued_at = Column(DateTime)
    vendor_email_sent = Column(Boolean, default=False)
    amendment_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="purchase_orders")
    items = relationship("POItem", back_populates="po", cascade="all, delete-orphan")
    grns = relationship("GoodsReceiptNote", back_populates="po")
    invoices = relationship("Invoice", back_populates="po")
    amendments = relationship("POAmendment", back_populates="po", cascade="all, delete-orphan")
    evaluations = relationship("VendorEvaluation", back_populates="po")


class POItem(Base):
    __tablename__ = "po_items"

    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    item_description = Column(Text, nullable=False)
    quantity = Column(Numeric(10, 2), nullable=False)
    unit = Column(String(50))
    unit_price = Column(Numeric(15, 2), nullable=False)
    total_price = Column(Numeric(15, 2), nullable=False)
    received_quantity = Column(Numeric(10, 2), default=0)

    po = relationship("PurchaseOrder", back_populates="items")


class POAmendment(Base):
    __tablename__ = "po_amendments"

    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    amendment_number = Column(Integer, nullable=False)
    reason = Column(Text, nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"))
    changes_snapshot = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    po = relationship("PurchaseOrder", back_populates="amendments")


class GoodsReceiptNote(Base):
    __tablename__ = "goods_receipt_notes"

    id = Column(Integer, primary_key=True, index=True)
    grn_number = Column(String(30), unique=True, nullable=False, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    received_by = Column(Integer, ForeignKey("users.id"))
    delivery_date = Column(DateTime, nullable=False)
    status = Column(SAEnum(GRNStatus), default=GRNStatus.PENDING_INSPECTION)
    inspection_notes = Column(Text)
    rejection_reason = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    po = relationship("PurchaseOrder", back_populates="grns")
    items = relationship("GRNItem", back_populates="grn", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="grn")


class GRNItem(Base):
    __tablename__ = "grn_items"

    id = Column(Integer, primary_key=True, index=True)
    grn_id = Column(Integer, ForeignKey("goods_receipt_notes.id"), nullable=False)
    po_item_id = Column(Integer, ForeignKey("po_items.id"))
    item_description = Column(Text, nullable=False)
    quantity_received = Column(Numeric(10, 2), nullable=False)
    quantity_accepted = Column(Numeric(10, 2), default=0)
    quantity_rejected = Column(Numeric(10, 2), default=0)
    rejection_reason = Column(Text)

    grn = relationship("GoodsReceiptNote", back_populates="items")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(100), unique=True, nullable=False, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    grn_id = Column(Integer, ForeignKey("goods_receipt_notes.id"))
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    invoice_amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(10), default="USD")
    invoice_date = Column(DateTime, nullable=False)
    due_date = Column(DateTime)
    status = Column(SAEnum(InvoiceStatus), default=InvoiceStatus.PENDING)
    matching_result = Column(JSON)  # stores three-way match result
    mismatch_details = Column(Text)
    approved_by = Column(Integer, ForeignKey("users.id"))
    approved_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    po = relationship("PurchaseOrder", back_populates="invoices")
    grn = relationship("GoodsReceiptNote", back_populates="invoices")
    payment = relationship("Payment", back_populates="invoice", uselist=False)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    payment_reference = Column(String(100), unique=True, nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(10), default="USD")
    status = Column(SAEnum(PaymentStatus), default=PaymentStatus.PENDING)
    payment_method = Column(String(100))
    payment_date = Column(DateTime)
    bank_reference = Column(String(100))
    processed_by = Column(Integer, ForeignKey("users.id"))
    remarks = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payment")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer)
    old_values = Column(JSON)
    new_values = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="audit_logs")
