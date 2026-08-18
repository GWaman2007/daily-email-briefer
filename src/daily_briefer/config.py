"""Configuration loader and environment validator for DailyBriefer v2."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


@dataclass(frozen=True)
class Config:
    """Immutable application configuration."""

    # Supabase Persistence
    supabase_url: str
    supabase_key: str

    # AI & Search Providers
    gemini_api_key: str
    tavily_api_key: str

    # Outbound SMTP Mail Relay
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    recipient_email: str = ""

    # Model & Search Defaults
    primary_model: str = "gemini-3.5-flash-lite"
    fallback_model: str = "gemini-3.1-flash-lite"
    search_topic: str = "news"
    search_depth: str = "basic"
    max_search_queries: int = 4

    @classmethod
    def from_env(cls) -> Config:
        """Instantiate configuration from environment variables with validation."""
        supabase_url = os.getenv("SUPABASE_URL", "").strip()
        supabase_key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            or os.getenv("SUPABASE_KEY", "").strip()
            or os.getenv("SUPABASE_ANON_KEY", "").strip()
        )
        gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
        tavily_api_key = os.getenv("TAVILY_API_KEY", "").strip()

        # SMTP settings
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
        smtp_port_raw = os.getenv("SMTP_PORT", "587").strip()
        smtp_port = int(smtp_port_raw) if smtp_port_raw.isdigit() else 587
        smtp_user = os.getenv("SMTP_USER", "").strip() or os.getenv("GMAIL_USER", "").strip()
        smtp_password = os.getenv("SMTP_PASSWORD", "").strip() or os.getenv("GMAIL_APP_PASSWORD", "").strip()
        recipient_email = os.getenv("RECIPIENT_EMAIL", "").strip()

        # Model & Search defaults
        primary_model = os.getenv("PRIMARY_MODEL", "gemini-3.5-flash-lite").strip()
        fallback_model = os.getenv("FALLBACK_MODEL", "gemini-3.1-flash-lite").strip()
        search_topic = os.getenv("SEARCH_TOPIC", "news").strip()
        search_depth = os.getenv("SEARCH_DEPTH", "basic").strip()
        max_queries_raw = os.getenv("MAX_SEARCH_QUERIES", "4").strip()
        max_search_queries = int(max_queries_raw) if max_queries_raw.isdigit() else 4

        # Validation
        missing = []
        if not supabase_url:
            missing.append("SUPABASE_URL")
        if not supabase_key:
            missing.append("SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY")
        if not gemini_api_key:
            missing.append("GEMINI_API_KEY")
        if not tavily_api_key:
            missing.append("TAVILY_API_KEY")
        if not smtp_user:
            missing.append("SMTP_USER / GMAIL_USER")
        if not smtp_password:
            missing.append("SMTP_PASSWORD / GMAIL_APP_PASSWORD")

        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

        return cls(
            supabase_url=supabase_url,
            supabase_key=supabase_key,
            gemini_api_key=gemini_api_key,
            tavily_api_key=tavily_api_key,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            recipient_email=recipient_email,
            primary_model=primary_model,
            fallback_model=fallback_model,
            search_topic=search_topic,
            search_depth=search_depth,
            max_search_queries=max_search_queries,
        )
