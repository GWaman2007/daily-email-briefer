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

    @patch.object(GeminiSynthesizer, "_call_with_retry_and_fallback")
    def test_synthesize_brief_theme_selection(self, mock_call):
        mock_call.return_value = '{"subject": "S", "html": "<p>H</p>"}'

        synthesizer = GeminiSynthesizer(api_key="test-key")
        articles = [Article(title="AI", url="https://a.com", content="C")]
        events = []

        # Dark theme
        synthesizer.synthesize_brief(articles, {"theme": "dark"}, events)
        dark_prompt = mock_call.call_args[0][0]
        self.assertIn("NOTION DARK THEME", dark_prompt)
        self.assertIn("#191919", dark_prompt)

        # Light theme (default)
        synthesizer.synthesize_brief(articles, {"theme": "light"}, events)
        light_prompt = mock_call.call_args[0][0]
        self.assertIn("NOTION LIGHT THEME", light_prompt)
        self.assertIn("#fcfbf9", light_prompt)

    def test_fallback_html_creation_light_and_dark(self):
        synthesizer = GeminiSynthesizer(api_key="test-key")
        articles = [
            Article(title="Fallback Story", url="https://example.com/story", content="Story snippet here.")
        ]
        events = [
            {"title": "Conference", "event_date": "2026-09-01"}
        ]

        # Test Light Fallback HTML
        light_html = synthesizer._create_fallback_html("Tuesday, August 18, 2026", articles, events, theme="light")
        self.assertIn("Fallback Story", light_html)
        self.assertIn("Conference", light_html)
        self.assertIn("https://example.com/story", light_html)
        self.assertIn("#fcfbf9", light_html)
        self.assertIn("#ffffff", light_html)
        self.assertIn("#e16259", light_html)

        # Test Dark Fallback HTML
        dark_html = synthesizer._create_fallback_html("Tuesday, August 18, 2026", articles, events, theme="dark")
        self.assertIn("Fallback Story", dark_html)
        self.assertIn("Conference", dark_html)
        self.assertIn("https://example.com/story", dark_html)
        self.assertIn("#191919", dark_html)
        self.assertIn("#202020", dark_html)
        self.assertIn("#eb5757", dark_html)


if __name__ == "__main__":
    unittest.main()
