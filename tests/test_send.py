"""Unit tests for send module and email construction."""

import unittest
from unittest.mock import MagicMock, patch

from src.daily_briefer.send import EmailSender, strip_html_tags, validate_email


class TestSend(unittest.TestCase):
    def test_validate_email_valid(self):
        self.assertEqual(validate_email("test@example.com"), "test@example.com")
        self.assertEqual(validate_email(" user.name+tag@sub.domain.co "), "user.name+tag@sub.domain.co")

    def test_validate_email_invalid(self):
        with self.assertRaises(ValueError):
            validate_email("")
        with self.assertRaises(ValueError):
            validate_email("not-an-email")
        with self.assertRaises(ValueError):
            validate_email("user@domain")
        with self.assertRaises(ValueError):
            validate_email("@missing-user.com")

    def test_strip_html_tags(self):
        raw_html = "<html><head><style>body{color:red;}</style></head><body><h1>Hello</h1><p>This is a <b>test</b>.</p></body></html>"
        plain = strip_html_tags(raw_html)
        self.assertEqual(plain, "Hello This is a test.")

    @patch("smtplib.SMTP")
    def test_send_brief_starttls(self, mock_smtp_cls):
        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__.return_value = mock_server

        sender = EmailSender(
            smtp_host="smtp.gmail.com",
            smtp_port=587,
            smtp_user="sender@gmail.com",
            smtp_password="password",
        )

        success = sender.send_brief(
            recipient_email="recipient@example.com",
            subject="Test Subject",
            html_content="<p>Test Body</p>",
        )

        self.assertTrue(success)
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("sender@gmail.com", "password")
        mock_server.sendmail.assert_called_once()


if __name__ == "__main__":
    unittest.main()
