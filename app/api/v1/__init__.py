from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth, users, budgets, requisitions,
    approvals, vendors, rfqs, purchase_orders,
    grns, invoices, reports, audit, settings
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(budgets.router)
api_router.include_router(requisitions.router)
api_router.include_router(approvals.router)
api_router.include_router(vendors.router)
api_router.include_router(rfqs.router)
api_router.include_router(purchase_orders.router)
api_router.include_router(grns.router)
api_router.include_router(invoices.router)
api_router.include_router(invoices.payment_router)
api_router.include_router(reports.router)
api_router.include_router(audit.router)
api_router.include_router(settings.router)
