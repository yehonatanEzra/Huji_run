import smtplib
import logging
from email.mime.text import MIMEText
from ..config import settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    """Send an email. Falls back to console logging when SMTP is not configured."""
    if not settings.SMTP_HOST:
        log.warning("[EMAIL STUB] To: %s | %s\n%s", to, subject, body)
        return

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
        smtp.starttls()
        smtp.login(settings.SMTP_USER, settings.SMTP_PASS)
        smtp.send_message(msg)
