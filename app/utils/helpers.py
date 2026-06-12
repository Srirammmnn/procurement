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


def get_all_settings(db) -> dict:
    from app.models.all_models import SystemSetting
    if db is None:
        return {}
    try:
        settings_list = db.query(SystemSetting).all()
        return {s.key: s.value for s in settings_list}
    except Exception as e:
        print(f"[WARN] Failed to query system_settings: {str(e)}")
        return {}


def send_po_email(po_number: str, vendor_email: str, total_amount: float, currency: str, items_info: str, sender_email: str = None, db = None) -> bool:
    import smtplib
    import os
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from app.core.config import settings
    
    # Load from DB settings, fall back to environment settings
    db_settings = get_all_settings(db)
    mail_server = db_settings.get("MAIL_SERVER") or settings.MAIL_SERVER
    mail_port = db_settings.get("MAIL_PORT") or settings.MAIL_PORT
    mail_username = db_settings.get("MAIL_USERNAME") or settings.MAIL_USERNAME
    mail_password = db_settings.get("MAIL_PASSWORD") or settings.MAIL_PASSWORD
    mail_from = sender_email or db_settings.get("MAIL_FROM") or settings.MAIL_FROM or mail_username

    try:
        mail_port = int(mail_port) if mail_port else 587
    except ValueError:
        mail_port = 587
    
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
            f.write(f"From: {mail_from or 'noreply@company.com'}\n")
            f.write(f"Subject: Purchase Order Issued: {po_number}\n")
            f.write("="*40 + "\n")
            f.write(body)
        print(f"[OK] Saved PO email to local file: {filepath}")
    except Exception as e:
        print(f"[WARN] Failed to write PO email to file: {str(e)}")

    is_placeholder = (
        not mail_server 
        or "company.com" in mail_server 
        or not mail_username 
        or "your_gmail_username" in mail_username
        or not mail_password
        or "your_gmail_app_password" in mail_password
    )

    if is_placeholder:
        print(f"[WARN] Real SMTP settings not configured (placeholder credentials detected). Simulated email successfully saved locally.")
        return False
        
    try:
        msg = MIMEMultipart()
        msg["From"] = mail_from or mail_username
        msg["To"] = vendor_email
        msg["Subject"] = f"Purchase Order Issued: {po_number}"
        msg.attach(MIMEText(body, "plain"))
        
        # Connect to SMTP server
        if mail_port == 465:
            server = smtplib.SMTP_SSL(mail_server, mail_port, timeout=5)
        else:
            server = smtplib.SMTP(mail_server, mail_port, timeout=5)
            server.ehlo()
            if mail_port == 587:
                server.starttls()
                server.ehlo()
                
        if mail_password:
            server.login(mail_username, mail_password)
            
        server.sendmail(msg["From"], [msg["To"]], msg.as_string())
        server.quit()
        print(f"[OK] Email sent to vendor: {vendor_email} for PO {po_number}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send email via SMTP: {str(e)}")
        return False


def send_rfq_email(rfq_number: str, rfq_title: str, vendor_email: str, deadline: str, description: str, sender_email: str = None, db = None) -> bool:
    import smtplib
    import os
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from app.core.config import settings

    db_settings = get_all_settings(db)
    mail_server = db_settings.get("MAIL_SERVER") or settings.MAIL_SERVER
    mail_port = db_settings.get("MAIL_PORT") or settings.MAIL_PORT
    mail_username = db_settings.get("MAIL_USERNAME") or settings.MAIL_USERNAME
    mail_password = db_settings.get("MAIL_PASSWORD") or settings.MAIL_PASSWORD
    mail_from = sender_email or db_settings.get("MAIL_FROM") or settings.MAIL_FROM or mail_username

    try:
        mail_port = int(mail_port) if mail_port else 587
    except ValueError:
        mail_port = 587

    body = f"""Dear Vendor,

You are invited to submit a quotation for the following Request for Quotation (RFQ):

RFQ Number: {rfq_number}
Title: {rfq_title}
Submission Deadline: {deadline}

Description:
{description or 'No description provided.'}

Please log in to the portal or submit your bid details before the deadline.

Best regards,
Procurement Team
"""

    # Local file log for development
    try:
        sent_emails_dir = "sent_emails"
        if not os.path.exists(sent_emails_dir):
            os.makedirs(sent_emails_dir)
        filepath = os.path.join(sent_emails_dir, f"{rfq_number}_{vendor_email}.txt")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"To: {vendor_email}\n")
            f.write(f"From: {mail_from or 'noreply@company.com'}\n")
            f.write(f"Subject: Invitation to Bid: {rfq_title} ({rfq_number})\n")
            f.write("="*40 + "\n")
            f.write(body)
        print(f"[OK] Saved RFQ email invitation to local file: {filepath}")
    except Exception as e:
        print(f"[WARN] Failed to write RFQ email to file: {str(e)}")

    is_placeholder = (
        not mail_server 
        or "company.com" in mail_server 
        or not mail_username 
        or "your_gmail_username" in mail_username
        or not mail_password
        or "your_gmail_app_password" in mail_password
    )

    if is_placeholder:
        print(f"[WARN] Real SMTP settings not configured (placeholder credentials). Simulated RFQ email successfully saved locally.")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"] = mail_from or mail_username
        msg["To"] = vendor_email
        msg["Subject"] = f"Invitation to Bid: {rfq_title} ({rfq_number})"
        msg.attach(MIMEText(body, "plain"))
        
        # Connect to SMTP server
        if mail_port == 465:
            server = smtplib.SMTP_SSL(mail_server, mail_port, timeout=5)
        else:
            server = smtplib.SMTP(mail_server, mail_port, timeout=5)
            server.ehlo()
            if mail_port == 587:
                server.starttls()
                server.ehlo()
                
        if mail_password:
            server.login(mail_username, mail_password)
            
        server.sendmail(msg["From"], [msg["To"]], msg.as_string())
        server.quit()
        print(f"[OK] RFQ invitation sent to: {vendor_email}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send RFQ email: {str(e)}")
        return False

