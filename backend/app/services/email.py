import smtplib
import logging
from email.mime.text import MIMEText

import httpx

from ..config import settings

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def _from_address() -> str:
    return settings.EMAIL_FROM or settings.SMTP_FROM or "Huji Run <onboarding@resend.dev>"


def send_email(to: str, subject: str, body: str) -> None:
    """Send an email. Delivery path, in order of preference:
      1. Resend HTTPS API (RESEND_API_KEY set) — works on hosts that block SMTP.
      2. SMTP (SMTP_HOST set).
      3. Console stub (neither configured) — logs the message.

    Never raises and never blocks indefinitely, so a slow/unreachable provider
    can't hang the calling request."""
    if settings.RESEND_API_KEY:
        _send_via_resend(to, subject, body)
        return
    if settings.SMTP_HOST:
        _send_via_smtp(to, subject, body)
        return
    log.warning("[EMAIL STUB] To: %s | %s\n%s", to, subject, body)


def _send_via_resend(to: str, subject: str, body: str) -> None:
    try:
        resp = httpx.post(
            RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={"from": _from_address(), "to": [to], "subject": subject, "text": body},
            timeout=10.0,
        )
        if resp.status_code >= 400:
            log.error("Resend rejected email to %s (%s): %s", to, resp.status_code, resp.text)
    except Exception:
        log.exception("Failed to send email to %s via Resend", to)


def _send_via_smtp(to: str, subject: str, body: str) -> None:
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = _from_address()
    msg["To"] = to
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASS)
            smtp.send_message(msg)
    except Exception:
        log.exception("Failed to send email to %s via SMTP", to)
