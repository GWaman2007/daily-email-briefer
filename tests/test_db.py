"""Unit tests for Supabase database operations."""

import unittest
from unittest.mock import MagicMock

from src.daily_briefer.db import (
    load_profile,
    load_active_events,
    record_brief,
    mark_expired_events,
    cleanup_old_briefs,
)


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

        count = mark_expired_events(mock_client, today_str="2026-09-24")
        self.assertEqual(count, 1)
        mock_client.table().update().eq().lt.assert_called_with("event_date", "2026-09-24")

    def test_cleanup_old_briefs_under_limit(self):
        mock_client = MagicMock()
        mock_client.table().select().order().execute.return_value.data = [
            {"id": f"b-{i}", "created_at": "2026-01-01"} for i in range(10)
        ]
        pruned = cleanup_old_briefs(mock_client, keep_last_n=20)
        self.assertEqual(pruned, 0)

    def test_cleanup_old_briefs_over_limit(self):
        mock_client = MagicMock()
        mock_client.table().select().order().execute.return_value.data = [
            {"id": f"b-{i}", "created_at": "2026-01-01"} for i in range(25)
        ]
        mock_client.table().delete().in_().execute.return_value.data = [{"id": "deleted"}] * 5

        pruned = cleanup_old_briefs(mock_client, keep_last_n=20)
        self.assertEqual(pruned, 5)


if __name__ == "__main__":
    unittest.main()
