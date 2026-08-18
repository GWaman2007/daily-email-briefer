# DailyBriefer v2 🚀

> **Single-user, 100% serverless, zero-maintenance AI news intelligence system.**
> Automates personalized daily news discovery, multi-model synthesis with Google Gemini & Tavily, and HTML email delivery, backed by Supabase PostgreSQL and a client-side Web Crypto encrypted static dashboard on GitHub Pages.

---

## 🏛 System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. STATIC PRESENTATION TIER (GitHub Pages)                             │
│                                                                        │
│  [Web Crypto Vault] ──► Decrypts Gemini Key & GitHub PAT to RAM        │
│  [AI Tuning Chat]   ──► Calls Google Gemini API directly via fetch()   │
│  [Dashboard UI]     ──► Direct PostgREST read/write to Supabase        │
│  [Action Trigger]   ──► Dispatches workflow_dispatch to GitHub API     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ PostgREST / HTTPS
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. PERSISTENCE TIER (Supabase PostgreSQL)                              │
│                                                                        │
│  • profile: Singleton row (id=1) storing persona & focus text          │
│  • events: Active/expired date-based reminders                         │
│  • briefs: Historical log of sent HTML digests                         │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ Service Role Sync
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│ 3. COMPUTE & ORCHESTRATION TIER (GitHub Actions Ephemeral Runner)       │
│                                                                        │
│  Cron (5:00 AM IST) ──► Load DB Profile & Events                       │
│                         ──► Gemini API: Formulate search queries       │
│                         ──► Tavily API: Search news across topics      │
│                         ──► Gemini API: Synthesize HTML email          │
│                         ──► Supabase: Log brief & expire past events   │
│                         ──► Gmail SMTP: Send MIME HTML email           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Features

- **100% Serverless & Free**: Operates entirely within free tiers (GitHub Pages + GitHub Actions + Supabase + Tavily Free + Gemini Free Tier).
- **Zero-Trust Client Cryptography**: Uses the **Web Crypto API** (`crypto.subtle`) with **PBKDF2 (100,000 rounds, SHA-256)** and **AES-GCM-256** to encrypt API keys in browser storage. Decrypted keys exist only in ephemeral RAM during the active session.
- **Dynamic AI Tuning**: Conversational chat interface on the dashboard lets you instruct Gemini to adapt your focus areas, change writing tones, and automatically extract upcoming milestones and deadlines.
- **Multi-Model Fallback Hierarchy**: Primary execution on `gemini-3.5-flash-lite`, with automatic fallback to `gemini-3.1-flash-lite` and `gemini-2.5-flash-lite` on transient rate limits (429) or server errors (500/503).
- **Smart Milestone Countdowns**: Injects real-time countdown tags into daily email digests, automatically expiring past milestones once their dates elapse.
- **One-Click Manual Dispatch**: Trigger an immediate briefing run straight from the web dashboard via the GitHub Actions `workflow_dispatch` API.

---

## 📦 Directory Structure

```
DailyBrieferv2/
├── .github/
│   └── workflows/
│       └── daily-brief.yml              # Scheduled (5:00 AM IST) & manual workflow runner
├── db/
│   └── schema.sql                       # Supabase PostgreSQL DDL definitions & initial seed
├── docs/                                # GitHub Pages static root
│   ├── index.html                       # Modern dark-mode dashboard interface
│   ├── css/
│   │   └── styles.css                   # Glassmorphism styling and animations
│   └── js/
│       ├── vault.js                     # Web Crypto PBKDF2/AES-GCM-256 encrypt/decrypt
│       ├── db.js                        # Supabase PostgREST client wrapper
│       ├── chat.js                      # Direct Gemini REST client for persona tuning
│       └── app.js                       # UI controller, event listeners, workflow dispatch
├── src/
│   └── daily_briefer/
│       ├── __init__.py
│       ├── config.py                    # Frozen Config dataclass & environment loader
│       ├── db.py                        # Supabase DB operations (profile, events, briefs)
│       ├── news.py                      # Tavily search integration & article deduplication
│       ├── gemini.py                    # Gemini SDK synthesis with fallback & structured outputs
│       ├── send.py                      # MIME multipart email constructor & SMTP relay
│       └── agent.py                     # Main orchestrator pipeline
├── tests/                               # Comprehensive unit & integration tests
├── requirements.txt                     # Python backend dependencies
├── pyproject.toml                       # Python package configuration
├── .env.example                         # Environment variables template
└── README.md                            # Documentation and deployment guide
```

---

## 🚀 Quick Setup Guide

### 1. Database Setup (Supabase)
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Paste and run the contents of [`db/schema.sql`](file:///home/nicepotato/Projects/DailyBrieferv2/db/schema.sql).
4. Copy your **Project URL** and **Anon Public Key** (from *Settings -> API*).

### 2. GitHub Repository Secrets Setup
In your GitHub repository, go to **Settings -> Secrets and variables -> Actions** and add the following repository secrets:

| Secret Name | Description | Example |
|---|---|---|
| `SUPABASE_URL` | Your Supabase Project URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role or Anon Key | `eyJhbGci...` |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `TAVILY_API_KEY` | Tavily Search API Key | `tvly-...` |
| `SMTP_USER` / `GMAIL_USER` | Outbound sender Gmail address | `your-email@gmail.com` |
| `SMTP_PASSWORD` / `GMAIL_APP_PASSWORD` | 16-character Gmail App Password | `abcd efgh ijkl mnop` |
| `RECIPIENT_EMAIL` | Destination email for daily digests | `your-destination@example.com` |

*(Note: `RECIPIENT_EMAIL` can also be modified on the fly from the web dashboard stored in the Supabase `profile` table).*

### 3. Deploy Web Dashboard (GitHub Pages)
1. In your GitHub repository, go to **Settings -> Pages**.
2. Under **Build and deployment -> Source**, select **Deploy from a branch**.
3. Choose branch `main` and folder `/docs`. Click **Save**.
4. Visit your deployed GitHub Pages URL (e.g. `https://<username>.github.io/<repo>/`).

### 4. Configure Browser Vault
1. Open your GitHub Pages dashboard.
2. The Vault setup modal will automatically prompt for your credentials:
   - Supabase URL & Anon Key
   - Google Gemini API Key (used for client-side chat tuning)
   - GitHub PAT (Fine-grained Personal Access Token with `actions:write` scope)
   - GitHub Repo (`username/repo`)
   - Master Passphrase
3. Enter your Master Passphrase to encrypt your keys into `localStorage`. Whenever you open the dashboard in a new tab, you simply enter your passphrase to unlock your ephemeral session.

---

## 💻 Local Development & Testing

### Running Tests
To run the automated Python test suite:
```bash
python3 -m unittest discover tests
```

### Running Pipeline Locally
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
# Fill in your credentials in .env
python3 -m src.daily_briefer.agent
```

### Previewing the Static Dashboard Locally
You can serve the `docs/` folder with any static file server:
```bash
python3 -m http.server 8000 --directory docs
```
Open `http://localhost:8000` in your browser.

---

## 🔒 Security & Privacy Architecture

- **Zero Inbound Attack Surface**: No public webhook receivers or open ports.
- **Client-Side PBKDF2/AES-GCM Encryption**: Secrets stored in `localStorage` are ciphertext. Decryption occurs only in ephemeral browser memory upon entering the master passphrase.
- **Ephemeral Worker Compute**: GitHub Actions runners spin up, execute `agent.py`, deliver the brief via TLS, and terminate immediately with no persistent disk state.
