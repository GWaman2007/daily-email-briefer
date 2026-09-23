"""DailyBriefer v2 - Main Execution Pipeline Orchestrator."""

from __future__ import annotations

import datetime
import logging
import sys
from typing import Optional
try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore

from .config import Config
from .db import (
    get_client,
    load_profile,
    load_active_events,
    record_brief,
    mark_expired_events,
    cleanup_old_briefs,
)
from .gemini import GeminiSynthesizer
from .news import NewsFetcher
from .send import EmailSender, validate_email

# Configure structured console logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("daily_briefer.agent")


def run_pipeline(config_override: Optional[Config] = None) -> int:
    """
    Execute the full end-to-end DailyBriefer workflow.
    Returns exit code (0 for success or intentional skip, 1 for unhandled failure).
    """
    logger.info("=== DailyBriefer v2 Pipeline Starting ===")

    try:
        # 1. Load and validate configuration
        config = config_override or Config.from_env()
        logger.info("Configuration validated successfully.")

        # 2. Connect to persistence tier
        supabase = get_client(config.supabase_url, config.supabase_key)
        profile = load_profile(supabase)

        if not profile:
            logger.error("No profile record found (id=1). Please initialize the database with schema.sql.")
            return 1

        # Check if profile is active
        is_active = profile.get("is_active", True)
        if not is_active:
            logger.info("DailyBriefer is paused (profile.is_active is False). Exiting cleanly without sending email.")
            return 0

        # Resolve dynamic settings (DB overrides env defaults)
        raw_recipient = profile.get("recipient_email", "").strip() or config.recipient_email
        if not raw_recipient:
            logger.error("No recipient email configured in database profile or environment.")
            return 1

        try:
            recipient_email = validate_email(raw_recipient)
        except ValueError as val_err:
            logger.error(f"Recipient email validation failed: {val_err}")
            return 1

        tz_name = profile.get("timezone", "UTC")
        user_tz = datetime.timezone.utc
        if ZoneInfo and tz_name:
            try:
                user_tz = ZoneInfo(tz_name)
            except Exception:
                user_tz = datetime.timezone.utc
        today_str = datetime.datetime.now(user_tz).strftime("%Y-%m-%d")

        primary_model = profile.get("primary_model", "").strip() or config.primary_model
        fallback_model = profile.get("fallback_model", "").strip() or config.fallback_model
        search_topic = profile.get("search_topic", "").strip() or config.search_topic
        search_depth = profile.get("search_depth", "").strip() or config.search_depth
        max_queries = profile.get("max_search_queries") or config.max_search_queries
        theme_raw = profile.get("theme", "").strip() or config.theme or "light"
        theme = theme_raw.lower() if theme_raw.lower() in ("light", "dark") else "light"
        profile["theme"] = theme

        logger.info(f"Target Recipient: {recipient_email}")
        logger.info(f"Persona Tone: {profile.get('persona_tone')}")
        logger.info(f"Email & Web Theme: '{theme}'")
        logger.info(f"Model Stack: Primary='{primary_model}', Fallback='{fallback_model}'")
        logger.info(f"Search Config: Topic='{search_topic}', Depth='{search_depth}', MaxQueries={max_queries}")

        # 3. Read active events
        active_events = load_active_events(supabase)
        logger.info(f"Loaded {len(active_events)} active upcoming event milestone(s).")

        # 4. Formulate search queries via Gemini
        synthesizer = GeminiSynthesizer(
            api_key=config.gemini_api_key,
            primary_model=primary_model,
            fallback_model=fallback_model,
        )

        queries = synthesizer.formulate_queries(
            preferences_summary=profile.get("preferences_summary", ""),
            persona_tone=profile.get("persona_tone", ""),
            max_queries=max_queries,
        )
        logger.info(f"Formulated {len(queries)} news queries: {queries}")

        # 5. Ingest news articles from Tavily
        news_fetcher = NewsFetcher(api_key=config.tavily_api_key)
        articles = news_fetcher.search_news(
            queries=queries,
            topic=search_topic,
            search_depth=search_depth,
        )

        if not articles:
            logger.warning("No articles retrieved from search queries. Proceeding with synthesis of available context.")

        # 6. Synthesize executive HTML briefing via Gemini
        logger.info("Synthesizing personalized HTML briefing...")
        brief_data = synthesizer.synthesize_brief(
            articles=articles,
            profile=profile,
            active_events=active_events,
        )

        subject = brief_data.get("subject", "Daily Intelligence Brief")
        html_content = brief_data.get("html", "")

        # 7. Persist brief to database, mark expired events, and prune old briefs
        logger.info("Archiving synthesized brief to Supabase...")
        record_brief(supabase, subject=subject, html_content=html_content)
        mark_expired_events(supabase, today_str=today_str)
        cleanup_old_briefs(supabase, keep_last_n=90)

        # 8. Transmit email via SMTP relay
        logger.info("Transmitting email digest via SMTP...")
        email_sender = EmailSender(
            smtp_host=config.smtp_host,
            smtp_port=config.smtp_port,
            smtp_user=config.smtp_user,
            smtp_password=config.smtp_password,
        )

        email_sender.send_brief(
            recipient_email=recipient_email,
            subject=subject,
            html_content=html_content,
        )

        logger.info(f"=== DailyBriefer v2 Pipeline Completed Successfully for {recipient_email} ===")
        return 0

    except Exception as e:
        logger.exception(f"Fatal error in DailyBriefer execution pipeline: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(run_pipeline())
