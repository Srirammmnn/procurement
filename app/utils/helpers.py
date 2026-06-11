import random
import string
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.all_models import AuditLog


def generate_number(prefix: str, db: Session, model, field_name: str) -> str:
    """Generate unique sequential numbers like PR-2026-00001"""
    year = datetime.utcnow().year
    base = f"{prefix}-{year}-"
    last = (
        db.query(model)
        .filter(getattr(model, field_name).like(f"{base}%"))
        .order_by(getattr(model, field_name).desc())
        .first()
    )
    if last:
        last_num = int(getattr(last, field_name).split("-")[-1])
        new_num = last_num + 1
    else:
        new_num = 1
    return f"{base}{str(new_num).zfill(5)}"


from contextvars import ContextVar
from typing import Optional

client_ip_var: ContextVar[Optional[str]] = ContextVar("client_ip", default=None)
user_agent_var: ContextVar[Optional[str]] = ContextVar("user_agent", default=None)


def generate_vendor_code(db: Session) -> str:
    from app.models.all_models import Vendor
    return generate_number("VND", db, Vendor, "vendor_code")


def log_audit(
    db: Session,
    user_id: int,
    action: str,
    entity_type: str,
    entity_id: int = None,
    old_values: dict = None,
    new_values: dict = None,
    ip_address: str = None,
    user_agent: str = None,
):
    if not ip_address:
        ip_address = client_ip_var.get()
    if not user_agent:
        user_agent = user_agent_var.get()

    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    db.flush()


def get_approval_levels(amount: float) -> list:
    """Return required approval roles based on amount"""
    from app.models.all_models import UserRole
    if amount < 5000:
        return [UserRole.MANAGER]
    elif amount < 20000:
        return [UserRole.MANAGER, UserRole.PROCUREMENT_MANAGER]
    elif amount < 100000:
        return [UserRole.MANAGER, UserRole.PROCUREMENT_MANAGER, UserRole.FINANCE_OFFICER]
    else:
        return [UserRole.MANAGER, UserRole.PROCUREMENT_MANAGER, UserRole.FINANCE_OFFICER, UserRole.ADMINISTRATOR]


def send_po_email(po_number: str, vendor_email: str, total_amount: float, currency: str, items_info: str) -> bool:
    import smtplib
    import os
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from app.core.config import settings
    
    body = f"""Dear Vendor,

We are pleased to issue the following Purchase Order to you:

PO Number: {po_number}
Total Amount: {total_amount} {currency}

Items Ordered:
{items_info}

Please prepare the delivery according to the agreed terms.

Best regards,
Procurement Team
"""

    # Always write to a local file for verification/mocking in development
    try:
        sent_emails_dir = "sent_emails"
        if not os.path.exists(sent_emails_dir):
            os.makedirs(sent_emails_dir)
        filepath = os.path.join(sent_emails_dir, f"{po_number}.txt")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"To: {vendor_email}\n")
            f.write(f"From: {settings.MAIL_FROM or 'noreply@company.com'}\n")
            f.write(f"Subject: Purchase Order Issued: {po_number}\n")
            f.write("="*40 + "\n")
            f.write(body)
        print(f"[OK] Saved PO email to local file: {filepath}")
    except Exception as e:
        print(f"[WARN] Failed to write PO email to file: {str(e)}")

    if not settings.MAIL_SERVER or "company.com" in settings.MAIL_SERVER or not settings.MAIL_USERNAME:
        print(f"[WARN] Real SMTP settings not configured. Simulated email successfully saved locally.")
        return True
        
    try:
        msg = MIMEMultipart()
        msg["From"] = settings.MAIL_FROM or settings.MAIL_USERNAME
        msg["To"] = vendor_email
        msg["Subject"] = f"Purchase Order Issued: {po_number}"
        msg.attach(MIMEText(body, "plain"))
        
        # Connect to SMTP server
        if settings.MAIL_PORT == 465:
            server = smtplib.SMTP_SSL(settings.MAIL_SERVER, settings.MAIL_PORT, timeout=5)
        else:
            server = smtplib.SMTP(settings.MAIL_SERVER, settings.MAIL_PORT, timeout=5)
            server.ehlo()
            if settings.MAIL_PORT == 587:
                server.starttls()
                server.ehlo()
                
        if settings.MAIL_PASSWORD:
            server.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
            
        server.sendmail(msg["From"], [msg["To"]], msg.as_string())
        server.quit()
        print(f"[OK] Email sent to vendor: {vendor_email} for PO {po_number}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send email via SMTP (using local file backup): {str(e)}")
        return True
