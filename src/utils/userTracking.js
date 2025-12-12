const supabaseClient = require('./supabaseClient.js');
const { v4: uuidv4 } = require('uuid');

class UserTracking {
    constructor() {
        this.enabled = true;
        this.trackingQueue = [];
        this.batchSize = 10;
        this.flushInterval = 5000; // 5 seconds
        this.startBatchProcessor();
    }

    /**
     * Start background batch processor for efficient DB writes
     */
    startBatchProcessor() {
        setInterval(async () => {
            if (this.trackingQueue.length > 0) {
                await this.flushQueue();
            }
        }, this.flushInterval);
    }

    /**
     * Ensure user exists in database
     */
    async ensureUser(discordUser) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return null;

            const { data: existingUser, error: fetchError } = await client
                .from('users')
                .select('id')
                .eq('discord_id', discordUser.id)
                .single();

            if (existingUser) {
                return existingUser.id;
            }

            // Create new user
            const { data: newUser, error: insertError } = await client
                .from('users')
                .insert({
                    discord_id: discordUser.id,
                    username: discordUser.username
                })
                .select('id')
                .single();

            if (insertError) {
                console.error('[TRACKING] Error creating user:', insertError.message);
                return null;
            }

            return newUser.id;

        } catch (error) {
            console.error('[TRACKING] Error ensuring user:', error.message);
            return null;
        }
    }

    /**
     * Track a song play - batched for performance
     */
    async trackPlay(discordUser, track, sessionId, guildId) {
        if (!this.enabled) return;

        try {
            const userId = await this.ensureUser(discordUser);
            if (!userId) return;

            // Add to queue for batch processing
            this.trackingQueue.push({
                user_id: userId,
                session_id: sessionId,
                track_title: track.title,
                track_artist: track.artist,
                track_source: track.source || 'youtube',
                track_url: track.url,
                track_duration: track.duration,
                guild_id: guildId,
                played_at: new Date().toISOString()
            });

            // Flush if batch is full
            if (this.trackingQueue.length >= this.batchSize) {
                await this.flushQueue();
            }

        } catch (error) {
            console.error('[TRACKING] Error tracking play:', error.message);
        }
    }

    /**
     * Flush tracking queue to database
     */
    async flushQueue() {
        if (this.trackingQueue.length === 0) return;

        try {
            const client = await supabaseClient.getClient();
            if (!client) {
                this.trackingQueue = []; // Clear queue if no connection
                return;
            }

            const batch = this.trackingQueue.splice(0, this.batchSize);

            const { error } = await client
                .from('listening_history')
                .insert(batch);

            if (error) {
                console.error('[TRACKING] Error flushing queue:', error.message);
                // Don't re-add to queue to avoid infinite loop
            } else {
                console.log(`[TRACKING] Flushed ${batch.length} plays to database`);
            }

        } catch (error) {
            console.error('[TRACKING] Error in flushQueue:', error.message);
        }
    }

    /**
     * Update track completion status
     */
    async updateCompletion(userId, trackId, completed, completionPercentage) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return;

            await client
                .from('listening_history')
                .update({
                    completed,
                    completion_percentage: completionPercentage
                })
                .eq('id', trackId);

        } catch (error) {
            console.error('[TRACKING] Error updating completion:', error.message);
        }
    }

    /**
     * Get user listening history
     */
    async getUserHistory(discordUserId, limit = 50, offset = 0) {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data: user } = await client
                .from('users')
                .select('id')
                .eq('discord_id', discordUserId)
                .single();

            if (!user) return [];

            const { data, error } = await client
                .from('listening_history')
                .select('*')
                .eq('user_id', user.id)
                .order('played_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                console.error('[TRACKING] Error fetching history:', error.message);
                return [];
            }

            return data || [];

        } catch (error) {
            console.error('[TRACKING] Error in getUserHistory:', error.message);
            return [];
        }
    }

    /**
     * Get user top tracks
     */
    async getUserTopTracks(discordUserId, limit = 10, timeframe = '30 days') {
        try {
            const client = await supabaseClient.getClient();
            if (!client) return [];

            const { data: user } = await client
                .from('users')
                .select('id')
                .eq('discord_id', discordUserId)
                .single();

            if (!user) return [];

            const { data, error } = await client
                .from('listening_history')
                .select('track_title, track_artist, count')
                .eq('user_id', user.id)
                .gte('played_at', `now() - interval '${timeframe}'`)
                .order('count', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[TRACKING] Error fetching top tracks:', error.message);
                return [];
            }

            return data || [];

        } catch (error) {
            console.error('[TRACKING] Error in getUserTopTracks:', error.message);
            return [];
        }
    }

    /**
     * Disable tracking
     */
    disable() {
        this.enabled = false;
        console.log('[TRACKING] Disabled');
    }

    /**
     * Enable tracking
     */
    enable() {
        this.enabled = true;
        console.log('[TRACKING] Enabled');
    }

    /**
     * Graceful shutdown - flush remaining queue
     */
    async shutdown() {
        console.log('[TRACKING] Shutting down...');
        await this.flushQueue();
    }
}

// Singleton instance
const userTracking = new UserTracking();

module.exports = userTracking;
