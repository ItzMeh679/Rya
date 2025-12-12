const supabaseClient = require('./supabaseClient.js');
const { v4: uuidv4 } = require('uuid');

class SessionManager {
    constructor() {
        this.activeSessions = new Map(); // guildId -> sessionId
    }

    /**
     * Start a new session or get existing one
     */
    async startSession(discordUser, guildId) {
        try {
            // Check if session already exists
            const existingSessionId = this.activeSessions.get(guildId);
            if (existingSessionId) {
                return existingSessionId;
            }

            const client = await supabaseClient.getClient();
            if (!client) {
                // If no Supabase, create local session ID
                const localSessionId = uuidv4();
                this.activeSessions.set(guildId, localSessionId);
                return localSessionId;
            }

            // Get user ID
            const { data: user } = await client
                .from('users')
                .select('id')
                .eq('discord_id', discordUser.id)
                .single();

            if (!user) {
                console.warn('[SESSION] User not found, creating...');
                const { data: newUser } = await client
                    .from('users')
                    .insert({
                        discord_id: discordUser.id,
                        username: discordUser.username
                    })
                    .select('id')
                    .single();

                if (!newUser) return uuidv4(); // Fallback to local session
            }

            const userId = user?.id || newUser?.id;

            // Create session in database
            const { data: session, error } = await client
                .from('sessions')
                .insert({
                    user_id: userId,
                    guild_id: guildId,
                    started_at: new Date().toISOString()
                })
                .select('id')
                .single();

            if (error) {
                console.error('[SESSION] Error creating session:', error.message);
                const fallbackId = uuidv4();
                this.activeSessions.set(guildId, fallbackId);
                return fallbackId;
            }

            const sessionId = session.id;
            this.activeSessions.set(guildId, sessionId);
            console.log(`[SESSION] Started session ${sessionId} for guild ${guildId}`);

            return sessionId;

        } catch (error) {
            console.error('[SESSION] Error starting session:', error.message);
            const fallbackId = uuidv4();
            this.activeSessions.set(guildId, fallbackId);
            return fallbackId;
        }
    }

    /**
     * End a session
     */
    async endSession(guildId) {
        try {
            const sessionId = this.activeSessions.get(guildId);
            if (!sessionId) return;

            const client = await supabaseClient.getClient();
            if (!client) {
                this.activeSessions.delete(guildId);
                return;
            }

            // Update session end time and stats
            const { error } = await client
                .from('sessions')
                .update({
                    ended_at: new Date().toISOString()
                })
                .eq('id', sessionId);

            if (error) {
                console.error('[SESSION] Error ending session:', error.message);
            } else {
                console.log(`[SESSION] Ended session ${sessionId}`);
            }

            this.activeSessions.delete(guildId);

        } catch (error) {
            console.error('[SESSION] Error in endSession:', error.message);
            this.activeSessions.delete(guildId);
        }
    }

    /**
     * Get active session ID for guild
     */
    getActiveSession(guildId) {
        return this.activeSessions.get(guildId);
    }

    /**
     * Update session statistics
     */
    async updateSessionStats(guildId, stats) {
        try {
            const sessionId = this.activeSessions.get(guildId);
            if (!sessionId) return;

            const client = await supabaseClient.getClient();
            if (!client) return;

            await client
                .from('sessions')
                .update({
                    track_count: stats.trackCount || 0,
                    total_duration: stats.totalDuration || 0,
                    skip_count: stats.skipCount || 0
                })
                .eq('id', sessionId);

        } catch (error) {
            console.error('[SESSION] Error updating stats:', error.message);
        }
    }

    /**
     * Get user session history
     */
    async getUserSessions(discordUserId, limit = 10) {
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
                .from('sessions')
                .select('*')
                .eq('user_id', user.id)
                .order('started_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[SESSION] Error fetching sessions:', error.message);
                return [];
            }

            return data || [];

        } catch (error) {
            console.error('[SESSION] Error in getUserSessions:', error.message);
            return [];
        }
    }

    /**
     * Get current session details
     */
    async getCurrentSession(guildId) {
        try {
            const sessionId = this.activeSessions.get(guildId);
            if (!sessionId) return null;

            const client = await supabaseClient.getClient();
            if (!client) return { id: sessionId };

            const { data, error } = await client
                .from('sessions')
                .select('*')
                .eq('id', sessionId)
                .single();

            if (error) {
                console.error('[SESSION] Error fetching session:', error.message);
                return { id: sessionId };
            }

            return data;

        } catch (error) {
            console.error('[SESSION] Error in getCurrentSession:', error.message);
            return null;
        }
    }

    /**
     * Cleanup - end all sessions
     */
    async cleanup() {
        console.log('[SESSION] Cleaning up all sessions...');
        for (const guildId of this.activeSessions.keys()) {
            await this.endSession(guildId);
        }
    }
}

// Singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;
