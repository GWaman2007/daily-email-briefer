"""Email construction and SMTP delivery for DailyBriefer v2."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import re

logger = logging.getLogger(__name__)


def strip_html_tags(html_text: str) -> str:
    """Create clean plain-text representation from HTML string."""
    clean = re.sub(r"<style.*?>.*?</style>", "", html_text, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r"<script.*?>.*?</script>", "", clean, flags=re.DOTALL | re.IGNORECASE)
    # Replace block level elements with space
    clean = re.sub(r"</?(?:div|p|h[1-6]|li|tr|br|hr)[^>]*>", " ", clean, flags=re.IGNORECASE)
    # Remove remaining inline tags
    clean = re.sub(r"<[^>]+>", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


class EmailSender:
    """Outbound email sender via TLS-encrypted SMTP."""

    def __init__(
        self,
        smtp_host: str,
        smtp_port: int,
        smtp_user: str,
        smtp_password: str,
    ):
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_password = smtp_password

    def send_brief(
        self,
        recipient_email: str,
        subject: str,
        html_content: str,
        plain_text: str = "",
    ) -> bool:
        """
        Send a multipart HTML email to the recipient.
        """
        if not recipient_email:
            raise ValueError("Recipient email is empty. Cannot send email.")

        if not plain_text:
            plain_text = strip_html_tags(html_content)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"DailyBriefer Intelligence <{self.smtp_user}>"
        msg["To"] = recipient_email

        # Attach plain-text fallback part first, then HTML part
        part_text = MIMEText(plain_text, "plain", "utf-8")
        part_html = MIMEText(html_content, "html", "utf-8")

        msg.attach(part_text)
        msg.attach(part_html)

        logger.info(f"Connecting to SMTP server at {self.smtp_host}:{self.smtp_port}...")

        try:
            if self.smtp_port == 465:
                # SSL connection
                with smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=30) as server:
                    server.login(self.smtp_user, self.smtp_password)
                    server.sendmail(self.smtp_user, [recipient_email], msg.as_string())
            else:
                # Standard STARTTLS connection (e.g. 587)
                with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=30) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(self.smtp_user, self.smtp_password)
                    server.sendmail(self.smtp_user, [recipient_email], msg.as_string())

            logger.info(f"Successfully transmitted email brief to {recipient_email}.")
            return True

        except smtplib.SMTPAuthenticationError as auth_err:
            logger.error(f"SMTP Authentication Error: {auth_err}. Please check your Gmail App Password.")
            raise
        except Exception as e:
            logger.error(f"Failed to send email via SMTP: {e}")
            raise
