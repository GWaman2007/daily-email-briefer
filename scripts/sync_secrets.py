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

REPO = "GWaman2007/daily-email-briefer"
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

def main():
    if not ENV_PATH.exists():
        print(f"❌ .env file not found at {ENV_PATH}")
        print("Please copy .env.example to .env and fill in your keys once:")
        print("  cp .env.example .env")
        sys.exit(1)

    load_dotenv(ENV_PATH)
    print(f"🔄 Syncing secrets from .env to GitHub repository ({REPO})...\n")

    synced = 0
    for secret in SECRETS_TO_SYNC:
        val = os.getenv(secret, "").strip()
        if not val:
            continue

        # Run gh secret set
        cmd = ["gh", "secret", "set", secret, "--repo", REPO, "--body", val]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"  ✓ Set GitHub Secret: {secret}")
            synced += 1
        else:
            print(f"  ✗ Failed to set {secret}: {res.stderr.strip()}")

    print(f"\n✅ Successfully synced {synced} secrets to GitHub Actions!")

if __name__ == "__main__":
    main()
