"""Tavily news search integration and article deduplication for DailyBriefer v2."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlunparse
try:
    from tavily import TavilyClient
except ImportError:
    TavilyClient = None  # type: ignore

logger = logging.getLogger(__name__)


@dataclass
class Article:
    """Normalized news article entity."""

    title: str
    url: str
    content: str
    published_date: Optional[str] = None
    score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "content": self.content,
            "published_date": self.published_date,
            "score": self.score,
        }


def normalize_url(url: str) -> str:
    """Strip query params and trailing slashes for robust deduplication."""
    try:
        parsed = urlparse(url)
        # Reconstruct without query strings, fragment, and force lowercase netloc
        clean_url = urlunparse((
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path.rstrip("/"),
            "",
            "",
            "",
        ))
        return clean_url
    except Exception:
        return url.strip().rstrip("/")


class NewsFetcher:
    """Tavily search manager for retrieving and deduplicating news."""

    def __init__(self, api_key: str):
        self.client = TavilyClient(api_key=api_key)

    def search_news(
        self,
        queries: List[str],
        topic: str = "news",
        search_depth: str = "basic",
        max_results_per_query: int = 5,
    ) -> List[Article]:
        """
        Execute searches across a collection of queries, deduplicating articles by URL.
        """
        seen_urls: set[str] = set()
        aggregated_articles: List[Article] = []

        logger.info(f"Executing Tavily news searches across {len(queries)} formulated queries (topic='{topic}', depth='{search_depth}').")

        for query in queries:
            clean_query = query.strip()
            if not clean_query:
                continue

            try:
                # Tavily search API call with error protection
                logger.debug(f"Querying Tavily: {clean_query}")
                response = self.client.search(
                    query=clean_query,
                    topic=topic,
                    search_depth=search_depth,
                    max_results=max_results_per_query,
                    include_answer=False,
                    include_raw_content=False,
                )

                results = response.get("results", [])
                for item in results:
                    raw_url = item.get("url", "")
                    title = item.get("title", "").strip()
                    content = item.get("content", "").strip()
                    score = float(item.get("score", 0.0))
                    published_date = item.get("published_date")

                    if not raw_url or not title:
                        continue

                    norm_url = normalize_url(raw_url)
                    if norm_url in seen_urls:
                        continue

                    seen_urls.add(norm_url)
                    aggregated_articles.append(
                        Article(
                            title=title,
                            url=raw_url,
                            content=content,
                            published_date=published_date,
                            score=score,
                        )
                    )

            except Exception as e:
                logger.warning(f"Tavily search failed for query '{clean_query}': {e}. Skipping gracefully.")
                continue

        logger.info(f"Aggregated and deduplicated {len(aggregated_articles)} articles from Tavily.")
        return aggregated_articles
