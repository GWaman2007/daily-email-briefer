-- ==============================================================================
-- DailyBriefer v2 Database Schema (Supabase / PostgreSQL 15+)
-- ==============================================================================

-- 1. Singleton User Profile
CREATE TABLE IF NOT EXISTS public.profile (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    recipient_email TEXT NOT NULL,
    preferences_summary TEXT NOT NULL DEFAULT 'Focus on software engineering, AI breakthroughs, and world news. Clear, analytical tone.',
    persona_tone TEXT NOT NULL DEFAULT 'Analytical & Direct',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    search_topic TEXT NOT NULL DEFAULT 'news',
    search_depth TEXT NOT NULL DEFAULT 'basic',
    primary_model TEXT NOT NULL DEFAULT 'gemini-3.5-flash-lite',
    fallback_model TEXT NOT NULL DEFAULT 'gemini-3.1-flash-lite',
    max_search_queries INT NOT NULL DEFAULT 4,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Event Milestones & Target Reminders
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    event_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- 3. Historical Briefs Archive
CREATE TABLE IF NOT EXISTS public.briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Disable Row Level Security (RLS) for single-user direct client access
ALTER TABLE public.profile DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefs DISABLE ROW LEVEL SECURITY;

-- Initial default singleton profile record (Insert only if not present)
INSERT INTO public.profile (
    id,
    recipient_email,
    preferences_summary,
    persona_tone,
    is_active,
    search_topic,
    search_depth,
    primary_model,
    fallback_model,
    max_search_queries
) VALUES (
    1,
    'user@example.com',
    'Focus on software engineering, AI breakthroughs, and world news. Clear, analytical tone.',
    'Analytical & Direct',
    TRUE,
    'news',
    'basic',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    4
) ON CONFLICT (id) DO NOTHING;
