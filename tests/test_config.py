"""Unit tests for config module."""

import os
import unittest
from unittest.mock import patch

from src.daily_briefer.config import Config


class TestConfig(unittest.TestCase):
    def test_config_missing_env_raises(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError) as ctx:
                Config.from_env()
            self.assertIn("Missing required environment variables", str(ctx.exception))

    def test_config_valid_env_loads(self):
        env = {
            "SUPABASE_URL": "https://test.supabase.co",
            "SUPABASE_KEY": "test-key",
            "GEMINI_API_KEY": "gemini-key",
            "TAVILY_API_KEY": "tavily-key",
            "SMTP_USER": "test@gmail.com",
            "SMTP_PASSWORD": "app-password",
            "RECIPIENT_EMAIL": "recipient@example.com",
            "PRIMARY_MODEL": "gemini-3.5-flash-lite",
            "FALLBACK_MODEL": "gemini-3.1-flash-lite",
            "SEARCH_TOPIC": "news",
            "SEARCH_DEPTH": "basic",
            "MAX_SEARCH_QUERIES": "5",
        }
        with patch.dict(os.environ, env, clear=True):
            cfg = Config.from_env()
            self.assertEqual(cfg.supabase_url, "https://test.supabase.co")
            self.assertEqual(cfg.supabase_key, "test-key")
            self.assertEqual(cfg.gemini_api_key, "gemini-key")
            self.assertEqual(cfg.tavily_api_key, "tavily-key")
            self.assertEqual(cfg.smtp_user, "test@gmail.com")
            self.assertEqual(cfg.smtp_password, "app-password")
            self.assertEqual(cfg.recipient_email, "recipient@example.com")
            self.assertEqual(cfg.primary_model, "gemini-3.5-flash-lite")
            self.assertEqual(cfg.fallback_model, "gemini-3.1-flash-lite")
            self.assertEqual(cfg.search_topic, "news")
            self.assertEqual(cfg.search_depth, "basic")
            self.assertEqual(cfg.max_search_queries, 5)


if __name__ == "__main__":
    unittest.main()
