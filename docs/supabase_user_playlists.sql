-- Supabase SQL for user_playlists table
-- Run this in Supabase SQL Editor

-- Create user_playlists table
CREATE TABLE IF NOT EXISTS user_playlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    playlist_name TEXT NOT NULL,
    tracks JSONB DEFAULT '[]'::jsonb,
    play_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint on user + playlist name
    CONSTRAINT unique_user_playlist UNIQUE (user_id, playlist_name)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_id ON user_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_user_playlists_updated_at ON user_playlists(updated_at DESC);

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE user_playlists ENABLE ROW LEVEL SECURITY;

-- Grant permissions (adjust as needed)
GRANT ALL ON user_playlists TO authenticated;
GRANT ALL ON user_playlists TO service_role;

-- Maintenance function to clean up old/unused playlists (optional)
-- Call this periodically via cron or scheduled function
CREATE OR REPLACE FUNCTION cleanup_old_playlists()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete playlists not used in 90 days with 0 plays
    WITH deleted AS (
        DELETE FROM user_playlists
        WHERE updated_at < NOW() - INTERVAL '90 days'
        AND play_count = 0
        RETURNING *
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment: Run cleanup_old_playlists() manually or via scheduled task
-- SELECT cleanup_old_playlists();
