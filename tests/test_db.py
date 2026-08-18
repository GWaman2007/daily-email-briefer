"""Unit tests for Supabase database operations."""

import unittest
from unittest.mock import MagicMock

from src.daily_briefer.db import load_profile, load_active_events, record_brief, mark_expired_events


class TestDB(unittest.TestCase):
    def test_load_profile(self):
        mock_client = MagicMock()
        mock_client.table().select().eq().limit().execute.return_value.data = [
            {"id": 1, "recipient_email": "test@example.com"}
        ]

        profile = load_profile(mock_client)
        self.assertIsNotNone(profile)
        self.assertEqual(profile["recipient_email"], "test@example.com")

    def test_load_active_events(self):
        mock_client = MagicMock()
        mock_client.table().select().eq().order().execute.return_value.data = [
            {"id": "uuid-1", "title": "Launch", "event_date": "2026-09-01", "status": "active"}
        ]

        events = load_active_events(mock_client)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["title"], "Launch")

    def test_record_brief(self):
        mock_client = MagicMock()
        mock_client.table().insert().execute.return_value.data = [
            {"id": "brief-1", "subject": "Daily Brief", "html_content": "<p>Content</p>"}
        ]

        res = record_brief(mock_client, "Daily Brief", "<p>Content</p>")
        self.assertEqual(res["id"], "brief-1")

    def test_mark_expired_events(self):
        mock_client = MagicMock()
        mock_client.table().update().eq().lt().execute.return_value.data = [
            {"id": "past-event-1"}
        ]

        count = mark_expired_events(mock_client)
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
