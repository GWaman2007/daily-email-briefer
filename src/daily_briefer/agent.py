"""DailyBriefer v2 - Main Execution Pipeline Orchestrator."""

from __future__ import annotations

import logging
import sys
from typing import Optional

from .config import Config
from .db import get_client, load_profile, load_active_events, record_brief, mark_expired_events
from .gemini import GeminiSynthesizer
from .news import NewsFetcher
from .send import EmailSender

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
        recipient_email = profile.get("recipient_email", "").strip() or config.recipient_email
        if not recipient_email:
            logger.error("No recipient email configured in database profile or environment.")
            return 1

        primary_model = profile.get("primary_model", "").strip() or config.primary_model
        fallback_model = profile.get("fallback_model", "").strip() or config.fallback_model
        search_topic = profile.get("search_topic", "").strip() or config.search_topic
        search_depth = profile.get("search_depth", "").strip() or config.search_depth
        max_queries = profile.get("max_search_queries") or config.max_search_queries

        logger.info(f"Target Recipient: {recipient_email}")
        logger.info(f"Persona Tone: {profile.get('persona_tone')}")
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

        # 7. Persist brief to database and mark expired events
        logger.info("Archiving synthesized brief to Supabase...")
        record_brief(supabase, subject=subject, html_content=html_content)
        mark_expired_events(supabase)

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
