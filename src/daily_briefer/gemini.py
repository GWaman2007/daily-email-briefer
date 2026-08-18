"""Google Gemini AI integration for query formulation and briefing synthesis."""

from __future__ import annotations

import datetime
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional
try:
    import requests
except ImportError:
    requests = None  # type: ignore

from .news import Article

logger = logging.getLogger(__name__)

# Fallback model hierarchy
DEFAULT_PRIMARY_MODEL = "gemini-3.5-flash-lite"
DEFAULT_FALLBACK_MODEL = "gemini-3.1-flash-lite"
SECONDARY_FALLBACK_MODEL = "gemini-2.5-flash-lite"


class GeminiSynthesizer:
    """Handles query generation and HTML briefing synthesis using Google Gemini."""

    def __init__(
        self,
        api_key: str,
        primary_model: str = DEFAULT_PRIMARY_MODEL,
        fallback_model: str = DEFAULT_FALLBACK_MODEL,
    ):
        self.api_key = api_key
        self.primary_model = primary_model or DEFAULT_PRIMARY_MODEL
        self.fallback_model = fallback_model or DEFAULT_FALLBACK_MODEL
        self.genai_client = None

        # Attempt initializing google-genai SDK if installed
        try:
            from google import genai
            self.genai_client = genai.Client(api_key=self.api_key)
            logger.info("Initialized Google GenAI SDK client successfully.")
        except Exception as e:
            logger.warning(f"Google GenAI SDK init notice: {e}. Falling back to high-performance direct REST client.")

    def _call_gemini_rest(self, model: str, prompt: str, json_mode: bool = True) -> str:
        """Direct REST call to Gemini API with robust response extraction."""
        clean_model = model.replace("models/", "")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }
        generation_config: Dict[str, Any] = {
            "temperature": 0.3,
        }
        if json_mode:
            generation_config["responseMimeType"] = "application/json"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": generation_config,
        }

        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError(f"No candidates returned from Gemini API: {data}")

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            raise ValueError(f"No text parts returned from Gemini candidate: {candidates[0]}")

        return parts[0].get("text", "")

    def _call_with_retry_and_fallback(self, prompt: str, json_mode: bool = True) -> str:
        """
        Execute LLM generation with exponential backoff and multi-tier model fallback.
        """
        models_to_try = [self.primary_model, self.fallback_model, SECONDARY_FALLBACK_MODEL, "gemini-2.5-flash"]
        # Deduplicate while preserving order
        unique_models = []
        for m in models_to_try:
            if m and m not in unique_models:
                unique_models.append(m)

        last_exception: Optional[Exception] = None

        for model in unique_models:
            max_retries = 3
            backoff_base = 2.0

            for attempt in range(1, max_retries + 1):
                try:
                    logger.info(f"Invoking Gemini model '{model}' (Attempt {attempt}/{max_retries})...")

                    # Try SDK first if available
                    if self.genai_client is not None:
                        try:
                            from google.genai import types
                            config = types.GenerateContentConfig(
                                temperature=0.3,
                                response_mime_type="application/json" if json_mode else "text/plain",
                            )
                            resp = self.genai_client.models.generate_content(
                                model=model,
                                contents=prompt,
                                config=config,
                            )
                            if resp and resp.text:
                                return resp.text
                        except Exception as sdk_err:
                            logger.debug(f"SDK call failed with {sdk_err}, trying REST fallback...")

                    # REST fallback
                    text = self._call_gemini_rest(model, prompt, json_mode=json_mode)
                    if text:
                        return text

                except Exception as exc:
                    last_exception = exc
                    logger.warning(f"Gemini call error on model '{model}' attempt {attempt}: {exc}")
                    if attempt < max_retries:
                        sleep_sec = backoff_base ** attempt
                        logger.info(f"Retrying in {sleep_sec:.1f}s...")
                        time.sleep(sleep_sec)
                    else:
                        logger.warning(f"Exhausted retries for model '{model}'. Switching to next fallback model.")

        raise RuntimeError(f"All Gemini models exhausted. Last error: {last_exception}")

    def formulate_queries(
        self,
        preferences_summary: str,
        persona_tone: str,
        max_queries: int = 4,
    ) -> List[str]:
        """
        Convert user preferences into 3 to 6 optimized search queries.
        """
        target_count = max(3, min(6, max_queries))
        today_date = datetime.datetime.now(datetime.timezone.utc).strftime("%B %d, %Y")

        prompt = f"""You are an elite research assistant. Formulate exactly {target_count} distinct, highly specific, and search-engine-ready search queries to discover the latest breaking news and developments for today ({today_date}).

User Profile & Preferences:
{preferences_summary}

Writing Persona Tone:
{persona_tone}

Instructions:
1. Generate between 3 and {target_count} search queries.
2. Focus on breaking developments, major breakthroughs, policy shifts, and key market/tech news from the past 24-48 hours.
3. Keep queries concise, keyword-rich, and avoid Boolean operators, quotes, or punctuation.
4. Output STRICT JSON format as an array of strings.

Example Output:
["AI reasoning models breakthroughs benchmark releases", "Open source software supply chain vulnerabilities", "Global central bank rate decisions economy", "Autonomous vehicle regulatory approvals updates"]
"""

        raw_json = self._call_with_retry_and_fallback(prompt, json_mode=True)
        try:
            # Clean possible markdown wrapping
            cleaned = re.sub(r"^```json\s*", "", raw_json.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned.strip())
            queries = json.loads(cleaned)

            if isinstance(queries, list):
                valid_queries = [str(q).strip() for q in queries if str(q).strip()]
                if valid_queries:
                    return valid_queries[:6]
        except Exception as e:
            logger.warning(f"Failed to parse queries JSON from Gemini ({e}). Raw response: {raw_json}")

        # Safe fallback queries if JSON parsing fails
        return [
            "latest artificial intelligence breakthroughs updates",
            "software engineering and developer tooling news",
            "global technology and macro economy developments",
        ]

    def synthesize_brief(
        self,
        articles: List[Article],
        profile: Dict[str, Any],
        active_events: List[Dict[str, Any]],
    ) -> Dict[str, str]:
        """
        Synthesize news articles and active event milestones into a structured HTML email brief.
        Returns a dict with 'subject' and 'html'.
        """
        today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%A, %B %d, %Y")
        today_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")

        persona_tone = profile.get("persona_tone", "Analytical & Direct")
        preferences_summary = profile.get("preferences_summary", "Focus on software engineering, AI, and global news.")

        # Prepare articles context
        articles_context = []
        for i, art in enumerate(articles[:25], 1):
            articles_context.append(
                f"[{i}] Title: {art.title}\n"
                f"    URL: {art.url}\n"
                f"    Published: {art.published_date or 'Recent'}\n"
                f"    Snippet: {art.content}\n"
            )
        articles_text = "\n".join(articles_context) if articles_context else "No new articles found today."

        # Prepare active events context
        events_context = []
        for ev in active_events:
            ev_title = ev.get("title", "")
            ev_date = ev.get("event_date", "")
            # Calculate days remaining
            days_msg = ""
            try:
                dt = datetime.datetime.strptime(str(ev_date), "%Y-%m-%d").date()
                curr = datetime.date.fromisoformat(today_iso)
                diff = (dt - curr).days
                if diff == 0:
                    days_msg = " (TODAY!)"
                elif diff == 1:
                    days_msg = " (Tomorrow)"
                elif diff > 1:
                    days_msg = f" (in {diff} days)"
            except Exception:
                pass
            events_context.append(f"- {ev_title} on {ev_date}{days_msg}")
        events_text = "\n".join(events_context) if events_context else "None"

        has_events = len(active_events) > 0

        prompt = f"""You are DailyBriefer, an executive AI intelligence synthesizer.
Today is {today_str}.

User Profile & Preferences:
{preferences_summary}

Target Persona & Tone:
{persona_tone}

Active Event Reminders & Milestones:
{events_text}

Raw News Articles Aggregated from Search:
{articles_text}

Task:
Synthesize the news into a top-tier executive briefing matching the user's persona tone.
Deliver the output as a STRICT JSON object with two fields:
1. "subject": A punchy, insightful email subject line containing today's date and the top headline (e.g. "DailyBriefer · Oct 24: AI Reasoning Leap & Tech Macro Highlights")
2. "html": A complete, modern, responsive HTML email string formatted for high readability.

Design & Layout Guidelines for the HTML string:
- Modern inline CSS styles suitable for email clients (Gmail, Apple Mail, Outlook).
- Max-width 640px centered container with clean background (#0f172a / #1e293b dark container or dark slate palette, high contrast clean text #f8fafc and #94a3b8).
- Include a sleek header with "DAILY BRIEFER" logo badge, date ({today_str}), and a 1-sentence executive summary.
- Group the briefing into 3-4 structured thematic sections (e.g., "AI & Machine Intelligence", "Engineering & Systems", "Global & Tech Macro").
- For each key story:
  - Clear, bold title
  - Concise analytical synthesis with bullet points highlighting key takeaways
  - A subtle clickable pill/link to the source URL (e.g. `<a href="URL" style="...">Source: Domain.com →</a>`)
{f'- Include an "Upcoming Milestones & Reminders" section at the bottom listing the active countdowns.' if has_events else '- DO NOT include any empty Milestones section since there are no active reminders.'}
- Sleek footer noting that preferences can be adjusted anytime on the web dashboard.
- Output ONLY valid JSON: {{"subject": "...", "html": "..."}}
"""

        raw_json = self._call_with_retry_and_fallback(prompt, json_mode=True)

        try:
            cleaned = re.sub(r"^```json\s*", "", raw_json.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned.strip())
            data = json.loads(cleaned)

            subject = data.get("subject", "").strip() or f"Daily Intelligence Brief · {today_str}"
            html_content = data.get("html", "").strip()

            if html_content:
                return {
                    "subject": subject,
                    "html": html_content,
                }
        except Exception as e:
            logger.warning(f"Error parsing synthesis JSON ({e}). Creating emergency fallback HTML.")

        # Fallback formatting if JSON parsing failed
        fallback_subject = f"Daily Intelligence Brief · {today_str}"
        fallback_html = self._create_fallback_html(today_str, articles, active_events)
        return {
            "subject": fallback_subject,
            "html": fallback_html,
        }

    def _create_fallback_html(
        self,
        today_str: str,
        articles: List[Article],
        events: List[Dict[str, Any]],
    ) -> str:
        """Create clean fallback HTML email if LLM JSON format fails."""
        articles_html = ""
        for art in articles[:10]:
            articles_html += f"""
            <div style="margin-bottom: 20px; padding: 16px; background-color: #1e293b; border-radius: 8px; border-left: 4px solid #38bdf8;">
                <h3 style="margin: 0 0 8px 0; color: #f8fafc; font-size: 16px;">{art.title}</h3>
                <p style="margin: 0 0 10px 0; color: #94a3b8; font-size: 14px; line-height: 1.5;">{art.content}</p>
                <a href="{art.url}" style="color: #38bdf8; text-decoration: none; font-size: 13px; font-weight: bold;">Read Source →</a>
            </div>
            """

        events_html = ""
        if events:
            events_items = "".join([f"<li style='margin-bottom: 6px; color: #cbd5e1;'><strong>{e.get('title')}</strong> — {e.get('event_date')}</li>" for e in events])
            events_html = f"""
            <div style="margin-top: 30px; padding: 16px; background-color: #1e293b; border-radius: 8px; border-left: 4px solid #a855f7;">
                <h3 style="margin: 0 0 10px 0; color: #f8fafc; font-size: 15px;">Upcoming Milestones</h3>
                <ul style="margin: 0; padding-left: 20px;">{events_items}</ul>
            </div>
            """

        return f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0; padding:24px; background-color:#0b1120; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <div style="max-width:640px; margin:0 auto; background-color:#0f172a; padding:32px; border-radius:12px; border:1px solid #334155; color:#f8fafc;">
                <div style="border-bottom:1px solid #334155; padding-bottom:16px; margin-bottom:24px;">
                    <span style="font-size:12px; font-weight:700; color:#38bdf8; letter-spacing:1.5px; text-transform:uppercase;">Daily Intelligence Digest</span>
                    <h1 style="margin:8px 0 4px 0; font-size:22px; color:#f8fafc;">DailyBriefer Executive Summary</h1>
                    <p style="margin:0; font-size:13px; color:#64748b;">{today_str}</p>
                </div>
                <div>{articles_html}</div>
                {events_html}
                <div style="margin-top:32px; padding-top:16px; border-top:1px solid #334155; text-align:center; font-size:12px; color:#64748b;">
                    Generated automatically by DailyBriefer v2 · Serverless AI Intelligence
                </div>
            </div>
        </body>
        </html>
        """
