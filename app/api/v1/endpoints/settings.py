from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import require_roles
from app.models.all_models import User, UserRole, SystemSetting
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/settings", tags=["Settings"])

class SMTPSettingsUpdate(BaseModel):
    mail_server: str
    mail_port: str
    mail_username: str
    mail_password: Optional[str] = None
    mail_from: Optional[str] = None

@router.get("/")
def get_smtp_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.PROCUREMENT_MANAGER))
):
    from app.core.config import settings
    # Query database values
    db_settings = {}
    try:
        items = db.query(SystemSetting).all()
        db_settings = {item.key: item.value for item in items}
    except Exception:
        pass
    
    # Merge with default settings
    mail_server = db_settings.get("MAIL_SERVER") or settings.MAIL_SERVER or ""
    mail_port = db_settings.get("MAIL_PORT") or settings.MAIL_PORT or "587"
    mail_username = db_settings.get("MAIL_USERNAME") or settings.MAIL_USERNAME or ""
    mail_password = db_settings.get("MAIL_PASSWORD") or settings.MAIL_PASSWORD or ""
    mail_from = db_settings.get("MAIL_FROM") or settings.MAIL_FROM or ""
    
    # Mask password for security
    masked_password = ""
    if mail_password:
        if "your_gmail_app_password" in mail_password:
            masked_password = mail_password
        else:
            masked_password = "•" * 12

    return {
        "mail_server": mail_server,
        "mail_port": str(mail_port),
        "mail_username": mail_username,
        "mail_password": masked_password,
        "mail_from": mail_from
    }

@router.post("/")
def update_smtp_settings(
    data: SMTPSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR, UserRole.PROCUREMENT_MANAGER))
):
    keys_map = {
        "MAIL_SERVER": data.mail_server,
        "MAIL_PORT": data.mail_port,
        "MAIL_USERNAME": data.mail_username,
        "MAIL_FROM": data.mail_from or data.mail_username,
    }
    
    # Only update password if a new one (not all masked bullets/empty) is provided
    if data.mail_password and not data.mail_password.startswith("•"):
        keys_map["MAIL_PASSWORD"] = data.mail_password
        
    for key, value in keys_map.items():
        if value is not None:
            setting = db.query(SystemSetting).filter_by(key=key).first()
            if not setting:
                setting = SystemSetting(key=key, value=str(value))
                db.add(setting)
            else:
                setting.value = str(value)
                
    db.commit()
    return {"message": "Settings updated successfully"}
