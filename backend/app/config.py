from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./dev.db"
    JWT_SECRET: str = "dev-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 10080  # 7 daysß

    # Comma-separated list of allowed origins. Set in prod to your Vercel URL.
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # When true, photo uploads return 503 (use this on hosts without persistent storage).e
    DISABLE_PHOTO_UPLOADS: bool = False

    STRAVA_CLIENT_ID: str = ""
    STRAVA_CLIENT_SECRET: str = ""
    STRAVA_REDIRECT_URI: str = "http://localhost:8000/api/v1/strava/callback"
    FRONTEND_URL: str = "http://localhost:5173"

    # Email delivery. Preference order: Resend HTTPS API → SMTP → console stub.
    # Render's free tier blocks outbound SMTP, so RESEND_API_KEY is the prod path.
    RESEND_API_KEY: str = ""
    # Verified sender ("Name <you@yourdomain.com>"). Falls back to SMTP_FROM, then
    # Resend's onboarding sandbox address (which only delivers to the account owner).
    EMAIL_FROM: str = ""

    # Optional SMTP settings. When SMTP_HOST is empty, emails are logged to console only.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = ""

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
