"""Unit tests for Gemini synthesis and query formulation."""

import unittest
from unittest.mock import patch

from src.daily_briefer.gemini import GeminiSynthesizer
from src.daily_briefer.news import Article


class TestGemini(unittest.TestCase):
    @patch.object(GeminiSynthesizer, "_call_with_retry_and_fallback")
    def test_formulate_queries_parses_json(self, mock_call):
        mock_call.return_value = '["AI breakthroughs 2026", "Quantum computing chips", "Global clean energy transition"]'

        synthesizer = GeminiSynthesizer(api_key="test-key")
        queries = synthesizer.formulate_queries(
            preferences_summary="Focus on AI and Energy.",
            persona_tone="Direct",
            max_queries=3,
        )

        self.assertEqual(len(queries), 3)
        self.assertEqual(queries[0], "AI breakthroughs 2026")
        self.assertEqual(queries[1], "Quantum computing chips")
        self.assertEqual(queries[2], "Global clean energy transition")

    @patch.object(GeminiSynthesizer, "_call_with_retry_and_fallback")
    def test_synthesize_brief_parses_json(self, mock_call):
        mock_call.return_value = '''{
            "subject": "Daily Intelligence · Aug 18: Breakthroughs in Quantum & AI",
            "html": "<html><body><h1>Top Stories</h1></body></html>"
        }'''

        synthesizer = GeminiSynthesizer(api_key="test-key")
        articles = [
            Article(title="Quantum Leap", url="https://example.com/q", content="Quantum chip released.")
        ]
        profile = {
            "persona_tone": "Analytical & Direct",
            "preferences_summary": "Focus on tech.",
        }
        active_events = [
            {"title": "Product Launch", "event_date": "2026-08-25"}
        ]

        res = synthesizer.synthesize_brief(articles, profile, active_events)
        self.assertEqual(res["subject"], "Daily Intelligence · Aug 18: Breakthroughs in Quantum & AI")
        self.assertIn("Top Stories", res["html"])

    def test_fallback_html_creation(self):
        synthesizer = GeminiSynthesizer(api_key="test-key")
        articles = [
            Article(title="Fallback Story", url="https://example.com/story", content="Story snippet here.")
        ]
        events = [
            {"title": "Conference", "event_date": "2026-09-01"}
        ]
        html = synthesizer._create_fallback_html("Tuesday, August 18, 2026", articles, events)
        self.assertIn("Fallback Story", html)
        self.assertIn("Conference", html)
        self.assertIn("https://example.com/story", html)


if __name__ == "__main__":
    unittest.main()
