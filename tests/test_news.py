"""Unit tests for news fetcher and deduplication."""

import unittest
from unittest.mock import MagicMock, patch

from src.daily_briefer.news import Article, NewsFetcher, normalize_url


class TestNews(unittest.TestCase):
    def test_normalize_url(self):
        url1 = "https://EXAMPLE.com/path/to/article?utm_source=twitter&ref=123"
        url2 = "https://example.com/path/to/article/"
        self.assertEqual(normalize_url(url1), "https://example.com/path/to/article")
        self.assertEqual(normalize_url(url2), "https://example.com/path/to/article")

    @patch("src.daily_briefer.news.TavilyClient")
    def test_search_news_deduplication(self, mock_tavily_cls):
        mock_client = MagicMock()
        mock_tavily_cls.return_value = mock_client

        # Return mock results for two queries with overlapping URLs
        mock_client.search.side_effect = [
            {
                "results": [
                    {
                        "title": "Article One",
                        "url": "https://tech.example.com/art-1?ref=a",
                        "content": "Content of article one",
                        "score": 0.9,
                        "published_date": "2026-08-18",
                    },
                    {
                        "title": "Article Two",
                        "url": "https://tech.example.com/art-2",
                        "content": "Content of article two",
                        "score": 0.85,
                        "published_date": "2026-08-18",
                    },
                ]
            },
            {
                "results": [
                    {
                        "title": "Article One Duplicate",
                        "url": "https://tech.example.com/art-1?ref=b",
                        "content": "Duplicate content",
                        "score": 0.88,
                        "published_date": "2026-08-18",
                    },
                    {
                        "title": "Article Three",
                        "url": "https://tech.example.com/art-3",
                        "content": "Content of article three",
                        "score": 0.8,
                        "published_date": "2026-08-18",
                    },
                ]
            },
        ]

        fetcher = NewsFetcher(api_key="fake-key")
        articles = fetcher.search_news(queries=["AI breakthrough", "Tech news"])

        self.assertEqual(len(articles), 3)
        urls = [a.url for a in articles]
        self.assertIn("https://tech.example.com/art-1?ref=a", urls)
        self.assertIn("https://tech.example.com/art-2", urls)
        self.assertIn("https://tech.example.com/art-3", urls)


if __name__ == "__main__":
    unittest.main()
