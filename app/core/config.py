from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    MAIL_USERNAME: Optional[str] = None
    MAIL_PASSWORD: Optional[str] = None
    MAIL_FROM: Optional[str] = None
    MAIL_PORT: int = 587
    MAIL_SERVER: Optional[str] = None

    REDIS_URL: str = "redis://localhost:6379/0"

    APP_NAME: str = "Procurement Management System"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    CLERK_SECRET_KEY: Optional[str] = None
    VITE_CLERK_PUBLISHABLE_KEY: Optional[str] = None
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: Optional[str] = None
    
    RAZORPAY_KEY_ID: str = "rzp_test_T0cUaqBftS7Tko"
    RAZORPAY_KEY_SECRET: str = "dummysecret"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
