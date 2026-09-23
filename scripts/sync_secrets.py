#!/usr/bin/env python3
"""
DailyBriefer v2 - One-Shot Secret Sync Utility
Reads your local .env file and automatically sets all GitHub Actions Secrets in 1 command.
"""

import os
import subprocess
import sys
from pathlib import Path
from dotenv import load_dotenv

DEFAULT_REPO = "GWaman2007/daily-email-briefer"
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

SECRETS_TO_SYNC = [
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "TAVILY_API_KEY",
    "SMTP_USER",
    "SMTP_PASSWORD",
]


def get_current_repo() -> str:
    """Detect GitHub owner/repo from git remote origin with graceful fallback."""
    env_repo = os.getenv("GITHUB_REPOSITORY", "").strip()
    if env_repo:
        return env_repo
    try:
        res = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
        )
        if res.returncode == 0 and res.stdout.strip():
            url = res.stdout.strip()
            if "github.com" in url:
                part = url.split("github.com")[-1].lstrip("/:").removesuffix(".git")
                if "/" in part:
                    return part
    except Exception:
        pass
    return DEFAULT_REPO

def main():
    if not ENV_PATH.exists():
        print(f"❌ .env file not found at {ENV_PATH}")
        print("Please copy .env.example to .env and fill in your keys once:")
        print("  cp .env.example .env")
        sys.exit(1)

    load_dotenv(ENV_PATH)
    repo = get_current_repo()
    print(f"🔄 Syncing secrets from .env to GitHub repository ({repo})...\n")

    synced = 0
    for secret in SECRETS_TO_SYNC:
        val = os.getenv(secret, "").strip()
        if not val:
            continue

        # Run gh secret set
        cmd = ["gh", "secret", "set", secret, "--repo", repo, "--body", val]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"  ✓ Set GitHub Secret: {secret}")
            synced += 1
        else:
            print(f"  ✗ Failed to set {secret}: {res.stderr.strip()}")

    print(f"\n✅ Successfully synced {synced} secrets to GitHub Actions!")

if __name__ == "__main__":
    main()
