# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Enter project details and create

## 2. Run Database Migrations

Go to the SQL Editor in Supabase and run the following SQL commands:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discord_id TEXT UNIQUE NOT NULL,
    username TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guild_id TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    track_count INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    skip_count INTEGER DEFAULT 0
);

-- Listening history table
CREATE TABLE listening_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    track_title TEXT NOT NULL,
    track_artist TEXT NOT NULL,
    track_source TEXT,
    track_url TEXT,
    track_duration INTEGER,
    played_at TIMESTAMPTZ DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE,
    completion_percentage REAL DEFAULT 0,
    skipped BOOLEAN DEFAULT FALSE,
    guild_id TEXT
);

-- Indexes for performance
CREATE INDEX idx_history_user ON listening_history(user_id, played_at DESC);
CREATE INDEX idx_history_session ON listening_history(session_id);
CREATE INDEX idx_sessions_user ON sessions(user_id, started_at DESC);

-- User preferences table (for future enhancements)
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    favorite_genres TEXT[],
    preferred_artists TEXT[],
    mood_preferences JSONB,
    recommendation_settings JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 3. Get API Keys

1. Go to Project Settings → API
2. Copy the following:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - `anon` public key
   - `service_role` secret key (optional, for admin operations)

## 4. Update .env File

Add these to your `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
ENABLE_TRACKING=true
```

## 5. Install Missing Packages

Run:
```bash
npm install @supabase/supabase-js uuid play-dl yt-dlp-wrap compression
```

## 6. Test Connection

Start your bot and check the logs for:
```
[SUPABASE] Connected successfully
```

## Notes

- The `anon` key is safe to use in client-side code
- The `service_role` key should be kept secret (not needed for basic functionality)
- All user data collection is automatic when users play music
- History is retained indefinitely by default (you can add TTL policies in Supabase if needed)
