-- ============================================
-- Rya Music Bot - Complete Fresh SQL Schema
-- Run this in Supabase SQL Editor
-- This will DROP old tables and create new ones
-- ============================================

-- Drop old tables if they exist (clean slate)
DROP TABLE IF EXISTS listening_history CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS guild_settings CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS track_stats CASCADE;
DROP TABLE IF EXISTS artist_stats CASCADE;

-- ============================================
-- 1. Guild Settings (prefixes, DJ roles, etc.)
-- ============================================
CREATE TABLE guild_settings (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT DEFAULT '!r',
    dj_role_id TEXT,
    announce_channel_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Listening History (every track played)
-- ============================================
CREATE TABLE listening_history (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    username TEXT,
    track_title TEXT NOT NULL,
    track_artist TEXT,
    track_uri TEXT,
    track_thumbnail TEXT,
    duration_ms INTEGER DEFAULT 0,
    played_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'youtube'
);

-- ============================================
-- 3. User Stats (aggregated per user)
-- ============================================
CREATE TABLE user_stats (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    avatar_url TEXT,
    total_tracks INTEGER DEFAULT 0,
    total_duration_ms BIGINT DEFAULT 0,
    favorite_artist TEXT,
    favorite_track TEXT,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_played_date DATE,
    weekly_tracks INTEGER DEFAULT 0,
    weekly_duration_ms BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. Track Stats (global track popularity)
-- ============================================
CREATE TABLE track_stats (
    id BIGSERIAL PRIMARY KEY,
    track_title TEXT NOT NULL,
    track_artist TEXT,
    track_uri TEXT UNIQUE,
    play_count INTEGER DEFAULT 1,
    total_duration_ms BIGINT DEFAULT 0,
    unique_listeners INTEGER DEFAULT 1,
    last_played_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. Artist Stats (global artist popularity)
-- ============================================
CREATE TABLE artist_stats (
    id BIGSERIAL PRIMARY KEY,
    artist_name TEXT UNIQUE NOT NULL,
    play_count INTEGER DEFAULT 1,
    unique_listeners INTEGER DEFAULT 1,
    total_duration_ms BIGINT DEFAULT 0,
    last_played_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX idx_history_user ON listening_history(user_id);
CREATE INDEX idx_history_guild ON listening_history(guild_id);
CREATE INDEX idx_history_artist ON listening_history(track_artist);
CREATE INDEX idx_history_played ON listening_history(played_at DESC);
CREATE INDEX idx_history_user_played ON listening_history(user_id, played_at DESC);
CREATE INDEX idx_track_stats_plays ON track_stats(play_count DESC);
CREATE INDEX idx_artist_stats_plays ON artist_stats(play_count DESC);
CREATE INDEX idx_user_stats_tracks ON user_stats(total_tracks DESC);
CREATE INDEX idx_user_stats_duration ON user_stats(total_duration_ms DESC);

-- ============================================
-- Auto-update timestamp trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER guild_settings_updated
    BEFORE UPDATE ON guild_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_stats_updated
    BEFORE UPDATE ON user_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Weekly reset function (optional - run via cron)
-- ============================================
CREATE OR REPLACE FUNCTION reset_weekly_stats()
RETURNS void AS $$
BEGIN
    UPDATE user_stats 
    SET weekly_tracks = 0, 
        weekly_duration_ms = 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Success message
-- ============================================
SELECT 'Schema created successfully! Tables: guild_settings, listening_history, user_stats, track_stats, artist_stats' as status;
