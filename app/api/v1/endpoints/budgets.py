from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.all_models import User, Budget, UserRole
from app.schemas.schemas import BudgetCreate, BudgetOut
from app.utils.helpers import log_audit

router = APIRouter(prefix="/budgets", tags=["Budget Management"])


@router.post("/", response_model=BudgetOut, status_code=201)
def create_budget(
    data: BudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_OFFICER, UserRole.ADMINISTRATOR)),
):
    if db.query(Budget).filter(Budget.budget_code == data.budget_code).first():
        raise HTTPException(400, "Budget code already exists")
    budget = Budget(**data.model_dump())
    db.add(budget)
    log_audit(db, current_user.id, "CREATE_BUDGET", "Budget")
    db.commit()
    db.refresh(budget)
    return budget


@router.get("/", response_model=List[BudgetOut])
def list_budgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Budget).filter(Budget.is_active == True).all()


@router.get("/{budget_id}", response_model=BudgetOut)
def get_budget(budget_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = db.query(Budget).filter(Budget.id == budget_id).first()
    if not b:
        raise HTTPException(404, "Budget not found")
    return b
