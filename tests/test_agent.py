"""Unit tests for pipeline orchestrator agent."""

import unittest
from unittest.mock import MagicMock, patch

from src.daily_briefer.agent import run_pipeline
from src.daily_briefer.config import Config


class TestAgent(unittest.TestCase):
    def setUp(self):
        self.dummy_config = Config(
            supabase_url="https://fake.supabase.co",
            supabase_key="fake-key",
            gemini_api_key="fake-gemini",
            tavily_api_key="fake-tavily",
            smtp_user="user@gmail.com",
            smtp_password="password",
            recipient_email="recipient@example.com",
        )

    @patch("src.daily_briefer.agent.load_profile")
    @patch("src.daily_briefer.agent.get_client")
    def test_run_pipeline_inactive_profile_exits_0(self, mock_client, mock_load_profile):
        mock_load_profile.return_value = {
            "id": 1,
            "recipient_email": "user@example.com",
            "is_active": False,
        }

        exit_code = run_pipeline(config_override=self.dummy_config)
        self.assertEqual(exit_code, 0)

    @patch("src.daily_briefer.agent.EmailSender")
    @patch("src.daily_briefer.agent.mark_expired_events")
    @patch("src.daily_briefer.agent.record_brief")
    @patch("src.daily_briefer.agent.GeminiSynthesizer")
    @patch("src.daily_briefer.agent.NewsFetcher")
    @patch("src.daily_briefer.agent.load_active_events")
    @patch("src.daily_briefer.agent.load_profile")
    @patch("src.daily_briefer.agent.get_client")
    def test_run_pipeline_full_success(
        self,
        mock_get_client,
        mock_load_profile,
        mock_load_events,
        mock_news_cls,
        mock_gemini_cls,
        mock_record_brief,
        mock_mark_expired,
        mock_email_cls,
    ):
        mock_load_profile.return_value = {
            "id": 1,
            "recipient_email": "user@example.com",
            "preferences_summary": "Tech news",
            "persona_tone": "Analytical",
            "is_active": True,
            "primary_model": "gemini-3.5-flash-lite",
            "fallback_model": "gemini-3.1-flash-lite",
            "search_topic": "news",
            "search_depth": "basic",
            "max_search_queries": 3,
        }
        mock_load_events.return_value = [{"title": "Demo Day", "event_date": "2026-09-01"}]

        mock_synth = MagicMock()
        mock_synth.formulate_queries.return_value = ["AI news", "Robotics news"]
        mock_synth.synthesize_brief.return_value = {
            "subject": "Daily Briefing",
            "html": "<p>Digest</p>",
        }
        mock_gemini_cls.return_value = mock_synth

        mock_news = MagicMock()
        mock_news.search_news.return_value = []
        mock_news_cls.return_value = mock_news

        mock_sender = MagicMock()
        mock_email_cls.return_value = mock_sender

        exit_code = run_pipeline(config_override=self.dummy_config)
        self.assertEqual(exit_code, 0)
        mock_record_brief.assert_called_once()
        mock_mark_expired.assert_called_once()
        mock_sender.send_brief.assert_called_once()


if __name__ == "__main__":
    unittest.main()
