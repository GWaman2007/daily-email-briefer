"""Supabase PostgreSQL persistence operations for DailyBriefer v2."""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, List, Optional
try:
    from supabase import Client, create_client
except ImportError:
    Client = Any  # type: ignore
    create_client = None  # type: ignore

logger = logging.getLogger(__name__)


def get_client(supabase_url: str, supabase_key: str) -> Client:
    """Initialize and return a Supabase client instance."""
    return create_client(supabase_url, supabase_key)


def load_profile(client: Client) -> Optional[Dict[str, Any]]:
    """Load the singleton user profile (id=1)."""
    try:
        response = client.table("profile").select("*").eq("id", 1).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to load profile from database: {e}")
        raise


def load_active_events(client: Client) -> List[Dict[str, Any]]:
    """Load all active event reminders ordered by event_date ascending."""
    try:
        response = (
            client.table("events")
            .select("*")
            .eq("status", "active")
            .order("event_date", desc=False)
            .execute()
        )
        return response.data or []
    except Exception as e:
        logger.error(f"Failed to load active events: {e}")
        raise


def record_brief(client: Client, subject: str, html_content: str) -> Dict[str, Any]:
    """Store generated HTML brief into the briefs archive."""
    try:
        payload = {
            "subject": subject,
            "html_content": html_content,
        }
        response = client.table("briefs").insert(payload).execute()
        if response.data and len(response.data) > 0:
            logger.info(f"Successfully archived brief with ID: {response.data[0].get('id')}")
            return response.data[0]
        return {}
    except Exception as e:
        logger.error(f"Failed to record brief: {e}")
        raise


def mark_expired_events(client: Client) -> int:
    """Transition events where event_date < CURRENT_DATE to status='expired'."""
    try:
        today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        response = (
            client.table("events")
            .update({"status": "expired"})
            .eq("status", "active")
            .lt("event_date", today_str)
            .execute()
        )
        expired_count = len(response.data) if response.data else 0
        if expired_count > 0:
            logger.info(f"Transitioned {expired_count} past event(s) to expired.")
        return expired_count
    except Exception as e:
        logger.warning(f"Error marking expired events: {e}")
        return 0
