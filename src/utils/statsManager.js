// src/utils/statsManager.js - Supabase stats tracking and retrieval
const supabaseClient = require('./supabaseClient.js');

class StatsManager {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
        this.batchQueue = [];
        this.batchTimeout = null;
    }

    // ===== TRACK LISTENING =====

    /**
     * Record a track being played
     */
    async trackPlay(userId, guildId, track, username = null) {
        try {
            console.log(`[STATS] trackPlay called: userId=${userId}, guildId=${guildId}`);

            const client = await supabaseClient.getClient();
            if (!client) {
                console.error('[STATS] Supabase client is null - not connected');
                return false;
            }
            console.log('[STATS] Supabase client connected');

            const trackData = {
                user_id: userId,
                guild_id: guildId,
                username: username,
                track_title: track.title || 'Unknown',
                track_artist: track.author || track.artist || 'Unknown',
                track_uri: track.uri || null,
                track_thumbnail: track.thumbnail || null,
                duration_ms: track.length || track.duration || 0,
                source: track.source || 'youtube',
                played_at: new Date().toISOString()
            };

            console.log('[STATS] Inserting track data:', JSON.stringify(trackData, null, 2));

            // Insert to listening history
            const { data, error } = await client.from('listening_history').insert(trackData).select();

            if (error) {
                console.error('[STATS] Insert error:', error);
                return false;
            }
            console.log('[STATS] Insert success:', data);

            // ===== GREEDY FILTER: Keep max 30 tracks per user =====
            await this.applyGreedyHistoryFilter(userId, client);

            // Update user stats
            await this.updateUserStats(userId, username, trackData);

            // Update track stats
            await this.updateTrackStats(trackData);

            // Update artist stats
            if (trackData.track_artist && trackData.track_artist !== 'Unknown') {
                await this.updateArtistStats(trackData.track_artist, trackData.duration_ms, userId);
            }

            console.log(`[STATS] Tracked play: "${trackData.track_title}" by ${username || userId}`);
            return true;

        } catch (error) {
            console.error('[STATS] Error tracking play:', error);
            return false;
        }
    }

    /**
     * Apply greedy filter to keep max 30 tracks per user
     * Removes oldest tracks when limit is exceeded
     */
    async applyGreedyHistoryFilter(userId, client) {
        const MAX_HISTORY_PER_USER = 30;

        try {
            // Count user's tracks
            const { count, error: countError } = await client
                .from('listening_history')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            if (countError || count === null) {
                console.warn('[STATS] Could not count user history for greedy filter');
                return;
            }

            // If under limit, no action needed
            if (count <= MAX_HISTORY_PER_USER) {
                return;
            }

            // Calculate how many to delete
            const toDelete = count - MAX_HISTORY_PER_USER;

            // Get IDs of oldest tracks to delete
            const { data: oldestTracks, error: selectError } = await client
                .from('listening_history')
                .select('id')
                .eq('user_id', userId)
                .order('played_at', { ascending: true })
                .limit(toDelete);

            if (selectError || !oldestTracks || oldestTracks.length === 0) {
                console.warn('[STATS] Could not fetch oldest tracks for deletion');
                return;
            }

            // Delete the oldest tracks
            const idsToDelete = oldestTracks.map(t => t.id);
            const { error: deleteError } = await client
                .from('listening_history')
                .delete()
                .in('id', idsToDelete);

            if (deleteError) {
                console.error('[STATS] Greedy filter delete error:', deleteError);
            } else {
                console.log(`[STATS] Greedy filter: Removed ${idsToDelete.length} old tracks for user ${userId}`);
            }

        } catch (error) {
            console.error('[STATS] Greedy filter error:', error);
        }
    }

    /**
     * Update user aggregate stats
     */
    async updateUserStats(userId, username, trackData) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return;

            const today = new Date().toISOString().split('T')[0];

            // Get existing stats
            const { data: existing } = await client
                .from('user_stats')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (existing) {
                // Calculate streak
                let newStreak = existing.current_streak;
                const lastPlayed = existing.last_played_date;

                if (lastPlayed) {
                    const lastDate = new Date(lastPlayed);
                    const todayDate = new Date(today);
                    const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

                    if (diffDays === 1) {
                        newStreak = existing.current_streak + 1;
                    } else if (diffDays > 1) {
                        newStreak = 1;
                    }
                }

                await client.from('user_stats').update({
                    username: username || existing.username,
                    total_tracks: existing.total_tracks + 1,
                    total_duration_ms: existing.total_duration_ms + (trackData.duration_ms || 0),
                    weekly_tracks: existing.weekly_tracks + 1,
                    weekly_duration_ms: existing.weekly_duration_ms + (trackData.duration_ms || 0),
                    current_streak: newStreak,
                    longest_streak: Math.max(newStreak, existing.longest_streak),
                    last_played_date: today
                }).eq('user_id', userId);
            } else {
                // Create new user stats
                await client.from('user_stats').insert({
                    user_id: userId,
                    username: username,
                    total_tracks: 1,
                    total_duration_ms: trackData.duration_ms || 0,
                    weekly_tracks: 1,
                    weekly_duration_ms: trackData.duration_ms || 0,
                    current_streak: 1,
                    longest_streak: 1,
                    last_played_date: today
                });
            }
        } catch (error) {
            console.error('[STATS] Error updating user stats:', error.message);
        }
    }

    /**
     * Update track stats
     */
    async updateTrackStats(trackData) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return;

            const { data: existing } = await client
                .from('track_stats')
                .select('*')
                .eq('track_uri', trackData.track_uri)
                .single();

            if (existing) {
                await client.from('track_stats').update({
                    play_count: existing.play_count + 1,
                    total_duration_ms: existing.total_duration_ms + (trackData.duration_ms || 0),
                    last_played_at: new Date().toISOString()
                }).eq('track_uri', trackData.track_uri);
            } else {
                await client.from('track_stats').insert({
                    track_title: trackData.track_title,
                    track_artist: trackData.track_artist,
                    track_uri: trackData.track_uri,
                    play_count: 1,
                    total_duration_ms: trackData.duration_ms || 0
                });
            }
        } catch (error) {
            console.error('[STATS] Error updating track stats:', error.message);
        }
    }

    /**
     * Update artist stats
     */
    async updateArtistStats(artistName, durationMs, userId) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return;

            const { data: existing } = await client
                .from('artist_stats')
                .select('*')
                .eq('artist_name', artistName)
                .single();

            if (existing) {
                await client.from('artist_stats').update({
                    play_count: existing.play_count + 1,
                    total_duration_ms: existing.total_duration_ms + (durationMs || 0),
                    last_played_at: new Date().toISOString()
                }).eq('artist_name', artistName);
            } else {
                await client.from('artist_stats').insert({
                    artist_name: artistName,
                    play_count: 1,
                    total_duration_ms: durationMs || 0
                });
            }
        } catch (error) {
            console.error('[STATS] Error updating artist stats:', error.message);
        }
    }

    // ===== USER STATS QUERIES =====

    /**
     * Get user's overall stats
     */
    async getUserStats(userId) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return null;

            const { data, error } = await client
                .from('user_stats')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) return null;
            return data;
        } catch (error) {
            console.error('[STATS] Error getting user stats:', error.message);
            return null;
        }
    }

    /**
     * Get user's top tracks
     */
    async getUserTopTracks(userId, limit = 10) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('listening_history')
                .select('track_title, track_artist, track_uri')
                .eq('user_id', userId)
                .order('played_at', { ascending: false });

            if (error || !data) return [];

            // Count plays per track
            const trackCounts = {};
            data.forEach(item => {
                const key = `${item.track_title}|||${item.track_artist}`;
                trackCounts[key] = (trackCounts[key] || 0) + 1;
            });

            // Sort and return top tracks
            return Object.entries(trackCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
                .map(([key, count]) => {
                    const [title, artist] = key.split('|||');
                    return { title, artist, plays: count };
                });
        } catch (error) {
            console.error('[STATS] Error getting top tracks:', error.message);
            return [];
        }
    }

    /**
     * Get user's top artists
     */
    async getUserTopArtists(userId, limit = 10) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('listening_history')
                .select('track_artist')
                .eq('user_id', userId)
                .not('track_artist', 'is', null);

            if (error || !data) return [];

            // Count plays per artist
            const artistCounts = {};
            data.forEach(item => {
                if (item.track_artist && item.track_artist !== 'Unknown') {
                    artistCounts[item.track_artist] = (artistCounts[item.track_artist] || 0) + 1;
                }
            });

            // Sort and return
            return Object.entries(artistCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit)
                .map(([artist, plays]) => ({ artist, plays }));
        } catch (error) {
            console.error('[STATS] Error getting top artists:', error.message);
            return [];
        }
    }

    /**
     * Get user's listening history
     */
    async getUserHistory(userId, limit = 20) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('listening_history')
                .select('track_title, track_artist, played_at, duration_ms')
                .eq('user_id', userId)
                .order('played_at', { ascending: false })
                .limit(limit);

            return data || [];
        } catch (error) {
            console.error('[STATS] Error getting history:', error.message);
            return [];
        }
    }

    // ===== LEADERBOARDS =====

    /**
     * Get server leaderboard
     */
    async getServerLeaderboard(guildId, limit = 10) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('listening_history')
                .select('user_id, username')
                .eq('guild_id', guildId);

            if (error || !data) return [];

            // Count per user
            const userCounts = {};
            data.forEach(item => {
                if (!userCounts[item.user_id]) {
                    userCounts[item.user_id] = { username: item.username, plays: 0 };
                }
                userCounts[item.user_id].plays++;
            });

            return Object.entries(userCounts)
                .sort((a, b) => b[1].plays - a[1].plays)
                .slice(0, limit)
                .map(([userId, info], i) => ({
                    rank: i + 1,
                    userId,
                    username: info.username || 'Unknown',
                    plays: info.plays
                }));
        } catch (error) {
            console.error('[STATS] Error getting leaderboard:', error.message);
            return [];
        }
    }

    /**
     * Get global leaderboard
     */
    async getGlobalLeaderboard(limit = 10) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('user_stats')
                .select('user_id, username, total_tracks, total_duration_ms')
                .order('total_tracks', { ascending: false })
                .limit(limit);

            if (error) return [];

            return (data || []).map((user, i) => ({
                rank: i + 1,
                userId: user.user_id,
                username: user.username || 'Unknown',
                plays: user.total_tracks,
                hours: Math.round(user.total_duration_ms / 3600000 * 10) / 10
            }));
        } catch (error) {
            console.error('[STATS] Error getting global leaderboard:', error.message);
            return [];
        }
    }

    /**
     * Get top tracks globally
     */
    async getGlobalTopTracks(limit = 10) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('track_stats')
                .select('track_title, track_artist, play_count')
                .order('play_count', { ascending: false })
                .limit(limit);

            return data || [];
        } catch (error) {
            console.error('[STATS] Error getting global top tracks:', error.message);
            return [];
        }
    }

    /**
     * Get top artists globally
     */
    async getGlobalTopArtists(limit = 10) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('artist_stats')
                .select('artist_name, play_count')
                .order('play_count', { ascending: false })
                .limit(limit);

            return data || [];
        } catch (error) {
            console.error('[STATS] Error getting global top artists:', error.message);
            return [];
        }
    }

    // ===== GUILD SETTINGS =====

    /**
     * Get guild prefix
     */
    async getPrefix(guildId) {
        try {
            const cacheKey = `prefix_${guildId}`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.time < this.cacheTimeout) {
                    return cached.value;
                }
            }

            const client = await supabaseClient.getClient();
            if (!client) return '!r';

            const { data } = await client
                .from('guild_settings')
                .select('prefix')
                .eq('guild_id', guildId)
                .single();

            const prefix = data?.prefix || '!r';
            this.cache.set(cacheKey, { value: prefix, time: Date.now() });
            return prefix;
        } catch (error) {
            return '!r';
        }
    }

    /**
     * Set guild prefix
     */
    async setPrefix(guildId, prefix) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) throw new Error('Database not available');

            // Validate prefix
            if (!prefix || prefix.length < 1 || prefix.length > 5) {
                throw new Error('Prefix must be 1-5 characters');
            }
            if (prefix.includes(' ')) {
                throw new Error('Prefix cannot contain spaces');
            }

            // Upsert
            const { error } = await client
                .from('guild_settings')
                .upsert({
                    guild_id: guildId,
                    prefix: prefix,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            // Update cache
            this.cache.set(`prefix_${guildId}`, { value: prefix, time: Date.now() });
            console.log(`[STATS] Set prefix for ${guildId}: "${prefix}"`);
            return true;
        } catch (error) {
            console.error('[STATS] Error setting prefix:', error.message);
            throw error;
        }
    }

    // ===== UTILITIES =====

    formatDuration(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    clearCache() {
        this.cache.clear();
    }

    /**
     * Clear user's listening history
     */
    async clearUserHistory(userId) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) {
                return { success: false, error: 'Database not connected', count: 0 };
            }

            // Count tracks before deletion
            const { count: trackCount } = await client
                .from('listening_history')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            // Delete all history for this user
            const { error: deleteHistoryError } = await client
                .from('listening_history')
                .delete()
                .eq('user_id', userId);

            if (deleteHistoryError) {
                console.error('[STATS] Error clearing history:', deleteHistoryError.message);
                return { success: false, error: deleteHistoryError.message, count: 0 };
            }

            // Also reset user_stats
            const { error: deleteStatsError } = await client
                .from('user_stats')
                .delete()
                .eq('user_id', userId);

            if (deleteStatsError) {
                console.warn('[STATS] Could not reset user stats:', deleteStatsError.message);
            }

            console.log(`[STATS] Cleared ${trackCount || 0} tracks for user ${userId}`);
            return { success: true, count: trackCount || 0 };

        } catch (error) {
            console.error('[STATS] Error in clearUserHistory:', error.message);
            return { success: false, error: error.message, count: 0 };
        }
    }
}

module.exports = new StatsManager();
